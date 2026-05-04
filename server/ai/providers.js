import { analysisResponseSchema, recognitionResponseSchema } from './schemas.js';
import {
  buildAnalysisInstructions,
  buildAnalysisUserPrompt,
  buildRecognitionInstructions,
  buildRecognitionUserPrompt,
} from './prompts.js';
import { detectFormulaHeavyText, readAssetBuffer, toDataUrl } from './file-utils.js';
import { preprocessImageForAI } from './image-preprocessor.js';
import { logger } from '../logger.js';

// Math/science subjects that benefit from higher-capability model
const FORMULA_SUBJECTS = ['математик', 'физик', 'хими', 'алгебр', 'геометр', 'тригоном'];
function isFormulaHeavySubject(subject = '') {
  const s = subject.toLowerCase();
  return FORMULA_SUBJECTS.some(kw => s.includes(kw));
}

async function callOpenAiStructuredJson({
  config,
  model,
  schemaName,
  schema,
  instructions,
  userContent,
  timeoutMs,
}) {
  const { maxAttempts, baseDelayMs } = config.retry;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || config.openai.timeoutMs);
    try {
      const t0 = Date.now();
      const response = await fetch(`${config.openai.baseUrl}/responses`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openai.apiKey}`,
        },
        body: JSON.stringify({
          model,
          instructions,
          input: [{ role: 'user', content: userContent }],
          // reasoning only supported by o1/o3/o4-mini — omit for gpt-4o/gpt-4o-mini
          ...(/^o\d/.test(model) ? { reasoning: { effort: 'medium' } } : {}),
          max_output_tokens: config.openai.maxOutputTokens,
          text: {
            format: {
              type: 'json_schema',
              name: schemaName,
              schema,
              strict: true,
            },
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      clearTimeout(timeout);
      if (!response.ok) {
        const err = new Error(payload?.error?.message || 'OpenAI request failed.');
        err.status = response.status;
        const isRetryable = response.status === 429 || response.status >= 500;
        if (!isRetryable || attempt === maxAttempts) throw err;
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn({ attempt, status: response.status, delay }, '[openai] retryable error, waiting');
        await new Promise(r => setTimeout(r, delay));
        lastError = err;
        continue;
      }
      const durationMs = Date.now() - t0;
      const usage = payload.usage || {};
      logger.info({ model, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, durationMs }, '[openai] call');
      const rawText = payload.output_text
        || payload.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text
        || '';
      return rawText ? JSON.parse(rawText) : {};
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') { err.status = 504; }
      const isRetryable = err.status === 429 || (err.status >= 500 && err.status < 600);
      if (!isRetryable || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn({ attempt, errMsg: err.message, delay }, '[openai] retryable error, waiting');
      await new Promise(r => setTimeout(r, delay));
      lastError = err;
    }
  }
  throw lastError;
}

export class RecognitionProvider {
  async extract() { throw new Error('Not implemented'); }
}

export class OpenAIRecognitionProvider extends RecognitionProvider {
  constructor({ config, uploadsDir }) {
    super();
    this.config = config;
    this.uploadsDir = uploadsDir;
  }

  async extract({ assets = [], assignmentContext = {}, assetLabel = '' }) {
    const content = [
      { type: 'input_text', text: buildRecognitionUserPrompt({ assignmentContext }) },
    ];
    for (const asset of assets) {
      let buffer = await readAssetBuffer(this.uploadsDir, asset);
      // Compress images before sending to reduce token cost
      buffer = await preprocessImageForAI(buffer, asset.mimeType);
      if (asset.mimeType === 'application/pdf') {
        content.push({
          type: 'input_file',
          filename: asset.originalName || asset.name || 'submission.pdf',
          file_data: toDataUrl(buffer, asset.mimeType),
        });
      } else {
        content.push({
          type: 'input_image',
          image_url: toDataUrl(buffer, 'image/jpeg'),
        });
      }
    }
    // Use the full model for formula-heavy subjects, cheaper model for plain text
    const model = isFormulaHeavySubject(assignmentContext.subject)
      ? this.config.openai.model
      : this.config.openai.recognitionModel;
    return callOpenAiStructuredJson({
      config: this.config,
      model,
      schemaName: 'recognition_result',
      schema: recognitionResponseSchema,
      instructions: buildRecognitionInstructions({ assignmentContext, assetLabel }),
      userContent: content,
    });
  }
}

export class MathpixRecognitionProvider extends RecognitionProvider {
  constructor({ config, uploadsDir }) {
    super();
    this.config = config;
    this.uploadsDir = uploadsDir;
  }

  async extract({ assets = [], assignmentContext = {} }) {
    const results = [];
    for (const asset of assets) {
      const buffer = await readAssetBuffer(this.uploadsDir, asset);
      const { appId, apiKey, baseUrl } = this.config.mathpix;
      const headers = { 'app_id': appId, 'app_key': apiKey, 'Content-Type': 'application/json' };

      if (asset.mimeType === 'application/pdf') {
        const uploadResp = await fetch(`${baseUrl}/pdf`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            url: toDataUrl(buffer, 'application/pdf'),
            conversion_formats: { mmd: true },
            math_inline_delimiters: ['$', '$'],
            math_display_delimiters: ['$$', '$$'],
          }),
        });
        const { pdf_id } = await uploadResp.json();
        let status = 'loading';
        let mmdText = '';
        for (let i = 0; i < 30 && status !== 'completed'; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const statusResp = await fetch(`${baseUrl}/pdf/${pdf_id}`, { headers });
          const statusData = await statusResp.json();
          status = statusData.status;
          if (status === 'completed') {
            const mmdResp = await fetch(`${baseUrl}/pdf/${pdf_id}.mmd`, { headers });
            mmdText = await mmdResp.text();
          }
        }
        results.push({ type: 'solution', text: mmdText, latex: mmdText, confidence: 0.92 });
      } else {
        const resp = await fetch(`${baseUrl}/text`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            src: toDataUrl(buffer, asset.mimeType),
            formats: ['text', 'latex_styled'],
            include_detected_alphabets: true,
          }),
        });
        const data = await resp.json();
        results.push({
          type: 'solution',
          text: data.text || '',
          latex: data.latex_styled || null,
          confidence: data.confidence || 0.85,
        });
      }
    }
    return {
      pages: [{ pageNumber: 1, detectedBlocks: results }],
      globalConfidence: results.reduce((s, r) => s + r.confidence, 0) / (results.length || 1),
      warnings: [],
    };
  }
}

export class RecognitionResultNormalizer {
  normalize(result = {}) {
    return {
      pages: Array.isArray(result.pages)
        ? result.pages.map((page, index) => ({
          pageNumber: Number(page.pageNumber || index + 1),
          detectedBlocks: Array.isArray(page.detectedBlocks)
            ? page.detectedBlocks.map(block => ({
              type: block.type || 'unknown',
              text: String(block.text || ''),
              latex: block.latex ?? null,
              confidence: Number.isFinite(Number(block.confidence)) ? Number(block.confidence) : 0,
            }))
            : [],
        }))
        : [],
      globalConfidence: Number.isFinite(Number(result.globalConfidence)) ? Number(result.globalConfidence) : 0,
      warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [],
    };
  }
}

export class RecognitionOrchestrator {
  constructor({ config, openaiProvider, mathpixProvider }) {
    this.config = config;
    this.openaiProvider = openaiProvider;
    this.mathpixProvider = mathpixProvider;
    this.normalizer = new RecognitionResultNormalizer();
  }

  async extract({ assets = [], assignmentContext = {}, hintText = '' }) {
    // Use Mathpix if enabled + formula-heavy content (formula text or math subject)
    const subjectIsFormula = isFormulaHeavySubject(assignmentContext.subject || '');
    const shouldUseMathpix = this.config.flags.ENABLE_MATHPIX
      && (subjectIsFormula || (this.config.flags.ENABLE_ADVANCED_FORMULA_RECOGNITION && detectFormulaHeavyText(hintText)));
    const provider = shouldUseMathpix ? this.mathpixProvider : this.openaiProvider;
    const providerName = shouldUseMathpix ? 'mathpix' : 'openai';
    const raw = await provider.extract({
      assets,
      assignmentContext,
      assetLabel: assets.map(asset => asset.originalName || asset.name).join(', '),
    });
    return {
      provider: providerName,
      ...this.normalizer.normalize(raw),
      rawStructuredOutput: raw,
    };
  }
}

export async function generateAnalysisDraft({ config, assignmentContext = {}, recognitionResult = {} }) {
  const payload = await callOpenAiStructuredJson({
    config,
    model: config.openai.analysisModel,
    schemaName: 'analysis_result',
    schema: analysisResponseSchema,
    instructions: buildAnalysisInstructions({ assignmentContext }),
    userContent: [
      { type: 'input_text', text: buildAnalysisUserPrompt({ assignmentContext, recognitionResult }) },
    ],
  });
  return {
    extractedTask: String(payload.extractedTask || ''),
    studentSolutionSummary: String(payload.studentSolutionSummary || ''),
    canonicalSolution: String(payload.canonicalSolution || ''),
    mistakes: Array.isArray(payload.mistakes) ? payload.mistakes : [],
    mistakeTags: Array.isArray(payload.mistakeTags) ? payload.mistakeTags.map(String) : [],
    suggestedScore: Number(payload.suggestedScore || 0),
    studentCommentDraft: String(payload.studentCommentDraft || ''),
    teacherCommentDraft: String(payload.teacherCommentDraft || ''),
    recommendations: Array.isArray(payload.recommendations) ? payload.recommendations.map(String) : [],
    confidence: Number.isFinite(Number(payload.confidence)) ? Number(payload.confidence) : 0,
    needsHumanReview: Boolean(payload.needsHumanReview),
    warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
    rawModelOutput: payload,
  };
}

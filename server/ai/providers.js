import { analysisResponseSchema, recognitionResponseSchema } from './schemas.js';
import {
  buildAnalysisInstructions,
  buildAnalysisUserPrompt,
  buildRecognitionInstructions,
  buildRecognitionUserPrompt,
} from './prompts.js';
import { detectFormulaHeavyText, readAssetBuffer, toDataUrl } from './file-utils.js';

const OCR_DIAGRAM_MARKER = '[рисунок смотри на оригинале слева]';

async function callOpenAiStructuredJson({
  config,
  model,
  schemaName,
  schema,
  instructions,
  userContent,
  timeoutMs,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs || config.openai.timeoutMs);
  try {
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
        input: [
          {
            role: 'user',
            content: userContent,
          },
        ],
        reasoning: { effort: 'medium' },
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
    if (!response.ok) {
      const error = new Error(payload?.error?.message || 'OpenAI request failed.');
      error.status = response.status;
      throw error;
    }
    const rawText = payload.output_text
      || payload.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text
      || '';
    return rawText ? JSON.parse(rawText) : {};
  } finally {
    clearTimeout(timeout);
  }
}

async function callHuggingFaceImageToText({
  config,
  model,
  buffer,
  mimeType,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.huggingface.timeoutMs);
  try {
    const response = await fetch(`${config.huggingface.baseUrl}/${model}`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.huggingface.apiKey}`,
        'Content-Type': mimeType || 'image/jpeg',
      },
      body: buffer,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error || 'Hugging Face request failed.');
      error.status = response.status;
      throw error;
    }
    if (typeof payload === 'string') return payload;
    if (Array.isArray(payload)) {
      return payload
        .map(item => item?.generated_text || item?.text || '')
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    return String(payload?.generated_text || payload?.text || '').trim();
  } finally {
    clearTimeout(timeout);
  }
}

export class RecognitionProvider {
  async extract() {
    throw new Error('Not implemented');
  }
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
      const buffer = await readAssetBuffer(this.uploadsDir, asset);
      if (asset.mimeType === 'application/pdf') {
        content.push({
          type: 'input_file',
          filename: asset.originalName || asset.name || 'submission.pdf',
          file_data: toDataUrl(buffer, asset.mimeType),
        });
      } else {
        content.push({
          type: 'input_image',
          image_url: toDataUrl(buffer, asset.mimeType || 'image/jpeg'),
        });
      }
    }
    return callOpenAiStructuredJson({
      config: this.config,
      model: this.config.openai.recognitionModel,
      schemaName: 'recognition_result',
      schema: recognitionResponseSchema,
      instructions: buildRecognitionInstructions({ assignmentContext, assetLabel }),
      userContent: content,
    });
  }
}

export class MathpixRecognitionProvider extends RecognitionProvider {
  constructor() {
    super();
  }

  async extract() {
    const error = new Error('Mathpix provider is not enabled in the current deployment.');
    error.code = 'MATHPIX_NOT_ENABLED';
    throw error;
  }
}

export class HuggingFaceRecognitionProvider extends RecognitionProvider {
  constructor({ config, uploadsDir }) {
    super();
    this.config = config;
    this.uploadsDir = uploadsDir;
  }

  async extract({ assets = [] }) {
    if (!assets.length) {
      return { pages: [], globalConfidence: 0, warnings: ['Нет файлов для OCR.'] };
    }
    const pages = [];
    for (const [index, asset] of assets.entries()) {
      if (asset.mimeType === 'application/pdf') {
        throw new Error('Hugging Face OCR fallback does not support PDF assets in this deployment.');
      }
      const buffer = await readAssetBuffer(this.uploadsDir, asset);
      const text = await callHuggingFaceImageToText({
        config: this.config,
        model: this.config.huggingface.ocrModel,
        buffer,
        mimeType: asset.mimeType || 'image/jpeg',
      });
      pages.push({
        pageNumber: index + 1,
        detectedBlocks: [{
          type: 'unknown',
          text: text || '',
          latex: null,
          confidence: text ? 0.62 : 0.18,
        }],
      });
    }
    return {
      pages,
      globalConfidence: pages.some(page => page.detectedBlocks.some(block => block.text)) ? 0.62 : 0.18,
      warnings: ['Использован резервный OCR через Hugging Face. Проверьте распознанный текст перед публикацией результата.'],
    };
  }
}

export class RecognitionResultNormalizer {
  normalizeBlock(block = {}) {
    const type = ['task', 'solution', 'answer', 'annotation', 'diagram', 'unknown'].includes(block.type)
      ? block.type
      : 'unknown';
    const text = String(block.text || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const normalizedText = type === 'diagram'
      ? OCR_DIAGRAM_MARKER
      : text || (block.latex ? String(block.latex) : '');
    return {
      type,
      text: normalizedText,
      latex: block.latex ?? null,
      confidence: Number.isFinite(Number(block.confidence)) ? Number(block.confidence) : 0,
    };
  }

  normalize(result = {}) {
    return {
      pages: Array.isArray(result.pages)
        ? result.pages.map((page, index) => ({
          pageNumber: Number(page.pageNumber || index + 1),
          detectedBlocks: Array.isArray(page.detectedBlocks)
            ? page.detectedBlocks.map(block => this.normalizeBlock(block))
            : [],
        }))
        : [],
      globalConfidence: Number.isFinite(Number(result.globalConfidence)) ? Number(result.globalConfidence) : 0,
      warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [],
    };
  }
}

export class RecognitionOrchestrator {
  constructor({ config, openaiProvider, mathpixProvider, huggingFaceProvider = null }) {
    this.config = config;
    this.openaiProvider = openaiProvider;
    this.mathpixProvider = mathpixProvider;
    this.huggingFaceProvider = huggingFaceProvider;
    this.normalizer = new RecognitionResultNormalizer();
  }

  shouldFallback(normalized) {
    if (!normalized?.pages?.length) return true;
    const recognizedChars = normalized.pages
      .flatMap(page => page.detectedBlocks || [])
      .map(block => block.text || '')
      .join('')
      .replace(/\s/g, '').length;
    return normalized.globalConfidence < 0.58 || recognizedChars < 20;
  }

  async extract({ assets = [], assignmentContext = {}, hintText = '' }) {
    const shouldUseMathpix = this.config.flags.ENABLE_MATHPIX
      && this.config.flags.ENABLE_ADVANCED_FORMULA_RECOGNITION
      && detectFormulaHeavyText(hintText);
    const candidates = [];
    if (shouldUseMathpix) {
      candidates.push({ provider: this.mathpixProvider, name: 'mathpix' });
    } else {
      candidates.push({ provider: this.openaiProvider, name: 'openai' });
      if (this.config.flags.ENABLE_HUGGINGFACE_OCR && this.huggingFaceProvider && assets.every(asset => asset.mimeType !== 'application/pdf')) {
        candidates.push({ provider: this.huggingFaceProvider, name: 'huggingface' });
      }
    }

    let bestResult = null;
    let lastError = null;
    for (const candidate of candidates) {
      try {
        const raw = await candidate.provider.extract({
          assets,
          assignmentContext,
          assetLabel: assets.map(asset => asset.originalName || asset.name).join(', '),
        });
        const normalized = this.normalizer.normalize(raw);
        const nextResult = {
          provider: candidate.name,
          ...normalized,
          rawStructuredOutput: raw,
        };
        bestResult = nextResult;
        if (candidate.name !== 'openai' || !this.shouldFallback(normalized)) {
          return nextResult;
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (bestResult) return bestResult;
    throw lastError || new Error('No recognition provider succeeded.');
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

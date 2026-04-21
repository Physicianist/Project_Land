import { analysisResponseSchema, recognitionResponseSchema } from './schemas.js';
import {
  buildAnalysisInstructions,
  buildAnalysisUserPrompt,
  buildRecognitionInstructions,
  buildRecognitionUserPrompt,
} from './prompts.js';
import { detectFormulaHeavyText, readAssetBuffer, toDataUrl } from './file-utils.js';

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
    const shouldUseMathpix = this.config.flags.ENABLE_MATHPIX
      && this.config.flags.ENABLE_ADVANCED_FORMULA_RECOGNITION
      && detectFormulaHeavyText(hintText);
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


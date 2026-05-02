const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositive = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function loadAiConfig(env = process.env) {
  const openAiApiKey = String(env.OPENAI_API_KEY || '').trim();
  const enableOpenAiByDefault = Boolean(openAiApiKey);
  const enableOpenAiRecognition = parseBoolean(env.ENABLE_OPENAI_RECOGNITION, enableOpenAiByDefault);
  const defaultModel = String(env.OPENAI_MODEL || 'gpt-4o').trim();
  const config = {
    flags: {
      ENABLE_OPENAI_RECOGNITION: enableOpenAiRecognition,
      ENABLE_MATHPIX: parseBoolean(env.ENABLE_MATHPIX, false),
      ENABLE_BATCH_AI_GRADING: parseBoolean(env.ENABLE_BATCH_AI_GRADING, true),
      ENABLE_ADVANCED_FORMULA_RECOGNITION: parseBoolean(env.ENABLE_ADVANCED_FORMULA_RECOGNITION, false),
      ENABLE_TEACHER_REVIEW_REQUIRED: parseBoolean(env.ENABLE_TEACHER_REVIEW_REQUIRED, true),
    },
    openai: {
      apiKey: openAiApiKey,
      baseUrl: String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim(),
      model: defaultModel,
      recognitionModel: String(env.OPENAI_RECOGNITION_MODEL || 'gpt-4o-mini').trim(),
      analysisModel: String(env.OPENAI_ANALYSIS_MODEL || 'gpt-4o').trim(),
      timeoutMs: toPositive(env.OPENAI_TIMEOUT_MS, 90_000),
      maxOutputTokens: toPositive(env.OPENAI_MAX_OUTPUT_TOKENS, 3_500),
    },
    mathpix: {
      apiKey: String(env.MATHPIX_API_KEY || '').trim(),
      appId: String(env.MATHPIX_APP_ID || '').trim(),
      baseUrl: String(env.MATHPIX_BASE_URL || 'https://api.mathpix.com/v3').trim(),
    },
    limits: {
      maxUploadMb: toPositive(env.AI_MAX_UPLOAD_MB, 15),
      maxPdfPages: toPositive(env.AI_MAX_PDF_PAGES, 25),
      maxBatchFiles: toPositive(env.AI_MAX_BATCH_FILES, 20),
      maxFilesPerSubmission: toPositive(env.AI_MAX_FILES_PER_SUBMISSION, 20),
    },
    rateLimits: {
      windowMs: toPositive(env.API_RATE_LIMIT_WINDOW_MS, 60_000),
      maxRequestsPerWindow: parseInteger(env.API_RATE_LIMIT_MAX_REQUESTS, 80),
      maxAiRequestsPerWindow: parseInteger(env.AI_RATE_LIMIT_MAX_REQUESTS, 20),
    },
    retry: {
      maxAttempts: parseInteger(env.AI_MAX_RETRY_ATTEMPTS, 3),
      baseDelayMs: toPositive(env.AI_RETRY_BASE_DELAY_MS, 2_500),
    },
  };

  const errors = [];
  if (config.flags.ENABLE_OPENAI_RECOGNITION && !config.openai.apiKey) {
    errors.push('ENABLE_OPENAI_RECOGNITION=true requires OPENAI_API_KEY on the server.');
  }
  if (config.flags.ENABLE_MATHPIX && (!config.mathpix.apiKey || !config.mathpix.appId)) {
    errors.push('ENABLE_MATHPIX=true requires MATHPIX_APP_ID and MATHPIX_API_KEY.');
  }
  if (config.limits.maxBatchFiles > 50) {
    errors.push('AI_MAX_BATCH_FILES must be 50 or less for this deployment profile.');
  }
  if (errors.length) {
    const error = new Error(errors.join(' '));
    error.code = 'AI_ENV_VALIDATION_FAILED';
    throw error;
  }

  return config;
}

export function redactAiError(error) {
  if (!error) return 'Не удалось обработать запрос AI.';
  if (error.name === 'AbortError') return 'Превышено время ожидания ответа AI-провайдера.';
  return 'Не удалось завершить AI-обработку. Попробуйте повторить позже.';
}

export function featureFlagsPayload(config) {
  return {
    ENABLE_OPENAI_RECOGNITION: config.flags.ENABLE_OPENAI_RECOGNITION,
    ENABLE_MATHPIX: config.flags.ENABLE_MATHPIX,
    ENABLE_BATCH_AI_GRADING: config.flags.ENABLE_BATCH_AI_GRADING,
    ENABLE_ADVANCED_FORMULA_RECOGNITION: config.flags.ENABLE_ADVANCED_FORMULA_RECOGNITION,
    ENABLE_TEACHER_REVIEW_REQUIRED: config.flags.ENABLE_TEACHER_REVIEW_REQUIRED,
  };
}

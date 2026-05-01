export const recognitionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pages', 'globalConfidence', 'warnings'],
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pageNumber', 'detectedBlocks'],
        properties: {
          pageNumber: { type: 'integer', minimum: 1 },
          detectedBlocks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'text', 'latex', 'confidence'],
              properties: {
                type: {
                  type: 'string',
                  enum: ['task', 'solution', 'answer', 'annotation', 'diagram', 'unknown'],
                },
                text: { type: 'string' },
                latex: { type: ['string', 'null'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
          },
        },
      },
    },
    globalConfidence: { type: 'number', minimum: 0, maximum: 1 },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

export const analysisResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'extractedTask',
    'studentSolutionSummary',
    'canonicalSolution',
    'mistakes',
    'mistakeTags',
    'suggestedScore',
    'studentCommentDraft',
    'teacherCommentDraft',
    'recommendations',
    'confidence',
    'needsHumanReview',
    'warnings',
  ],
  properties: {
    extractedTask: { type: 'string' },
    studentSolutionSummary: { type: 'string' },
    canonicalSolution: { type: 'string' },
    mistakes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'severity', 'locationHint', 'isRecognitionUncertain'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          locationHint: { type: 'string' },
          isRecognitionUncertain: { type: 'boolean' },
        },
      },
    },
    mistakeTags: {
      type: 'array',
      items: { type: 'string' },
    },
    suggestedScore: { type: 'number' },
    studentCommentDraft: { type: 'string' },
    teacherCommentDraft: { type: 'string' },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    needsHumanReview: { type: 'boolean' },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};


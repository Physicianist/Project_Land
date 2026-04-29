import { NORMALIZED_ERROR_TAXONOMY } from '../../shared/error-taxonomy.js';

const compactJson = (value) => JSON.stringify(value, null, 2);
const OCR_DIAGRAM_MARKER = '[рисунок смотри на оригинале слева]';

export function buildRecognitionInstructions({ assignmentContext = {}, assetLabel = '' } = {}) {
  return [
    'Ты помогаешь преподавателю проверить письменную работу ученика.',
    'Нужно извлечь только то, что реально видно на изображении или в PDF.',
    'Не выдумывай отсутствующие фрагменты условия или решения.',
    'Распознавай только текст, формулы и короткие пометки.',
    `Если на странице есть рисунок, график, схема или чертеж, не описывай его словами. Вместо описания добавляй маркер "${OCR_DIAGRAM_MARKER}".`,
    'Сохраняй порядок страниц и не смешивай текст с разных страниц.',
    'Если уверенность низкая, укажи это в warnings и снизь confidence.',
    'Верни только JSON по заданной схеме.',
    assetLabel ? `Контекст файла: ${assetLabel}.` : '',
    assignmentContext?.subject ? `Предмет: ${assignmentContext.subject}.` : '',
    assignmentContext?.title ? `Название задания: ${assignmentContext.title}.` : '',
    assignmentContext?.description ? `Описание задания: ${assignmentContext.description}.` : '',
    assignmentContext?.links?.length ? `Полезные ссылки по заданию: ${assignmentContext.links.join(', ')}.` : '',
  ].filter(Boolean).join('\n');
}

export function buildRecognitionUserPrompt({ assignmentContext = {} } = {}) {
  return [
    'Извлеки структуру работы постранично.',
    'Для каждого блока укажи тип: task, solution, answer, annotation, diagram или unknown.',
    'Если формула читается, продублируй ее в latex. Если нет, оставь latex = null.',
    'Если в одном файле несколько задач, не смешивай условие и решение.',
    `Если блок соответствует рисунку или схеме, в поле text верни только "${OCR_DIAGRAM_MARKER}".`,
    'Не описывай внешний вид страницы и не добавляй лишние объяснения.',
    'Контекст задания:',
    compactJson({
      subject: assignmentContext.subject || null,
      title: assignmentContext.title || null,
      description: assignmentContext.description || null,
      links: assignmentContext.links || [],
      rubric: assignmentContext.rubric || null,
      expectedAnswer: assignmentContext.expectedAnswer || null,
      scoringScale: assignmentContext.scoringScale || null,
    }),
  ].join('\n');
}

export function buildAnalysisInstructions({ assignmentContext = {} } = {}) {
  return [
    'Ты готовишь черновик проверки для преподавателя.',
    'Не раскрывай скрытые рассуждения и не выводи chain-of-thought.',
    'Нужно отделять ошибку ученика от ошибки распознавания.',
    'Если данных недостаточно или распознавание сомнительное, ставь needsHumanReview=true.',
    'Если оценка неочевидна, дай консервативный suggestedScore и предупреди об этом.',
    'Комментарий ученику должен быть коротким, уважительным и понятным.',
    'Комментарий преподавателю может быть более техническим и подробным.',
    'Теги ошибок должны быть короткими, понятными и на русском языке.',
    `Нормализуй верхнеуровневые типы ошибок вокруг этих категорий: ${NORMALIZED_ERROR_TAXONOMY.join(', ')}.`,
    assignmentContext?.toneOfVoiceForFeedback ? `Тон комментария ученику: ${assignmentContext.toneOfVoiceForFeedback}.` : '',
  ].filter(Boolean).join('\n');
}

export function buildAnalysisUserPrompt({ assignmentContext = {}, recognitionResult = {} } = {}) {
  return [
    'Построй черновик проверки по распознанной работе.',
    'Если возможно, восстанови условие задачи, предложи эталонное решение или проверку решения ученика.',
    'Указывай конкретные ошибки по шагам, но не утверждай ошибку, если это может быть OCR/vision ambiguity.',
    'Контекст задания:',
    compactJson({
      subject: assignmentContext.subject || null,
      title: assignmentContext.title || null,
      description: assignmentContext.description || null,
      links: assignmentContext.links || [],
      rubric: assignmentContext.rubric || null,
      gradingCriteria: assignmentContext.gradingCriteria || null,
      expectedAnswer: assignmentContext.expectedAnswer || null,
      scoringScale: assignmentContext.scoringScale || null,
      maxScore: assignmentContext.maxScore || null,
    }),
    'Распознанная структура:',
    compactJson(recognitionResult),
  ].join('\n');
}

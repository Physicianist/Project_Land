/**
 * Prompt builders for recognition and analysis.
 *
 * IMPORTANT: Assignment context is placed at the START of system instructions
 * to maximise OpenAI prefix cache hit rate — the static context prefix is
 * shared across repeated requests for the same assignment.
 */
const compactJson = (value) => JSON.stringify(value, null, 2);

export function buildRecognitionInstructions({ assignmentContext = {}, assetLabel = '' } = {}) {
  // Assignment context first → stable prefix for caching
  const contextBlock = [
    assignmentContext?.subject ? `Предмет: ${assignmentContext.subject}.` : '',
    assignmentContext?.title ? `Название задания: ${assignmentContext.title}.` : '',
    assignmentContext?.description ? `Описание задания: ${assignmentContext.description}.` : '',
    assignmentContext?.expectedAnswer ? `Ожидаемый ответ: ${assignmentContext.expectedAnswer}.` : '',
    assignmentContext?.scoringScale ? `Шкала оценивания: ${assignmentContext.scoringScale}.` : '',
  ].filter(Boolean).join('\n');

  return [
    contextBlock,
    assetLabel ? `Контекст файла: ${assetLabel}.` : '',
    // General instructions after the stable prefix
    'Ты помогаешь преподавателю проверить письменную работу ученика.',
    'Нужно извлечь только то, что реально видно на изображении или в PDF.',
    'Не выдумывай отсутствующие фрагменты условия или решения.',
    'Если уверенность низкая, укажи это в warnings и снизь confidence.',
    'Верни только JSON по заданной схеме.',
  ].filter(Boolean).join('\n');
}

export function buildRecognitionUserPrompt({ assignmentContext = {} } = {}) {
  return [
    'Извлеки структуру работы постранично.',
    'Для каждого блока укажи тип: task, solution, answer, annotation, diagram или unknown.',
    'Если формула читается, продублируй ее в latex. Если нет, оставь latex = null.',
    'Если в одном файле несколько задач, не смешивай условие и решение.',
    'Контекст задания:',
    compactJson({
      subject: assignmentContext.subject || null,
      title: assignmentContext.title || null,
      description: assignmentContext.description || null,
      rubric: assignmentContext.rubric || null,
      expectedAnswer: assignmentContext.expectedAnswer || null,
      scoringScale: assignmentContext.scoringScale || null,
    }),
  ].join('\n');
}

export function buildAnalysisInstructions({ assignmentContext = {} } = {}) {
  // Assignment context first → stable prefix for caching
  const contextBlock = [
    assignmentContext?.subject ? `Предмет: ${assignmentContext.subject}.` : '',
    assignmentContext?.title ? `Задание: ${assignmentContext.title}.` : '',
    assignmentContext?.description ? `Описание: ${assignmentContext.description}.` : '',
    assignmentContext?.gradingCriteria ? `Критерии оценивания: ${assignmentContext.gradingCriteria}.` : '',
    assignmentContext?.expectedAnswer ? `Ожидаемый ответ: ${assignmentContext.expectedAnswer}.` : '',
    assignmentContext?.scoringScale ? `Максимум баллов: ${assignmentContext.scoringScale}.` : '',
  ].filter(Boolean).join('\n');

  return [
    contextBlock,
    // General instructions after the stable prefix
    'Ты готовишь черновик проверки для преподавателя.',
    'Не раскрывай скрытые рассуждения и не выводи chain-of-thought.',
    'Нужно отделять ошибку ученика от ошибки распознавания.',
    'Если данных недостаточно или распознавание сомнительное, ставь needsHumanReview=true.',
    'Если оценка неочевидна, дай консервативный suggestedScore и предупреди об этом.',
    'Комментарий ученику должен быть коротким, уважительным и понятным.',
    'Комментарий преподавателю может быть более техническим и подробным.',
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

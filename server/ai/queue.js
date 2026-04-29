import { redactAiError } from './config.js';
import {
  buildProcessingContext,
  copyRecognitionPagesFromCache,
  createOrReuseRecognitionJob,
  ensureAiDbDefaults,
  finalizeFailedJob,
  finalizeSuccessfulJob,
  getRecognitionPages,
  markJobProcessing,
  pickNextRecognitionJob,
  storeRecognitionResult,
} from './pipeline.js';
import {
  HuggingFaceRecognitionProvider,
  MathpixRecognitionProvider,
  OpenAIRecognitionProvider,
  RecognitionOrchestrator,
  generateAnalysisDraft,
} from './providers.js';

export function createRecognitionQueue({ config, readDb, writeDb, uploadsDir }) {
  const openaiProvider = new OpenAIRecognitionProvider({ config, uploadsDir });
  const mathpixProvider = new MathpixRecognitionProvider();
  const huggingFaceProvider = config.flags.ENABLE_HUGGINGFACE_OCR
    ? new HuggingFaceRecognitionProvider({ config, uploadsDir })
    : null;
  const orchestrator = new RecognitionOrchestrator({
    config,
    openaiProvider,
    mathpixProvider,
    huggingFaceProvider,
  });
  let timer = null;
  let running = false;

  const schedule = (delayMs = 50) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, delayMs);
  };

  const start = () => schedule(25);

  const enqueueSubmission = (submissionId, teacherId = null, forceNewRevision = false) => {
    const db = readDb();
    ensureAiDbDefaults(db);
    const job = createOrReuseRecognitionJob(db, { submissionId, teacherId, forceNewRevision });
    if (!job) return null;
    writeDb(db);
    schedule(25);
    return job;
  };

  const enqueueBatchSession = (sessionId, teacherId = null, forceFailedOnly = false) => {
    const db = readDb();
    ensureAiDbDefaults(db);
    const session = (db.batchSessions || []).find(item => item.id === sessionId);
    if (!session) return [];
    const jobs = [];
    (session.results || []).forEach(result => {
      if (forceFailedOnly && result.status !== 'failed') return;
      const job = createOrReuseRecognitionJob(db, { submissionId: result.submissionId, teacherId, forceNewRevision: forceFailedOnly });
      if (job) jobs.push(job);
    });
    writeDb(db);
    schedule(25);
    return jobs;
  };

  const processQueuedJob = async (jobId) => {
    const preDb = readDb();
    ensureAiDbDefaults(preDb);
    const marked = markJobProcessing(preDb, jobId);
    if (!marked) return false;
    writeDb(preDb);

    try {
      const workingDb = readDb();
      ensureAiDbDefaults(workingDb);
      const context = buildProcessingContext(workingDb, marked.job.submissionId);
      if (!context || !context.assets.length) {
        throw new Error('Не найдены файлы для AI-обработки.');
      }

      const providersUsed = new Set();
      for (const asset of context.assets) {
        const reused = copyRecognitionPagesFromCache(workingDb, asset);
        if (reused) continue;
        const recognitionResult = await orchestrator.extract({
          assets: [asset],
          assignmentContext: context.assignmentContext,
          hintText: context.hintText,
        });
        providersUsed.add(recognitionResult.provider);
        storeRecognitionResult(workingDb, asset, recognitionResult, recognitionResult.provider);
      }

      const recognitionPages = getRecognitionPages(workingDb, context.submission.id);
      const analysisDraft = await generateAnalysisDraft({
        config,
        assignmentContext: context.assignmentContext,
        recognitionResult: {
          pages: recognitionPages.map(page => ({
            pageNumber: page.pageNumber,
            detectedBlocks: page.detectionBlocks || [],
          })),
          globalConfidence: recognitionPages.length
            ? recognitionPages.reduce((sum, page) => sum + Number(page.recognitionConfidence || 0), 0) / recognitionPages.length
            : 0,
          warnings: [],
        },
      });

      finalizeSuccessfulJob(workingDb, jobId, {
        recognitionPages,
        analysisDraft,
        provider: providersUsed.size ? Array.from(providersUsed).join('+') : 'cache',
      });
      writeDb(workingDb);
      return true;
    } catch (error) {
      const failedDb = readDb();
      ensureAiDbDefaults(failedDb);
      finalizeFailedJob(failedDb, jobId, {
        safeMessage: redactAiError(error),
        retryConfig: config.retry,
      });
      writeDb(failedDb);
      return true;
    }
  };

  const drain = async () => {
    if (running) return;
    running = true;
    try {
      while (true) {
        const db = readDb();
        ensureAiDbDefaults(db);
        const nextJob = pickNextRecognitionJob(db);
        if (!nextJob) break;
        await processQueuedJob(nextJob.id);
      }
    } finally {
      running = false;
      schedule(1_500);
    }
  };

  return {
    start,
    schedule,
    enqueueSubmission,
    enqueueBatchSession,
    drain,
  };
}

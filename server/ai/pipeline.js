import { createIdempotencyKey, fileKindFromMime } from './file-utils.js';
import {
  normalizeErrorCategory,
  normalizeErrorTags,
  normalizeMistakeCollection,
  sanitizeEditableErrorTags,
} from '../../shared/error-taxonomy.js';

const uniqueStrings = (items = []) => [...new Set(items.filter(Boolean).map(String))];

export const SubmissionStatuses = {
  uploaded: 'uploaded',
  queued: 'queued',
  processing: 'processing',
  draftReady: 'draft_ready',
  needsHumanReview: 'needs_human_review',
  approved: 'approved',
  failed: 'failed',
};

export function submissionIdForWork(workId) {
  return `sub-${workId}`;
}

export function submissionIdForBatchResult(sessionId, resultId) {
  return `sub-${sessionId}-${resultId}`;
}

export function analysisDraftIdForSubmission(submissionId) {
  return `ad-${submissionId}`;
}

export function teacherReviewIdForSubmission(submissionId) {
  return `tr-${submissionId}`;
}

export function finalFeedbackIdForSubmission(submissionId) {
  return `ff-${submissionId}`;
}

function assetIdForSubmission(submissionId, index) {
  return `sa-${submissionId}-${index + 1}`;
}

function recognitionJobIdForKey(idempotencyKey) {
  return `rjob-${idempotencyKey.slice(0, 24)}`;
}

function normalizeSubmissionStatusFromLegacyWork(work = {}) {
  if (work.status === 'Проверено') return SubmissionStatuses.approved;
  if (work.processingStatus === SubmissionStatuses.processing) return SubmissionStatuses.processing;
  if (work.processingStatus === SubmissionStatuses.failed) return SubmissionStatuses.failed;
  if (work.needsHumanReview) return SubmissionStatuses.needsHumanReview;
  if (work.analysisDraftId || work.ocrText || work.aiComment || (work.aiErrors || []).length) return SubmissionStatuses.draftReady;
  return SubmissionStatuses.uploaded;
}

function normalizeBatchStatus(result = {}) {
  if (result.status) return result.status;
  if (result.score !== undefined || result.aiComment || result.typedText) return SubmissionStatuses.draftReady;
  return SubmissionStatuses.uploaded;
}

function buildLegacyAnalysisDraft(work = {}, assignment = {}) {
  return {
    id: analysisDraftIdForSubmission(work.submissionId || submissionIdForWork(work.id)),
    submissionId: work.submissionId || submissionIdForWork(work.id),
    extractedTask: assignment.description || assignment.title || '',
    extractedStudentSolution: work.ocrText || '',
    studentSolutionSummary: work.ocrText || '',
    canonicalSolution: '',
    detectedMistakes: Array.isArray(work.aiErrors) ? work.aiErrors : [],
    teacherCommentDraft: work.teacherCommentDraft || '',
    studentCommentDraft: work.aiComment || '',
    suggestedScore: Number(work.suggestedScore ?? work.finalScore ?? 0),
    confidence: Number(work.aiConfidence || 0.55),
    needsHumanReview: work.status !== 'Проверено',
    rawModelOutput: null,
    mistakeTags: uniqueStrings((work.aiErrors || []).flatMap(item => item.types || [])),
    recommendations: Array.isArray(work.recommendations) ? work.recommendations : [],
    warnings: Array.isArray(work.reviewWarnings) ? work.reviewWarnings : [],
  };
}

function buildBatchAnalysisDraft(session, result) {
  return {
    id: analysisDraftIdForSubmission(result.submissionId || submissionIdForBatchResult(session.id, result.id)),
    submissionId: result.submissionId || submissionIdForBatchResult(session.id, result.id),
    extractedTask: '',
    extractedStudentSolution: result.typedText || '',
    studentSolutionSummary: result.typedText || '',
    canonicalSolution: '',
    detectedMistakes: (result.errorTypes || []).map(type => ({
      types: [type],
      label: type,
      description: result.errorDescription || '',
    })),
    teacherCommentDraft: result.teacherCommentDraft || '',
    studentCommentDraft: result.aiComment || '',
    suggestedScore: Number(result.score || 0),
    confidence: Number(result.aiConfidence || 0.5),
    needsHumanReview: result.status !== SubmissionStatuses.approved,
    rawModelOutput: null,
    mistakeTags: uniqueStrings(result.errorTypes || []),
    recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
  };
}

function normalizeAssetRecord(submissionId, file = {}, index = 0) {
  const mimeType = file.mimeType || (String(file.name || '').toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
  return {
    id: assetIdForSubmission(submissionId, index),
    submissionId,
    type: mimeType === 'application/pdf' ? 'pdf' : 'image',
    originalUrl: file.url,
    normalizedUrl: file.normalizedUrl || file.url,
    previewUrl: file.previewUrl || file.url,
    pageCount: Number(file.pageCount || 1),
    sha256: file.sha256 || null,
    mimeType,
    sizeBytes: Number(file.sizeBytes || 0) || null,
    originalName: file.originalName || file.name || `file-${index + 1}`,
    storageName: file.storageName || null,
    kind: file.kind || fileKindFromMime(mimeType, file.name),
  };
}

function extractPageOrder(label = '') {
  const stem = String(label || '').replace(/\.[^.]+$/, '').toLowerCase();
  const match = stem.match(/(?:page|p|стр|лист|img|image|scan|photo|фото)?[\s_-]*(\d{1,3})$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function inferBatchIdentity(label = '') {
  const stem = String(label || '')
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
    .replace(/(?:page|p|стр|лист|img|image|scan|photo|фото)[\s_-]*\d{1,3}$/i, '')
    .replace(/[\s_-]+\d{1,3}$/i, '')
    .replace(/[\s_-]+/g, ' ')
    .trim();
  if (!stem) return null;
  const genericWords = new Set(['img', 'image', 'scan', 'photo', 'file', 'work', 'page', 'лист', 'стр', 'фото']);
  const meaningfulWords = stem.split(' ').filter(part => part && !genericWords.has(part) && /[a-zа-яё]/i.test(part));
  if (!meaningfulWords.length) return null;
  const key = meaningfulWords.join(' ').trim();
  return key.length >= 3 ? key : null;
}

function humanizeBatchIdentity(identity, fallbackLabel) {
  if (!identity) return fallbackLabel;
  return identity
    .split(' ')
    .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1) : '')
    .join(' ')
    .trim();
}

function upsertById(list, entry) {
  const index = list.findIndex(item => item.id === entry.id);
  if (index === -1) list.push(entry);
  else list[index] = { ...list[index], ...entry };
  return list.find(item => item.id === entry.id);
}

export function appendAuditTrail(db, entry) {
  db.auditTrail ||= [];
  db.auditTrail.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  });
  db.auditTrail = db.auditTrail.slice(0, 500);
}

export function ensureAiDbDefaults(db) {
  db.submissions ||= [];
  db.submissionAssets ||= [];
  db.recognitionJobs ||= [];
  db.recognitionPages ||= [];
  db.analysisDrafts ||= [];
  db.teacherReviews ||= [];
  db.finalFeedbacks ||= [];
  db.parentReportSnapshots ||= [];
  db.auditTrail ||= [];

  (db.works || []).forEach(work => {
    const assignment = (db.assignments || []).find(item => item.id === work.assignmentId) || {};
    const submissionId = work.submissionId || submissionIdForWork(work.id);
    work.submissionId = submissionId;
    upsertById(db.submissions, {
      id: submissionId,
      workId: work.id,
      sourceType: 'assignment_work',
      sourceRefId: work.id,
      assignmentId: work.assignmentId,
      teacherId: work.teacherId || assignment.teacherId || null,
      studentId: work.studentId,
      status: normalizeSubmissionStatusFromLegacyWork(work),
      processingRevision: Number(work.processingRevision || 1),
      processingStartedAt: work.processingStartedAt || null,
      processingFinishedAt: work.processingFinishedAt || null,
      createdAt: work.submittedAt || null,
      lastJobId: work.lastJobId || null,
    });

    (work.files || []).forEach((file, index) => {
      upsertById(db.submissionAssets, normalizeAssetRecord(submissionId, file, index));
    });

    if ((work.ocrText || work.aiComment || (work.aiErrors || []).length) && !db.analysisDrafts.find(item => item.submissionId === submissionId)) {
      db.analysisDrafts.push(buildLegacyAnalysisDraft(work, assignment));
    }

    if (work.status === 'Проверено') {
      const review = upsertById(db.teacherReviews, {
        id: teacherReviewIdForSubmission(submissionId),
        submissionId,
        editedStudentComment: work.aiComment || '',
        editedTeacherComment: work.teacherComment || '',
        finalScore: work.finalScore ?? work.suggestedScore ?? 0,
        teacherApprovedAt: work.approvedAt || work.reviewedAt || null,
        wasEditedAfterAI: Boolean(work.wasEditedAfterAI),
      });
      upsertById(db.finalFeedbacks, {
        id: finalFeedbackIdForSubmission(submissionId),
        submissionId,
        studentId: work.studentId,
        teacherId: work.teacherId || null,
        finalScore: work.finalScore ?? work.suggestedScore ?? 0,
        studentComment: review.editedStudentComment,
        teacherComment: review.editedTeacherComment,
        recommendations: Array.isArray(work.recommendations) ? work.recommendations : [],
        publishedAt: work.approvedAt || work.reviewedAt || null,
      });
    }
  });

  (db.batchSessions || []).forEach(session => {
    session.results ||= [];
    session.results.forEach((result, index) => {
      const submissionId = result.submissionId || submissionIdForBatchResult(session.id, result.id || `r${index + 1}`);
      result.submissionId = submissionId;
      upsertById(db.submissions, {
        id: submissionId,
        sourceType: 'batch_result',
        sourceRefId: `${session.id}:${result.id}`,
        batchSessionId: session.id,
        batchResultId: result.id,
        teacherId: session.teacherId || null,
        studentId: null,
        assignmentId: null,
        status: normalizeBatchStatus(result),
        processingRevision: Number(result.processingRevision || 1),
        processingStartedAt: result.processingStartedAt || null,
        processingFinishedAt: result.processingFinishedAt || null,
        createdAt: session.createdAt,
        lastJobId: result.lastJobId || null,
      });
      const sourceFile = result.file || session.files?.[index] || {
        id: `file-${index + 1}`,
        name: result.originalName || `batch-${index + 1}`,
        originalName: result.originalName || `batch-${index + 1}`,
        url: result.sourceUrl || null,
      };
      const sourceFiles = (result.sourceFiles?.length ? result.sourceFiles : [sourceFile]).filter(Boolean);
      result.sourceFiles = sourceFiles;
      sourceFiles.forEach((file, assetIndex) => {
        upsertById(db.submissionAssets, normalizeAssetRecord(submissionId, file, assetIndex));
      });
      if ((result.typedText || result.aiComment || (result.errorTypes || []).length) && !db.analysisDrafts.find(item => item.submissionId === submissionId)) {
        db.analysisDrafts.push(buildBatchAnalysisDraft(session, result));
      }
    });
  });

  return db;
}

export function getSubmissionById(db, submissionId) {
  ensureAiDbDefaults(db);
  return (db.submissions || []).find(item => item.id === submissionId) || null;
}

export function getSubmissionAssets(db, submissionId) {
  ensureAiDbDefaults(db);
  return (db.submissionAssets || []).filter(item => item.submissionId === submissionId);
}

export function getAnalysisDraft(db, submissionId) {
  ensureAiDbDefaults(db);
  return (db.analysisDrafts || []).find(item => item.submissionId === submissionId) || null;
}

export function getTeacherReview(db, submissionId) {
  ensureAiDbDefaults(db);
  return (db.teacherReviews || []).find(item => item.submissionId === submissionId) || null;
}

export function getFinalFeedback(db, submissionId) {
  ensureAiDbDefaults(db);
  return (db.finalFeedbacks || []).find(item => item.submissionId === submissionId) || null;
}

export function getRecognitionPages(db, submissionId) {
  ensureAiDbDefaults(db);
  const assetIds = new Set(getSubmissionAssets(db, submissionId).map(item => item.id));
  return (db.recognitionPages || [])
    .filter(item => assetIds.has(item.submissionAssetId))
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

export function decorateWorkWithAi(db, work) {
  ensureAiDbDefaults(db);
  const submissionId = work.submissionId || submissionIdForWork(work.id);
  return {
    ...work,
    submission: getSubmissionById(db, submissionId),
    submissionAssets: getSubmissionAssets(db, submissionId),
    recognitionPages: getRecognitionPages(db, submissionId),
    analysisDraft: getAnalysisDraft(db, submissionId),
    teacherReview: getTeacherReview(db, submissionId),
    finalFeedback: getFinalFeedback(db, submissionId),
  };
}

export function decorateBatchResultWithAi(db, session, result) {
  ensureAiDbDefaults(db);
  const submissionId = result.submissionId || submissionIdForBatchResult(session.id, result.id);
  return {
    ...result,
    submission: getSubmissionById(db, submissionId),
    submissionAssets: getSubmissionAssets(db, submissionId),
    recognitionPages: getRecognitionPages(db, submissionId),
    analysisDraft: getAnalysisDraft(db, submissionId),
  };
}

export function registerWorkSubmission(db, work, assignment = {}) {
  ensureAiDbDefaults(db);
  const submissionId = work.submissionId || submissionIdForWork(work.id);
  work.submissionId = submissionId;
  work.processingStatus = SubmissionStatuses.uploaded;
  work.processingRevision = Number(work.processingRevision || 1);
  work.aiProcessingError = null;
  work.aiComment ||= 'Работа загружена. AI готовит черновик проверки.';
  upsertById(db.submissions, {
    id: submissionId,
    workId: work.id,
    sourceType: 'assignment_work',
    sourceRefId: work.id,
    assignmentId: work.assignmentId,
    teacherId: work.teacherId || assignment.teacherId || null,
    studentId: work.studentId,
    status: SubmissionStatuses.uploaded,
    processingRevision: work.processingRevision,
    processingStartedAt: null,
    processingFinishedAt: null,
    createdAt: work.submittedAt || new Date().toISOString(),
    lastJobId: null,
  });
  (work.files || []).forEach((file, index) => {
    upsertById(db.submissionAssets, normalizeAssetRecord(submissionId, file, index));
  });
  return getSubmissionById(db, submissionId);
}

export function createBatchResultsFromUploadedFiles(session, uploadedFiles = []) {
  const grouped = [];
  uploadedFiles.forEach((file, index) => {
    const label = file.originalName || file.name || `Файл ${index + 1}`;
    const inferredIdentity = inferBatchIdentity(label);
    const existingGroup = inferredIdentity
      ? grouped.find(item => item.inferredIdentity === inferredIdentity)
      : null;
    if (existingGroup) {
      existingGroup.sourceFiles.push(file);
      return;
    }
    grouped.push({
      inferredIdentity,
      sourceFiles: [file],
    });
  });

  return grouped.map((group, index) => {
    const sourceFiles = [...group.sourceFiles].sort((left, right) => extractPageOrder(left.originalName || left.name) - extractPageOrder(right.originalName || right.name));
    const primaryFile = sourceFiles[0] || null;
    return {
      id: `r${index + 1}`,
      name: humanizeBatchIdentity(group.inferredIdentity, `Ученик ${index + 1}`),
      inferredIdentity: group.inferredIdentity,
      originalLabel: primaryFile?.originalName || primaryFile?.name || `Файл ${index + 1}`,
      originalName: primaryFile?.originalName || primaryFile?.name || `Файл ${index + 1}`,
      sourceUrl: primaryFile?.url || null,
      file: primaryFile,
      sourceFiles,
      score: null,
      aiComment: '',
      teacherCommentDraft: '',
      errorTypes: [],
      errorDescription: '',
      typedText: '',
      submittedAt: new Date().toISOString().slice(0, 10),
      status: SubmissionStatuses.uploaded,
      processingRevision: 1,
      aiConfidence: null,
      recognitionConfidence: null,
      warnings: [],
      needsHumanReview: false,
    };
  });
}

function buildAssignmentSignature(assignmentContext = {}) {
  return createIdempotencyKey([
    assignmentContext.subject,
    assignmentContext.title,
    assignmentContext.description,
    ...(assignmentContext.links || []),
    assignmentContext.rubric,
    assignmentContext.gradingCriteria,
    assignmentContext.expectedAnswer,
    assignmentContext.scoringScale,
    assignmentContext.maxScore,
  ]);
}

export function buildProcessingContext(db, submissionId) {
  ensureAiDbDefaults(db);
  const submission = getSubmissionById(db, submissionId);
  if (!submission) return null;
  const work = submission.workId ? (db.works || []).find(item => item.id === submission.workId) || null : null;
  const batchSession = submission.batchSessionId ? (db.batchSessions || []).find(item => item.id === submission.batchSessionId) || null : null;
  const batchResult = batchSession?.results?.find(item => item.id === submission.batchResultId) || null;
  const assignment = work?.assignmentId ? (db.assignments || []).find(item => item.id === work.assignmentId) || null : null;
  const assignmentContext = assignment ? {
    subject: assignment.subject,
    title: assignment.title,
    description: assignment.description,
    links: assignment.links || assignment.assignmentLinks || [],
    rubric: assignment.rubric || assignment.gradingCriteria || '',
    gradingCriteria: assignment.gradingCriteria || assignment.rubric || '',
    expectedAnswer: assignment.expectedAnswer || null,
    scoringScale: assignment.scoringScale || assignment.maxScore || 100,
    toneOfVoiceForFeedback: assignment.toneOfVoiceForFeedback || 'поддерживающий, но точный',
    maxScore: assignment.maxScore || 100,
  } : {
    subject: 'Свободная проверка',
    title: batchResult?.name || 'Пакетная проверка',
    description: batchSession?.assignmentText || 'Пакетная проверка без привязки к конкретному заданию.',
    links: batchSession?.assignmentLinks || [],
    rubric: '',
    gradingCriteria: '',
    expectedAnswer: null,
    scoringScale: batchSession?.scale || 100,
    toneOfVoiceForFeedback: 'поддерживающий, но точный',
    maxScore: Number(batchSession?.scale || 100),
  };

  const assets = getSubmissionAssets(db, submissionId);
  const hintText = [
    assignmentContext.title,
    assignmentContext.description,
    assignmentContext.subject,
    ...(assignmentContext.links || []),
    batchSession?.classGroupLabel || '',
  ].filter(Boolean).join('\n');
  const assignmentSignature = buildAssignmentSignature(assignmentContext);
  return {
    submission,
    work,
    batchSession,
    batchResult,
    assignment,
    assignmentContext,
    assets,
    hintText,
    assignmentSignature,
  };
}

export function createOrReuseRecognitionJob(db, { submissionId, teacherId = null, forceNewRevision = false }) {
  ensureAiDbDefaults(db);
  const context = buildProcessingContext(db, submissionId);
  if (!context) return null;
  const { submission, assets, assignmentSignature } = context;
  if (forceNewRevision) submission.processingRevision = Number(submission.processingRevision || 1) + 1;
  else submission.processingRevision = Number(submission.processingRevision || 1);

  const idempotencyKey = createIdempotencyKey([
    submission.id,
    submission.processingRevision,
    assignmentSignature,
    ...assets.map(asset => asset.sha256 || asset.id),
  ]);
  const existing = (db.recognitionJobs || []).find(item => item.idempotencyKey === idempotencyKey);
  if (existing) return existing;

  const job = {
    id: recognitionJobIdForKey(idempotencyKey),
    submissionId: submission.id,
    teacherId,
    status: SubmissionStatuses.queued,
    attempts: 0,
    createdAt: new Date().toISOString(),
    processingRevision: submission.processingRevision,
    idempotencyKey,
    nextAttemptAt: new Date().toISOString(),
    lastError: null,
    sourceType: submission.sourceType,
    sourceRefId: submission.sourceRefId,
  };
  db.recognitionJobs.unshift(job);
  submission.status = SubmissionStatuses.queued;
  submission.lastJobId = job.id;
  if (context.work) {
    context.work.processingStatus = SubmissionStatuses.queued;
    context.work.lastJobId = job.id;
  }
  if (context.batchResult) {
    context.batchResult.status = SubmissionStatuses.queued;
    context.batchResult.lastJobId = job.id;
  }
  appendAuditTrail(db, {
    actorId: teacherId,
    action: 'ai_job_enqueued',
    entityType: 'submission',
    entityId: submission.id,
    meta: { sourceType: submission.sourceType, processingRevision: submission.processingRevision },
  });
  return job;
}

export function pickNextRecognitionJob(db) {
  ensureAiDbDefaults(db);
  const now = Date.now();
  return (db.recognitionJobs || [])
    .filter(job => job.status === SubmissionStatuses.queued && new Date(job.nextAttemptAt || job.createdAt).getTime() <= now)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0] || null;
}

export function markJobProcessing(db, jobId) {
  ensureAiDbDefaults(db);
  const job = (db.recognitionJobs || []).find(item => item.id === jobId);
  if (!job) return null;
  const context = buildProcessingContext(db, job.submissionId);
  if (!context) return null;
  job.status = SubmissionStatuses.processing;
  job.attempts = Number(job.attempts || 0) + 1;
  job.startedAt = new Date().toISOString();
  context.submission.status = SubmissionStatuses.processing;
  context.submission.processingStartedAt = job.startedAt;
  if (context.work) {
    context.work.processingStatus = SubmissionStatuses.processing;
    context.work.processingStartedAt = job.startedAt;
    context.work.aiProcessingError = null;
  }
  if (context.batchResult) {
    context.batchResult.status = SubmissionStatuses.processing;
    context.batchResult.processingStartedAt = job.startedAt;
  }
  return { job, context };
}

function copyRecognitionFromCachedAsset(db, currentAsset) {
  if (!currentAsset.sha256) return false;
  const cachedAsset = (db.submissionAssets || []).find(asset => asset.id !== currentAsset.id && asset.sha256 && asset.sha256 === currentAsset.sha256);
  if (!cachedAsset) return false;
  const cachedPages = (db.recognitionPages || []).filter(page => page.submissionAssetId === cachedAsset.id);
  if (!cachedPages.length) return false;
  cachedPages.forEach(page => {
    upsertById(db.recognitionPages, {
      ...page,
      id: `${currentAsset.id}-page-${page.pageNumber}`,
      submissionAssetId: currentAsset.id,
    });
  });
  return true;
}

function persistRecognitionForAsset(db, asset, recognitionResult, provider) {
  (recognitionResult.pages || []).forEach((page, index) => {
    const detectionBlocks = (page.detectedBlocks || []).map(block => ({
      ...block,
      text: block.type === 'diagram'
        ? '[рисунок смотри на оригинале слева]'
        : String(block.text || '').trim(),
    }));
    upsertById(db.recognitionPages, {
      id: `${asset.id}-page-${page.pageNumber || index + 1}`,
      submissionAssetId: asset.id,
      pageNumber: Number(page.pageNumber || index + 1),
      recognizedText: detectionBlocks.map(block => block.text).filter(Boolean).join('\n\n'),
      recognizedLatex: detectionBlocks.map(block => block.latex).filter(Boolean).join('\n') || null,
      detectionBlocks,
      recognitionConfidence: Number(recognitionResult.globalConfidence || 0),
      provider,
      rawStructuredOutput: recognitionResult.rawStructuredOutput || recognitionResult,
    });
  });
}

function flattenRecognitionPages(db, submissionId) {
  return getRecognitionPages(db, submissionId).map(page => ({
    pageNumber: page.pageNumber,
    detectedBlocks: page.detectionBlocks || [],
  }));
}

function mistakesToLegacyErrors(mistakes = [], fallbackTags = []) {
  return mistakes.map(mistake => ({
    types: uniqueStrings([
      ...normalizeErrorTags([...(fallbackTags || []), mistake.title, mistake.label, ...(mistake.types || [])]),
      mistake.severity === 'high' ? 'Критично' : '',
    ].filter(Boolean)).slice(0, 3),
    label: mistake.title,
    description: mistake.description,
    locationHint: mistake.locationHint,
    severity: mistake.severity,
    isRecognitionUncertain: mistake.isRecognitionUncertain,
    normalizedCategory: normalizeErrorCategory(
      mistake.title,
      mistake.description,
      ...(mistake.types || []),
    ),
  }));
}

export function finalizeSuccessfulJob(db, jobId, { recognitionPages, analysisDraft, provider }) {
  ensureAiDbDefaults(db);
  const job = (db.recognitionJobs || []).find(item => item.id === jobId);
  if (!job) return null;
  const context = buildProcessingContext(db, job.submissionId);
  if (!context) return null;
  const finishedAt = new Date().toISOString();
  const globalRecognitionConfidence = recognitionPages.length
    ? Number((recognitionPages.reduce((sum, page) => sum + Number(page.recognitionConfidence || 0), 0) / recognitionPages.length).toFixed(3))
    : 0;

  upsertById(db.analysisDrafts, {
    id: analysisDraftIdForSubmission(context.submission.id),
    submissionId: context.submission.id,
    extractedTask: analysisDraft.extractedTask,
    extractedStudentSolution: analysisDraft.studentSolutionSummary,
    studentSolutionSummary: analysisDraft.studentSolutionSummary,
    canonicalSolution: analysisDraft.canonicalSolution,
    detectedMistakes: mistakesToLegacyErrors(analysisDraft.mistakes, analysisDraft.mistakeTags),
    teacherCommentDraft: analysisDraft.teacherCommentDraft,
    studentCommentDraft: analysisDraft.studentCommentDraft,
    suggestedScore: analysisDraft.suggestedScore,
    confidence: analysisDraft.confidence,
    needsHumanReview: analysisDraft.needsHumanReview,
    rawModelOutput: analysisDraft.rawModelOutput,
    mistakeTags: sanitizeEditableErrorTags(analysisDraft.mistakeTags),
    normalizedErrorCategories: normalizeErrorTags(analysisDraft.mistakeTags),
    recommendations: analysisDraft.recommendations,
    warnings: uniqueStrings([...(analysisDraft.warnings || [])]),
  });

  context.submission.status = analysisDraft.needsHumanReview ? SubmissionStatuses.needsHumanReview : SubmissionStatuses.draftReady;
  context.submission.processingFinishedAt = finishedAt;
  job.status = 'completed';
  job.completedAt = finishedAt;
  job.provider = provider;

  if (context.work) {
    context.work.processingStatus = context.submission.status;
    context.work.processingFinishedAt = finishedAt;
    context.work.ocrText = flattenRecognitionPages(db, context.submission.id)
      .flatMap(page => (page.detectedBlocks || []).map(block => block.text))
      .filter(Boolean)
      .join('\n\n');
    context.work.aiErrors = mistakesToLegacyErrors(analysisDraft.mistakes, analysisDraft.mistakeTags);
    context.work.aiComment = analysisDraft.studentCommentDraft;
    context.work.teacherCommentDraft = analysisDraft.teacherCommentDraft;
    context.work.studentCommentDraft = analysisDraft.studentCommentDraft;
    context.work.suggestedScore = analysisDraft.suggestedScore;
    context.work.reviewWarnings = uniqueStrings([...(analysisDraft.warnings || []), ...recognitionPages.flatMap(page => page.warnings || [])]);
    context.work.recommendations = analysisDraft.recommendations || [];
    context.work.aiConfidence = analysisDraft.confidence;
    context.work.recognitionConfidence = globalRecognitionConfidence;
    context.work.needsHumanReview = analysisDraft.needsHumanReview;
    context.work.analysisDraftId = analysisDraftIdForSubmission(context.submission.id);
    context.work.aiProvider = provider;
    context.work.aiProcessingError = null;
  }

  if (context.batchResult) {
    context.batchResult.status = context.submission.status;
    context.batchResult.processingFinishedAt = finishedAt;
    context.batchResult.typedText = flattenRecognitionPages(db, context.submission.id)
      .flatMap(page => (page.detectedBlocks || []).map(block => block.text))
      .filter(Boolean)
      .join('\n\n');
    context.batchResult.errorTypes = sanitizeEditableErrorTags(analysisDraft.mistakeTags);
    context.batchResult.normalizedErrorCategories = normalizeErrorTags(analysisDraft.mistakeTags);
    context.batchResult.errorDescription = (analysisDraft.mistakes || []).map(item => `${item.title}: ${item.description}`).join(' ');
    context.batchResult.score = analysisDraft.suggestedScore;
    context.batchResult.aiComment = analysisDraft.studentCommentDraft;
    context.batchResult.teacherCommentDraft = analysisDraft.teacherCommentDraft;
    context.batchResult.aiConfidence = analysisDraft.confidence;
    context.batchResult.recognitionConfidence = globalRecognitionConfidence;
    context.batchResult.warnings = uniqueStrings([...(analysisDraft.warnings || [])]);
    context.batchResult.needsHumanReview = analysisDraft.needsHumanReview;
  }

  appendAuditTrail(db, {
    actorId: job.teacherId,
    action: 'ai_job_completed',
    entityType: 'submission',
    entityId: context.submission.id,
    meta: { provider, status: context.submission.status },
  });
  return context;
}

export function finalizeFailedJob(db, jobId, { safeMessage, retryConfig }) {
  ensureAiDbDefaults(db);
  const job = (db.recognitionJobs || []).find(item => item.id === jobId);
  if (!job) return null;
  const context = buildProcessingContext(db, job.submissionId);
  if (!context) return null;
  const attempts = Number(job.attempts || 1);
  const shouldRetry = attempts < retryConfig.maxAttempts;
  const failedAt = new Date().toISOString();

  if (shouldRetry) {
    const delayMs = retryConfig.baseDelayMs * (2 ** Math.max(0, attempts - 1));
    job.status = SubmissionStatuses.queued;
    job.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
  } else {
    job.status = SubmissionStatuses.failed;
    job.failedAt = failedAt;
  }
  job.lastError = safeMessage;
  context.submission.status = shouldRetry ? SubmissionStatuses.queued : SubmissionStatuses.failed;
  context.submission.processingFinishedAt = failedAt;

  if (context.work) {
    context.work.processingStatus = context.submission.status;
    context.work.aiProcessingError = safeMessage;
    context.work.processingFinishedAt = failedAt;
  }
  if (context.batchResult) {
    context.batchResult.status = context.submission.status;
    context.batchResult.processingFinishedAt = failedAt;
    context.batchResult.errorDescription = safeMessage;
  }

  appendAuditTrail(db, {
    actorId: job.teacherId,
    action: shouldRetry ? 'ai_job_retry_scheduled' : 'ai_job_failed',
    entityType: 'submission',
    entityId: context.submission.id,
    meta: { attempts, safeMessage },
  });
  return context;
}

export function approveSubmissionReview(db, {
  workId,
  finalScore,
  studentComment,
  teacherComment,
  actorId,
  reviewRequired = true,
  errorTags = [],
}) {
  ensureAiDbDefaults(db);
  const work = (db.works || []).find(item => item.id === workId);
  if (!work) return { error: 'Работа не найдена.' };
  const submission = getSubmissionById(db, work.submissionId || submissionIdForWork(work.id));
  if (!submission) return { error: 'Связанная submission не найдена.' };
  const existingFeedback = getFinalFeedback(db, submission.id);
  if (existingFeedback && reviewRequired) {
    return { error: 'Результат уже подтвержден и опубликован.' };
  }
  const draft = getAnalysisDraft(db, submission.id);
  const finalStudentComment = String(studentComment ?? draft?.studentCommentDraft ?? work.aiComment ?? '').trim();
  const finalTeacherComment = String(teacherComment ?? draft?.teacherCommentDraft ?? work.teacherCommentDraft ?? '').trim();
  const score = Number(finalScore ?? draft?.suggestedScore ?? work.suggestedScore ?? 0);
  const sanitizedTags = sanitizeEditableErrorTags(errorTags?.length ? errorTags : draft?.mistakeTags || []);
  const normalizedCategories = normalizeErrorTags(sanitizedTags, draft?.normalizedErrorCategories || []);
  const wasEditedAfterAI = Boolean(
    draft
    && (
      finalStudentComment !== String(draft.studentCommentDraft || '')
      || finalTeacherComment !== String(draft.teacherCommentDraft || '')
      || score !== Number(draft.suggestedScore || 0)
      || JSON.stringify(sanitizedTags) !== JSON.stringify(sanitizeEditableErrorTags(draft.mistakeTags || []))
    )
  );
  const approvedAt = new Date().toISOString();
  upsertById(db.teacherReviews, {
    id: teacherReviewIdForSubmission(submission.id),
    submissionId: submission.id,
    editedStudentComment: finalStudentComment,
    editedTeacherComment: finalTeacherComment,
    finalScore: score,
    teacherApprovedAt: approvedAt,
    wasEditedAfterAI,
    finalErrorTags: sanitizedTags,
    normalizedErrorCategories: normalizedCategories,
  });
  upsertById(db.finalFeedbacks, {
    id: finalFeedbackIdForSubmission(submission.id),
    submissionId: submission.id,
    studentId: work.studentId,
    teacherId: work.teacherId || null,
    finalScore: score,
    studentComment: finalStudentComment,
    teacherComment: finalTeacherComment,
    recommendations: draft?.recommendations || work.recommendations || [],
    publishedAt: approvedAt,
    errorTags: sanitizedTags,
    normalizedErrorCategories: normalizedCategories,
  });
  submission.status = SubmissionStatuses.approved;
  submission.processingFinishedAt = approvedAt;
  work.finalScore = score;
  work.aiComment = finalStudentComment;
  work.teacherComment = finalTeacherComment;
  work.status = 'Проверено';
  work.processingStatus = SubmissionStatuses.approved;
  work.approvedAt = approvedAt;
  work.wasEditedAfterAI = wasEditedAfterAI;
  work.finalErrorTags = sanitizedTags;
  work.normalizedErrorCategories = normalizedCategories;
  if (draft) {
    draft.mistakeTags = sanitizedTags;
    draft.normalizedErrorCategories = normalizedCategories;
  }
  appendAuditTrail(db, {
    actorId,
    action: 'teacher_review_approved',
    entityType: 'submission',
    entityId: submission.id,
    meta: { wasEditedAfterAI, normalizedErrorCategories: normalizedCategories },
  });
  return { work, submission };
}

export function markSubmissionNeedsHumanReview(db, workId, actorId) {
  ensureAiDbDefaults(db);
  const work = (db.works || []).find(item => item.id === workId);
  if (!work) return null;
  const submission = getSubmissionById(db, work.submissionId || submissionIdForWork(work.id));
  if (!submission) return null;
  submission.status = SubmissionStatuses.needsHumanReview;
  work.processingStatus = SubmissionStatuses.needsHumanReview;
  work.needsHumanReview = true;
  appendAuditTrail(db, {
    actorId,
    action: 'teacher_marked_manual_review',
    entityType: 'submission',
    entityId: submission.id,
  });
  return submission;
}

export function attachParentReportSnapshot(db, snapshot) {
  ensureAiDbDefaults(db);
  db.parentReportSnapshots.unshift({
    id: `prs-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...snapshot,
  });
}

export function copyRecognitionPagesFromCache(db, asset) {
  ensureAiDbDefaults(db);
  return copyRecognitionFromCachedAsset(db, asset);
}

export function storeRecognitionResult(db, asset, recognitionResult, provider) {
  ensureAiDbDefaults(db);
  persistRecognitionForAsset(db, asset, recognitionResult, provider);
}

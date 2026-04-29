import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAiConfig } from '../ai/config.js';
import {
  SubmissionStatuses,
  approveSubmissionReview,
  createBatchResultsFromUploadedFiles,
  createOrReuseRecognitionJob,
  ensureAiDbDefaults,
  finalizeSuccessfulJob,
  getFinalFeedback,
  getRecognitionPages,
  getSubmissionAssets,
  markJobProcessing,
  registerWorkSubmission,
  storeRecognitionResult,
} from '../ai/pipeline.js';
import { RecognitionResultNormalizer } from '../ai/providers.js';

function baseDb() {
  return {
    teacher: { id: 't1' },
    teachers: [{ id: 't1', name: 'Teacher', historicalStudentIds: ['s1'] }],
    accounts: [],
    smsLogs: [],
    resetRequests: [],
    reportConfigs: [],
    reportLogs: [],
    batchSessions: [],
    students: [{ id: 's1', name: 'Student', active: true, teacherId: 't1', teacherIds: ['t1'] }],
    groups: [],
    assignments: [{
      id: 'a1',
      teacherId: 't1',
      title: 'Линейные уравнения',
      subject: 'Математика',
      description: 'Решить уравнение',
      maxScore: 10,
      status: 'Активно',
      recipientType: 'student',
      recipientId: 's1',
    }],
    works: [],
    teacherInvites: [],
    attendanceRecords: [],
    counters: { work: 1, batch: 0, assignment: 1, student: 1, teacher: 1, group: 0, report: 0 },
  };
}

test('loadAiConfig validates missing server secret', () => {
  assert.throws(
    () => loadAiConfig({ ENABLE_OPENAI_RECOGNITION: 'true' }),
    /OPENAI_API_KEY/,
  );
  const config = loadAiConfig({ OPENAI_API_KEY: 'sk-test', ENABLE_OPENAI_RECOGNITION: 'true' });
  assert.equal(config.flags.ENABLE_OPENAI_RECOGNITION, true);
  assert.equal(config.openai.model, 'gpt-5.2');
});

test('submission registration, job dedupe and teacher approval keep final feedback consistent', () => {
  const db = baseDb();
  const work = {
    id: 'w1',
    assignmentId: 'a1',
    studentId: 's1',
    teacherId: 't1',
    submittedAt: '2026-04-21',
    status: 'Ожидает подтверждения',
    files: [{
      id: 'f1',
      name: 'solution.jpg',
      originalName: 'solution.jpg',
      url: 'http://127.0.0.1:4000/uploads/solution.jpg',
      storageName: 'solution.jpg',
      mimeType: 'image/jpeg',
      kind: 'photo',
      sha256: 'abc123',
      sizeBytes: 128,
    }],
  };
  db.works.push(work);
  ensureAiDbDefaults(db);
  registerWorkSubmission(db, work, db.assignments[0]);

  const jobA = createOrReuseRecognitionJob(db, { submissionId: work.submissionId, teacherId: 't1' });
  const jobB = createOrReuseRecognitionJob(db, { submissionId: work.submissionId, teacherId: 't1' });
  assert.equal(jobA.id, jobB.id);

  markJobProcessing(db, jobA.id);
  const asset = getSubmissionAssets(db, work.submissionId)[0];
  storeRecognitionResult(db, asset, {
    pages: [{
      pageNumber: 1,
      detectedBlocks: [{ type: 'solution', text: '2x = 8, x = 4', latex: null, confidence: 0.94 }],
    }],
    globalConfidence: 0.94,
    rawStructuredOutput: { ok: true },
  }, 'openai');

  finalizeSuccessfulJob(db, jobA.id, {
    recognitionPages: getRecognitionPages(db, work.submissionId),
    analysisDraft: {
      extractedTask: 'Решить 2x = 8',
      studentSolutionSummary: 'Ученик разделил обе части на 2 и получил x = 4.',
      canonicalSolution: 'x = 4',
      mistakes: [],
      mistakeTags: [],
      suggestedScore: 10,
      studentCommentDraft: 'Решение верное.',
      teacherCommentDraft: 'Ошибок не найдено.',
      recommendations: ['Можно сразу проверять подстановкой.'],
      confidence: 0.91,
      needsHumanReview: false,
      warnings: [],
      rawModelOutput: { ok: true },
    },
    provider: 'openai',
  });

  assert.equal(work.processingStatus, SubmissionStatuses.draftReady);
  const approval = approveSubmissionReview(db, {
    workId: work.id,
    finalScore: 10,
    studentComment: 'Все верно, молодец.',
    teacherComment: 'Подтверждаю решение.',
    actorId: 't1',
    reviewRequired: true,
  });
  assert.ok(approval.work);
  assert.equal(approval.work.status, 'Проверено');
  assert.equal(getFinalFeedback(db, work.submissionId).finalScore, 10);
});

test('batch upload groups same student pages by filename stem', () => {
  const results = createBatchResultsFromUploadedFiles({ id: 'b1' }, [
    { name: 'ivanov_page_1.jpg', originalName: 'ivanov_page_1.jpg', url: 'http://example/1.jpg' },
    { name: 'ivanov_page_2.jpg', originalName: 'ivanov_page_2.jpg', url: 'http://example/2.jpg' },
    { name: 'petrova_1.jpg', originalName: 'petrova_1.jpg', url: 'http://example/3.jpg' },
  ]);

  assert.equal(results.length, 2);
  assert.equal(results[0].name, 'Ivanov');
  assert.equal(results[0].sourceFiles.length, 2);
  assert.equal(results[1].name, 'Petrova');
});

test('recognition normalizer replaces diagram text with original-side marker', () => {
  const normalizer = new RecognitionResultNormalizer();
  const normalized = normalizer.normalize({
    pages: [{
      pageNumber: 1,
      detectedBlocks: [
        { type: 'solution', text: 'x = 4', latex: null, confidence: 0.9 },
        { type: 'diagram', text: 'треугольник с высотой', latex: null, confidence: 0.8 },
      ],
    }],
    globalConfidence: 0.82,
    warnings: [],
  });

  assert.equal(normalized.pages[0].detectedBlocks[1].text, '[рисунок смотри на оригинале слева]');
});

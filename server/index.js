import express from 'express';
import cors from 'cors';
import multer from 'multer';
import cron from 'node-cron';
import PDFDocument from 'pdfkit';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadServerEnv } from './load-env.js';
import { readDb, writeDb, nextId, publicFileUrl } from './db.js';
import { createRecognitionQueue } from './ai/queue.js';
import { featureFlagsPayload, loadAiConfig, redactAiError } from './ai/config.js';
import { PARENT_REPORT_TEMPLATES, buildParentReportHtml, writeParentReportPdf } from './reporting.js';
import {
  allowedUploadMimeTypes,
  guessPdfPageCountFromBuffer,
  safeStoredFilename,
  sha256File,
} from './ai/file-utils.js';
import {
  SubmissionStatuses,
  approveSubmissionReview,
  attachParentReportSnapshot,
  createBatchResultsFromUploadedFiles,
  decorateBatchResultWithAi,
  decorateWorkWithAi,
  ensureAiDbDefaults,
  markSubmissionNeedsHumanReview,
  registerWorkSubmission,
} from './ai/pipeline.js';
import {
  NORMALIZED_ERROR_TAXONOMY,
  countNormalizedCategories,
  normalizeErrorCategory,
  normalizeErrorTags,
  sanitizeEditableErrorTags,
} from '../shared/error-taxonomy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadServerEnv({ cwd: path.join(__dirname, '..') });
const app = express();
const PORT = process.env.PORT || 4000;
const TRIAL_DAYS = 30;
const uploadsDir = path.join(__dirname, 'uploads');
const aiConfig = loadAiConfig();
const envFileExists = ['.env', '.env.local']
  .some(fileName => fs.existsSync(path.join(path.join(__dirname, '..'), fileName)));
const pdfFontPath = ['/Library/Fonts/Arial Unicode.ttf', '/System/Library/Fonts/Supplemental/Arial Unicode.ttf']
  .find(candidate => fs.existsSync(candidate));

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => cb(null, safeStoredFilename(file.originalname)),
});
const upload = multer({
  storage,
  limits: {
    files: aiConfig.limits.maxFilesPerSubmission,
    fileSize: aiConfig.limits.maxUploadMb * 1024 * 1024,
  },
  fileFilter: (_, file, cb) => {
    if (!allowedUploadMimeTypes.has(file.mimetype)) {
      const error = new Error('Поддерживаются только JPG, PNG, WEBP, HEIC и PDF.');
      error.code = 'UNSUPPORTED_FILE_TYPE';
      cb(error);
      return;
    }
    cb(null, true);
  },
});

const rateLimitState = new Map();
const createRateLimit = ({ windowMs, maxRequests }) => (req, res, next) => {
  const bucketKey = `${req.ip}:${req.path}`;
  const now = Date.now();
  const current = rateLimitState.get(bucketKey);
  if (!current || current.expiresAt <= now) {
    rateLimitState.set(bucketKey, { count: 1, expiresAt: now + windowMs });
    next();
    return;
  }
  if (current.count >= maxRequests) {
    res.status(429).json({ error: 'Слишком много запросов. Попробуйте чуть позже.' });
    return;
  }
  current.count += 1;
  next();
};

const apiRateLimit = createRateLimit({
  windowMs: aiConfig.rateLimits.windowMs,
  maxRequests: aiConfig.rateLimits.maxRequestsPerWindow,
});
const aiRateLimit = createRateLimit({
  windowMs: aiConfig.rateLimits.windowMs,
  maxRequests: aiConfig.rateLimits.maxAiRequestsPerWindow,
});
app.use('/api', apiRateLimit);

const subjects = ['Математика', 'Физика', 'Химия'];
const notificationKeys = ['Новая работа загружена', 'Запрос на пересмотр', 'Дедлайн приближается', 'Еженедельная сводка'];
const reportFieldKeys = ['Имя ученика', 'Частые типы ошибок', 'Гистограмма оценок', 'Динамика по темам', 'Рекомендации, на что обратить внимание'];
const inviteTtlDays = 14;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const recognitionQueue = createRecognitionQueue({
  config: aiConfig,
  readDb,
  writeDb,
  uploadsDir,
});

async function buildUploadedFileDescriptors(req, files = []) {
  return Promise.all((files || []).map(async (file, index) => {
    const absolutePath = path.join(uploadsDir, file.filename);
    const sha256 = await sha256File(absolutePath);
    const pageCount = file.mimetype === 'application/pdf'
      ? guessPdfPageCountFromBuffer(await fs.promises.readFile(absolutePath))
      : 1;
    return {
      id: `${Date.now()}-${index}-${file.originalname}`,
      name: file.originalname,
      originalName: file.originalname,
      storageName: file.filename,
      url: publicFileUrl(req, file.filename),
      previewUrl: publicFileUrl(req, file.filename),
      normalizedUrl: publicFileUrl(req, file.filename),
      kind: file.mimetype.startsWith('image/') ? 'photo' : 'file',
      mimeType: file.mimetype,
      sizeBytes: file.size,
      sha256,
      pageCount,
    };
  }));
}

const defaultTeacherProfile = (overrides = {}) => ({
  id: overrides.id || '',
  name: overrides.name || 'Преподаватель',
  email: overrides.email || '',
  phone: overrides.phone || '',
  avatarUrl: overrides.avatarUrl || '',
  plan: overrides.plan || 'Trial',
  subjects: Array.isArray(overrides.subjects) && overrides.subjects.length ? overrides.subjects : [...subjects],
  notifications: overrides.notifications || Object.fromEntries(notificationKeys.map(key => [key, true])),
  reportPreferences: {
    ...Object.fromEntries(reportFieldKeys.map(key => [key, true])),
    ...(overrides.reportPreferences || {}),
  },
  historicalStudentIds: unique(overrides.historicalStudentIds || []),
});

const minutesFromTime = (time = '00:00') => {
  const [h, m] = String(time).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const durationMinutes = (slot) => (Number(slot.durationHours || 0) * 60) + Number(slot.durationMinutes || slot.duration || 0);
const normalizeSlots = (slots = []) => slots.map((slot, idx) => ({
  id: slot.id || `slot-${Date.now()}-${idx}`,
  day: slot.day,
  time: slot.time,
  durationHours: Number(slot.durationHours || 0),
  durationMinutes: Number(slot.durationMinutes || slot.duration || 0),
}));
const overlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
const inviteToken = () => crypto.randomBytes(16).toString('hex');

const numericId = (value = '') => {
  const match = String(value).match(/(\d+)/);
  return match ? Number(match[1]) : 0;
};

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();
const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '');
const isValidPhone = (value = '') => {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 15;
};
const isValidEmail = (value = '') => emailRegex.test(String(value || '').trim());
const isEmailLike = (value = '') => /.+@.+\..+/.test(String(value || '').trim());
const normalizePersonName = (...parts) => parts.map(part => String(part || '').trim()).filter(Boolean).join(' ');
const unique = (items = []) => [...new Set(items.filter(Boolean))];
const studentTeacherIds = (student = {}) => unique(Array.isArray(student.teacherIds) ? student.teacherIds : [student.teacherId]);
const studentHasTeacher = (student = {}, teacherId) => studentTeacherIds(student).includes(teacherId);
const syncPrimaryTeacher = (student) => {
  student.teacherIds = studentTeacherIds(student);
  student.teacherId = student.teacherIds[0] || null;
  return student;
};
const getStudentParentEmail = (student = {}) => {
  const explicitEmail = normalizeEmail(student.parentEmail || '');
  if (isEmailLike(explicitEmail)) return explicitEmail;
  const legacyContact = normalizeEmail(student.parentContact || '');
  return isEmailLike(legacyContact) ? legacyContact : '';
};
const normalizeStudentParentFields = (student = {}) => {
  student.parentName = String(student.parentName || '').trim();
  student.parentEmail = getStudentParentEmail(student);
  student.parentContact = student.parentContact ?? student.parentEmail;
  return student;
};
const canSendToParent = (student = {}) => Boolean(getStudentParentEmail(student));
const isVirtualStudent = (db, student = {}) => !db.accounts.some(account => account.role === 'student' && account.userId === student.id);
const normalizeInviteStatus = (status = '') => (status === 'rejected' ? 'declined' : (status || 'pending'));
const normalizeAssignmentLinks = (links = []) => unique((Array.isArray(links) ? links : []).map(link => String(link || '').trim()).filter(Boolean));
const parseDeadlineToIso = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T23:59:59`);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return raw;
  const [, dd, mm, yyyy] = match;
  const date = new Date(`${yyyy}-${mm}-${dd}T23:59:59`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};
const endOfDayIso = (value = '') => parseDeadlineToIso(value);
const isInviteExpired = (invite = {}) => Boolean(invite.expiresAt && new Date(invite.expiresAt) < new Date());
const createInviteExpiry = () => {
  const next = new Date();
  next.setDate(next.getDate() + inviteTtlDays);
  return next.toISOString();
};
const normalizeWorkStatus = (status = '') => {
  if (status === 'На пересмотре') return 'Ожидает подтверждения';
  if (status === 'Проверена') return 'Проверено';
  return status || 'Ожидает подтверждения';
};
const isPublishedAssignment = (assignment = {}) => assignment.status && assignment.status !== 'Черновик';
const teacherOwnsStudent = (student = {}, teacherId) => Boolean(student?.active && studentHasTeacher(student, teacherId));
const teacherOwnsGroup = (group = {}, teacherId) => Boolean(group?.active && group.teacherId === teacherId);
const teacherOwnsAssignment = (assignment = {}, teacherId) => assignment?.teacherId === teacherId;
const teacherOwnsWork = (work = {}, teacherId) => work?.teacherId === teacherId;
const teacherOwnsAttendance = (record = {}, teacherId) => record?.teacherId === teacherId;

function assignmentRecipientStudentIds(db, assignment) {
  if (!assignment) return [];
  if (assignment.recipientType === 'student') {
    const student = db.students.find(item => item.id === assignment.recipientId);
    return student && teacherOwnsStudent(student, assignment.teacherId) ? [student.id] : [];
  }
  if (assignment.recipientType === 'students') {
    return unique((assignment.recipientIds || []).filter(id => {
      const student = db.students.find(item => item.id === id);
      return teacherOwnsStudent(student, assignment.teacherId);
    }));
  }
  if (assignment.recipientType === 'group') {
    const group = db.groups.find(item => item.id === assignment.recipientId && teacherOwnsGroup(item, assignment.teacherId));
    return group ? unique((group.studentIds || []).filter(id => {
      const student = db.students.find(item => item.id === id);
      return teacherOwnsStudent(student, assignment.teacherId);
    })) : [];
  }
  return [];
}

function normalizeAssignmentRecipients(db, assignment, teacherId = assignment?.teacherId || null) {
  const safeTeacherId = teacherId || null;
  const safeStudentIds = unique((assignment?.recipientIds || []).filter(id => {
    const student = db.students.find(item => item.id === id);
    return teacherOwnsStudent(student, safeTeacherId);
  }));

  if (assignment?.recipientType === 'students') {
    return {
      recipientType: 'students',
      recipientId: null,
      recipientIds: safeStudentIds,
    };
  }

  if (assignment?.recipientType === 'group') {
    const group = db.groups.find(item => item.id === assignment?.recipientId && teacherOwnsGroup(item, safeTeacherId));
    return {
      recipientType: 'group',
      recipientId: group?.id || null,
      recipientIds: [],
    };
  }

  const student = db.students.find(item => item.id === assignment?.recipientId);
  return {
    recipientType: 'student',
    recipientId: teacherOwnsStudent(student, safeTeacherId) ? student.id : null,
    recipientIds: [],
  };
}

const assignmentTargetSignature = (db, assignment) => assignmentRecipientStudentIds(db, assignment).sort().join(',');

function assignmentTargetsStudent(db, assignment, studentId) {
  if (!assignment) return false;
  if (!isPublishedAssignment(assignment)) return false;
  if (assignment.recipientType === 'student') return assignment.recipientId === studentId;
  if (assignment.recipientType === 'students') return (assignment.recipientIds || []).includes(studentId);
  if (assignment.recipientType === 'group') return db.groups.find(group => group.id === assignment.recipientId && teacherOwnsGroup(group, assignment.teacherId))?.studentIds.includes(studentId);
  return false;
}

function assignTeacherToStudent(student, teacherId) {
  student.teacherIds = unique([...(student.teacherIds || []), teacherId]);
  student.teacherId = student.teacherIds[0] || null;
}

function getTeacherStudentOverlay(db, teacherId, studentId) {
  db.teacherStudentOverlays ||= [];
  return db.teacherStudentOverlays.find(item => item.teacherId === teacherId && item.studentId === studentId) || null;
}

function ensureTeacherStudentOverlay(db, teacherId, studentId) {
  db.teacherStudentOverlays ||= [];
  const existing = getTeacherStudentOverlay(db, teacherId, studentId);
  if (existing) return existing;
  const overlay = {
    id: `overlay-${teacherId}-${studentId}`,
    teacherId,
    studentId,
    display_name_override: '',
    student_email_label: '',
    student_phone_label: '',
    parent_email_override: '',
    parent_name_override: '',
    level_override: '',
    schedule_slots_override: [],
    updatedAt: new Date().toISOString(),
  };
  db.teacherStudentOverlays.push(overlay);
  return overlay;
}

function overlaySlotsForTeacher(db, teacherId, student) {
  const overlay = getTeacherStudentOverlay(db, teacherId, student?.id);
  if (overlay?.schedule_slots_override?.length) return normalizeSlots(overlay.schedule_slots_override);
  return normalizeSlots(student?.lessonSlots || []);
}

function applyTeacherOverlayToStudent(db, teacherId, student = {}) {
  const overlay = getTeacherStudentOverlay(db, teacherId, student.id);
  const merged = {
    ...student,
    name: overlay?.display_name_override || student.name,
    email: overlay?.student_email_label || student.email,
    phone: overlay?.student_phone_label || student.phone,
    parentEmail: overlay?.parent_email_override || student.parentEmail,
    parentName: overlay?.parent_name_override || student.parentName,
    level: overlay?.level_override || student.level,
    lessonSlots: overlay?.schedule_slots_override?.length ? normalizeSlots(overlay.schedule_slots_override) : normalizeSlots(student.lessonSlots || []),
    teacherOverlay: overlay || null,
    accountEmail: student.email || '',
    accountPhone: student.phone || '',
  };
  return normalizeStudentParentFields(merged);
}

function rememberHistoricalStudent(db, teacherId, studentId) {
  const teacher = (db.teachers || []).find(item => item.id === teacherId);
  if (!teacher || !studentId) return;
  teacher.historicalStudentIds = unique([...(teacher.historicalStudentIds || []), studentId]);
}

function replaceHistoricalStudentId(db, fromStudentId, toStudentId) {
  db.teachers.forEach(teacher => {
    if (!(teacher.historicalStudentIds || []).includes(fromStudentId)) return;
    teacher.historicalStudentIds = unique(
      (teacher.historicalStudentIds || []).map(id => (id === fromStudentId ? toStudentId : id)),
    );
  });
}

function findStudentContactConflict(db, { email = '', phone = '', parentEmail = '' } = {}, ignoreStudentId = null) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const normalizedParentEmail = normalizeEmail(parentEmail);
  return db.students.find(student => {
    if (student.id === ignoreStudentId) return false;
    if (normalizedEmail && normalizeEmail(student.email || '') === normalizedEmail) return true;
    if (normalizedPhone && normalizePhone(student.phone || '') === normalizedPhone) return true;
    if (normalizedParentEmail && getStudentParentEmail(student) === normalizedParentEmail) return true;
    return false;
  }) || null;
}

function findMergeCandidateForRegisteredStudent(db, { email = '', phone = '', parentEmail = '' } = {}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const normalizedParentEmail = normalizeEmail(parentEmail);
  return db.students.find(student => {
    if (!isVirtualStudent(db, student)) return false;
    if (normalizedEmail && normalizeEmail(student.email || '') === normalizedEmail) return true;
    if (normalizedPhone && normalizePhone(student.phone || '') === normalizedPhone) return true;
    if (!normalizedParentEmail) return false;
    if (normalizeEmail(student.email || '') || normalizePhone(student.phone || '')) return false;
    return getStudentParentEmail(student) === normalizedParentEmail;
  }) || null;
}

function mergeVirtualStudentIntoRealStudent(db, virtualStudent, realStudent) {
  if (!virtualStudent || !realStudent || virtualStudent.id === realStudent.id) return realStudent;

  const teacherIds = unique([...studentTeacherIds(realStudent), ...studentTeacherIds(virtualStudent)]);
  const merged = syncPrimaryTeacher({
    ...realStudent,
    ...virtualStudent,
    id: realStudent.id,
    email: virtualStudent.email || realStudent.email || '',
    phone: virtualStudent.phone || realStudent.phone || '',
    parentName: virtualStudent.parentName || realStudent.parentName || '',
    parentEmail: virtualStudent.parentEmail || realStudent.parentEmail || '',
    parentContact: virtualStudent.parentContact || realStudent.parentContact || '',
    active: realStudent.active !== false && virtualStudent.active !== false,
    virtual: false,
    teacherIds,
  });

  normalizeStudentParentFields(merged);

  const realIndex = db.students.findIndex(student => student.id === realStudent.id);
  if (realIndex !== -1) {
    db.students[realIndex] = merged;
  }

  db.groups.forEach(group => {
    if (!(group.studentIds || []).includes(virtualStudent.id)) return;
    group.studentIds = unique((group.studentIds || []).map(studentId => (
      studentId === virtualStudent.id ? realStudent.id : studentId
    )));
  });

  db.assignments.forEach(assignment => {
    if (assignment.recipientType === 'student' && assignment.recipientId === virtualStudent.id) {
      assignment.recipientId = realStudent.id;
    }
    if (assignment.recipientType === 'students') {
      assignment.recipientIds = unique((assignment.recipientIds || []).map(studentId => (
        studentId === virtualStudent.id ? realStudent.id : studentId
      )));
    }
  });

  db.works.forEach(work => {
    if (work.studentId === virtualStudent.id) work.studentId = realStudent.id;
  });

  db.attendanceRecords.forEach(record => {
    if (record.studentId === virtualStudent.id) record.studentId = realStudent.id;
  });

  db.teacherInvites.forEach(invite => {
    if (invite.studentId === virtualStudent.id) invite.studentId = realStudent.id;
  });

  db.reportConfigs.forEach(config => {
    if (config.targetType === 'student' && config.targetId === virtualStudent.id) {
      config.targetId = realStudent.id;
    }
  });

  db.reportLogs.forEach(log => {
    log.recipients = (log.recipients || []).map(recipient => (
      recipient.studentId === virtualStudent.id ? { ...recipient, studentId: realStudent.id } : recipient
    ));
    log.deliveries = (log.deliveries || []).map(delivery => (
      delivery.studentId === virtualStudent.id ? { ...delivery, studentId: realStudent.id } : delivery
    ));
    if (Array.isArray(log.payload)) {
      log.payload = log.payload.map(item => (
        item.studentId === virtualStudent.id ? { ...item, studentId: realStudent.id } : item
      ));
    }
  });

  replaceHistoricalStudentId(db, virtualStudent.id, realStudent.id);
  teacherIds.forEach(teacherId => rememberHistoricalStudent(db, teacherId, realStudent.id));

  db.students = db.students.filter(student => student.id !== virtualStudent.id);
  return merged;
}

function detachTeacherStudent(db, teacherId, studentId) {
  const student = db.students.find(item => item.id === studentId);
  if (!student) return null;
  student.teacherIds = studentTeacherIds(student).filter(id => id !== teacherId);
  student.teacherId = student.teacherIds[0] || null;
  db.groups.filter(group => group.teacherId === teacherId).forEach(group => {
    group.studentIds = (group.studentIds || []).filter(id => id !== studentId);
  });
  db.teacherInvites.forEach(invite => {
    if (invite.teacherId === teacherId && invite.studentId === studentId && invite.status === 'pending') {
      invite.status = 'declined';
      invite.reviewedAt = new Date().toISOString();
    }
  });
  return student;
}

function normalizeInviteRecord(invite = {}) {
  return {
    status: normalizeInviteStatus(invite.status),
    direction: invite.direction || 'student_to_teacher',
    token: invite.token || inviteToken(),
    createdAt: invite.createdAt || new Date().toISOString(),
    expiresAt: invite.expiresAt || createInviteExpiry(),
    studentNotificationDismissedAt: invite.studentNotificationDismissedAt || null,
    claimedByStudentId: invite.claimedByStudentId || invite.studentId || null,
    ...invite,
  };
}

function resolveInviteByToken(db, token) {
  return (db.teacherInvites || []).find(item => item.token === token) || null;
}

function validateTeacherInviteToken(db, token, expectedDirection = 'teacher_to_student') {
  const invite = resolveInviteByToken(db, token);
  if (!invite || invite.direction !== expectedDirection) {
    return { error: 'Приглашение не найдено.' };
  }
  if (isInviteExpired(invite)) {
    return { error: 'Срок действия ссылки истек.' };
  }
  if (normalizeInviteStatus(invite.status) !== 'pending') {
    return { error: 'Ссылка уже использована.' };
  }
  return { invite };
}

function assignmentLinksForAi(assignment = {}) {
  return normalizeAssignmentLinks(assignment.links || assignment.assignmentLinks || []);
}

function assignmentTaskText(assignment = {}) {
  return String(assignment.description || assignment.taskText || '').trim();
}

function recalculateAssignmentStatus(db, assignmentId) {
  const assignment = db.assignments.find(item => item.id === assignmentId);
  if (!assignment || assignment.status === 'Черновик') return assignment;
  const recipientIds = assignmentRecipientStudentIds(db, assignment);
  if (!recipientIds.length) {
    assignment.status = 'Активно';
    return assignment;
  }
  const reviewedIds = recipientIds.filter(studentId => db.works.some(work => work.assignmentId === assignmentId && work.studentId === studentId && work.status === 'Проверено'));
  assignment.status = reviewedIds.length === recipientIds.length ? 'Прорешено' : 'Активно';
  return assignment;
}

function ensureDbDefaults(db) {
  db.accounts ||= [];
  db.smsLogs ||= [];
  db.resetRequests ||= [];
  db.reportConfigs ||= [];
  db.reportLogs ||= [];
  db.batchSessions ||= [];
  db.savedBatchResults ||= [];
  db.teacherStudentOverlays ||= [];
  db.students ||= [];
  db.groups ||= [];
  db.assignments ||= [];
  db.works ||= [];
  db.teacherInvites ||= [];
  db.attendanceRecords ||= [];
  db.counters ||= {};

  const legacyTeacher = db.teacher ? defaultTeacherProfile(db.teacher) : null;
  db.teachers = Array.isArray(db.teachers) ? db.teachers : [];
  if (legacyTeacher && !db.teachers.find(item => item.id === legacyTeacher.id)) db.teachers.unshift(legacyTeacher);

  const accountTeacherIds = db.accounts.filter(item => item.role === 'teacher').map(item => item.userId).filter(Boolean);
  const knownTeacherIds = new Set([...db.teachers.map(item => item.id), ...accountTeacherIds].filter(Boolean));

  const maxTeacherId = Math.max(
    0,
    ...Array.from(knownTeacherIds).map(numericId),
    numericId(legacyTeacher?.id),
  );
  db.counters.teacher = Math.max(Number(db.counters.teacher || 0), maxTeacherId);
  db.counters.student = Math.max(Number(db.counters.student || 0), ...db.students.map(item => numericId(item.id)));
  db.counters.group = Math.max(Number(db.counters.group || 0), ...db.groups.map(item => numericId(item.id)));
  db.counters.assignment = Math.max(Number(db.counters.assignment || 0), ...db.assignments.map(item => numericId(item.id)));
  db.counters.work = Math.max(Number(db.counters.work || 0), ...db.works.map(item => numericId(item.id)));
  db.counters.report = Math.max(Number(db.counters.report || 0), ...db.reportConfigs.map(item => numericId(item.id)));
  db.counters.batch = Math.max(Number(db.counters.batch || 0), ...db.batchSessions.map(item => numericId(item.id)));

  const createTeacherId = () => {
    db.counters.teacher += 1;
    return `t${db.counters.teacher}`;
  };

  db.accounts.filter(item => item.role === 'teacher').forEach(account => {
    account.onboardingCompleted ??= account.id?.includes('demo');
    if (!account.userId) account.userId = createTeacherId();
    const existing = db.teachers.find(item => item.id === account.userId);
    if (!existing) {
      db.teachers.push(defaultTeacherProfile({
        id: account.userId,
        name: account.name || 'Преподаватель',
        email: account.email || '',
        phone: account.phone || '',
      }));
      return;
    }
    existing.name ||= account.name || 'Преподаватель';
    existing.email ||= account.email || '';
    existing.phone ||= account.phone || '';
  });

  if (!db.teachers.length) {
    const id = createTeacherId();
    db.teachers.push(defaultTeacherProfile({ id, name: 'Преподаватель' }));
  }

  db.teachers = db.teachers.map(teacher => defaultTeacherProfile(teacher));

  const primaryTeacherId = db.teachers[0]?.id || null;
  db.teacher = db.teachers.find(item => item.id === 't1') || db.teachers[0];
  const studentAccountIds = new Set(db.accounts.filter(item => item.role === 'student').map(item => item.userId));

  db.students.forEach(student => {
    student.phone ||= '';
    student.parentName ||= '';
    normalizeStudentParentFields(student);
    student.level = student.level || '';
    student.subjects = Array.isArray(student.subjects) ? student.subjects : [];
    student.lessonSlots = normalizeSlots(student.lessonSlots || []);
    student.active = student.active !== false;
    student.virtual = student.virtual ?? !studentAccountIds.has(student.id);
    if (!Array.isArray(student.teacherIds)) student.teacherIds = unique([student.teacherId].filter(Boolean));
    syncPrimaryTeacher(student);
  });

  db.teachers.forEach(teacher => {
    teacher.historicalStudentIds = unique([
      ...(teacher.historicalStudentIds || []),
      ...db.students.filter(student => studentHasTeacher(student, teacher.id)).map(student => student.id),
    ]);
  });

  db.teacherStudentOverlays = (db.teacherStudentOverlays || []).map(overlay => ({
    id: overlay.id || `overlay-${overlay.teacherId}-${overlay.studentId}`,
    teacherId: overlay.teacherId,
    studentId: overlay.studentId,
    display_name_override: overlay.display_name_override || '',
    student_email_label: overlay.student_email_label || '',
    student_phone_label: overlay.student_phone_label || '',
    parent_email_override: overlay.parent_email_override || '',
    parent_name_override: overlay.parent_name_override || '',
    level_override: overlay.level_override || '',
    schedule_slots_override: normalizeSlots(overlay.schedule_slots_override || []),
    updatedAt: overlay.updatedAt || new Date().toISOString(),
  })).filter(item => item.teacherId && item.studentId);

  db.groups.forEach(group => {
    group.active = group.active !== false;
    group.subject ||= subjects[0];
    group.studentIds = unique(Array.isArray(group.studentIds) ? group.studentIds : []).filter(id => {
      const student = db.students.find(item => item.id === id);
      return student?.active && (!group.teacherId || studentHasTeacher(student, group.teacherId));
    });
    group.riskTopics = Array.isArray(group.riskTopics) ? group.riskTopics : [];
    group.lessonSlots = normalizeSlots(group.lessonSlots || []);
    if (group.teacherId === undefined) group.teacherId = primaryTeacherId;
  });

  db.assignments.forEach(assignment => {
    assignment.attachments = Array.isArray(assignment.attachments) ? assignment.attachments : [];
    assignment.links = normalizeAssignmentLinks(assignment.links || assignment.assignmentLinks || []);
    assignment.description = assignmentTaskText(assignment);
    assignment.status = assignment.status === 'Завершено' ? 'Прорешено' : (assignment.status || 'Черновик');
    assignment.deadline = endOfDayIso(assignment.deadline) || assignment.deadline || '';
    if (assignment.teacherId === undefined) {
      assignment.teacherId = assignment.recipientType === 'student'
        ? studentTeacherIds(db.students.find(item => item.id === assignment.recipientId))[0] || primaryTeacherId
        : db.groups.find(item => item.id === assignment.recipientId)?.teacherId || primaryTeacherId;
    }
    Object.assign(assignment, normalizeAssignmentRecipients(db, assignment, assignment.teacherId));
  });

  db.works.forEach(work => {
    work.files = Array.isArray(work.files) ? work.files : [];
    work.aiErrors = Array.isArray(work.aiErrors) ? work.aiErrors : [];
    work.status = normalizeWorkStatus(work.status);
    if (work.teacherId === undefined) {
      work.teacherId = db.assignments.find(item => item.id === work.assignmentId)?.teacherId
        || studentTeacherIds(db.students.find(item => item.id === work.studentId))[0]
        || primaryTeacherId;
    }
  });

  db.reportConfigs.forEach(config => {
    if (config.teacherId === undefined) config.teacherId = primaryTeacherId;
  });
  db.reportLogs.forEach(log => {
    if (log.teacherId === undefined) log.teacherId = primaryTeacherId;
  });
  db.batchSessions.forEach(session => {
    if (session.teacherId === undefined) session.teacherId = primaryTeacherId;
    session.assignmentText ||= '';
    session.assignmentLinks = normalizeAssignmentLinks(session.assignmentLinks || []);
    session.classGroupLabel ||= '';
  });
  db.teacherInvites = db.teacherInvites.map(normalizeInviteRecord);
  db.accounts.filter(item => item.role === 'student').forEach(account => {
    account.onboardingCompleted ??= account.id?.includes('demo');
  });

  ensureAiDbDefaults(db);
  return db;
}

const findTeacherById = (db, teacherId) => {
  ensureDbDefaults(db);
  return db.teachers.find(item => item.id === teacherId) || null;
};

function slotConflict(db, slots = [], ignoreStudentId = null, ignoreGroupId = null, teacherId = null) {
  const activeStudents = db.students.filter(s => s.active && s.id !== ignoreStudentId && (!teacherId || studentHasTeacher(s, teacherId)));
  const activeGroups = db.groups.filter(g => g.active && g.id !== ignoreGroupId && (!teacherId || g.teacherId === teacherId));
  for (const slot of normalizeSlots(slots)) {
    const start = minutesFromTime(slot.time);
    const end = start + durationMinutes(slot);
    for (const student of activeStudents) {
      for (const existing of getEffectiveStudentSlots(db, student, teacherId)) {
        if (slot.day !== existing.day) continue;
        const existingStart = minutesFromTime(existing.time);
        const existingEnd = existingStart + durationMinutes(existing);
        if (overlap(start, end, existingStart, existingEnd)) {
          return { conflict: true, studentName: existing.inherited ? `${student.name} (группа ${existing.sourceGroupName})` : student.name, slot: existing };
        }
      }
    }
    for (const group of activeGroups) {
      for (const existing of normalizeSlots(group.lessonSlots || [])) {
        if (slot.day !== existing.day) continue;
        const existingStart = minutesFromTime(existing.time);
        const existingEnd = existingStart + durationMinutes(existing);
        if (overlap(start, end, existingStart, existingEnd)) {
          return { conflict: true, studentName: `Группа ${group.name}`, slot: existing };
        }
      }
    }
  }
  return { conflict: false };
}

const summarizeEntity = (db, type, id) => {
  if (type === 'student') return db.students.find(s => s.id === id)?.name || 'Неизвестный ученик';
  if (type === 'group') return db.groups.find(g => g.id === id)?.name || 'Неизвестная группа';
  return 'Неизвестный объект';
};

const getEffectiveStudentSlots = (db, student, teacherId = null) => {
  const own = teacherId ? overlaySlotsForTeacher(db, teacherId, student) : normalizeSlots(student.lessonSlots || []);
  if (own.length) return own.map(slot => ({ ...slot, inherited: false }));
  const inherited = db.groups
    .filter(group => group.active && group.studentIds.includes(student.id) && (!studentTeacherIds(student).length || studentTeacherIds(student).includes(group.teacherId)))
    .flatMap(group => normalizeSlots(group.lessonSlots || []).map(slot => ({ ...slot, inherited: true, sourceGroupId: group.id, sourceGroupName: group.name })));
  return inherited;
};

const getAssignmentsForStudent = (db, studentId) => {
  const student = db.students.find(item => item.id === studentId);
  const allowedTeacherIds = studentTeacherIds(student);
  return unique(db.assignments
    .filter(assignment => !allowedTeacherIds.length || allowedTeacherIds.includes(assignment.teacherId))
    .filter(assignment => assignmentTargetsStudent(db, assignment, studentId))
    .map(assignment => assignment.id))
    .map(id => db.assignments.find(item => item.id === id))
    .filter(Boolean);
};
const getSubmittedRatio = (db, studentId) => {
  const assigned = getAssignmentsForStudent(db, studentId).length;
  if (!assigned) return 0;
  const submitted = db.works.filter(work => work.studentId === studentId).length;
  return submitted / assigned;
};
const getAverageNormalizedPercent = (db, studentId) => {
  const works = db.works.filter(work => work.studentId === studentId);
  if (!works.length) return 0;
  const total = works.reduce((sum, work) => {
    const assignment = db.assignments.find(item => item.id === work.assignmentId);
    const score = work.finalScore ?? work.suggestedScore ?? 0;
    return sum + ((score / (assignment?.maxScore || 100)) * 100);
  }, 0);
  return Math.round(total / works.length);
};
const getStudentScore = (db, studentId) => Math.round(getSubmittedRatio(db, studentId) * getAverageNormalizedPercent(db, studentId));
const getAssignmentsForTeacherStudent = (db, teacherId, studentId) => getAssignmentsForStudent(db, studentId).filter(assignment => assignment.teacherId === teacherId);
const getSubmittedRatioForTeacher = (db, teacherId, studentId) => {
  const assigned = getAssignmentsForTeacherStudent(db, teacherId, studentId).length;
  if (!assigned) return 0;
  const submitted = db.works.filter(work => work.teacherId === teacherId && work.studentId === studentId).length;
  return submitted / assigned;
};
const getAverageNormalizedPercentForTeacher = (db, teacherId, studentId) => {
  const works = db.works.filter(work => work.teacherId === teacherId && work.studentId === studentId);
  if (!works.length) return 0;
  const total = works.reduce((sum, work) => {
    const assignment = db.assignments.find(item => item.id === work.assignmentId && item.teacherId === teacherId);
    const score = work.finalScore ?? work.suggestedScore ?? 0;
    return sum + ((score / (assignment?.maxScore || 100)) * 100);
  }, 0);
  return Math.round(total / works.length);
};
const getStudentScoreForTeacher = (db, teacherId, studentId) => Math.round(getSubmittedRatioForTeacher(db, teacherId, studentId) * getAverageNormalizedPercentForTeacher(db, teacherId, studentId));
const getOverdueAssignments = (db, teacherId, studentId) => getAssignmentsForStudent(db, studentId).filter(assignment => assignment.teacherId === teacherId && assignment.deadline && new Date(assignment.deadline) < new Date() && !db.works.some(work => work.studentId === studentId && work.assignmentId === assignment.id && work.teacherId === teacherId));
const getAttendanceFrequency = (db, teacherId, studentId) => {
  const records = db.attendanceRecords.filter(item => item.teacherId === teacherId && item.studentId === studentId);
  if (!records.length) return 'Недостаточно данных';
  const attended = records.filter(item => item.status === 'present').length;
  return `${Math.round((attended / records.length) * 100)}%`;
};
const normalizePeriodBoundary = (value, endOfDay = false) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
};
const resolveReportPeriod = ({ frequency = 'Самостоятельно', periodFrom, periodTo } = {}) => {
  const now = new Date();
  const end = normalizePeriodBoundary(periodTo, true) || now;
  let start = normalizePeriodBoundary(periodFrom, false);
  if (!start) {
    start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (frequency === 'Ежемесячно' ? 29 : 6));
  }
  const label = `${start.toLocaleDateString('ru-RU')} - ${end.toLocaleDateString('ru-RU')}`;
  return { start, end, label };
};
const isDateWithinPeriod = (value, period) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= period.start && date <= period.end;
};
const buildGradesHistogramForPeriod = (db, teacherId, studentId, period) => {
  const works = db.works.filter(work => work.teacherId === teacherId
    && work.studentId === studentId
    && work.status === 'Проверено'
    && isDateWithinPeriod(work.submittedAt, period));
  const buckets = [
    { label: '0–49', min: 0, max: 49, value: 0 },
    { label: '50–69', min: 50, max: 69, value: 0 },
    { label: '70–84', min: 70, max: 84, value: 0 },
    { label: '85–100', min: 85, max: 100, value: 0 },
  ];
  works.forEach(work => {
    const assignment = db.assignments.find(item => item.id === work.assignmentId);
    const percent = Math.round(((work.finalScore ?? work.suggestedScore ?? 0) / (assignment?.maxScore || 100)) * 100);
    const bucket = buckets.find(item => percent >= item.min && percent <= item.max) || buckets[0];
    bucket.value += 1;
  });
  return buckets.map(({ label, value }) => ({ label, value }));
};

const buildTopicDynamicsForPeriod = (db, teacherId, studentId, period) => {
  const works = db.works.filter(work => work.teacherId === teacherId
    && work.studentId === studentId
    && work.status === 'Проверено'
    && isDateWithinPeriod(work.submittedAt, period));
  const grouped = works.reduce((acc, work) => {
    const assignment = db.assignments.find(item => item.id === work.assignmentId);
    const topic = assignment?.subject || 'Без предмета';
    acc[topic] ||= { topic, value: 0 };
    acc[topic].value += 1;
    return acc;
  }, {});
  return Object.values(grouped).sort((a, b) => b.value - a.value).slice(0, 5);
};

const buildFrequentErrorsForPeriod = (db, teacherId, studentId, period) => {
  const works = db.works.filter(work => work.teacherId === teacherId
    && work.studentId === studentId
    && isDateWithinPeriod(work.submittedAt, period));
  const raw = works.flatMap(work => [
    ...(work.normalizedErrorCategories || []),
    ...(work.finalErrorTags || []),
    ...(work.aiErrors || []).flatMap(error => [error.normalizedCategory, ...(error.types || []), error.label]),
  ]);
  return countNormalizedCategories(raw).slice(0, 5).map(item => item.name);
};

const buildRecommendationsForPeriod = (db, teacherId, studentId, period) => {
  const works = db.works.filter(work => work.teacherId === teacherId
    && work.studentId === studentId
    && isDateWithinPeriod(work.submittedAt, period));
  return unique(works.flatMap(work => work.finalFeedback?.recommendations || work.recommendations || []))
    .slice(0, 4);
};

const buildParentReportDocument = (db, teacherId, studentId, period, template = 'concise') => {
  const student = db.students.find(item => item.id === studentId);
  const teacher = findTeacherById(db, teacherId);
  return {
    template,
    studentId,
    studentName: student?.name || 'Ученик',
    teacherName: teacher?.name || 'Преподаватель',
    parentEmail: getStudentParentEmail(student),
    periodLabel: period.label,
    frequentErrors: buildFrequentErrorsForPeriod(db, teacherId, studentId, period),
    gradesHistogram: buildGradesHistogramForPeriod(db, teacherId, studentId, period),
    topicDynamics: buildTopicDynamicsForPeriod(db, teacherId, studentId, period),
    recommendations: buildRecommendationsForPeriod(db, teacherId, studentId, period),
  };
};

const buildParentReportPayload = (db, teacherId, targetType, targetId, recipients = [], period, template = 'concise') => (
  targetType === 'student'
    ? buildParentReportDocument(db, teacherId, targetId, period, template)
    : recipients.map(recipient => ({
      studentId: recipient.studentId,
      ...buildParentReportDocument(db, teacherId, recipient.studentId, period, template),
    }))
);

const backendBaseUrl = (req = null) => (req ? `${req.protocol}://${req.get('host')}` : `http://127.0.0.1:${PORT}`);

async function buildReportDelivery({ db, teacherId, studentId, period, template = 'concise', req = null }) {
  const report = buildParentReportDocument(db, teacherId, studentId, period, template);
  const fileName = `parent-report-${studentId}-${Date.now()}.pdf`;
  const filePath = path.join(uploadsDir, fileName);
  await writeParentReportPdf({ filePath, report, fontPath: pdfFontPath });
  return {
    studentId,
    contact: report.parentEmail,
    name: report.studentName,
    fileName,
    url: `${backendBaseUrl(req)}/uploads/${fileName}`,
    htmlBody: buildParentReportHtml(report),
    report,
  };
}

const buildComputedForScope = (db, students = [], groups = [], teacherId = null) => ({
  studentScores: Object.fromEntries(students.map(student => [student.id, teacherId ? getStudentScoreForTeacher(db, teacherId, student.id) : getStudentScore(db, student.id)])),
  groupScores: Object.fromEntries(groups.map(group => {
    const activeIds = (group.studentIds || []).filter(id => students.find(student => student.id === id)?.active);
    const score = activeIds.length ? Math.round(activeIds.reduce((sum, id) => sum + (teacherId ? getStudentScoreForTeacher(db, teacherId, id) : getStudentScore(db, id)), 0) / activeIds.length) : 0;
    return [group.id, score];
  })),
});

const teacherDirectoryEntry = (teacher = {}) => ({
  id: teacher.id,
  name: teacher.name,
  email: teacher.email,
  avatarUrl: teacher.avatarUrl || '',
  subjects: Array.isArray(teacher.subjects) ? teacher.subjects : [],
});

const emptyScopedPayload = (scope = 'public') => ({
  teachers: [],
  students: [],
  groups: [],
  assignments: [],
  works: [],
  teacherInvites: [],
  reportConfigs: [],
  reportLogs: [],
  batchSessions: [],
  attendanceRecords: [],
  computed: { studentScores: {}, groupScores: {} },
  meta: { scope, featureFlags: featureFlagsPayload(aiConfig), reportTemplates: PARENT_REPORT_TEMPLATES, errorTaxonomy: NORMALIZED_ERROR_TAXONOMY },
});

const serializeBootstrap = ({ role = null, userId = null } = {}) => {
  const db = ensureDbDefaults(readDb());

  if (!role || !userId) return emptyScopedPayload();

  if (role === 'teacher') {
    const teacher = findTeacherById(db, userId);
    if (!teacher) return emptyScopedPayload('teacher');
    const invites = (db.teacherInvites || []).filter(item => item.teacherId === userId);
    const relatedStudentIds = new Set([
      ...db.students.filter(student => teacherOwnsStudent(student, userId)).map(student => student.id),
      ...invites.map(invite => invite.studentId).filter(Boolean),
    ]);
    const students = db.students
      .filter(student => relatedStudentIds.has(student.id))
      .map(student => applyTeacherOverlayToStudent(db, userId, student));
    const groups = db.groups.filter(group => teacherOwnsGroup(group, userId));
    return {
      teachers: [teacher],
      students,
      groups,
      assignments: db.assignments.filter(item => teacherOwnsAssignment(item, userId)),
      works: db.works
        .filter(item => teacherOwnsWork(item, userId) && relatedStudentIds.has(item.studentId))
        .map(item => decorateWorkWithAi(db, item)),
      teacherInvites: invites,
      reportConfigs: db.reportConfigs.filter(item => item.teacherId === userId),
      reportLogs: db.reportLogs.filter(item => item.teacherId === userId),
      batchSessions: db.batchSessions
        .filter(item => item.teacherId === userId)
        .map(session => ({
          ...session,
          results: (session.results || []).map(result => decorateBatchResultWithAi(db, session, result)),
        })),
      attendanceRecords: db.attendanceRecords.filter(item => teacherOwnsAttendance(item, userId)),
      computed: buildComputedForScope(db, students.filter(student => teacherOwnsStudent(student, userId)), groups, userId),
      meta: { scope: 'teacher', featureFlags: featureFlagsPayload(aiConfig), reportTemplates: PARENT_REPORT_TEMPLATES, errorTaxonomy: NORMALIZED_ERROR_TAXONOMY },
    };
  }

  if (role === 'student') {
    const student = db.students.find(item => item.id === userId);
    if (!student) return emptyScopedPayload('student');
    const teacherIds = studentTeacherIds(student);
    const invites = (db.teacherInvites || []).filter(item => item.studentId === userId);
    const groups = db.groups.filter(group => group.active && group.studentIds.includes(userId) && (!teacherIds.length || teacherIds.includes(group.teacherId)));
    const assignments = getAssignmentsForStudent(db, userId);
    const visibleTeacherIds = unique([
      ...teacherIds,
      ...invites.map(invite => invite.teacherId),
      ...groups.map(group => group.teacherId),
      ...assignments.map(assignment => assignment.teacherId),
      ...db.works.filter(item => item.studentId === userId).map(item => item.teacherId),
    ]);
    return {
      teachers: db.teachers.filter(teacher => visibleTeacherIds.includes(teacher.id)),
      students: [student],
      groups,
      assignments,
      works: db.works
        .filter(item => item.studentId === userId && (!teacherIds.length || !item.teacherId || teacherIds.includes(item.teacherId) || invites.some(invite => invite.teacherId === item.teacherId)))
        .map(item => {
          const decorated = decorateWorkWithAi(db, item);
          return {
            ...item,
            processingStatus: decorated.submission?.status || item.processingStatus || SubmissionStatuses.uploaded,
            finalFeedback: decorated.finalFeedback || null,
          };
        }),
      teacherInvites: invites,
      reportConfigs: [],
      reportLogs: [],
      batchSessions: [],
      attendanceRecords: db.attendanceRecords.filter(item => item.studentId === userId && (!item.teacherId || teacherIds.includes(item.teacherId))),
      computed: buildComputedForScope(db, [student], groups),
      meta: { scope: 'student', featureFlags: featureFlagsPayload(aiConfig), reportTemplates: PARENT_REPORT_TEMPLATES, errorTaxonomy: NORMALIZED_ERROR_TAXONOMY },
    };
  }

  return {
    ...emptyScopedPayload(role),
  };
};

const accountAccess = (account) => {
  if (account.role !== 'teacher') return 'standard';
  const createdAt = new Date(account.createdAt);
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + TRIAL_DAYS);
  return expiresAt < new Date() ? 'limited' : 'full';
};

const safeAccount = (db, account) => ({
  userId: account.userId,
  role: account.role,
  userName: account.role === 'teacher'
    ? (findTeacherById(db, account.userId)?.name || account.name || 'Преподаватель')
    : (db.students.find(s => s.id === account.userId)?.name || account.name || 'Ученик'),
  accessMode: accountAccess(account),
  trialEndsAt: (() => { const d = new Date(account.createdAt); d.setDate(d.getDate() + TRIAL_DAYS); return d.toISOString(); })(),
  createdAt: account.createdAt,
  onboardingCompleted: Boolean(account.onboardingCompleted),
});

const createSmsCode = () => String(Math.floor(1000 + Math.random() * 9000));

app.get('/api/bootstrap', (req, res) => {
  const { role, userId } = req.query || {};
  res.json(serializeBootstrap({ role, userId }));
});

app.get('/api/teachers/search', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const query = String(req.query?.q || '').trim().toLowerCase();
  const results = db.teachers
    .filter(item => {
      if (!query) return true;
      return `${item.name} ${item.email}`.toLowerCase().includes(query);
    })
    .map(teacherDirectoryEntry);
  res.json(results);
});

app.get('/api/students/search', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const teacherId = String(req.query?.teacherId || '').trim();
  if (!teacherId) return res.status(400).json({ error: 'Не указан преподаватель.' });
  const query = String(req.query?.q || '').trim().toLowerCase();
  const results = db.students
    .filter(student => student.active && !isVirtualStudent(db, student))
    .filter(student => {
      if (!query) return true;
      return `${student.name} ${student.email}`.toLowerCase().includes(query);
    })
    .map(student => ({
      id: student.id,
      name: student.name,
      email: student.email || '',
      phone: student.phone || '',
      attachedToCurrentTeacher: studentHasTeacher(student, teacherId),
    }));
  res.json(results);
});

app.post('/api/auth/register', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { role, name, firstName, lastName, email, phone, password, parentName, parentEmail, parentContact } = req.body;
  const normalizedName = normalizePersonName(name, firstName, lastName);
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = String(phone || '').trim();
  const normalizedParentEmail = normalizeEmail(parentEmail || (isEmailLike(parentContact) ? parentContact : ''));
  const hasSplitName = String(firstName || '').trim() && String(lastName || '').trim();
  if (!role || !normalizedName || !normalizedEmail || !password || !hasSplitName) return res.status(400).json({ error: 'Заполните имя, фамилию, email, телефон и пароль.' });
  if (!normalizedPhone) return res.status(400).json({ error: 'Номер телефона обязателен.' });
  if (!isValidEmail(normalizedEmail)) return res.status(400).json({ error: 'Укажите корректный email.' });
  if (!isValidPhone(normalizedPhone)) return res.status(400).json({ error: 'Укажите корректный номер телефона.' });
  if (normalizedParentEmail && !isValidEmail(normalizedParentEmail)) return res.status(400).json({ error: 'Укажите корректный Email родителя.' });
  const existing = db.accounts.find(acc => acc.role === role && acc.email === normalizedEmail);
  if (existing) return res.status(409).json({ error: 'Аккаунт с такой ролью и почтой уже существует.' });

  let userId = null;
  if (role === 'teacher') {
    userId = nextId(db, 'teacher', 't');
    db.teachers.push(defaultTeacherProfile({
      id: userId,
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
    }));
  } else {
    const mergeCandidate = findMergeCandidateForRegisteredStudent(db, {
      email: normalizedEmail,
      phone: normalizedPhone,
      parentEmail: normalizedParentEmail,
    });
    const contactConflict = findStudentContactConflict(
      db,
      { email: normalizedEmail, phone: normalizedPhone, parentEmail: normalizedParentEmail },
      mergeCandidate?.id || null,
    );
    if (contactConflict && !isVirtualStudent(db, contactConflict)) {
      return res.status(409).json({ error: 'Ученик с такими контактами уже зарегистрирован.' });
    }

    const student = normalizeStudentParentFields(syncPrimaryTeacher({
      id: nextId(db, 'student', 's'),
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      parentName: String(parentName || '').trim(),
      parentEmail: normalizedParentEmail,
      parentContact: normalizedParentEmail,
      level: '',
      subjects: [],
      active: true,
      virtual: false,
      lessonSlots: [],
      teacherId: null,
      teacherIds: [],
    }));
    db.students.push(student);
    const mergedStudent = mergeCandidate ? mergeVirtualStudentIntoRealStudent(db, mergeCandidate, student) : student;
    mergedStudent.virtual = false;
    userId = mergedStudent.id;
  }

  const account = {
    id: `acc-${Date.now()}`,
    role,
    name: normalizedName,
    email: normalizedEmail,
    phone: normalizedPhone,
    password,
    verified: false,
    createdAt: new Date().toISOString(),
    userId,
    onboardingCompleted: false,
  };
  db.accounts.push(account);

  const code = createSmsCode();
  db.smsLogs.unshift({ id: `sms-${Date.now()}`, email: normalizedEmail, role, phone: normalizedPhone, code, createdAt: new Date().toISOString(), used: false });
  writeDb(db);
  return res.json({ requiresSms: true, debugCode: code, email: normalizedEmail, role });
});

app.post('/api/auth/onboarding-complete', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { role, userId } = req.body || {};
  const account = db.accounts.find(item => item.role === role && item.userId === userId);
  if (!account) return res.status(404).json({ error: 'Аккаунт не найден.' });
  account.onboardingCompleted = true;
  writeDb(db);
  res.json({ session: safeAccount(db, account) });
});

app.post('/api/auth/verify-sms', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { email, role, code } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const account = db.accounts.find(acc => acc.email === normalizedEmail && acc.role === role);
  if (!account) return res.status(404).json({ error: 'Аккаунт не найден.' });
  const sms = db.smsLogs.find(item => item.email === normalizedEmail && item.role === role && item.code === String(code) && !item.used);
  if (!sms) return res.status(400).json({ error: 'Неверный код подтверждения.' });
  sms.used = true;
  account.verified = true;
  writeDb(db);
  res.json({ success: true });
});


app.post('/api/auth/request-reset', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { role, identifier } = req.body;
  const normalized = String(identifier || '').trim().toLowerCase();
  const byEmail = normalized.includes('@');
  const account = db.accounts.find(acc => acc.role === role && (byEmail ? acc.email === normalized : String(acc.phone || '').trim() === String(identifier || '').trim()));
  if (!account) return res.status(404).json({ error: 'Аккаунт не найден.' });
  const code = createSmsCode();
  db.resetRequests.unshift({ id: `reset-${Date.now()}`, role, identifier: byEmail ? account.email : account.phone, code, channel: byEmail ? 'email' : 'phone', used: false, createdAt: new Date().toISOString() });
  writeDb(db);
  res.json({ success: true, debugCode: code, channel: byEmail ? 'email' : 'phone' });
});

app.post('/api/auth/verify-reset', (req, res) => {
  const db = readDb();
  const { role, identifier, code } = req.body;
  const normalized = String(identifier || '').trim().toLowerCase();
  const request = db.resetRequests.find(item => item.role === role && item.code === String(code) && !item.used && (item.identifier.toLowerCase?.() ? item.identifier.toLowerCase() === normalized : String(item.identifier) === String(identifier)));
  if (!request) return res.status(400).json({ error: 'Неверный код восстановления.' });
  res.json({ success: true });
});

app.post('/api/auth/complete-reset', (req, res) => {
  const db = readDb();
  const { role, identifier, code, password } = req.body;
  const normalized = String(identifier || '').trim().toLowerCase();
  const request = db.resetRequests.find(item => item.role === role && item.code === String(code) && !item.used && (item.identifier.toLowerCase?.() ? item.identifier.toLowerCase() === normalized : String(item.identifier) === String(identifier)));
  if (!request) return res.status(400).json({ error: 'Код восстановления не подтвержден.' });
  const byEmail = normalized.includes('@');
  const account = db.accounts.find(acc => acc.role === role && (byEmail ? acc.email === normalized : String(acc.phone || '').trim() === String(identifier || '').trim()));
  if (!account) return res.status(404).json({ error: 'Аккаунт не найден.' });
  account.password = password;
  request.used = true;
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/auth/login', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { email, role, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) return res.status(400).json({ error: 'Укажите корректный email.' });
  const account = db.accounts.find(acc => acc.email === normalizedEmail && acc.role === role && acc.password === password);
  if (!account) return res.status(401).json({ error: 'Неверная почта, роль или пароль.' });
  if (!account.verified) return res.status(403).json({ error: 'Сначала подтвердите аккаунт по SMS.' });
  res.json({ session: safeAccount(db, account) });
});

app.put('/api/teacher/profile', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { userId, ...payload } = req.body || {};
  const teacher = findTeacherById(db, userId);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
  Object.assign(teacher, payload);
  db.accounts.filter(acc => acc.role === 'teacher' && acc.userId === teacher.id).forEach(acc => {
    if (payload.email) acc.email = payload.email;
    if (payload.phone !== undefined) acc.phone = payload.phone;
    if (payload.name) acc.name = payload.name;
  });
  writeDb(db);
  res.json(teacher);
});

app.post('/api/teacher-invites', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { teacherId, studentId = null, direction = 'student_to_teacher' } = req.body || {};
  if (!teacherId) return res.status(400).json({ error: 'Не хватает данных для приглашения.' });
  if (!['student_to_teacher', 'teacher_to_student'].includes(direction)) return res.status(400).json({ error: 'Некорректное направление приглашения.' });
  const teacher = findTeacherById(db, teacherId);
  const student = studentId ? db.students.find(item => item.id === studentId) : null;
  if (!teacher) return res.status(404).json({ error: 'Преподаватель не найден.' });
  if (studentId && !student) return res.status(404).json({ error: 'Ученик не найден.' });
  const existing = (direction === 'teacher_to_student' && !studentId)
    ? null
    : db.teacherInvites.find(item => item.teacherId === teacherId && item.studentId === studentId && item.direction === direction && normalizeInviteStatus(item.status) === 'pending');
  if (existing) return res.status(409).json({ error: 'Запрос уже отправлен.' });
  if (student && studentHasTeacher(student, teacherId)) return res.status(409).json({ error: 'Этот преподаватель уже связан с учеником.' });
  const invite = {
    id: `invite-${Date.now()}`,
    teacherId,
    studentId,
    direction,
    status: 'pending',
    token: inviteToken(),
    createdAt: new Date().toISOString(),
    expiresAt: createInviteExpiry(),
    claimedByStudentId: studentId || null,
  };
  db.teacherInvites.unshift(invite);
  writeDb(db);
  res.json(invite);
});

app.get('/api/teacher-invites/resolve/:token', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { invite, error } = validateTeacherInviteToken(db, req.params.token);
  if (error) return res.status(404).json({ error });
  const teacher = findTeacherById(db, invite.teacherId);
  res.json({
    token: invite.token,
    status: invite.status,
    expiresAt: invite.expiresAt,
    direction: invite.direction,
    teacher: teacher ? teacherDirectoryEntry(teacher) : null,
    claimedByStudentId: invite.claimedByStudentId || null,
  });
});

app.post('/api/teacher-invites/accept-token', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { token, studentId } = req.body || {};
  const { invite, error } = validateTeacherInviteToken(db, token);
  if (error) return res.status(409).json({ error });
  const student = db.students.find(item => item.id === studentId);
  if (!student) return res.status(404).json({ error: 'Ученик не найден.' });
  if (invite.studentId && invite.studentId !== studentId) {
    return res.status(409).json({ error: 'Ссылка уже закреплена за другим учеником.' });
  }
  invite.studentId = studentId;
  invite.claimedByStudentId = studentId;
  invite.claimedAt = invite.claimedAt || new Date().toISOString();
  invite.status = 'accepted';
  invite.reviewedAt = new Date().toISOString();
  assignTeacherToStudent(student, invite.teacherId);
  rememberHistoricalStudent(db, invite.teacherId, student.id);
  db.teacherInvites.forEach(item => {
    if (item.id !== invite.id && item.teacherId === invite.teacherId && item.studentId === student.id && item.status === 'pending') {
      item.status = 'declined';
      item.reviewedAt = invite.reviewedAt;
    }
  });
  writeDb(db);
  res.json({ success: true, invite, teacher: findTeacherById(db, invite.teacherId) });
});

app.post('/api/teacher-invites/claim', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { token, studentId } = req.body || {};
  const { invite, error } = validateTeacherInviteToken(db, token);
  if (error) return res.status(409).json({ error });
  if (invite.studentId && invite.studentId !== studentId) return res.status(409).json({ error: 'Ссылка уже закреплена за другим учеником.' });
  const student = db.students.find(item => item.id === studentId);
  if (!student) return res.status(404).json({ error: 'Ученик не найден.' });
  if (studentHasTeacher(student, invite.teacherId)) return res.status(409).json({ error: 'Этот преподаватель уже подключен.' });
  invite.studentId = studentId;
  invite.claimedByStudentId = studentId;
  invite.claimedAt = invite.claimedAt || new Date().toISOString();
  writeDb(db);
  res.json(invite);
});

app.put('/api/teacher-invites/:id', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const invite = db.teacherInvites.find(item => item.id === req.params.id);
  if (!invite) return res.status(404).json({ error: 'Запрос не найден.' });
  const nextStatus = normalizeInviteStatus(req.body?.status);
  if (!['accepted', 'declined'].includes(nextStatus)) return res.status(400).json({ error: 'Некорректный статус запроса.' });
  if (nextStatus === 'accepted' && !invite.studentId) return res.status(409).json({ error: 'Сначала закрепите приглашение за учеником.' });
  invite.status = nextStatus;
  invite.reviewedAt = new Date().toISOString();
  if (nextStatus === 'accepted') {
    const student = db.students.find(item => item.id === invite.studentId);
    if (student) {
      assignTeacherToStudent(student, invite.teacherId);
      rememberHistoricalStudent(db, invite.teacherId, student.id);
    }
    db.teacherInvites.forEach(item => {
      if (item.id !== invite.id && item.studentId === invite.studentId && item.teacherId === invite.teacherId && item.status === 'pending') {
        item.status = 'declined';
        item.reviewedAt = invite.reviewedAt;
      }
    });
  }
  writeDb(db);
  res.json(invite);
});

app.post('/api/teacher-invites/:id/dismiss-student-notification', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const invite = db.teacherInvites.find(item => item.id === req.params.id);
  if (!invite) return res.status(404).json({ error: 'Уведомление не найдено.' });
  invite.studentNotificationDismissedAt = new Date().toISOString();
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/upload', aiRateLimit, upload.array('files', aiConfig.limits.maxFilesPerSubmission), async (req, res, next) => {
  try {
    const files = await buildUploadedFileDescriptors(req, req.files || []);
    res.json({ files });
  } catch (error) {
    next(error);
  }
});

app.post('/api/students', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { name, email, parentName, parentContact, parentEmail, level, subjects, lessonSlots, newGroupName, newGroupSubject, teacherId, phone } = req.body;
  if (!teacherId) return res.status(400).json({ error: 'Не указан преподаватель для нового ученика.' });
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Имя ученика обязательно.' });
  const normalizedSlots = normalizeSlots(lessonSlots || []);
  const conflict = slotConflict(db, normalizedSlots, null, null, teacherId || null);
  if (conflict.conflict) return res.status(409).json({ error: `Слот занят: ${conflict.studentName}, ${conflict.slot.day} ${conflict.slot.time}` });
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = String(phone || '').trim();
  const normalizedParentEmail = normalizeEmail(parentEmail || (isEmailLike(parentContact) ? parentContact : ''));
  if (normalizedEmail && !isValidEmail(normalizedEmail)) return res.status(400).json({ error: 'Укажите корректный Email ученика.' });
  if (normalizedPhone && !isValidPhone(normalizedPhone)) return res.status(400).json({ error: 'Укажите корректный телефон ученика.' });
  if (normalizedParentEmail && !isValidEmail(normalizedParentEmail)) return res.status(400).json({ error: 'Укажите корректный Email родителя.' });
  const duplicate = findStudentContactConflict(db, { email: normalizedEmail, phone: normalizedPhone, parentEmail: normalizedParentEmail });
  if (duplicate) return res.status(409).json({ error: 'Ученик с такими контактами уже существует. Используйте поиск и приглашение.' });
  const studentId = nextId(db, 'student', 's');
  const student = normalizeStudentParentFields(syncPrimaryTeacher({
    id: studentId,
    name: String(name || '').trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    parentName: parentName || '',
    parentContact: parentContact || normalizedParentEmail,
    parentEmail: normalizedParentEmail,
    level: level || '',
    subjects: Array.isArray(subjects) ? subjects : [],
    active: true,
    virtual: true,
    lessonSlots: normalizedSlots,
    teacherIds: teacherId ? [teacherId] : [],
    teacherId: teacherId || null,
  }));
  db.students.push(student);
  rememberHistoricalStudent(db, teacherId, studentId);
  if (newGroupName) {
    const groupId = nextId(db, 'group', 'g');
    db.groups.push({ id: groupId, name: newGroupName, subject: newGroupSubject || subjects?.[0] || 'Математика', active: true, studentIds: [studentId], riskTopics: [], teacherId: teacherId || null, lessonSlots: [] });
  }
  writeDb(db);
  res.json(student);
});

app.put('/api/students/:id', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const index = db.students.findIndex(item => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Student not found' });
  const current = db.students[index];
  const normalizedSlots = req.body.lessonSlots ? normalizeSlots(req.body.lessonSlots) : db.students[index].lessonSlots;
  const activeTeacherId = req.body.teacherId || studentTeacherIds(db.students[index])[0] || null;
  const conflict = slotConflict(db, normalizedSlots, req.params.id, null, activeTeacherId);
  if (conflict.conflict) return res.status(409).json({ error: `Слот занят: ${conflict.studentName}, ${conflict.slot.day} ${conflict.slot.time}` });
  const nextParentEmail = normalizeEmail(req.body.parentEmail || (isEmailLike(req.body.parentContact) ? req.body.parentContact : current.parentEmail));
  if ((req.body.email ?? current.email) && !isValidEmail(req.body.email ?? current.email)) return res.status(400).json({ error: 'Укажите корректный email.' });
  if ((req.body.phone ?? current.phone) && !isValidPhone(req.body.phone ?? current.phone)) return res.status(400).json({ error: 'Укажите корректный телефон.' });
  if (nextParentEmail && !isValidEmail(nextParentEmail)) return res.status(400).json({ error: 'Укажите корректный Email родителя.' });
  const duplicate = findStudentContactConflict(db, {
    email: normalizeEmail(req.body.email ?? current.email),
    phone: req.body.phone ?? current.phone,
    parentEmail: nextParentEmail,
  }, req.params.id);
  if (duplicate) return res.status(409).json({ error: 'Ученик с такими контактами уже существует.' });
  db.students[index] = normalizeStudentParentFields(syncPrimaryTeacher({
    ...db.students[index],
    ...req.body,
    parentEmail: nextParentEmail,
    lessonSlots: normalizedSlots,
  }));
  db.accounts.filter(acc => acc.role === 'student' && acc.userId === req.params.id).forEach(acc => {
    if (req.body.email) acc.email = req.body.email;
    if (req.body.phone !== undefined) acc.phone = req.body.phone;
    if (req.body.name) acc.name = req.body.name;
  });
  writeDb(db);
  res.json(db.students[index]);
});

app.put('/api/teachers/:teacherId/students/:studentId/overlay', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const teacher = findTeacherById(db, req.params.teacherId);
  const student = db.students.find(item => item.id === req.params.studentId);
  if (!teacher || !student) return res.status(404).json({ error: 'Не удалось найти преподавателя или ученика.' });
  const normalizedSlots = normalizeSlots(req.body.schedule_slots_override || req.body.lessonSlots || []);
  const conflict = slotConflict(db, normalizedSlots, req.params.studentId, null, req.params.teacherId);
  if (conflict.conflict) return res.status(409).json({ error: `Слот занят: ${conflict.studentName}, ${conflict.slot.day} ${conflict.slot.time}` });

  if (isVirtualStudent(db, student)) {
    Object.assign(student, normalizeStudentParentFields(syncPrimaryTeacher({
      ...student,
      name: String(req.body.display_name_override || req.body.name || student.name || '').trim(),
      email: normalizeEmail(req.body.student_email_label || req.body.email || student.email || ''),
      phone: String(req.body.student_phone_label || req.body.phone || student.phone || '').trim(),
      parentName: String(req.body.parent_name_override || req.body.parentName || student.parentName || '').trim(),
      parentEmail: normalizeEmail(req.body.parent_email_override || req.body.parentEmail || student.parentEmail || ''),
      level: String(req.body.level_override || req.body.level || student.level || '').trim(),
      lessonSlots: normalizedSlots,
    })));
    writeDb(db);
    return res.json(student);
  }

  const overlay = ensureTeacherStudentOverlay(db, req.params.teacherId, req.params.studentId);
  overlay.display_name_override = String(req.body.display_name_override || req.body.name || '').trim();
  overlay.student_email_label = String(req.body.student_email_label || req.body.email || '').trim();
  overlay.student_phone_label = String(req.body.student_phone_label || req.body.phone || '').trim();
  overlay.parent_email_override = String(req.body.parent_email_override || req.body.parentEmail || '').trim();
  overlay.parent_name_override = String(req.body.parent_name_override || req.body.parentName || '').trim();
  overlay.level_override = String(req.body.level_override || req.body.level || '').trim();
  overlay.schedule_slots_override = normalizedSlots;
  overlay.updatedAt = new Date().toISOString();
  if (overlay.student_email_label && !isValidEmail(overlay.student_email_label)) return res.status(400).json({ error: 'Укажите корректный Email ученика.' });
  if (overlay.student_phone_label && !isValidPhone(overlay.student_phone_label)) return res.status(400).json({ error: 'Укажите корректный телефон ученика.' });
  if (overlay.parent_email_override && !isValidEmail(overlay.parent_email_override)) return res.status(400).json({ error: 'Укажите корректный Email родителя.' });
  writeDb(db);
  res.json(applyTeacherOverlayToStudent(db, req.params.teacherId, student));
});

app.post('/api/students/:id/archive', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const student = db.students.find(item => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  student.active = false;
  db.groups.forEach(group => { group.studentIds = group.studentIds.filter(id => id !== student.id); });
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/teachers/:teacherId/students/:studentId/detach', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const teacher = findTeacherById(db, req.params.teacherId);
  const student = db.students.find(item => item.id === req.params.studentId);
  if (!teacher || !student) return res.status(404).json({ error: 'Не удалось найти преподавателя или ученика.' });
  if (!studentHasTeacher(student, teacher.id)) return res.status(409).json({ error: 'Этот ученик не связан с преподавателем.' });
  detachTeacherStudent(db, teacher.id, student.id);
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/groups', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  if (!req.body.teacherId) return res.status(400).json({ error: 'Не указан преподаватель группы.' });
  const normalizedSlots = normalizeSlots(req.body.lessonSlots || []);
  const conflict = slotConflict(db, normalizedSlots, null, null, req.body.teacherId || null);
  if (conflict.conflict) return res.status(409).json({ error: `Слот занят: ${conflict.studentName}, ${conflict.slot.day} ${conflict.slot.time}` });
  const validStudentIds = unique((req.body.studentIds || []).filter(id => {
    const student = db.students.find(item => item.id === id);
    return teacherOwnsStudent(student, req.body.teacherId);
  }));
  const group = { id: nextId(db, 'group', 'g'), active: true, ...req.body, studentIds: validStudentIds, riskTopics: Array.isArray(req.body.riskTopics) ? req.body.riskTopics : [], lessonSlots: normalizedSlots, teacherId: req.body.teacherId || null };
  db.groups.push(group);
  writeDb(db);
  res.json(group);
});

app.put('/api/groups/:id', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const group = db.groups.find(item => item.id === req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const normalizedSlots = req.body.lessonSlots ? normalizeSlots(req.body.lessonSlots) : normalizeSlots(group.lessonSlots || []);
  const conflict = slotConflict(db, normalizedSlots, null, req.params.id, req.body.teacherId || group.teacherId || null);
  if (conflict.conflict) return res.status(409).json({ error: `Слот занят: ${conflict.studentName}, ${conflict.slot.day} ${conflict.slot.time}` });
  const nextStudentIds = req.body.studentIds ? unique(req.body.studentIds.filter(id => {
    const student = db.students.find(item => item.id === id);
    return teacherOwnsStudent(student, req.body.teacherId || group.teacherId);
  })) : group.studentIds;
  Object.assign(group, req.body, { studentIds: nextStudentIds, lessonSlots: normalizedSlots });
  writeDb(db);
  res.json(group);
});

app.post('/api/groups/:id/archive', (req, res) => {
  const db = readDb();
  const group = db.groups.find(item => item.id === req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  group.active = false;
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/assignments', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  if (!req.body.teacherId) return res.status(400).json({ error: 'Не указан преподаватель задания.' });
  const normalizedInput = {
    ...req.body,
    description: assignmentTaskText(req.body),
    links: normalizeAssignmentLinks(req.body.links || req.body.assignmentLinks || []),
    deadline: endOfDayIso(req.body.deadline) || '',
    maxScore: Number(req.body.maxScore || 100),
  };
  const recipients = normalizeAssignmentRecipients(db, req.body, req.body.teacherId);
  const hasRecipient = recipients.recipientType === 'students'
    ? recipients.recipientIds.length
    : Boolean(recipients.recipientId);
  if (!hasRecipient) return res.status(400).json({ error: 'Выберите получателя задания из своих учеников или групп.' });
  const assignment = {
    id: nextId(db, 'assignment', 'a'),
    createdAt: new Date().toISOString().slice(0, 10),
    attachments: normalizedInput.attachments || [],
    teacherId: normalizedInput.teacherId || null,
    status: normalizedInput.status || 'Черновик',
    ...normalizedInput,
    ...recipients,
  };
  db.assignments.push(assignment);
  writeDb(db);
  res.json(assignment);
});

app.put('/api/assignments/:id', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const assignment = db.assignments.find(item => item.id === req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  if (assignment.status === 'Активно' || assignment.status === 'Прорешено') {
    return res.status(409).json({ error: 'Активное задание доступно только для просмотра.' });
  }
  const normalizedInput = {
    ...req.body,
    description: assignmentTaskText({ ...assignment, ...req.body }),
    links: normalizeAssignmentLinks(req.body.links || req.body.assignmentLinks || assignment.links || []),
    deadline: endOfDayIso(req.body.deadline || assignment.deadline) || '',
  };
  const recipients = req.body.recipientType || req.body.recipientId || req.body.recipientIds
    ? normalizeAssignmentRecipients(db, { ...assignment, ...normalizedInput }, req.body.teacherId || assignment.teacherId)
    : { recipientType: assignment.recipientType, recipientId: assignment.recipientId, recipientIds: assignment.recipientIds };
  const hasRecipient = recipients.recipientType === 'students'
    ? recipients.recipientIds.length
    : Boolean(recipients.recipientId);
  if (!hasRecipient) return res.status(400).json({ error: 'Выберите получателя задания из своих учеников или групп.' });
  Object.assign(assignment, normalizedInput, recipients);
  writeDb(db);
  res.json(assignment);
});

app.post('/api/assignments/:id/publish-draft', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const draft = db.assignments.find(item => item.id === req.params.id);
  if (!draft) return res.status(404).json({ error: 'Assignment not found' });
  const candidate = {
    ...draft,
    ...req.body,
    description: assignmentTaskText({ ...draft, ...req.body }),
    links: normalizeAssignmentLinks(req.body.links || req.body.assignmentLinks || draft.links || []),
    deadline: endOfDayIso(req.body.deadline || draft.deadline) || '',
    status: 'Активно',
  };
  const recipients = normalizeAssignmentRecipients(db, candidate, candidate.teacherId || draft.teacherId);
  const normalizedCandidate = { ...candidate, ...recipients };
  const hasRecipient = recipients.recipientType === 'students'
    ? recipients.recipientIds.length
    : Boolean(recipients.recipientId);
  if (!hasRecipient) return res.status(400).json({ error: 'Выберите получателя задания из своих учеников или групп.' });
  const duplicate = db.assignments.find(item => item.id !== draft.id
    && isPublishedAssignment(item)
    && item.title === normalizedCandidate.title
    && item.subject === normalizedCandidate.subject
    && item.deadline === normalizedCandidate.deadline
    && item.teacherId === normalizedCandidate.teacherId
    && assignmentTargetSignature(db, item) === assignmentTargetSignature(db, normalizedCandidate));
  if (duplicate) return res.status(409).json({ error: 'Нельзя повторно активировать одинаковое задание.' });
  Object.assign(draft, normalizedCandidate, { status: 'Активно' });
  writeDb(db);
  res.json(draft);
});

app.delete('/api/assignments/:id', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const assignment = db.assignments.find(item => item.id === req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  if (assignment.status !== 'Черновик') return res.status(409).json({ error: 'Удалять можно только черновики.' });
  db.assignments = db.assignments.filter(item => item.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/works', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const assignment = db.assignments.find(item => item.id === req.body.assignmentId);
  if (!assignment || !assignmentTargetsStudent(db, assignment, req.body.studentId)) {
    return res.status(400).json({ error: 'Нельзя загрузить работу для этого задания.' });
  }
  const existing = db.works.find(item => item.assignmentId === req.body.assignmentId && item.studentId === req.body.studentId && item.teacherId === (req.body.teacherId || assignment.teacherId));
  if (existing) {
    return res.status(409).json({ error: 'Работа по этому заданию уже отправлена. Дозагрузка файлов недоступна.' });
  }
  const work = {
    id: nextId(db, 'work', 'w'),
    submittedAt: new Date().toISOString().slice(0, 10),
    status: 'Ожидает подтверждения',
    aiComment: 'Работа загружена. AI-анализ будет добавлен после обработки.',
    aiErrors: [],
    suggestedScore: 0,
    finalScore: null,
    teacherId: req.body.teacherId || assignment?.teacherId || studentTeacherIds(db.students.find(item => item.id === req.body.studentId))[0] || null,
    ...req.body,
  };
  db.works.push(work);
  registerWorkSubmission(db, work, assignment);
  writeDb(db);
  if (aiConfig.flags.ENABLE_OPENAI_RECOGNITION) {
    recognitionQueue.enqueueSubmission(work.submissionId, work.teacherId);
  } else {
    const persistedDb = readDb();
    ensureDbDefaults(persistedDb);
    const persistedWork = persistedDb.works.find(item => item.id === work.id);
    if (persistedWork) {
      persistedWork.processingStatus = SubmissionStatuses.failed;
      persistedWork.aiProcessingError = 'AI-обработка отключена на сервере. Укажите OPENAI_API_KEY и включите ENABLE_OPENAI_RECOGNITION.';
      writeDb(persistedDb);
    }
  }
  const responseDb = readDb();
  ensureDbDefaults(responseDb);
  const responseWork = responseDb.works.find(item => item.id === work.id);
  res.json(decorateWorkWithAi(responseDb, responseWork || work));
});

app.put('/api/works/:id', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const work = db.works.find(item => item.id === req.params.id);
  if (!work) return res.status(404).json({ error: 'Work not found' });
  Object.assign(work, req.body);
  work.status = normalizeWorkStatus(work.status);
  writeDb(db);
  res.json(work);
});

app.put('/api/works/:id/confirm', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const result = approveSubmissionReview(db, {
    workId: req.params.id,
    finalScore: req.body.finalScore,
    studentComment: req.body.aiComment ?? req.body.studentComment,
    teacherComment: req.body.teacherComment,
    actorId: req.body.teacherId || req.body.actorId || null,
    reviewRequired: aiConfig.flags.ENABLE_TEACHER_REVIEW_REQUIRED,
    errorTags: sanitizeEditableErrorTags(req.body.errorTags || []),
  });
  if (result?.error) return res.status(409).json({ error: result.error });
  recalculateAssignmentStatus(db, result.work.assignmentId);
  writeDb(db);
  res.json(decorateWorkWithAi(db, result.work));
});

app.post('/api/works/:id/reprocess', aiRateLimit, (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const work = db.works.find(item => item.id === req.params.id);
  if (!work) return res.status(404).json({ error: 'Работа не найдена.' });
  if (!aiConfig.flags.ENABLE_OPENAI_RECOGNITION) return res.status(409).json({ error: 'AI-обработка отключена на сервере.' });
  const job = recognitionQueue.enqueueSubmission(work.submissionId || `sub-${work.id}`, work.teacherId, true);
  res.json({ success: true, jobId: job?.id || null });
});

app.put('/api/works/:id/manual-review', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const submission = markSubmissionNeedsHumanReview(db, req.params.id, req.body.actorId || null);
  if (!submission) return res.status(404).json({ error: 'Работа не найдена.' });
  writeDb(db);
  res.json({ success: true, submission });
});

app.get('/api/reports/configs', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const teacherId = req.query?.teacherId;
  res.json(teacherId ? db.reportConfigs.filter(item => item.teacherId === teacherId) : []);
});

app.post('/api/reports/configs', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const previewRecipients = recipientsForConfig(db, req.body, true);
  if (!previewRecipients.length) return res.status(409).json({ error: 'Нельзя настроить отправку без заполненного Email родителя.' });
  const existing = db.reportConfigs.find(item => item.teacherId === req.body.teacherId && item.targetType === req.body.targetType && item.targetId === req.body.targetId);
  const nextRun = new Date();
  nextRun.setDate(nextRun.getDate() + (req.body.frequency === 'Еженедельно' ? 7 : 30));
  const normalizedConfig = {
    targetType: req.body.targetType,
    targetId: req.body.targetId,
    frequency: req.body.frequency,
    teacherId: req.body.teacherId || null,
    template: req.body.template || 'concise',
    saved: true,
    nextRun: nextRun.toISOString(),
  };
  if (existing) Object.assign(existing, normalizedConfig);
  else db.reportConfigs.push({ id: nextId(db, 'report', 'rc'), ...normalizedConfig });
  writeDb(db);
  res.json({ success: true });
});

const recipientsForConfig = (db, config, manual = false) => {
  if (config.targetType === 'student') {
    const student = db.students.find(item => item.id === config.targetId);
    return canSendToParent(student) ? [{ contact: getStudentParentEmail(student), name: student.parentName || student.name, studentId: student.id }] : [];
  }
  const group = db.groups.find(item => item.id === config.targetId && (!config.teacherId || item.teacherId === config.teacherId));
  if (!group) return [];
  return group.studentIds
    .map(id => db.students.find(item => item.id === id))
    .filter(Boolean)
    .filter(student => canSendToParent(student))
    .filter(student => manual || !db.reportConfigs.find(cfg => cfg.teacherId === config.teacherId && cfg.targetType === 'student' && cfg.targetId === student.id && cfg.frequency !== 'Самостоятельно'))
    .map(student => ({ contact: getStudentParentEmail(student), name: student.parentName || student.name, studentId: student.id }));
};

app.post('/api/reports/preview', async (req, res) => {
  try {
    const db = readDb();
    ensureDbDefaults(db);
    const {
      targetType = 'student',
      targetId,
      teacherId,
      periodFrom,
      periodTo,
      template = 'concise',
    } = req.body || {};
    const config = { targetType, targetId, frequency: 'Самостоятельно', teacherId, periodFrom, periodTo };
    const recipients = recipientsForConfig(db, config, true);
    if (!recipients.length) return res.status(409).json({ error: 'У выбранного ученика не заполнен Email родителя.' });
    const period = resolveReportPeriod({ frequency: 'Самостоятельно', periodFrom, periodTo });
    const report = buildParentReportDocument(db, teacherId, recipients[0].studentId, period, template);
    res.json({
      report,
      html: buildParentReportHtml(report),
      periodLabel: period.label,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Не удалось сформировать превью отчета.' });
  }
});

app.post('/api/reports/send', async (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { targetType = 'student', targetId, teacherId, periodFrom, periodTo, template = 'concise' } = req.body;
  const config = { targetType, targetId, frequency: 'Самостоятельно', teacherId, periodFrom, periodTo };
  const recipients = recipientsForConfig(db, config, true);
  if (!recipients.length) return res.status(409).json({ error: 'У выбранного ученика не заполнен Email родителя.' });
  const period = resolveReportPeriod({ frequency: 'Самостоятельно', periodFrom, periodTo });
  try {
    const deliveries = await Promise.all(recipients.map(recipient => buildReportDelivery({
      db,
      teacherId,
      studentId: recipient.studentId,
      period,
      template,
      req,
    })));
    const entry = {
      id: `log-${Date.now()}`,
      createdAt: new Date().toISOString(),
      targetLabel: summarizeEntity(db, targetType, targetId),
      recipients,
      deliveries,
      htmlBodies: deliveries.map(item => ({ studentId: item.studentId, html: item.htmlBody })),
      fields: [...reportFieldKeys],
      payload: buildParentReportPayload(db, teacherId, targetType, targetId, recipients, period, template),
      periodLabel: period.label,
      mode: 'manual',
      template,
      teacherId: teacherId || null,
    };
    db.reportLogs.unshift(entry);
    attachParentReportSnapshot(db, {
      teacherId: teacherId || null,
      targetType,
      targetId,
      periodLabel: period.label,
      payload: entry.payload,
      recipients: entry.recipients,
      template,
    });
    writeDb(db);
    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Не удалось сформировать PDF-отчет.' });
  }
});

app.get('/api/reports/logs', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const teacherId = req.query?.teacherId;
  res.json(teacherId ? db.reportLogs.filter(item => item.teacherId === teacherId) : []);
});

app.post('/api/batch/sessions', aiRateLimit, upload.array('files', aiConfig.limits.maxBatchFiles), async (req, res, next) => {
  try {
    const db = readDb();
    ensureDbDefaults(db);
    const uploadedFiles = await buildUploadedFileDescriptors(req, req.files || []);
    const session = {
      id: nextId(db, 'batch', 'b'),
      createdAt: new Date().toISOString(),
      teacherId: req.body.teacherId || null,
      scale: req.body.scale || '100',
      assignmentText: String(req.body.assignmentText || '').trim(),
      assignmentLinks: normalizeAssignmentLinks(req.body.assignmentLinks ? JSON.parse(req.body.assignmentLinks) : []),
      classGroupLabel: String(req.body.classGroupLabel || '').trim(),
      files: uploadedFiles,
      results: [],
    };
    session.results = createBatchResultsFromUploadedFiles(session, uploadedFiles);
    db.batchSessions.unshift(session);
    writeDb(db);
    res.json({
      ...session,
      results: session.results.map(result => decorateBatchResultWithAi(db, session, result)),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/batch/sessions/:id/analyze', aiRateLimit, (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const session = db.batchSessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!aiConfig.flags.ENABLE_BATCH_AI_GRADING) return res.status(409).json({ error: 'Пакетная AI-проверка отключена.' });
  if (!aiConfig.flags.ENABLE_OPENAI_RECOGNITION) return res.status(409).json({ error: 'AI-обработка отключена на сервере.' });
  writeDb(db);
  recognitionQueue.enqueueBatchSession(session.id, session.teacherId);
  const responseDb = readDb();
  ensureDbDefaults(responseDb);
  const responseSession = responseDb.batchSessions.find(item => item.id === req.params.id);
  res.json({
    ...responseSession,
    results: (responseSession?.results || []).map(result => decorateBatchResultWithAi(responseDb, responseSession, result)),
  });
});

app.get('/api/batch/sessions/:id', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const session = db.batchSessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    ...session,
    results: (session.results || []).map(result => decorateBatchResultWithAi(db, session, result)),
  });
});

app.put('/api/batch/sessions/:id/results/:resultId', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const session = db.batchSessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const result = session.results.find(item => item.id === req.params.resultId);
  if (!result) return res.status(404).json({ error: 'Result not found' });
  Object.assign(result, {
    ...req.body,
    name: String(req.body.name ?? result.name).trim() || result.name,
    errorTypes: sanitizeEditableErrorTags(req.body.errorTypes || result.errorTypes || []),
    normalizedErrorCategories: normalizeErrorTags(req.body.errorTypes || result.errorTypes || []),
  });
  writeDb(db);
  res.json(result);
});

app.post('/api/batch/sessions/:id/save', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const session = db.batchSessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const teacherId = session.teacherId || req.body.teacherId || null;
  const savedAt = new Date().toISOString();
  const savedItems = (session.results || []).map(result => ({
    id: `sbr-${session.id}-${result.id}`,
    sessionId: session.id,
    resultId: result.id,
    teacherId,
    studentLabel: String(result.name || '').trim() || 'Ученик',
    originalLabel: result.originalLabel || result.originalName || '',
    score: Number(result.score || 0),
    errorTags: sanitizeEditableErrorTags(result.errorTypes || []),
    normalizedErrorCategories: normalizeErrorTags(result.errorTypes || []),
    aiComment: String(result.aiComment || '').trim(),
    teacherCommentDraft: String(result.teacherCommentDraft || '').trim(),
    savedAt,
    assignmentText: session.assignmentText || '',
    assignmentLinks: session.assignmentLinks || [],
    classGroupLabel: session.classGroupLabel || '',
  }));
  db.savedBatchResults = (db.savedBatchResults || []).filter(item => item.sessionId !== session.id);
  db.savedBatchResults.unshift(...savedItems);
  session.savedAt = savedAt;
  writeDb(db);
  res.json({ success: true, count: savedItems.length });
});

app.post('/api/batch/sessions/:id/retry-failed', aiRateLimit, (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const session = db.batchSessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!aiConfig.flags.ENABLE_OPENAI_RECOGNITION) return res.status(409).json({ error: 'AI-обработка отключена на сервере.' });
  recognitionQueue.enqueueBatchSession(session.id, session.teacherId, true);
  res.json({ success: true });
});

app.get('/api/batch/sessions/:id/export.csv', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const session = db.batchSessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const rows = [['Имя', 'Типы ошибок', 'Описание ошибок', 'Итоговый балл', 'Дата'], ...session.results.map(result => [result.name, result.errorTypes.join('; '), result.errorDescription, String(result.score), result.submittedAt])];
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=batch-${session.id}.csv`);
  res.send('\uFEFF' + csv);
});

app.get('/api/batch/sessions/:id/export.pdf', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const session = db.batchSessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=batch-${session.id}.pdf`);
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  doc.fontSize(18).text(`Пакетная проверка ${session.id}`);
  doc.moveDown();
  session.results.forEach(result => {
    doc.fontSize(12).text(`Имя: ${result.name}`);
    doc.text(`Типы ошибок: ${result.errorTypes.join(', ')}`);
    doc.text(`Описание ошибок: ${result.errorDescription}`);
    doc.text(`Итоговый балл: ${result.score}`);
    doc.text(`Дата: ${result.submittedAt}`);
    doc.moveDown();
  });
  doc.end();
});

cron.schedule('* * * * *', async () => {
  const db = readDb();
  ensureDbDefaults(db);
  let changed = false;
  const now = new Date();
  for (const config of db.reportConfigs) {
    if (config.frequency === 'Самостоятельно' || !config.nextRun) continue;
    if (new Date(config.nextRun) > now) continue;
    const recipients = recipientsForConfig(db, config, false);
    if (recipients.length) {
      const period = resolveReportPeriod({ frequency: config.frequency });
      const deliveries = await Promise.all(recipients.map(recipient => buildReportDelivery({
        db,
        teacherId: config.teacherId,
        studentId: recipient.studentId,
        period,
        template: config.template || 'concise',
      })));
      db.reportLogs.unshift({
        id: `log-${Date.now()}-${config.id}`,
        createdAt: new Date().toISOString(),
        targetLabel: summarizeEntity(db, config.targetType, config.targetId),
        recipients,
        deliveries,
        htmlBodies: deliveries.map(item => ({ studentId: item.studentId, html: item.htmlBody })),
        fields: [...reportFieldKeys],
        payload: buildParentReportPayload(db, config.teacherId, config.targetType, config.targetId, recipients, period, config.template || 'concise'),
        periodLabel: period.label,
        mode: 'scheduled',
        template: config.template || 'concise',
        teacherId: config.teacherId || null,
      });
      attachParentReportSnapshot(db, {
        teacherId: config.teacherId || null,
        targetType: config.targetType,
        targetId: config.targetId,
        periodLabel: period.label,
        payload: buildParentReportPayload(db, config.teacherId, config.targetType, config.targetId, recipients, period, config.template || 'concise'),
        recipients,
        template: config.template || 'concise',
      });
    }
    const nextRun = new Date(now);
    nextRun.setDate(nextRun.getDate() + (config.frequency === 'Еженедельно' ? 7 : 30));
    config.nextRun = nextRun.toISOString();
    changed = true;
  }
  if (changed) writeDb(db);
});

app.use((error, req, res, next) => {
  if (!error) return next();
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `Файл слишком большой. Лимит: ${aiConfig.limits.maxUploadMb} МБ.` });
    }
    return res.status(400).json({ error: 'Не удалось загрузить файл.' });
  }
  if (error.code === 'UNSUPPORTED_FILE_TYPE') {
    return res.status(415).json({ error: error.message });
  }
  return res.status(500).json({ error: redactAiError(error) });
});

recognitionQueue.start();
app.listen(PORT, () => {
  console.log(`Backend running on http://127.0.0.1:${PORT}`);
  console.log(`AI config: enabled=${aiConfig.flags.ENABLE_OPENAI_RECOGNITION}, batch=${aiConfig.flags.ENABLE_BATCH_AI_GRADING}, model=${aiConfig.openai.model}`);
  if (!envFileExists) {
    console.warn('AI env warning: .env or .env.local was not found in the project root. Server-only AI features will stay disabled until the file is created.');
  } else if (!aiConfig.openai.apiKey) {
    console.warn('AI env warning: OPENAI_API_KEY is empty. Server-only AI features will stay disabled until the key is set.');
  }
});

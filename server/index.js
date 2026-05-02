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
const pdfFontPath = [
  // macOS
  '/Library/Fonts/Arial Unicode.ttf',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  // Windows (SystemRoot env or default path)
  path.join(process.env.SystemRoot || 'C:\\Windows', 'Fonts', 'arial.ttf'),
  'C:/Windows/Fonts/arial.ttf',
  // Linux – DejaVu (Ubuntu/Debian/Fedora)
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
].find(candidate => { try { return fs.existsSync(candidate); } catch { return false; } });

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
const reportFieldKeys = ['Имя ученика', 'Частые типы ошибок', 'Гистограмма оценок'];
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
  // Keep parentContact in sync; use || so empty string is overwritten
  student.parentContact = student.parentContact || student.parentEmail;
  return student;
};
const canSendToParent = (student = {}) => Boolean(getStudentParentEmail(student));
const isVirtualStudent = (db, student = {}) => !db.accounts.some(account => account.role === 'student' && account.userId === student.id);
const normalizeInviteStatus = (status = '') => (status === 'rejected' ? 'declined' : (status || 'pending'));
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

function ensureDbDefaults(db) {
  db.accounts ||= [];
  db.smsLogs ||= [];
  db.resetRequests ||= [];
  db.reportConfigs ||= [];
  db.reportLogs ||= [];
  db.batchSessions ||= [];
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
    assignment.links = Array.isArray(assignment.links) ? assignment.links : [];
    assignment.status ||= 'Черновик';
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
  });
  db.teacherInvites = db.teacherInvites.map(invite => ({
    status: normalizeInviteStatus(invite.status),
    direction: invite.direction || 'student_to_teacher',
    token: invite.token || inviteToken(),
    createdAt: invite.createdAt || new Date().toISOString(),
    studentNotificationDismissedAt: invite.studentNotificationDismissedAt || null,
    ...invite,
  }));
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
  const ignoredGroup = ignoreGroupId ? db.groups.find(g => g.id === ignoreGroupId) : null;
  const ignoredGroupStudentIds = new Set(ignoredGroup ? (ignoredGroup.studentIds || []) : []);
  const activeStudents = db.students.filter(s => s.active && s.id !== ignoreStudentId && (!teacherId || studentHasTeacher(s, teacherId)));
  const activeGroups = db.groups.filter(g => g.active && g.id !== ignoreGroupId && (!teacherId || g.teacherId === teacherId));
  for (const slot of normalizeSlots(slots)) {
    const start = minutesFromTime(slot.time);
    const end = start + durationMinutes(slot);
    for (const student of activeStudents) {
      for (const existing of getEffectiveStudentSlots(db, student)) {
        if (slot.day !== existing.day) continue;
        // Skip slots that are inherited from the group we are editing
        if (ignoreGroupId && existing.inherited && existing.sourceGroupId === ignoreGroupId) continue;
        // Skip students who belong to the group being edited and whose only slots come from it
        if (ignoredGroupStudentIds.has(student.id) && existing.inherited && existing.sourceGroupId === ignoreGroupId) continue;
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

const getEffectiveStudentSlots = (db, student) => {
  const own = normalizeSlots(student.lessonSlots || []);
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
const getGradesHistogram = (db, teacherId, studentId) => {
  const works = db.works.filter(work => work.teacherId === teacherId && work.studentId === studentId && work.status === 'Проверено');
  if (!works.length) return 'Недостаточно данных';
  const buckets = { '0-49': 0, '50-69': 0, '70-84': 0, '85-100': 0 };
  works.forEach(work => {
    const assignment = db.assignments.find(item => item.id === work.assignmentId);
    const percent = Math.round(((work.finalScore ?? work.suggestedScore ?? 0) / (assignment?.maxScore || 100)) * 100);
    if (percent < 50) buckets['0-49'] += 1;
    else if (percent < 70) buckets['50-69'] += 1;
    else if (percent < 85) buckets['70-84'] += 1;
    else buckets['85-100'] += 1;
  });
  return Object.entries(buckets).map(([label, value]) => `${label}: ${value}`).join(', ');
};
const buildGradesHistogramForPeriod = (db, teacherId, studentId, period) => {
  const works = db.works.filter(work => work.teacherId === teacherId
    && work.studentId === studentId
    && work.status === 'Проверено'
    && isDateWithinPeriod(work.submittedAt, period));
  if (!works.length) return 'Недостаточно данных';
  const buckets = { '0-49': 0, '50-69': 0, '70-84': 0, '85-100': 0 };
  works.forEach(work => {
    const assignment = db.assignments.find(item => item.id === work.assignmentId);
    const percent = Math.round(((work.finalScore ?? work.suggestedScore ?? 0) / (assignment?.maxScore || 100)) * 100);
    if (percent < 50) buckets['0-49'] += 1;
    else if (percent < 70) buckets['50-69'] += 1;
    else if (percent < 85) buckets['70-84'] += 1;
    else buckets['85-100'] += 1;
  });
  return Object.entries(buckets).map(([label, value]) => `${label}: ${value}`).join(', ');
};
const buildParentReportFields = (db, teacherId, studentId, period) => {
  const student = db.students.find(item => item.id === studentId);
  const worksInPeriod = db.works.filter(work => work.teacherId === teacherId
    && work.studentId === studentId
    && isDateWithinPeriod(work.submittedAt, period));
  const checkedWorks = worksInPeriod.filter(w => w.status === 'Проверено');
  const checkedWorksCount = checkedWorks.length;

  const scores = checkedWorks.map(work => {
    const assignment = db.assignments.find(item => item.id === work.assignmentId);
    return Math.round(((work.finalScore ?? work.suggestedScore ?? 0) / (assignment?.maxScore || 100)) * 100);
  });
  const averageScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const lastScore = scores.length ? scores[scores.length - 1] : null;

  let trendLabel = 'Недостаточно данных для оценки динамики';
  if (scores.length >= 2) {
    const earlierAvg = Math.round(scores.slice(0, -1).reduce((a, b) => a + b, 0) / (scores.length - 1));
    if (lastScore > earlierAvg + 5) trendLabel = 'Положительная';
    else if (lastScore < earlierAvg - 5) trendLabel = 'Требует внимания';
    else trendLabel = 'Стабильная';
  }

  const errorCounts = worksInPeriod.flatMap(w => (w.aiErrors || []).flatMap(e => e.types || []))
    .reduce((acc, type) => ({ ...acc, [type]: (acc[type] || 0) + 1 }), {});
  const topErrorEntries = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topErrors = topErrorEntries.map(([type]) => type);
  const topErrorsList = topErrors.join('; ') || 'Не выявлено';

  const recs = [];
  if (trendLabel === 'Требует внимания') recs.push('Рекомендуем уделить больше времени практическим задачам.');
  if (topErrors.length) recs.push(`Акцент на: ${topErrors.slice(0, 2).join(', ')}.`);
  if (!recs.length) recs.push('Продолжайте в том же темпе.');

  let shortConclusion = '';
  if (!checkedWorksCount) shortConclusion = 'За выбранный период нет проверенных работ.';
  else if (trendLabel === 'Положительная') shortConclusion = `Положительная динамика. Средний результат: ${averageScore}%.`;
  else if (trendLabel === 'Требует внимания') shortConclusion = `Есть области для улучшения. Средний результат: ${averageScore}%. Рекомендуется дополнительная практика.`;
  else shortConclusion = `Стабильный результат. Средний показатель: ${averageScore !== null ? averageScore + '%' : 'нет данных'}.`;

  const buckets = { '0-49': 0, '50-69': 0, '70-84': 0, '85-100': 0 };
  scores.forEach(p => {
    if (p < 50) buckets['0-49']++;
    else if (p < 70) buckets['50-69']++;
    else if (p < 85) buckets['70-84']++;
    else buckets['85-100']++;
  });

  return {
    studentName: student?.name || 'Ученик',
    frequentErrors: topErrorsList,
    gradesHistogram: buildGradesHistogramForPeriod(db, teacherId, studentId, period),
    parentEmail: getStudentParentEmail(student),
    periodLabel: period.label,
    checkedWorksCount,
    averageScore: averageScore !== null ? `${averageScore}%` : 'Нет данных',
    lastScore: lastScore !== null ? `${lastScore}%` : 'Нет данных',
    trendLabel,
    topErrorsList,
    recommendationsList: recs.join(' '),
    shortConclusion,
    histogramBuckets: buckets,
  };
};

const buildParentReportPayload = (db, teacherId, targetType, targetId, recipients = [], period) => (
  targetType === 'student'
    ? buildParentReportFields(db, teacherId, targetId, period)
    : recipients.map(recipient => ({
      studentId: recipient.studentId,
      ...buildParentReportFields(db, teacherId, recipient.studentId, period),
    }))
);

const backendBaseUrl = (req = null) => (req ? `${req.protocol}://${req.get('host')}` : `http://127.0.0.1:${PORT}`);

function writeParentReportPdf({ student, payload, teacher, baseUrl }) {
  return new Promise((resolve, reject) => {
    const safeStudentId = student?.id || 'student';
    const fileName = `parent-report-${safeStudentId}-${Date.now()}.pdf`;
    const filePath = path.join(uploadsDir, fileName);
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', () => resolve({ fileName, url: `${baseUrl}/uploads/${fileName}` }));
    stream.on('error', reject);
    doc.pipe(stream);

    if (pdfFontPath) {
      try { doc.font(pdfFontPath); } catch { /* use built-in */ }
    }

    const hasFont = !!pdfFontPath;
    const safe = (str) => {
      if (hasFont) return String(str || '');
      // Transliterate Cyrillic when no font is available so PDF is still readable
      const map = { 'А':'A','а':'a','Б':'B','б':'b','В':'V','в':'v','Г':'G','г':'g','Д':'D','д':'d','Е':'E','е':'e','Ё':'E','ё':'e','Ж':'Zh','ж':'zh','З':'Z','з':'z','И':'I','и':'i','Й':'Y','й':'y','К':'K','к':'k','Л':'L','л':'l','М':'M','м':'m','Н':'N','н':'n','О':'O','о':'o','П':'P','п':'p','Р':'R','р':'r','С':'S','с':'s','Т':'T','т':'t','У':'U','у':'u','Ф':'F','ф':'f','Х':'Kh','х':'kh','Ц':'Ts','ц':'ts','Ч':'Ch','ч':'ch','Ш':'Sh','ш':'sh','Щ':'Shch','щ':'shch','Ъ':'','ъ':'','Ы':'Y','ы':'y','Ь':'','ь':'','Э':'E','э':'e','Ю':'Yu','ю':'yu','Я':'Ya','я':'ya','%':'%','·':'·' };
      return String(str || '').split('').map(c => map[c] !== undefined ? map[c] : c).join('');
    };

    // Header
    doc.fontSize(18).font(pdfFontPath || 'Helvetica-Bold').text(
      safe(`Отчет по ученику: ${payload.studentName}`), { align: 'left' }
    );
    doc.moveDown(0.3);
    doc.fontSize(11).font(pdfFontPath || 'Helvetica');
    doc.text(safe(`Период: ${payload.periodLabel}`));
    doc.text(safe(`Преподаватель: ${teacher?.name || 'Преподаватель'}`));
    doc.text(safe(`Email родителя: ${payload.parentEmail || 'Не указан'}`));
    doc.moveDown(0.8);

    // Section 1
    doc.fontSize(13).font(pdfFontPath || 'Helvetica-Bold').text(safe('1. Общая динамика'));
    doc.moveDown(0.3);
    doc.fontSize(11).font(pdfFontPath || 'Helvetica');
    doc.text(safe(`Проверено работ: ${payload.checkedWorksCount ?? 0}`));
    doc.text(safe(`Средний балл: ${payload.averageScore ?? 'Нет данных'}`));
    doc.text(safe(`Последний результат: ${payload.lastScore ?? 'Нет данных'}`));
    doc.text(safe(`Динамика: ${payload.trendLabel ?? 'Нет данных'}`));
    doc.moveDown(0.8);

    // Section 2
    doc.fontSize(13).font(pdfFontPath || 'Helvetica-Bold').text(safe('2. Частые ошибки'));
    doc.moveDown(0.3);
    doc.fontSize(11).font(pdfFontPath || 'Helvetica').text(safe(payload.topErrorsList || 'Не выявлено'));
    doc.moveDown(0.8);

    // Section 3 – histogram (drawn with PDFKit primitives)
    doc.fontSize(13).font(pdfFontPath || 'Helvetica-Bold').text(safe('3. Распределение оценок'));
    doc.moveDown(0.3);
    const buckets = payload.histogramBuckets || {};
    const bucketKeys = ['0-49', '50-69', '70-84', '85-100'];
    const maxVal = Math.max(...bucketKeys.map(k => buckets[k] || 0), 1);
    const barMaxHeight = 60;
    const barWidth = 50;
    const barGap = 20;
    const histX = doc.page.margins.left;
    const histBaseY = doc.y + barMaxHeight + 20;
    const totalCount = bucketKeys.reduce((s, k) => s + (buckets[k] || 0), 0);
    if (totalCount === 0) {
      doc.fontSize(11).font(pdfFontPath || 'Helvetica').text(safe('Недостаточно данных за выбранный период'));
    } else {
      bucketKeys.forEach((key, i) => {
        const val = buckets[key] || 0;
        const bh = maxVal > 0 ? Math.round((val / maxVal) * barMaxHeight) : 0;
        const bx = histX + i * (barWidth + barGap);
        const by = histBaseY - bh;
        doc.rect(bx, by, barWidth, bh).fill('#2563eb');
        doc.fontSize(9).font(pdfFontPath || 'Helvetica').fillColor('#0f172a');
        doc.text(String(val), bx, by - 14, { width: barWidth, align: 'center' });
        doc.text(safe(key), bx, histBaseY + 4, { width: barWidth, align: 'center' });
      });
      doc.fillColor('#0f172a');
      doc.y = histBaseY + 22;
    }
    doc.moveDown(1);

    // Section 4
    doc.fontSize(13).font(pdfFontPath || 'Helvetica-Bold').text(safe('4. Рекомендации'));
    doc.moveDown(0.3);
    doc.fontSize(11).font(pdfFontPath || 'Helvetica').text(safe(payload.recommendationsList || 'Нет данных'));
    doc.moveDown(0.8);

    // Conclusion
    doc.fontSize(13).font(pdfFontPath || 'Helvetica-Bold').text(safe('Итог'));
    doc.moveDown(0.3);
    doc.fontSize(11).font(pdfFontPath || 'Helvetica').text(safe(payload.shortConclusion || ''));

    if (!hasFont) {
      doc.moveDown(1);
      doc.fontSize(9).text('[PDF rendered without Cyrillic font — text was transliterated. Add a TTF font to server/fonts/ for full Unicode support.]');
    }

    doc.end();
  });
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
  meta: { scope, featureFlags: featureFlagsPayload(aiConfig) },
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
    const students = db.students.filter(student => relatedStudentIds.has(student.id));
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
      meta: { scope: 'teacher', featureFlags: featureFlagsPayload(aiConfig) },
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
      meta: { scope: 'student', featureFlags: featureFlagsPayload(aiConfig) },
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
  };
  db.teacherInvites.unshift(invite);
  writeDb(db);
  res.json(invite);
});

// GET /api/invite/validate/:token — validate invite link (used by InvitePage)
app.get('/api/invite/validate/:token', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const invite = db.teacherInvites.find(item => item.token === req.params.token && item.direction === 'teacher_to_student');
  if (!invite) return res.status(404).json({ error: 'Приглашение не найдено или ссылка неверная.' });
  if (normalizeInviteStatus(invite.status) !== 'pending') return res.status(409).json({ error: 'Эта ссылка-приглашение уже была использована или истекла.' });
  const teacher = findTeacherById(db, invite.teacherId);
  res.json({
    valid: true,
    invite: { id: invite.id, teacherId: invite.teacherId, teacherName: teacher?.name || 'Преподаватель', token: invite.token },
  });
});

// POST /api/invite/claim-auto/:token — auto-bind student to teacher (after auth)
app.post('/api/invite/claim-auto/:token', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { studentId } = req.body || {};
  const invite = db.teacherInvites.find(item => item.token === req.params.token && item.direction === 'teacher_to_student');
  if (!invite) return res.status(404).json({ error: 'Приглашение не найдено.' });
  if (normalizeInviteStatus(invite.status) !== 'pending') return res.json({ alreadyUsed: true });
  const student = db.students.find(item => item.id === studentId);
  if (!student) return res.status(404).json({ error: 'Ученик не найден.' });
  if (studentHasTeacher(student, invite.teacherId)) return res.json({ alreadyConnected: true });
  invite.studentId = studentId;
  invite.status = 'accepted';
  invite.reviewedAt = new Date().toISOString();
  invite.claimedAt = invite.claimedAt || new Date().toISOString();
  assignTeacherToStudent(student, invite.teacherId);
  rememberHistoricalStudent(db, invite.teacherId, student.id);
  db.teacherInvites.forEach(item => {
    if (item.id !== invite.id && item.studentId === studentId && item.teacherId === invite.teacherId && normalizeInviteStatus(item.status) === 'pending') {
      item.status = 'declined';
      item.reviewedAt = invite.reviewedAt;
    }
  });
  writeDb(db);
  res.json({ success: true, invite });
});

app.post('/api/teacher-invites/claim', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { token, studentId } = req.body || {};
  const invite = db.teacherInvites.find(item => item.token === token && item.direction === 'teacher_to_student');
  if (!invite) return res.status(404).json({ error: 'Приглашение не найдено.' });
  if (normalizeInviteStatus(invite.status) !== 'pending') return res.status(409).json({ error: 'Ссылка уже использована.' });
  if (invite.studentId && invite.studentId !== studentId) return res.status(409).json({ error: 'Ссылка уже закреплена за другим учеником.' });
  const student = db.students.find(item => item.id === studentId);
  if (!student) return res.status(404).json({ error: 'Ученик не найден.' });
  if (studentHasTeacher(student, invite.teacherId)) return res.status(409).json({ error: 'Этот преподаватель уже подключен.' });
  invite.studentId = studentId;
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

// PUT /api/students/:id/overlay — save tutor-local overlay (does NOT modify real student account data)
app.put('/api/students/:id/overlay', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  db.studentOverlays ||= [];
  const { teacherId, ...fields } = req.body || {};
  if (!teacherId) return res.status(400).json({ error: 'Не указан преподаватель.' });
  const student = db.students.find(item => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Ученик не найден.' });
  if (!studentHasTeacher(student, teacherId)) return res.status(403).json({ error: 'Ученик не привязан к этому преподавателю.' });
  const allowedFields = ['display_name_override','student_email_label','student_phone_label','parent_email_override','parent_name_override','level_override','schedule_slots_override'];
  const filtered = Object.fromEntries(Object.entries(fields).filter(([k]) => allowedFields.includes(k)));
  const key = `${req.params.id}:${teacherId}`;
  const existing = db.studentOverlays.find(item => item.key === key);
  if (existing) Object.assign(existing, filtered, { updatedAt: new Date().toISOString() });
  else db.studentOverlays.push({ key, studentId: req.params.id, teacherId, ...filtered, createdAt: new Date().toISOString() });
  writeDb(db);
  res.json({ success: true });
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
  const recipients = normalizeAssignmentRecipients(db, req.body, req.body.teacherId);
  const hasRecipient = recipients.recipientType === 'students'
    ? recipients.recipientIds.length
    : Boolean(recipients.recipientId);
  if (!hasRecipient) return res.status(400).json({ error: 'Выберите получателя задания из своих учеников или групп.' });
  const assignment = {
    id: nextId(db, 'assignment', 'a'),
    createdAt: new Date().toISOString().slice(0, 10),
    teacherId: req.body.teacherId || null,
    status: req.body.status || 'Черновик',
    ...req.body,
    attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
    links: Array.isArray(req.body.links) ? req.body.links : [],
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
  const recipients = req.body.recipientType || req.body.recipientId || req.body.recipientIds
    ? normalizeAssignmentRecipients(db, { ...assignment, ...req.body }, req.body.teacherId || assignment.teacherId)
    : { recipientType: assignment.recipientType, recipientId: assignment.recipientId, recipientIds: assignment.recipientIds };
  const hasRecipient = recipients.recipientType === 'students'
    ? recipients.recipientIds.length
    : Boolean(recipients.recipientId);
  if (!hasRecipient) return res.status(400).json({ error: 'Выберите получателя задания из своих учеников или групп.' });
  Object.assign(assignment, req.body, recipients);
  writeDb(db);
  res.json(assignment);
});

app.post('/api/assignments/:id/publish-draft', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const draft = db.assignments.find(item => item.id === req.params.id);
  if (!draft) return res.status(404).json({ error: 'Assignment not found' });
  const candidate = { ...draft, ...req.body, status: 'Активно' };
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
  });
  if (result?.error) return res.status(409).json({ error: result.error });
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

app.post('/api/reports/send', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { targetType = 'student', targetId, teacherId, periodFrom, periodTo } = req.body;
  const config = { targetType, targetId, frequency: 'Самостоятельно', teacherId, periodFrom, periodTo };
  const recipients = recipientsForConfig(db, config, true);
  if (!recipients.length) return res.status(409).json({ error: 'У выбранного ученика не заполнен Email родителя.' });
  const teacher = findTeacherById(db, teacherId);
  const period = resolveReportPeriod({ frequency: 'Самостоятельно', periodFrom, periodTo });
  Promise.all(recipients.map(async recipient => {
    const payload = buildParentReportFields(db, teacherId, recipient.studentId, period);
    const pdf = await writeParentReportPdf({
      student: db.students.find(item => item.id === recipient.studentId),
      payload,
      teacher,
      baseUrl: backendBaseUrl(req),
    });
    return { ...recipient, ...pdf, payload };
  }))
    .then((deliveries) => {
      const entry = {
        id: `log-${Date.now()}`,
        createdAt: new Date().toISOString(),
        targetLabel: summarizeEntity(db, targetType, targetId),
        recipients,
        deliveries,
        fields: [...reportFieldKeys],
        payload: buildParentReportPayload(db, teacherId, targetType, targetId, recipients, period),
        periodLabel: period.label,
        mode: 'manual',
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
      });
      writeDb(db);
      res.json(entry);
    })
    .catch((error) => {
      res.status(500).json({ error: error.message || 'Не удалось сформировать PDF-отчет.' });
    });
});

app.get('/api/reports/logs', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const teacherId = req.query?.teacherId;
  res.json(teacherId ? db.reportLogs.filter(item => item.teacherId === teacherId) : []);
});

const uploadBatchFields = multer({
  storage,
  limits: { files: aiConfig.limits.maxBatchFiles * 2, fileSize: aiConfig.limits.maxUploadMb * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!allowedUploadMimeTypes.has(file.mimetype)) {
      const error = new Error('Поддерживаются только JPG, PNG, WEBP, HEIC и PDF.');
      error.code = 'UNSUPPORTED_FILE_TYPE';
      cb(error);
      return;
    }
    cb(null, true);
  },
}).fields([
  { name: 'files', maxCount: aiConfig.limits.maxBatchFiles },
  { name: 'assignmentFiles', maxCount: 20 },
]);

app.post('/api/batch/sessions', aiRateLimit, (req, res, next) => {
  uploadBatchFields(req, res, async (err) => {
    if (err) return next(err);
    try {
      const db = readDb();
      ensureDbDefaults(db);
      const solutionFiles = req.files?.files || [];
      const aFiles = req.files?.assignmentFiles || [];
      const uploadedFiles = await buildUploadedFileDescriptors(req, solutionFiles);
      const uploadedAssignmentFiles = await buildUploadedFileDescriptors(req, aFiles);
      let assignmentLinks = [];
      try { assignmentLinks = JSON.parse(req.body.assignmentLinks || '[]'); } catch { assignmentLinks = []; }
      const session = {
        id: nextId(db, 'batch', 'b'),
        createdAt: new Date().toISOString(),
        teacherId: req.body.teacherId || null,
        scale: req.body.scale || '100',
        files: uploadedFiles,
        assignmentFiles: uploadedAssignmentFiles,
        assignmentLinks,
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
  Object.assign(result, req.body);
  writeDb(db);
  res.json(result);
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
      const teacher = findTeacherById(db, config.teacherId);
      const period = resolveReportPeriod({ frequency: config.frequency });
      const deliveries = await Promise.all(recipients.map(async recipient => {
        const payload = buildParentReportFields(db, config.teacherId, recipient.studentId, period);
        const pdf = await writeParentReportPdf({
          student: db.students.find(item => item.id === recipient.studentId),
          payload,
          teacher,
          baseUrl: backendBaseUrl(),
        });
        return { ...recipient, ...pdf, payload };
      }));
      db.reportLogs.unshift({
        id: `log-${Date.now()}-${config.id}`,
        createdAt: new Date().toISOString(),
        targetLabel: summarizeEntity(db, config.targetType, config.targetId),
        recipients,
        deliveries,
        fields: [...reportFieldKeys],
        payload: buildParentReportPayload(db, config.teacherId, config.targetType, config.targetId, recipients, period),
        periodLabel: period.label,
        mode: 'scheduled',
        teacherId: config.teacherId || null,
      });
      attachParentReportSnapshot(db, {
        teacherId: config.teacherId || null,
        targetType: config.targetType,
        targetId: config.targetId,
        periodLabel: period.label,
        payload: buildParentReportPayload(db, config.teacherId, config.targetType, config.targetId, recipients, period),
        recipients,
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

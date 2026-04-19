import express from 'express';
import cors from 'cors';
import multer from 'multer';
import cron from 'node-cron';
import PDFDocument from 'pdfkit';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { readDb, writeDb, nextId, publicFileUrl } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 4000;
const TRIAL_DAYS = 30;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`),
});
const upload = multer({ storage });

const subjects = ['Математика', 'Физика', 'Химия'];
const notificationKeys = ['Новая работа загружена', 'Запрос на пересмотр', 'Дедлайн приближается', 'Еженедельная сводка'];
const reportFieldKeys = ['Имя ученика', 'Частые типы ошибок', 'Частота посещаемости', 'Гистограмма оценок'];
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

const normalizePersonName = (...parts) => parts.map(part => String(part || '').trim()).filter(Boolean).join(' ');
const unique = (items = []) => [...new Set(items.filter(Boolean))];
const studentTeacherIds = (student = {}) => unique(Array.isArray(student.teacherIds) ? student.teacherIds : [student.teacherId]);
const studentHasTeacher = (student = {}, teacherId) => studentTeacherIds(student).includes(teacherId);
const syncPrimaryTeacher = (student) => {
  student.teacherIds = studentTeacherIds(student);
  student.teacherId = student.teacherIds[0] || null;
  return student;
};
const canSendToParent = (student = {}) => Boolean(String(student.parentName || '').trim() && String(student.parentContact || student.parentEmail || '').trim());
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

function detachTeacherFromStudent(db, teacherId, studentId) {
  const student = db.students.find(item => item.id === studentId);
  if (!student) return null;
  student.teacherIds = studentTeacherIds(student).filter(id => id !== teacherId);
  student.teacherId = student.teacherIds[0] || null;
  db.groups.filter(group => group.teacherId === teacherId).forEach(group => {
    group.studentIds = (group.studentIds || []).filter(id => id !== studentId);
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

  db.students.forEach(student => {
    student.phone ||= '';
    student.parentName ||= '';
    student.parentEmail ||= '';
    student.parentContact ||= student.parentEmail || '';
    student.level = student.level || '';
    student.subjects = Array.isArray(student.subjects) ? student.subjects : [];
    student.lessonSlots = normalizeSlots(student.lessonSlots || []);
    student.active = student.active !== false;
    if (!Array.isArray(student.teacherIds)) student.teacherIds = unique([student.teacherId].filter(Boolean));
    syncPrimaryTeacher(student);
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
    ...invite,
  }));
  db.accounts.filter(item => item.role === 'student').forEach(account => {
    account.onboardingCompleted ??= account.id?.includes('demo');
  });

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
      for (const existing of getEffectiveStudentSlots(db, student)) {
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
const buildParentReportFields = (db, teacherId, studentId) => {
  const student = db.students.find(item => item.id === studentId);
  const works = db.works.filter(work => work.teacherId === teacherId && work.studentId === studentId && work.status === 'Проверено');
  const errorCounts = works.flatMap(work => work.aiErrors || []).flatMap(error => error.types || []).reduce((acc, type) => ({ ...acc, [type]: (acc[type] || 0) + 1 }), {});
  const topErrors = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([type]) => type).join(', ') || 'Недостаточно данных';
  return {
    studentName: student?.name || 'Ученик',
    frequentErrors: topErrors,
    attendanceFrequency: getAttendanceFrequency(db, teacherId, studentId),
    gradesHistogram: getGradesHistogram(db, teacherId, studentId),
  };
};

const buildParentReportPayload = (db, teacherId, targetType, targetId, recipients = []) => (
  targetType === 'student'
    ? buildParentReportFields(db, teacherId, targetId)
    : recipients.map(recipient => ({
      studentId: recipient.studentId,
      ...buildParentReportFields(db, teacherId, recipient.studentId),
    }))
);

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
  meta: { scope },
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
      works: db.works.filter(item => teacherOwnsWork(item, userId)),
      teacherInvites: invites,
      reportConfigs: db.reportConfigs.filter(item => item.teacherId === userId),
      reportLogs: db.reportLogs.filter(item => item.teacherId === userId),
      batchSessions: db.batchSessions.filter(item => item.teacherId === userId),
      attendanceRecords: db.attendanceRecords.filter(item => teacherOwnsAttendance(item, userId)),
      computed: buildComputedForScope(db, students.filter(student => teacherOwnsStudent(student, userId)), groups, userId),
      meta: { scope: 'teacher' },
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
      works: db.works.filter(item => item.studentId === userId && (!teacherIds.length || !item.teacherId || teacherIds.includes(item.teacherId) || invites.some(invite => invite.teacherId === item.teacherId))),
      teacherInvites: invites,
      reportConfigs: [],
      reportLogs: [],
      batchSessions: [],
      attendanceRecords: db.attendanceRecords.filter(item => item.studentId === userId && (!item.teacherId || teacherIds.includes(item.teacherId))),
      computed: buildComputedForScope(db, [student], groups),
      meta: { scope: 'student' },
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

app.post('/api/auth/register', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { role, name, firstName, lastName, email, phone, password, parentName, parentContact } = req.body;
  const normalizedName = normalizePersonName(name, firstName, lastName);
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const hasSplitName = String(firstName || '').trim() && String(lastName || '').trim();
  if (!role || !normalizedName || !normalizedEmail || !password || !hasSplitName) return res.status(400).json({ error: 'Заполните имя, фамилию, email, телефон и пароль.' });
  if (!phone) return res.status(400).json({ error: 'Номер телефона обязателен.' });
  const existing = db.accounts.find(acc => acc.role === role && acc.email === normalizedEmail);
  if (existing) return res.status(409).json({ error: 'Аккаунт с такой ролью и почтой уже существует.' });

  let userId = null;
  if (role === 'teacher') {
    userId = nextId(db, 'teacher', 't');
    db.teachers.push(defaultTeacherProfile({
      id: userId,
      name: normalizedName,
      email: normalizedEmail,
      phone,
    }));
  } else {
    let student = db.students.find(s => s.email.toLowerCase() === normalizedEmail);
    if (!student) {
      student = {
        id: nextId(db, 'student', 's'),
        name: normalizedName,
        email: normalizedEmail,
        phone,
        parentName: String(parentName || '').trim(),
        parentEmail: '',
        parentContact: String(parentContact || '').trim(),
        level: '',
        subjects: [],
        active: true,
        lessonSlots: [],
        teacherId: null,
        teacherIds: [],
      };
      db.students.push(student);
    }
    student.name = normalizedName;
    student.phone = phone;
    student.parentName = String(parentName || '').trim();
    student.parentContact = String(parentContact || student.parentContact || '').trim();
    student.parentEmail = student.parentContact.includes('@') ? student.parentContact : (student.parentEmail || '');
    student.level ||= '';
    student.subjects = Array.isArray(student.subjects) ? student.subjects : [];
    student.lessonSlots = normalizeSlots(student.lessonSlots || []);
    student.teacherIds = Array.isArray(student.teacherIds) ? student.teacherIds : [];
    syncPrimaryTeacher(student);
    userId = student.id;
  }

  const account = {
    id: `acc-${Date.now()}`,
    role,
    name: normalizedName,
    email: normalizedEmail,
    phone,
    password,
    verified: false,
    createdAt: new Date().toISOString(),
    userId,
    onboardingCompleted: false,
  };
  db.accounts.push(account);

  const code = createSmsCode();
  db.smsLogs.unshift({ id: `sms-${Date.now()}`, email: normalizedEmail, role, phone, code, createdAt: new Date().toISOString(), used: false });
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
    if (student) assignTeacherToStudent(student, invite.teacherId);
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

app.post('/api/upload', upload.array('files', 20), (req, res) => {
  const files = (req.files || []).map(file => ({
    id: `${Date.now()}-${file.originalname}`,
    name: file.originalname,
    url: publicFileUrl(req, file.filename),
    kind: file.mimetype.startsWith('image/') ? 'photo' : 'file',
  }));
  res.json({ files });
});

app.post('/api/students', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { name, email, parentName, parentContact, parentEmail, level, subjects, lessonSlots, newGroupName, newGroupSubject, teacherId, phone } = req.body;
  if (!teacherId) return res.status(400).json({ error: 'Не указан преподаватель для нового ученика.' });
  const normalizedSlots = normalizeSlots(lessonSlots || []);
  const conflict = slotConflict(db, normalizedSlots, null, null, teacherId || null);
  if (conflict.conflict) return res.status(409).json({ error: `Слот занят: ${conflict.studentName}, ${conflict.slot.day} ${conflict.slot.time}` });
  const studentId = nextId(db, 'student', 's');
  const student = { id: studentId, name, email, phone: phone || '', parentName: parentName || '', parentContact: parentContact || parentEmail || '', parentEmail: parentEmail || '', level: level || '', subjects: Array.isArray(subjects) ? subjects : [], active: true, lessonSlots: normalizedSlots, teacherIds: teacherId ? [teacherId] : [], teacherId: teacherId || null };
  db.students.push(student);
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
  const normalizedSlots = req.body.lessonSlots ? normalizeSlots(req.body.lessonSlots) : db.students[index].lessonSlots;
  const activeTeacherId = req.body.teacherId || studentTeacherIds(db.students[index])[0] || null;
  const conflict = slotConflict(db, normalizedSlots, req.params.id, null, activeTeacherId);
  if (conflict.conflict) return res.status(409).json({ error: `Слот занят: ${conflict.studentName}, ${conflict.slot.day} ${conflict.slot.time}` });
  db.students[index] = syncPrimaryTeacher({ ...db.students[index], ...req.body, lessonSlots: normalizedSlots, parentContact: req.body.parentContact ?? db.students[index].parentContact });
  db.accounts.filter(acc => acc.role === 'student' && acc.userId === req.params.id).forEach(acc => {
    if (req.body.email) acc.email = req.body.email;
    if (req.body.phone !== undefined) acc.phone = req.body.phone;
    if (req.body.name) acc.name = req.body.name;
  });
  writeDb(db);
  res.json(db.students[index]);
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
  detachTeacherFromStudent(db, teacher.id, student.id);
  db.teacherInvites.forEach(invite => {
    if (invite.teacherId === teacher.id && invite.studentId === student.id && invite.status === 'pending') {
      invite.status = 'declined';
      invite.reviewedAt = new Date().toISOString();
    }
  });
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
    attachments: req.body.attachments || [],
    teacherId: req.body.teacherId || null,
    status: req.body.status || 'Черновик',
    ...req.body,
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
    existing.files = [...(existing.files || []), ...(req.body.files || [])];
    existing.aiComment = req.body.aiComment || existing.aiComment;
    existing.ocrText = req.body.ocrText || existing.ocrText;
    existing.status = normalizeWorkStatus(existing.status);
    writeDb(db);
    return res.json(existing);
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
  writeDb(db);
  res.json(work);
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
  const work = db.works.find(item => item.id === req.params.id);
  if (!work) return res.status(404).json({ error: 'Work not found' });
  work.finalScore = req.body.finalScore;
  work.aiComment = req.body.aiComment;
  work.status = 'Проверено';
  writeDb(db);
  res.json(work);
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
  if (!previewRecipients.length) return res.status(409).json({ error: 'Нельзя настроить отправку без заполненных контактов родителя.' });
  const existing = db.reportConfigs.find(item => item.teacherId === req.body.teacherId && item.targetType === req.body.targetType && item.targetId === req.body.targetId);
  const nextRun = new Date();
  nextRun.setDate(nextRun.getDate() + (req.body.frequency === 'Еженедельно' ? 7 : 30));
  if (existing) Object.assign(existing, req.body, { saved: true, nextRun: nextRun.toISOString() });
  else db.reportConfigs.push({ id: nextId(db, 'report', 'rc'), ...req.body, teacherId: req.body.teacherId || null, saved: true, nextRun: nextRun.toISOString() });
  writeDb(db);
  res.json({ success: true });
});

const recipientsForConfig = (db, config, manual = false) => {
  if (config.targetType === 'student') {
    const student = db.students.find(item => item.id === config.targetId);
    return canSendToParent(student) ? [{ contact: student.parentContact || student.parentEmail, name: student.parentName || student.name, studentId: student.id }] : [];
  }
  const group = db.groups.find(item => item.id === config.targetId && (!config.teacherId || item.teacherId === config.teacherId));
  if (!group) return [];
  return group.studentIds
    .map(id => db.students.find(item => item.id === id))
    .filter(Boolean)
    .filter(student => canSendToParent(student))
    .filter(student => manual || !db.reportConfigs.find(cfg => cfg.teacherId === config.teacherId && cfg.targetType === 'student' && cfg.targetId === student.id && cfg.frequency !== 'Самостоятельно'))
    .map(student => ({ contact: student.parentContact || student.parentEmail, name: student.parentName || student.name, studentId: student.id }));
};

app.post('/api/reports/send', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const { targetType, targetId, period, teacherId } = req.body;
  const config = { targetType, targetId, frequency: 'Самостоятельно', period, teacherId };
  const recipients = recipientsForConfig(db, config, true);
  if (!recipients.length) return res.status(409).json({ error: 'Не заполнены данные родителя для выбранного ученика или группы.' });
  const entry = {
    id: `log-${Date.now()}`,
    createdAt: new Date().toISOString(),
    targetLabel: summarizeEntity(db, targetType, targetId),
    recipients,
    fields: [...reportFieldKeys],
    payload: buildParentReportPayload(db, teacherId, targetType, targetId, recipients),
    mode: 'manual',
    teacherId: teacherId || null,
  };
  db.reportLogs.unshift(entry);
  writeDb(db);
  res.json(entry);
});

app.get('/api/reports/logs', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const teacherId = req.query?.teacherId;
  res.json(teacherId ? db.reportLogs.filter(item => item.teacherId === teacherId) : []);
});

app.post('/api/batch/sessions', upload.array('files', 20), (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const session = {
    id: nextId(db, 'batch', 'b'),
    createdAt: new Date().toISOString(),
    teacherId: req.body.teacherId || null,
    scale: req.body.scale || '100',
    files: (req.files || []).map(file => ({
      id: `${Date.now()}-${file.originalname}`,
      name: file.originalname,
      url: publicFileUrl(req, file.filename),
      kind: file.mimetype.startsWith('image/') ? 'photo' : 'file',
      originalName: file.originalname,
    })),
    results: []
  };
  db.batchSessions.unshift(session);
  writeDb(db);
  res.json(session);
});

app.post('/api/batch/sessions/:id/analyze', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const session = db.batchSessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  session.results = session.files.map((file, index) => ({
    id: `${session.id}-r${index + 1}`,
    name: `Ученик ${index + 1}`,
    errorTypes: index % 3 === 0 ? ['Вычислительная', 'Оформление'] : index % 3 === 1 ? ['Логическая', 'Терминология'] : ['Оформление'],
    errorDescription: index % 3 === 0 ? 'Есть арифметическая ошибка и неполное оформление финального ответа.' : index % 3 === 1 ? 'Неверно выбран метод решения, из-за чего ход решения уходит в сторону.' : 'Решение в целом верно, но оформление ответа не соответствует критериям.',
    score: session.scale === '5' ? 4 : session.scale === '10' ? 8 : 78,
    typedText: `Распознанный текст работы ${index + 1}:\nФормула, промежуточные вычисления, итоговый ответ...`,
    sourceUrl: file.url,
    aiComment: 'AI предлагает пересмотреть участок с формулой и финальным ответом.',
    submittedAt: new Date().toISOString().slice(0, 10)
  }));
  writeDb(db);
  res.json(session);
});

app.get('/api/batch/sessions/:id', (req, res) => {
  const db = readDb();
  ensureDbDefaults(db);
  const session = db.batchSessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
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

cron.schedule('* * * * *', () => {
  const db = readDb();
  ensureDbDefaults(db);
  let changed = false;
  const now = new Date();
  db.reportConfigs.forEach(config => {
    if (config.frequency === 'Самостоятельно' || !config.nextRun) return;
    if (new Date(config.nextRun) > now) return;
    const recipients = recipientsForConfig(db, config, false);
    if (recipients.length) {
      db.reportLogs.unshift({
        id: `log-${Date.now()}-${config.id}`,
        createdAt: new Date().toISOString(),
        targetLabel: summarizeEntity(db, config.targetType, config.targetId),
        recipients,
        fields: [...reportFieldKeys],
        payload: buildParentReportPayload(db, config.teacherId, config.targetType, config.targetId, recipients),
        mode: 'scheduled',
        teacherId: config.teacherId || null,
      });
    }
    const nextRun = new Date(now);
    nextRun.setDate(nextRun.getDate() + (config.frequency === 'Еженедельно' ? 7 : 30));
    config.nextRun = nextRun.toISOString();
    changed = true;
  });
  if (changed) writeDb(db);
});

app.listen(PORT, () => console.log(`Backend running on http://127.0.0.1:${PORT}`));

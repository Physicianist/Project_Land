import express from 'express';
import cors from 'cors';
import multer from 'multer';
import cron from 'node-cron';
import PDFDocument from 'pdfkit';
import path from 'path';
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
const reportFieldKeys = ['Оценки за период', 'Динамику успеваемости', 'Слабые темы', 'Рекомендации', 'Просроченные задания'];

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

function slotConflict(db, slots = [], ignoreStudentId = null, ignoreGroupId = null) {
  const activeStudents = db.students.filter(s => s.active && s.id !== ignoreStudentId);
  const activeGroups = db.groups.filter(g => g.active && g.id !== ignoreGroupId);
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
    .filter(group => group.active && group.studentIds.includes(student.id))
    .flatMap(group => normalizeSlots(group.lessonSlots || []).map(slot => ({ ...slot, inherited: true, sourceGroupId: group.id, sourceGroupName: group.name })));
  return inherited;
};

const getAssignmentsForStudent = (db, studentId) => {
  const groupIds = db.groups.filter(group => group.active && group.studentIds.includes(studentId)).map(group => group.id);
  return db.assignments.filter(assignment => assignment.recipientType === 'student' ? assignment.recipientId === studentId : groupIds.includes(assignment.recipientId));
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

const serializeBootstrap = () => {
  const db = readDb();
  return {
    ...db,
    computed: {
      studentScores: Object.fromEntries(db.students.map(student => [student.id, getStudentScore(db, student.id)])),
      groupScores: Object.fromEntries(db.groups.map(group => {
        const activeIds = group.studentIds.filter(id => db.students.find(student => student.id === id)?.active);
        const score = activeIds.length ? Math.round(activeIds.reduce((sum, id) => sum + getStudentScore(db, id), 0) / activeIds.length) : 0;
        return [group.id, score];
      }))
    }
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
    ? (db.teacher?.name || account.name || 'Преподаватель')
    : (db.students.find(s => s.id === account.userId)?.name || account.name || 'Ученик'),
  accessMode: accountAccess(account),
  trialEndsAt: (() => { const d = new Date(account.createdAt); d.setDate(d.getDate() + TRIAL_DAYS); return d.toISOString(); })(),
});

const createSmsCode = () => String(Math.floor(1000 + Math.random() * 9000));

function ensureTeacherDefaults(db) {
  db.teacher = {
    id: 't1',
    name: db.teacher?.name || 'Елена Викторовна Петрова',
    email: db.teacher?.email || 'teacher@demo.ru',
    phone: db.teacher?.phone || '+7 999 123-45-67',
    avatarUrl: db.teacher?.avatarUrl || '',
    plan: db.teacher?.plan || 'Trial',
    subjects: db.teacher?.subjects || [...subjects],
    notifications: db.teacher?.notifications || Object.fromEntries(notificationKeys.map(k => [k, true])),
    reportPreferences: db.teacher?.reportPreferences || Object.fromEntries(reportFieldKeys.map(k => [k, true])),
  };
  db.accounts ||= [];
  db.smsLogs ||= [];
  db.resetRequests ||= [];
}

app.get('/api/bootstrap', (_, res) => res.json(serializeBootstrap()));

app.post('/api/auth/register', (req, res) => {
  const db = readDb();
  ensureTeacherDefaults(db);
  const { role, name, email, phone, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!role || !name || !normalizedEmail || !password) return res.status(400).json({ error: 'Не хватает обязательных полей.' });
  if (!phone) return res.status(400).json({ error: 'Номер телефона обязателен.' });
  const existing = db.accounts.find(acc => acc.role === role && acc.email === normalizedEmail);
  if (existing) return res.status(409).json({ error: 'Аккаунт с такой ролью и почтой уже существует.' });

  let userId = null;
  if (role === 'teacher') {
    db.teacher.name = name;
    db.teacher.email = normalizedEmail;
    db.teacher.phone = phone;
    userId = db.teacher.id;
  } else {
    let student = db.students.find(s => s.email.toLowerCase() === normalizedEmail);
    if (!student) {
      student = { id: nextId(db, 'student', 's'), name, email: normalizedEmail, phone, parentName: '', parentEmail: '', level: 'Новый ученик', subjects: [], active: true, lessonSlots: [] };
      db.students.push(student);
    }
    student.phone = phone;
    userId = student.id;
  }

  const account = {
    id: `acc-${Date.now()}`,
    role,
    name,
    email: normalizedEmail,
    phone,
    password,
    verified: false,
    createdAt: new Date().toISOString(),
    userId,
  };
  db.accounts.push(account);

  const code = createSmsCode();
  db.smsLogs.unshift({ id: `sms-${Date.now()}`, email: normalizedEmail, role, phone, code, createdAt: new Date().toISOString(), used: false });
  writeDb(db);
  return res.json({ requiresSms: true, debugCode: code, email: normalizedEmail, role });
});

app.post('/api/auth/verify-sms', (req, res) => {
  const db = readDb();
  ensureTeacherDefaults(db);
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
  ensureTeacherDefaults(db);
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
  ensureTeacherDefaults(db);
  const { email, role, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const account = db.accounts.find(acc => acc.email === normalizedEmail && acc.role === role && acc.password === password);
  if (!account) return res.status(401).json({ error: 'Неверная почта, роль или пароль.' });
  if (!account.verified) return res.status(403).json({ error: 'Сначала подтвердите аккаунт по SMS.' });
  res.json({ session: safeAccount(db, account) });
});

app.put('/api/teacher/profile', (req, res) => {
  const db = readDb();
  ensureTeacherDefaults(db);
  db.teacher = { ...db.teacher, ...req.body };
  db.accounts.filter(acc => acc.role === 'teacher' && acc.userId === db.teacher.id).forEach(acc => {
    if (req.body.email) acc.email = req.body.email;
    if (req.body.phone !== undefined) acc.phone = req.body.phone;
    if (req.body.name) acc.name = req.body.name;
  });
  writeDb(db);
  res.json(db.teacher);
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
  const { name, email, parentName, parentEmail, level, subjects, lessonSlots, newGroupName, newGroupSubject } = req.body;
  const normalizedSlots = normalizeSlots(lessonSlots || []);
  const conflict = slotConflict(db, normalizedSlots);
  if (conflict.conflict) return res.status(409).json({ error: `Слот занят: ${conflict.studentName}, ${conflict.slot.day} ${conflict.slot.time}` });
  const studentId = nextId(db, 'student', 's');
  const student = { id: studentId, name, email, parentName, parentEmail, level, subjects, active: true, lessonSlots: normalizedSlots };
  db.students.push(student);
  if (newGroupName) {
    const groupId = nextId(db, 'group', 'g');
    db.groups.push({ id: groupId, name: newGroupName, subject: newGroupSubject || subjects?.[0] || 'Математика', active: true, studentIds: [studentId], riskTopics: [] });
  }
  writeDb(db);
  res.json(student);
});

app.put('/api/students/:id', (req, res) => {
  const db = readDb();
  const index = db.students.findIndex(item => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Student not found' });
  const normalizedSlots = req.body.lessonSlots ? normalizeSlots(req.body.lessonSlots) : db.students[index].lessonSlots;
  const conflict = slotConflict(db, normalizedSlots, req.params.id);
  if (conflict.conflict) return res.status(409).json({ error: `Слот занят: ${conflict.studentName}, ${conflict.slot.day} ${conflict.slot.time}` });
  db.students[index] = { ...db.students[index], ...req.body, lessonSlots: normalizedSlots };
  writeDb(db);
  res.json(db.students[index]);
});

app.post('/api/students/:id/archive', (req, res) => {
  const db = readDb();
  const student = db.students.find(item => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  student.active = false;
  db.groups.forEach(group => { group.studentIds = group.studentIds.filter(id => id !== student.id); });
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/groups', (req, res) => {
  const db = readDb();
  const normalizedSlots = normalizeSlots(req.body.lessonSlots || []);
  const conflict = slotConflict(db, normalizedSlots);
  if (conflict.conflict) return res.status(409).json({ error: `Слот занят: ${conflict.studentName}, ${conflict.slot.day} ${conflict.slot.time}` });
  const group = { id: nextId(db, 'group', 'g'), active: true, riskTopics: [], lessonSlots: normalizedSlots, ...req.body };
  db.groups.push(group);
  writeDb(db);
  res.json(group);
});

app.put('/api/groups/:id', (req, res) => {
  const db = readDb();
  const group = db.groups.find(item => item.id === req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const normalizedSlots = req.body.lessonSlots ? normalizeSlots(req.body.lessonSlots) : normalizeSlots(group.lessonSlots || []);
  const conflict = slotConflict(db, normalizedSlots, null, req.params.id);
  if (conflict.conflict) return res.status(409).json({ error: `Слот занят: ${conflict.studentName}, ${conflict.slot.day} ${conflict.slot.time}` });
  Object.assign(group, req.body, { lessonSlots: normalizedSlots });
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
  const assignment = {
    id: nextId(db, 'assignment', 'a'),
    createdAt: new Date().toISOString().slice(0, 10),
    attachments: req.body.attachments || [],
    ...req.body,
  };
  db.assignments.push(assignment);
  writeDb(db);
  res.json(assignment);
});

app.put('/api/assignments/:id', (req, res) => {
  const db = readDb();
  const assignment = db.assignments.find(item => item.id === req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  Object.assign(assignment, req.body);
  writeDb(db);
  res.json(assignment);
});

app.post('/api/assignments/:id/publish-draft', (req, res) => {
  const db = readDb();
  const draft = db.assignments.find(item => item.id === req.params.id);
  if (!draft) return res.status(404).json({ error: 'Assignment not found' });
  const candidate = { ...draft, ...req.body };
  const duplicate = db.assignments.find(item => item.status === 'Активно' && item.title === candidate.title && item.recipientId === candidate.recipientId && item.subject === candidate.subject && item.deadline === candidate.deadline);
  if (duplicate) return res.status(409).json({ error: 'Нельзя повторно активировать одинаковое задание.' });
  const copy = { ...draft, id: nextId(db, 'assignment', 'a'), status: 'Активно', createdAt: new Date().toISOString().slice(0, 10), ...req.body };
  db.assignments.push(copy);
  writeDb(db);
  res.json(copy);
});

app.delete('/api/assignments/:id', (req, res) => {
  const db = readDb();
  db.assignments = db.assignments.filter(item => item.id !== req.params.id);
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/works', (req, res) => {
  const db = readDb();
  const work = {
    id: nextId(db, 'work', 'w'),
    submittedAt: new Date().toISOString().slice(0, 10),
    status: 'Ожидает подтверждения',
    aiComment: 'Работа загружена. AI-анализ будет добавлен после обработки.',
    aiErrors: [],
    suggestedScore: 0,
    finalScore: null,
    ...req.body,
  };
  db.works.push(work);
  writeDb(db);
  res.json(work);
});

app.put('/api/works/:id', (req, res) => {
  const db = readDb();
  const work = db.works.find(item => item.id === req.params.id);
  if (!work) return res.status(404).json({ error: 'Work not found' });
  Object.assign(work, req.body);
  writeDb(db);
  res.json(work);
});

app.put('/api/works/:id/confirm', (req, res) => {
  const db = readDb();
  const work = db.works.find(item => item.id === req.params.id);
  if (!work) return res.status(404).json({ error: 'Work not found' });
  work.finalScore = req.body.finalScore;
  work.aiComment = req.body.aiComment;
  work.status = 'Проверена';
  writeDb(db);
  res.json(work);
});

app.get('/api/reports/configs', (_, res) => {
  const db = readDb();
  res.json(db.reportConfigs);
});

app.post('/api/reports/configs', (req, res) => {
  const db = readDb();
  const existing = db.reportConfigs.find(item => item.targetType === req.body.targetType && item.targetId === req.body.targetId);
  const nextRun = new Date();
  nextRun.setDate(nextRun.getDate() + (req.body.frequency === 'Еженедельно' ? 7 : 30));
  if (existing) Object.assign(existing, req.body, { saved: true, nextRun: nextRun.toISOString() });
  else db.reportConfigs.push({ id: nextId(db, 'report', 'rc'), ...req.body, saved: true, nextRun: nextRun.toISOString() });
  writeDb(db);
  res.json({ success: true });
});

const recipientsForConfig = (db, config, manual = false) => {
  if (config.targetType === 'student') {
    const student = db.students.find(item => item.id === config.targetId);
    return student?.parentEmail ? [{ email: student.parentEmail, name: student.parentName || student.name, studentId: student.id }] : [];
  }
  const group = db.groups.find(item => item.id === config.targetId);
  if (!group) return [];
  return group.studentIds
    .map(id => db.students.find(item => item.id === id))
    .filter(Boolean)
    .filter(student => student.parentEmail)
    .filter(student => manual || !db.reportConfigs.find(cfg => cfg.targetType === 'student' && cfg.targetId === student.id && cfg.frequency !== 'Самостоятельно'))
    .map(student => ({ email: student.parentEmail, name: student.parentName || student.name, studentId: student.id }));
};

app.post('/api/reports/send', (req, res) => {
  const db = readDb();
  const { targetType, targetId, period } = req.body;
  const config = { targetType, targetId, frequency: 'Самостоятельно', period };
  const recipients = recipientsForConfig(db, config, true);
  const entry = {
    id: `log-${Date.now()}`,
    createdAt: new Date().toISOString(),
    targetLabel: summarizeEntity(db, targetType, targetId),
    recipients,
    fields: ['Имя', 'Типы ошибок', 'Описание ошибок', 'Итоговый балл', 'Дата'],
    mode: 'manual'
  };
  db.reportLogs.unshift(entry);
  writeDb(db);
  res.json(entry);
});

app.get('/api/reports/logs', (_, res) => {
  const db = readDb();
  res.json(db.reportLogs);
});

app.post('/api/batch/sessions', upload.array('files', 20), (req, res) => {
  const db = readDb();
  const session = {
    id: nextId(db, 'batch', 'b'),
    createdAt: new Date().toISOString(),
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
  const session = db.batchSessions.find(item => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

app.put('/api/batch/sessions/:id/results/:resultId', (req, res) => {
  const db = readDb();
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
  let changed = false;
  const now = new Date();
  db.reportConfigs.forEach(config => {
    if (config.frequency === 'Самостоятельно' || !config.nextRun) return;
    if (new Date(config.nextRun) > now) return;
    const recipients = recipientsForConfig(db, config, false);
    db.reportLogs.unshift({
      id: `log-${Date.now()}-${config.id}`,
      createdAt: new Date().toISOString(),
      targetLabel: summarizeEntity(db, config.targetType, config.targetId),
      recipients,
      fields: ['Имя', 'Типы ошибок', 'Описание ошибок', 'Итоговый балл', 'Дата'],
      mode: 'scheduled'
    });
    const nextRun = new Date(now);
    nextRun.setDate(nextRun.getDate() + (config.frequency === 'Еженедельно' ? 7 : 30));
    config.nextRun = nextRun.toISOString();
    changed = true;
  });
  if (changed) writeDb(db);
});

app.listen(PORT, () => console.log(`Backend running on http://127.0.0.1:${PORT}`));

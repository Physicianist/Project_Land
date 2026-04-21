import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Archive, ArrowRight, BarChart3, BookOpen, CheckSquare, ChevronRight, Clock3,
  CreditCard, Eye, EyeOff, FileSpreadsheet, FileText, FolderOpen, GraduationCap, ImagePlus,
  LayoutDashboard, Lock, LogOut, Mail, Menu, Pencil, Plus, Save, Search, Send, Settings,
  Sparkles, Trash2, UploadCloud, Users, X
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Landing from './Landing.tsx';

const API = 'http://127.0.0.1:4000';
const PERIODS = [
  { value: '1', label: '1 месяц', days: 30 },
  { value: '3', label: '3 месяца', days: 90 },
  { value: '6', label: '6 месяцев', days: 180 },
  { value: '9', label: '9 месяцев', days: 270 },
  { value: 'all', label: 'За все время', days: Infinity },
];

const api = {
  bootstrap: (session = null) => {
    const params = new URLSearchParams();
    if (session?.role) params.set('role', session.role);
    if (session?.userId) params.set('userId', session.userId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return fetch(`${API}/api/bootstrap${suffix}`).then(r => r.json());
  },
  upload: async (files) => {
    const fd = new FormData();
    Array.from(files).forEach(file => fd.append('files', file));
    const res = await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Не удалось загрузить файлы');
    return res.json();
  },
  createStudent: post('/api/students'),
  updateStudent: put('/api/students'),
  archiveStudent: postNoBody('/api/students', 'archive'),
  createGroup: post('/api/groups'),
  updateGroup: put('/api/groups'),
  archiveGroup: postNoBody('/api/groups', 'archive'),
  createAssignment: post('/api/assignments'),
  updateAssignment: put('/api/assignments'),
  publishDraft: post('/api/assignments', 'publish-draft'),
  deleteAssignment: del('/api/assignments'),
  createWork: post('/api/works'),
  updateWork: put('/api/works'),
  confirmWork: put('/api/works', 'confirm'),
  reprocessWork: (id, payload = {}) => jsonPost(`/api/works/${id}/reprocess`, payload),
  markWorkManualReview: (id, payload = {}) => jsonPut(`/api/works/${id}/manual-review`, payload),
  saveReportConfig: post('/api/reports/configs'),
  sendReport: post('/api/reports/send'),
  createBatchSession: async (files, scale, teacherId) => {
    const fd = new FormData();
    Array.from(files).forEach(file => fd.append('files', file));
    fd.append('scale', scale);
    if (teacherId) fd.append('teacherId', teacherId);
    const res = await fetch(`${API}/api/batch/sessions`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Не удалось создать пакетную сессию');
    return res.json();
  },
  analyzeBatch: async (id) => {
    const res = await fetch(`${API}/api/batch/sessions/${id}/analyze`, { method: 'POST' });
    if (!res.ok) throw new Error('Не удалось запустить анализ');
    return res.json();
  },
  updateBatchResult: async (sessionId, resultId, payload) => {
    const res = await fetch(`${API}/api/batch/sessions/${sessionId}/results/${resultId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Не удалось обновить результат');
    return res.json();
  },
  retryFailedBatch: async (sessionId) => {
    const res = await fetch(`${API}/api/batch/sessions/${sessionId}/retry-failed`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Не удалось повторно поставить файлы в очередь');
    return data;
  },
  exportCsvUrl: (sessionId) => `${API}/api/batch/sessions/${sessionId}/export.csv`,
  exportPdfUrl: (sessionId) => `${API}/api/batch/sessions/${sessionId}/export.pdf`,
  register: (payload) => jsonPost('/api/auth/register', payload),
  verifySms: (payload) => jsonPost('/api/auth/verify-sms', payload),
  login: (payload) => jsonPost('/api/auth/login', payload),
  completeOnboarding: (payload) => jsonPost('/api/auth/onboarding-complete', payload),
  requestReset: (payload) => jsonPost('/api/auth/request-reset', payload),
  verifyReset: (payload) => jsonPost('/api/auth/verify-reset', payload),
  completeReset: (payload) => jsonPost('/api/auth/complete-reset', payload),
  updateTeacher: (payload) => jsonPut('/api/teacher/profile', payload),
  searchTeachers: (query = '') => fetch(`${API}/api/teachers/search?q=${encodeURIComponent(query)}`).then(async r => {
    const data = await r.json().catch(() => ([]));
    if (!r.ok) throw new Error('Не удалось загрузить список преподавателей');
    return data;
  }),
  searchStudents: (teacherId, query = '') => fetch(`${API}/api/students/search?teacherId=${encodeURIComponent(teacherId)}&q=${encodeURIComponent(query)}`).then(async r => {
    const data = await r.json().catch(() => ([]));
    if (!r.ok) throw new Error(data.error || 'Не удалось загрузить список учеников');
    return data;
  }),
  createTeacherInvite: (payload) => jsonPost('/api/teacher-invites', payload),
  claimTeacherInvite: (payload) => jsonPost('/api/teacher-invites/claim', payload),
  updateTeacherInvite: (id, payload) => jsonPut(`/api/teacher-invites/${id}`, payload),
  dismissTeacherInviteNotification: (id) => jsonPost(`/api/teacher-invites/${id}/dismiss-student-notification`, {}),
  detachTeacherStudent: (teacherId, studentId) => jsonPost(`/api/teachers/${teacherId}/students/${studentId}/detach`, {}),
};


function jsonPost(path, payload) {
  return fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(async r => { const data = await r.json().catch(()=>({})); if (!r.ok) throw new Error(data.error || 'Запрос завершился с ошибкой'); return data; });
}
function jsonPut(path, payload) {
  return fetch(`${API}${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(async r => { const data = await r.json().catch(()=>({})); if (!r.ok) throw new Error(data.error || 'Запрос завершился с ошибкой'); return data; });
}
function post(base, action) {
  return async (arg1, arg2) => {
    const url = arg2 !== undefined ? `${API}${base}/${arg1}${action ? `/${action}` : ''}` : `${API}${base}`;
    const payload = arg2 !== undefined ? arg2 : arg1;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Запрос завершился с ошибкой');
    return data;
  };
}
function put(base, action) {
  return async (id, payload) => {
    const res = await fetch(`${API}${base}/${id}${action ? `/${action}` : ''}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Запрос завершился с ошибкой');
    return data;
  };
}
function del(base) {
  return async (id) => {
    const res = await fetch(`${API}${base}/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Запрос завершился с ошибкой');
    return data;
  };
}
function postNoBody(base, idAction) {
  return async (id) => {
    const res = await fetch(`${API}${base}/${id}/${idAction}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Запрос завершился с ошибкой');
    return data;
  };
}

function getSession() {
  try { return JSON.parse(localStorage.getItem('proveriai_session') || 'null'); } catch { return null; }
}
function setSession(next) { localStorage.setItem('proveriai_session', JSON.stringify(next)); }
function clearSession() { localStorage.removeItem('proveriai_session'); }

const cx = (...items) => items.filter(Boolean).join(' ');
const pillClass = {
  'Активно': 'pill info', 'Черновик': 'pill warn', 'Завершено': 'pill success',
  'Проверено': 'pill success', 'Ожидает подтверждения': 'pill info', 'На проверке': 'pill info',
  pending: 'pill info', accepted: 'pill success', declined: 'pill warn',
  uploaded: 'pill info',
  queued: 'pill info',
  processing: 'pill warn',
  draft_ready: 'pill success',
  needs_human_review: 'pill warn',
  approved: 'pill success',
  failed: 'pill danger',
};
const SUBJECT_OPTIONS = ['Математика', 'Физика', 'Химия'];
const PARENT_REPORT_FIELDS = ['Имя ученика', 'Частые типы ошибок', 'Гистограмма оценок'];
const WORK_STATUS_LABELS = {
  student: {
    'Ожидает подтверждения': 'На проверке',
  },
  teacher: {},
};
const AI_PROCESSING_LABELS = {
  uploaded: 'Загружено',
  queued: 'В очереди AI',
  processing: 'AI обрабатывает',
  draft_ready: 'Черновик готов',
  needs_human_review: 'Требует ручной проверки',
  approved: 'Проверено',
  failed: 'Ошибка AI',
};
const onboardingVariants = {
  student: [
    { title: 'Заполнить профиль', text: 'Добавьте телефон и Email родителя, если он нужен для отчетов.', path: '/student/profile', cta: 'Открыть профиль' },
    { title: 'Найти преподавателя', text: 'Откройте раздел «Репетиторы» и отправьте запрос нужному преподавателю.', path: '/student/tutors', cta: 'Перейти к репетиторам' },
    { title: 'Открыть первое задание', text: 'Как только преподаватель опубликует задание, оно появится в вашем списке.', path: '/student/assignments', cta: 'Открыть задания' },
  ],
  teacher: [
    { title: 'Заполнить профиль', text: 'Укажите контакты и предметы, с которыми вы работаете.', path: '/teacher/settings', cta: 'Открыть настройки' },
    { title: 'Пригласить ученика', text: 'Создайте ученика вручную или отправьте ссылку-приглашение.', path: '/teacher/students', cta: 'Открыть учеников' },
    { title: 'Создать группу или пропустить', text: 'Можно собрать мини-группу сразу или сделать это позже.', path: '/teacher/groups', cta: 'Открыть группы' },
    { title: 'Выдать первое задание', text: 'После публикации оно сразу появится в аккаунтах нужных учеников.', path: '/teacher/assignments', cta: 'Открыть задания' },
  ],
};

function displayWorkStatus(status, role = 'teacher') {
  return WORK_STATUS_LABELS[role]?.[status] || status;
}

function displayAiStatus(status) {
  return AI_PROCESSING_LABELS[status] || status || 'Загружено';
}

function getTeacherProfile(db, session) {
  if (!session?.userId) return null;
  return (db.teachers || []).find(item => item.id === session.userId) || null;
}

function getCurrentStudent(db, session) {
  if (!session?.userId) return null;
  return db.students.find(item => item.id === session.userId) || null;
}

function studentTeacherIds(student = {}) {
  return [...new Set((Array.isArray(student.teacherIds) ? student.teacherIds : [student.teacherId]).filter(Boolean))];
}

function studentHasTeacher(student = {}, teacherId) {
  return studentTeacherIds(student).includes(teacherId);
}

function teacherOwnedStudents(db, teacherId) {
  return db.students.filter(item => item.active && studentHasTeacher(item, teacherId));
}

function teacherOwnedGroups(db, teacherId) {
  return db.groups.filter(item => item.active && item.teacherId === teacherId);
}

function teacherOwnedAssignments(db, teacherId) {
  return db.assignments.filter(item => item.teacherId === teacherId);
}

function teacherOwnedWorks(db, teacherId) {
  return db.works.filter(item => item.teacherId === teacherId);
}

function teacherInvitesFor(db, teacherId, status = 'pending') {
  return (db.teacherInvites || []).filter(item => item.teacherId === teacherId && (!status || item.status === status));
}

function teacherHistoricalStudentsCount(db, teacherId) {
  const teacher = (db.teachers || []).find(item => item.id === teacherId);
  return teacher?.historicalStudentIds?.length || 0;
}

function isPdfAttachment(file = {}) {
  const source = `${file.name || ''} ${file.url || ''}`.toLowerCase();
  return source.includes('.pdf');
}

function formatDeadline(deadline) {
  if (!deadline) return 'Без дедлайна';
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return deadline;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(value) {
  if (!value) return 'Не указан';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU');
}

async function submitAssignmentWork({ assignment, student, works, files, reload, notify }) {
  if (!files.length) return;
  const existing = works.find(item => item.assignmentId === assignment.id);
  if (existing) throw new Error('Работа по этому заданию уже отправлена. Дозагрузка недоступна.');
  const uploaded = await api.upload(files);
  await api.createWork({
    assignmentId: assignment.id,
    studentId: student.id,
    teacherId: assignment.teacherId || studentTeacherIds(student)[0] || null,
    files: uploaded.files,
    ocrText: 'Распознанный текст будет добавлен после обработки.',
    aiComment: 'AI-анализ будет добавлен после обработки.',
    aiErrors: [],
    suggestedScore: 0,
    finalScore: null,
    status: 'Ожидает подтверждения',
  });
  await reload();
  notify({ type: 'success', text: 'Решение отправлено преподавателю.' });
}

function AttachmentGallery({ files = [], compact = false }) {
  if (!files.length) return null;
  return (
    <div className={cx('gallery', compact && 'attachmentGalleryCompact')}>
      {files.map(file => {
        const href = normalizeUrl(file.url);
        if (file.kind === 'photo') {
          return <img key={file.id} src={href} alt={file.name} className="galleryImg" />;
        }
        if (isPdfAttachment(file)) {
          return (
            <div key={file.id} className="pdfPreviewCard">
              <div className="pdfPreviewTitle">{file.name}</div>
              <object data={href} type="application/pdf" className="pdfPreviewObject">
                <a href={href} target="_blank" rel="noreferrer" className="fileTile">Открыть PDF</a>
              </object>
            </div>
          );
        }
        return <a key={file.id} href={href} target="_blank" rel="noreferrer" className="fileTile">{file.name}</a>;
      })}
    </div>
  );
}

function formatConfidence(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'н/д';
  return `${Math.round(Number(value) * 100)}%`;
}

function ReviewFileViewer({ files = [] }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const safeFiles = files.length ? files : [];
  const selected = safeFiles[Math.min(pageIndex, Math.max(safeFiles.length - 1, 0))] || null;

  useEffect(() => {
    setPageIndex(0);
  }, [safeFiles.length]);

  if (!selected) return <div className="empty">Нет приложенных файлов.</div>;
  const href = normalizeUrl(selected.previewUrl || selected.normalizedUrl || selected.url);
  return (
    <div className="stack gap12">
      <div className="row between wrap gap8">
        <div className="chipWrap">
          {safeFiles.map((file, index) => (
            <button
              key={file.id || `${file.name}-${index}`}
              className={cx('chipBtn', index === pageIndex && 'active')}
              onClick={() => setPageIndex(index)}
            >
              {safeFiles.length > 1 ? `Стр. ${index + 1}` : 'Файл'}
            </button>
          ))}
        </div>
        <label className="field compactField">
          <span>Zoom</span>
          <select className="input selectSmall" value={zoom} onChange={e => setZoom(Number(e.target.value))}>
            {[80, 100, 125, 150].map(value => <option key={value} value={value}>{value}%</option>)}
          </select>
        </label>
      </div>
      <div className="reviewViewerSurface">
        {selected.kind === 'photo'
          ? <img src={href} alt={selected.name} className="reviewViewerImage" style={{ transform: `scale(${zoom / 100})` }} />
          : (
            <object data={href} type={selected.mimeType || 'application/pdf'} className="reviewViewerPdf">
              <a href={href} target="_blank" rel="noreferrer" className="fileTile">Открыть файл</a>
            </object>
          )}
      </div>
      <div className="muted small">{selected.originalName || selected.name}</div>
    </div>
  );
}

function ReviewSummaryCard({ selected, editMode, finalScore, setFinalScore, studentComment, setStudentComment, teacherComment, setTeacherComment, onConfirm, onEnableEdit, onReprocess, onManualReview, busy }) {
  const analysis = selected.analysisDraft || {};
  const warnings = [...new Set([...(selected.reviewWarnings || []), ...(analysis.warnings || [])].filter(Boolean))];
  return (
    <div className="stack gap12">
      <div className="row gap8 wrap">
        <span className={pillClass[selected.processingStatus || 'uploaded']}>{displayAiStatus(selected.processingStatus)}</span>
        <span className="pill info">OCR {formatConfidence(selected.recognitionConfidence)}</span>
        <span className="pill info">AI {formatConfidence(selected.aiConfidence)}</span>
        {selected.needsHumanReview && <span className="pill warn">Нужна ручная проверка</span>}
      </div>
      {!!warnings.length && <div className="stack gap8">{warnings.map((warning, index) => <div key={`${warning}-${index}`} className="banner subtle">{warning}</div>)}</div>}
      <label className="field">
        <span>Предварительный балл</span>
        <input className="input" type="number" value={finalScore} disabled={!editMode || busy} onChange={e => setFinalScore(Number(e.target.value))} />
      </label>
      <label className="field">
        <span>Комментарий ученику</span>
        <textarea className="input textarea" value={studentComment} disabled={!editMode || busy} onChange={e => setStudentComment(e.target.value)} />
      </label>
      <label className="field">
        <span>Комментарий преподавателю</span>
        <textarea className="input textarea" value={teacherComment} disabled={!editMode || busy} onChange={e => setTeacherComment(e.target.value)} />
      </label>
      <details className="advancedDisclosure">
        <summary>Расширенный разбор</summary>
        <div className="stack gap12 mt12">
          <div className="cardInner">
            <div className="sectionLabel">Извлеченное условие</div>
            <div className="mt8">{analysis.extractedTask || 'Пока не выделено.'}</div>
          </div>
          <div className="cardInner">
            <div className="sectionLabel">Эталон / верификация</div>
            <div className="mt8">{analysis.canonicalSolution || 'Пока не сформировано.'}</div>
          </div>
        </div>
      </details>
      <div className="modalActions alignStart">
        <button className="primaryBtn" disabled={busy || !studentComment.trim()} onClick={onConfirm}>Подтвердить</button>
        <button className="secondaryBtn" disabled={busy} onClick={onEnableEdit}>{editMode ? 'Режим редактирования включен' : 'Исправить'}</button>
        <button className="ghostBtn" disabled={busy} onClick={onReprocess}>Сгенерировать заново</button>
        <button className="ghostBtn" disabled={busy} onClick={onManualReview}>Пометить как требует ручной проверки</button>
      </div>
    </div>
  );
}


export default function App() {
  const [session, setSessionState] = useState(getSession());
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const updateSession = (next) => {
    if (next) setSession(next);
    else clearSession();
    setSessionState(next);
  };

  const reload = async (scopeSession = session) => {
    setLoading(true);
    try {
      const payload = await api.bootstrap(scopeSession);
      setDb(payload);
    } catch {
      setToast({ type: 'error', text: 'Не удалось загрузить данные backend.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(session); }, [session?.role, session?.userId]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const setServerSession = (next) => updateSession(next);
  const logout = () => updateSession(null);

  if (loading || !db) return <div className="screen center">Загрузка проекта…</div>;

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={session ? <Navigate to={session.role === 'teacher' ? (session.accessMode === 'limited' ? '/teacher/grading?tab=batch' : '/teacher') : '/student'} replace /> : <LoginPage onAuth={setServerSession} notify={setToast} />} />
        <Route path="/*" element={session ? <Shell session={session} db={db} reload={reload} logout={logout} notify={setToast} updateSession={updateSession} /> : <Navigate to="/login" replace />} />
      </Routes>
      {toast && <Toast {...toast} />}
    </>
  );
}

function Shell({ session, db, reload, logout, notify, updateSession }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [teaser, setTeaser] = useState(null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const isTeacherLimited = session.role === 'teacher' && session.accessMode === 'limited';
  const teacherPendingInvites = session.role === 'teacher'
    ? (db.teacherInvites || []).filter(item => item.direction === 'student_to_teacher' && item.status === 'pending').length
    : 0;
  const studentPendingInvites = session.role === 'student'
    ? (db.teacherInvites || []).filter(item => item.status === 'pending').length
    : 0;

  const teacherItems = [
    { path: '/teacher', label: 'Дашборд', icon: LayoutDashboard },
    { path: '/teacher/students', label: 'Ученики', icon: Users, badge: teacherPendingInvites || null },
    { path: '/teacher/groups', label: 'Группы', icon: FolderOpen },
    { path: '/teacher/assignments', label: 'Задания', icon: BookOpen },
    { path: '/teacher/grading', label: 'Проверка', icon: CheckSquare },
    { path: '/teacher/analytics', label: 'Аналитика', icon: BarChart3 },
    { path: '/teacher/reports', label: 'Отчеты', icon: FileText },
    { path: '/teacher/pricing', label: 'Тарифы', icon: CreditCard },
    { path: '/teacher/settings', label: 'Настройки', icon: Settings },
  ];
  const studentItems = [
    { path: '/student', label: 'Главная', icon: LayoutDashboard },
    { path: '/student/assignments', label: 'Мои задания', icon: BookOpen },
    { path: '/student/tutors', label: 'Репетиторы', icon: Search, badge: studentPendingInvites || null },
    { path: '/student/profile', label: 'Профиль', icon: Users },
  ];
  const navItems = session.role === 'teacher' ? teacherItems : studentItems;
  const onboardingItems = onboardingVariants[session.role] || [];

  const onNav = (item) => {
    if (isTeacherLimited && !['/teacher/grading', '/teacher/pricing'].includes(item.path)) {
      setTeaser({ title: item.label, text: 'Пробный период завершен. В Free-режиме доступна только пакетная проверка и тарифы.' });
      return;
    }
    if (item.path === '/teacher/grading' && isTeacherLimited) navigate('/teacher/grading?tab=batch');
    else navigate(item.path);
  };

  const finishOnboarding = async () => {
    setSavingOnboarding(true);
    try {
      const payload = await api.completeOnboarding({ role: session.role, userId: session.userId });
      updateSession(payload.session);
    } finally {
      setSavingOnboarding(false);
    }
  };

  return (
    <div className="shell fixedSidebarShell">
      <aside className="sidebar alwaysOpen">
        <div className="brand">
          <div className="logo"><Sparkles size={18} /></div>
          <div><div className="brandTitle">ПроверьAI</div></div>
        </div>
        <nav className="navList">
          {navItems.map(item => {
            const active = location.pathname === item.path || (item.path === '/teacher/grading' && location.pathname === '/teacher/grading');
            const blocked = isTeacherLimited && session.role === 'teacher' && !['/teacher/grading', '/teacher/pricing'].includes(item.path);
            const Icon = item.icon;
            return (
              <button key={item.path} className={cx('navItem', active && 'active', blocked && 'blocked')} onClick={() => onNav(item)}>
                <Icon size={18} /><span>{item.label}</span>{item.badge ? <span className="navBadge">{item.badge}</span> : null}{blocked && <Lock size={13} />}
              </button>
            );
          })}
        </nav>
        <div className="sidebarFooter stickyFooter">
          <div className="userCard stableUserCard">
            <div className="avatar">{session.role === 'teacher' ? 'ЕП' : 'АС'}</div>
            <div>
              <div className="userName">{session.userName}</div>
              <div className="userMeta">{isTeacherLimited ? 'Free-режим после trial' : session.role === 'teacher' ? 'Преподаватель' : 'Ученик'}</div>
            </div>
          </div>
          <button className="ghostBtn wide" onClick={logout}><LogOut size={16} /> Выйти</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar noCollapseTopbar">
          {isTeacherLimited ? <div className="banner"><Sparkles size={14} /> Пробный период завершен. Доступна только Пакетная проверка и Тарифы</div> : null}
        </header>
        <main className="content">
          <Routes>
            <Route path="/teacher" element={<TeacherDashboard db={db} session={session} navigate={navigate} />} />
            <Route path="/teacher/students" element={<TeacherStudentsPage db={db} reload={reload} navigate={navigate} notify={notify} session={session} />} />
            <Route path="/teacher/groups" element={<TeacherGroupsPage db={db} reload={reload} navigate={navigate} notify={notify} session={session} />} />
            <Route path="/teacher/assignments" element={<TeacherAssignmentsPage db={db} reload={reload} notify={notify} session={session} />} />
            <Route path="/teacher/grading" element={<TeacherGradingPage db={db} reload={reload} session={session} notify={notify} />} />
            <Route path="/teacher/analytics" element={<TeacherAnalyticsPage db={db} session={session} />} />
            <Route path="/teacher/reports" element={<TeacherReportsPage db={db} reload={reload} notify={notify} session={session} />} />
            <Route path="/teacher/pricing" element={<TeacherPricingPage db={db} session={session} />} />
            <Route path="/teacher/settings" element={<TeacherSettingsPage db={db} reload={reload} notify={notify} session={session} />} />
            <Route path="/student" element={<StudentDashboardPage db={db} session={session} navigate={navigate} reload={reload} notify={notify} />} />
            <Route path="/student/assignments" element={<StudentAssignmentsPage db={db} reload={reload} notify={notify} session={session} />} />
            <Route path="/student/tutors" element={<StudentTutorsPage db={db} reload={reload} notify={notify} session={session} />} />
            <Route path="/student/profile" element={<StudentProfilePage db={db} session={session} reload={reload} notify={notify} />} />
            <Route path="*" element={<Navigate to={session.role === 'teacher' ? (isTeacherLimited ? '/teacher/grading?tab=batch' : '/teacher') : '/student'} replace />} />
          </Routes>
        </main>
      </div>
      {teaser && <Modal title={teaser.title} onClose={() => setTeaser(null)}><p>{teaser.text}</p><div className="modalActions"><button className="secondaryBtn" onClick={() => setTeaser(null)}>Понятно</button><button className="primaryBtn" onClick={() => { setTeaser(null); navigate('/teacher/pricing'); }}>Перейти к тарифам</button></div></Modal>}
      {!session.onboardingCompleted && !!onboardingItems.length && <Modal title="Первые шаги" onClose={() => {}}>
        <div className="stack gap16">
          <div className="chipWrap">
            {onboardingItems.map((item, index) => <span key={item.title} className={cx('chip', index === onboardingStep && 'chipInherited')}>{index + 1}. {item.title}</span>)}
          </div>
          <div className="cardInner">
            <div className="cardTitle">{onboardingItems[onboardingStep]?.title}</div>
            <div className="muted mt8">{onboardingItems[onboardingStep]?.text}</div>
          </div>
          <div className="modalActions">
            <button className="secondaryBtn" onClick={() => setOnboardingStep(step => Math.max(0, step - 1))} disabled={onboardingStep === 0}>Назад</button>
            <button className="ghostBtn" onClick={() => navigate(onboardingItems[onboardingStep]?.path)}>{onboardingItems[onboardingStep]?.cta}</button>
            {onboardingStep < onboardingItems.length - 1 ? (
              <button className="primaryBtn" onClick={() => setOnboardingStep(step => Math.min(onboardingItems.length - 1, step + 1))}>Далее</button>
            ) : (
              <button className="primaryBtn" onClick={finishOnboarding} disabled={savingOnboarding}>Завершить</button>
            )}
          </div>
        </div>
      </Modal>}
    </div>
  );
}

function LoginPage({ onAuth, notify }) {
  const [role, setRole] = useState('teacher');
  // Determine the initial mode based on the current URL's query params.
  // When `?mode=register` is present, default to the registration screen.
  const [searchParams] = useSearchParams();
  const initialModeParam = searchParams.get('mode');
  const [mode, setMode] = useState(() => initialModeParam === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reg, setReg] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '', parentName: '', parentEmail: '' });
  const [pendingSms, setPendingSms] = useState(null);
  const [smsCode, setSmsCode] = useState('');
  const [working, setWorking] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const doLogin = async () => {
    setWorking(true);
    try {
      const payload = await api.login({ email, role, password });
      onAuth(payload.session);
    } catch (e) {
      notify({ type: 'error', text: e.message });
    } finally { setWorking(false); }
  };

  const doRegister = async () => {
    setWorking(true);
    try {
      const result = await api.register({
        role,
        firstName: reg.firstName,
        lastName: reg.lastName,
        email: reg.email,
        password: reg.password,
        phone: reg.phone,
        parentName: role === 'student' ? reg.parentName : '',
        parentEmail: role === 'student' ? reg.parentEmail : '',
      });
      if (result.requiresSms) {
        setPendingSms({ email: result.email, role: result.role, debugCode: result.debugCode, password: reg.password });
        notify({ type: 'success', text: `SMS-код сгенерирован. Для локального запуска используй код ${result.debugCode}` });
      }
    } catch (e) {
      notify({ type: 'error', text: e.message });
    } finally { setWorking(false); }
  };

  const verifySms = async () => {
    setWorking(true);
    try {
      await api.verifySms({ email: pendingSms.email, role: pendingSms.role, code: smsCode });
      const payload = await api.login({ email: pendingSms.email, role: pendingSms.role, password: pendingSms.password });
      onAuth(payload.session);
    } catch (e) {
      notify({ type: 'error', text: e.message });
    } finally { setWorking(false); }
  };

  return (
    <div className="loginScreen authSplitRefined">
      <section className="hero authShowcase">
        <div className="heroBadge"><Sparkles size={15} /> ПроверьAI</div>
        <h1>Проверка письменных работ без хаоса, лишней рутины и перегруженных интерфейсов.</h1>
        <p>Один аккуратный кабинет для репетиторов, мини-групп и пакетной проверки. AI берет на себя первичную обработку, а преподаватель сохраняет контроль над результатом.</p>
        <div className="authFeatureList">
          <div className="authFeature">Проверка по одному и пакетно</div>
          <div className="authFeature">Рукописные и печатные работы</div>
          <div className="authFeature">Trial 30 дней, затем Free-режим</div>
        </div>
      </section>
      <section className="loginCard authPanel">
        <div className="authPanelHead">
          <div>
            <div className="sectionLabel">Панель входа</div>
            <div className="authTitle">{mode === 'login' ? 'Войти в аккаунт' : 'Создать аккаунт'}</div>
            <div className="muted">Выбери роль и продолжи в нужном кабинете.</div>
          </div>
          <button className="linkButton smallLink" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Зарегистрироваться' : 'Уже есть аккаунт'}
          </button>
        </div>

        <div className="segmented authSwitch mt20">
          <button className={cx(role === 'teacher' && 'active')} onClick={() => setRole('teacher')}><GraduationCap size={16} /> Преподаватель</button>
          <button className={cx(role === 'student' && 'active')} onClick={() => setRole('student')}><Users size={16} /> Ученик</button>
        </div>

        {mode === 'login' ? (
          <div className="stack gap16 mt20">
            <label className="field"><span>Email</span><input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" /></label>
            <label className="field"><span>Пароль</span><input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Пароль" /></label>
            <button className="primaryBtn wide" onClick={doLogin} disabled={working}>Войти</button>
            <button className="linkButton alignStart" onClick={()=>setResetOpen(true)}>Забыл пароль</button>
          </div>
        ) : (
          <div className="stack gap16 mt20">
            <div className="grid twoCol compactAuthGrid">
              <label className="field"><span>Имя</span><input className="input" value={reg.firstName} onChange={e=>setReg(v=>({...v,firstName:e.target.value}))} placeholder="Имя" /></label>
              <label className="field"><span>Фамилия</span><input className="input" value={reg.lastName} onChange={e=>setReg(v=>({...v,lastName:e.target.value}))} placeholder="Фамилия" /></label>
              <label className="field"><span>Email</span><input className="input" value={reg.email} onChange={e=>setReg(v=>({...v,email:e.target.value}))} placeholder="Email" /></label>
              <label className="field"><span>Телефон</span><input className="input" value={reg.phone} onChange={e=>setReg(v=>({...v,phone:e.target.value}))} placeholder="Телефон" /></label>
              <label className="field"><span>Пароль</span><input className="input" type="password" value={reg.password} onChange={e=>setReg(v=>({...v,password:e.target.value}))} placeholder="Пароль" /></label>
              {role === 'student' && <label className="field"><span>Имя родителя</span><input className="input" value={reg.parentName} onChange={e=>setReg(v=>({...v,parentName:e.target.value}))} placeholder="Опционально" /></label>}
              {role === 'student' && <label className="field"><span>Email родителя (необязательно)</span><input className="input" type="email" value={reg.parentEmail} onChange={e=>setReg(v=>({...v,parentEmail:e.target.value}))} placeholder="parent@example.com" /></label>}
            </div>
            <button className="primaryBtn wide" onClick={doRegister} disabled={working}>Создать аккаунт</button>
          </div>
        )}

        {pendingSms && <div className="mt20 cardInner"><div className="cardTitle">Подтверди аккаунт по SMS</div><div className="muted small mt8">Код отправлен на номер из регистрации. Для локального запуска используй код {pendingSms.debugCode}</div><div className="row gap8 mt12"><input className="input" value={smsCode} onChange={e=>setSmsCode(e.target.value)} placeholder="Введите код" /><button className="primaryBtn" onClick={verifySms} disabled={working}>Подтвердить</button></div></div>}
      </section>
      {resetOpen && <ForgotPasswordModal role={role} onClose={()=>setResetOpen(false)} notify={notify} setEmail={setEmail} setPassword={setPassword} setMode={setMode} />}
    </div>
  );
}

function ForgotPasswordModal({ role, onClose, notify, setEmail, setPassword, setMode }) {
  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [debugCode, setDebugCode] = useState('');
  const [done, setDone] = useState(false);
  const [working, setWorking] = useState(false);

  const requestCode = async () => {
    setWorking(true);
    try {
      const result = await api.requestReset({ role, identifier });
      setDebugCode(result.debugCode);
      notify({ type: 'success', text: `Код восстановления создан. Для локального запуска используй код ${result.debugCode}` });
      setStep(2);
    } catch (e) {
      notify({ type: 'error', text: e.message });
    } finally { setWorking(false); }
  };
  const verifyCode = async () => {
    setWorking(true);
    try {
      await api.verifyReset({ role, identifier, code });
      setStep(3);
    } catch (e) {
      notify({ type: 'error', text: e.message });
    } finally { setWorking(false); }
  };
  const complete = async () => {
    setWorking(true);
    try {
      await api.completeReset({ role, identifier, code, password: newPassword });
      setDone(true);
      setEmail(identifier.includes('@') ? identifier : '');
      setPassword(newPassword);
      setMode('login');
      notify({ type: 'success', text: 'Пароль обновлен.' });
    } catch (e) {
      notify({ type: 'error', text: e.message });
    } finally { setWorking(false); }
  };

  return <Modal title="Восстановление доступа" onClose={onClose}>
    {step === 1 && <div className="stack gap16"><p className="muted">Введи email или телефон для отправки кода восстановления.</p><input className="input" value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="Email или телефон" /><div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Отмена</button><button className="primaryBtn" onClick={requestCode} disabled={!identifier || working}>Отправить код</button></div></div>}
    {step === 2 && <div className="stack gap16"><p className="muted">Введи код из SMS/email. Для локального запуска debug-код: {debugCode}</p><input className="input" value={code} onChange={e=>setCode(e.target.value)} placeholder="Код подтверждения" /><div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Отмена</button><button className="primaryBtn" onClick={verifyCode} disabled={!code || working}>Подтвердить код</button></div></div>}
    {step === 3 && <div className="stack gap16"><p className="muted">Придумай новый пароль и сохрани его.</p><input className="input" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Новый пароль" /><div className="modalActions">{done && <button className="secondaryBtn" onClick={onClose}>Войти</button>}<button className="primaryBtn" onClick={complete} disabled={!newPassword || working}>Сохранить пароль</button></div></div>}
  </Modal>;
}

function EmptyOnboarding({ role, title, text, actions = [] }) {
  return (
    <Card title={title} subtitle={text}>
      <div className="stack gap12">
        <div className="grid threeCol onboardingGrid">
          {onboardingVariants[role].map(item => (
            <div key={item.title} className="infoBox onboardingItem">
              <div className="infoLabel">{item.title}</div>
              <div className="muted small mt8">{item.text}</div>
            </div>
          ))}
        </div>
        {!!actions.length && <div className="row wrap gap10">{actions}</div>}
      </div>
    </Card>
  );
}

function TeacherDashboard({ db, session, navigate }) {
  const [widgets, setWidgets] = useState({ totalStudents: true, topErrors: true, errorTypes: true });
  const [showSettings, setShowSettings] = useState(false);
  const [topFilters, setTopFilters] = useState({ subject: 'all', period: 'all', studentId: 'all', groupId: 'all' });
  const [typeFilters, setTypeFilters] = useState({ subject: 'all', period: 'all', studentId: 'all', groupId: 'all' });
  const teacherId = session.userId;

  const activeStudents = teacherOwnedStudents(db, teacherId);
  const activeGroups = teacherOwnedGroups(db, teacherId);
  const pendingWorks = teacherOwnedWorks(db, teacherId).filter(item => item.status === 'Ожидает подтверждения');
  const events = buildErrorEvents(db, teacherId);
  const topErrors = aggregateErrors(events, topFilters, false);
  const topTypes = aggregateErrors(events, typeFilters, true);
  const riskStudents = teacherRiskStudents(db, teacherId).slice(0, 5);
  const isNewTeacher = !activeStudents.length && !activeGroups.length && !pendingWorks.length;

  return (
    <div className="stack gap24">
      <div className="row between wrap gap16">
        <div>
          <h2 className="pageTitle">Добро пожаловать, {session.userName}</h2>
          <p className="muted maxw">Дашборд показывает только ваших учеников, группы, очередь проверки и сигналы по ошибкам.</p>
        </div>
        <button className="secondaryBtn" onClick={() => setShowSettings(true)}><Settings size={16} /> Настроить дашборд</button>
      </div>

      <div className="grid kpiGrid fourNoOverdue">
        <KPI title="Активные ученики" value={activeStudents.length} onClick={() => navigate('/teacher/students')} />
        <KPI title="Группы" value={activeGroups.length} onClick={() => navigate('/teacher/groups')} />
        <KPI title="Ждут проверки" value={pendingWorks.length} onClick={() => navigate('/teacher/grading')} />
        {widgets.totalStudents && <KPI title="Всего учеников" value={teacherHistoricalStudentsCount(db, teacherId)} />}
      </div>

      {isNewTeacher && (
        <EmptyOnboarding
          role="teacher"
          title="Новый аккаунт готов к настройке"
          text="Пока здесь нет учеников, групп и работ. Начните с первых шагов, чтобы заполнить кабинет реальными данными."
          actions={[
            <button key="profile" className="secondaryBtn" onClick={() => navigate('/teacher/settings')}>Открыть настройки</button>,
            <button key="students" className="primaryBtn" onClick={() => navigate('/teacher/students')}>Открыть учеников</button>,
          ]}
        />
      )}

      <div className="grid twoCol">
        {widgets.topErrors && (
          <Card title="Топ-5 самых распространенных ошибок" subtitle="Данные появятся после первых проверенных работ.">
            <FilterRow filters={topFilters} setFilters={setTopFilters} db={db} includeAllTime teacherId={teacherId} />
            <ChartBar data={topErrors.map(item => ({ name: item.name, value: item.value }))} />
          </Card>
        )}
        {widgets.errorTypes && (
          <Card title="Самые частые типы ошибок" subtitle="Статистика строится только по работам ваших учеников.">
            <FilterRow filters={typeFilters} setFilters={setTypeFilters} db={db} includeAllTime teacherId={teacherId} />
            <ChartBar data={topTypes.map(item => ({ name: item.name, value: item.value }))} horizontal />
          </Card>
        )}
      </div>

      <Card title="Ученики из зоны риска" subtitle="Список формируется автоматически, когда по ученикам появляются первые работы.">
        <div className="stack gap12">
          {riskStudents.length ? riskStudents.map(item => <div key={item.id} className="riskRow"><div><div>{item.name}</div><div className="muted small">{item.factors.join(' · ')}</div></div><span className={cx('pill', item.riskScore >= 3 ? 'danger' : 'warn')}>Риск {item.riskScore}</span></div>) : <div className="empty">Недостаточно данных.</div>}
        </div>
      </Card>

      {showSettings && <Modal title="Настройка дашборда" onClose={() => setShowSettings(false)}>
        <CheckSetting label="Всего учеников" checked={widgets.totalStudents} onChange={() => setWidgets(v => ({ ...v, totalStudents: !v.totalStudents }))} />
        <CheckSetting label="Топ ошибок" checked={widgets.topErrors} onChange={() => setWidgets(v => ({ ...v, topErrors: !v.topErrors }))} />
        <CheckSetting label="Типы ошибок" checked={widgets.errorTypes} onChange={() => setWidgets(v => ({ ...v, errorTypes: !v.errorTypes }))} />
      </Modal>}
    </div>
  );
}

function TeacherStudentsPage({ db, reload, navigate, notify, session }) {
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryResults, setDirectoryResults] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [inviteLink, setInviteLink] = useState('');
  const [detachingStudent, setDetachingStudent] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const teacherId = session.userId;

  useEffect(() => {
    const sid = searchParams.get('student');
    if (sid) setSelectedId(sid);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    if (directoryQuery.trim().length < 2) {
      setDirectoryResults([]);
      return () => {
        active = false;
      };
    }
    api.searchStudents(teacherId, directoryQuery).then(result => {
      if (active) setDirectoryResults(result);
    }).catch(error => {
      if (active) notify({ type: 'error', text: error.message });
    });
    return () => {
      active = false;
    };
  }, [directoryQuery, teacherId, notify]);

  const ownedStudents = teacherOwnedStudents(db, teacherId);
  const invites = teacherInvitesFor(db, teacherId).filter(invite => invite.direction === 'student_to_teacher').map(invite => ({ ...invite, student: db.students.find(item => item.id === invite.studentId) })).filter(item => item.student && item.status === 'pending');
  const outgoingInvites = (db.teacherInvites || []).filter(invite => invite.teacherId === teacherId && invite.direction === 'teacher_to_student' && invite.status === 'pending');
  const selected = ownedStudents.find(item => item.id === selectedId) || ownedStudents[0] || null;
  const selectedWorks = selected ? db.works.filter(w => w.studentId === selected.id && w.teacherId === teacherId) : [];
  const pendingWorks = selected ? selectedWorks.filter(w => w.status !== 'Проверено') : [];
  const displaySlots = selected ? effectiveStudentSlots(db, selected) : [];
  const inviteStateForStudent = (studentId) => {
    if (ownedStudents.some(student => student.id === studentId)) return 'attached';
    if (outgoingInvites.some(invite => invite.studentId === studentId)) return 'pending';
    return 'available';
  };

  return (
    <div className="stack gap24">
      <div className="row between wrap gap16">
        <div>
          <h2 className="pageTitle">Ученики</h2>
          <p className="muted">Здесь остаются только ваши прикрепленные ученики, а поиск по базе работает отдельным сценарием и не заменяет основной список.</p>
        </div>
        <div className="row gap8 wrap">
          <button className="primaryBtn accentPrimaryBtn" onClick={async () => {
            try {
              const invite = await api.createTeacherInvite({ teacherId, direction: 'teacher_to_student' });
              setInviteLink(`${window.location.origin}/student/tutors?invite=${invite.token}`);
              notify({ type: 'success', text: 'Ссылка-приглашение создана.' });
            } catch (e) {
              notify({ type: 'error', text: e.message });
            }
          }}><ArrowRight size={16} /> Ссылка приглашение</button>
          <button className="ghostBtn" onClick={() => setShowAdd(true)}><Plus size={16} /> Добавить виртуального ученика</button>
        </div>
      </div>

      {inviteLink && (
        <Card title="Одноразовая ссылка-приглашение" subtitle="Ее можно отправить ученику. После принятия связь появится только в вашем контуре данных.">
          <div className="row gap8 wrap">
            <input className="input grow" value={inviteLink} readOnly />
            <button className="secondaryBtn" onClick={async () => {
              try {
                await navigator.clipboard.writeText(inviteLink);
                notify({ type: 'success', text: 'Ссылка скопирована.' });
              } catch {
                notify({ type: 'error', text: 'Не удалось скопировать ссылку.' });
              }
            }}>Скопировать</button>
          </div>
        </Card>
      )}

      <Card title="Поиск по имени или email" subtitle="Ищет только зарегистрированных реальных учеников базы. Виртуальные ученики сюда не попадают.">
        <div className="toolbar">
          <Search size={16} />
          <input className="toolbarInput" value={directoryQuery} onChange={e => setDirectoryQuery(e.target.value)} placeholder="Поиск по имени или email" />
        </div>
        {directoryQuery.trim().length < 2 ? (
          <div className="muted small mt12">Введите минимум 2 символа, чтобы найти ученика и отправить стандартное приглашение.</div>
        ) : (
          <div className="stack gap12 mt16">
            {directoryResults.length ? directoryResults.map(student => {
              const inviteState = inviteStateForStudent(student.id);
              return (
                <div key={student.id} className="listCard polished">
                  <div className="row between wrap gap16">
                    <div className="stack gap6">
                      <div className="cardTitle">{student.name}</div>
                      <div className="muted small">{student.email || 'Email не указан'}</div>
                      <div className="muted small">{student.phone || 'Телефон не указан'}</div>
                    </div>
                    <div className="row wrap gap8">
                      {inviteState === 'attached' ? (
                        <span className="searchSuccess"><CheckSquare size={16} /> Уже прикреплен</span>
                      ) : inviteState === 'pending' ? (
                        <span className="pill info">Приглашение отправлено</span>
                      ) : (
                        <button className="primaryBtn" onClick={async () => {
                          try {
                            await api.createTeacherInvite({ teacherId, studentId: student.id, direction: 'teacher_to_student' });
                            await reload();
                            notify({ type: 'success', text: 'Приглашение ученику отправлено.' });
                          } catch (e) {
                            notify({ type: 'error', text: e.message });
                          }
                        }}>Пригласить</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }) : <div className="empty">По этому запросу зарегистрированные ученики не найдены.</div>}
          </div>
        )}
      </Card>

      {!!invites.length && (
        <Card title="Приглашенные" subtitle="Ученики, которые отправили вам запрос на подключение.">
          <div className="stack gap12">
            {invites.map(item => (
              <div key={item.id} className="listCard polished">
                <div className="row between wrap gap16">
                  <div>
                    <div className="cardTitle">{item.student.name}</div>
                    <div className="muted small mt6">{item.student.email || 'Почта не указана'}</div>
                  </div>
                  <div className="row wrap gap8">
                    <button className="secondaryBtn" onClick={async () => {
                      await api.updateTeacherInvite(item.id, { status: 'declined' });
                      await reload();
                      notify({ type: 'success', text: 'Запрос отклонен.' });
                    }}>Отклонить</button>
                    <button className="primaryBtn" onClick={async () => {
                      await api.updateTeacherInvite(item.id, { status: 'accepted' });
                      await reload();
                      notify({ type: 'success', text: 'Ученик добавлен в ваш список.' });
                    }}>Принять</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid onePlusSide alignedTop">
        <div className="stack gap14">
          {ownedStudents.map(student => (
            <button key={student.id} className={cx('studentCard polished elegantStudentCard', selected?.id === student.id && 'active')} onClick={() => { setSelectedId(student.id); setSearchParams({ student: student.id }); }}>
              <div className="row between gap12 wrap alignStart">
                <div className="stack gap6">
                  <div className="studentNameSerifless">{student.name}</div>
                  <div className="studentMetaLine">{student.email || 'Email не указан'}{student.phone ? ` · ${student.phone}` : ''}</div>
                  {student.virtual && <span className="pill warn fit">Виртуальный ученик</span>}
                </div>
                <div className="scoreChip">Score {db.computed.studentScores[student.id] || 0}</div>
              </div>
            </button>
          ))}
          {!ownedStudents.length && <div className="empty">У вас пока нет учеников. Добавьте виртуального ученика, отправьте ссылку-приглашение или примите входящий запрос.</div>}
        </div>

        <div>
          {selected ? (
            <Card title={selected.name} subtitle={selected.email || 'Email не указан'} actions={<div className="row gap8 wrap"><button className="iconGhost" onClick={() => setEditing(selected)}><Pencil size={16} /></button><button className="secondaryBtn dangerOutline" onClick={() => setDetachingStudent(selected)}>Удалить аккаунт</button></div>}>
              <div className="grid detailGrid betterDetails refinedInfoGrid">
                <InfoBox label="Email родителя" value={selected.parentEmail || '—'} secondary={selected.parentName || 'Имя родителя не указано'} />
                <InfoBox label="Score" value={String(db.computed.studentScores[selected.id] || 0)} />
                <button className="infoBox clickable accentBox" onClick={() => pendingWorks.length ? navigate(`/teacher/grading?tab=queue&student=${selected.id}`) : notify({ type: 'error', text: 'Нет работ для проверки.' })}>
                  <div className="infoLabel">Работы для проверки</div>
                  <div className="infoValue">{pendingWorks.length}</div>
                  <div className="muted small">Открыть только работы этого ученика</div>
                </button>
              </div>
              {selected.virtual && <div className="cardInner mt16">При добавлении виртуального ученика вы получаете полный рабочий контур преподавателя, но решения он сам прикреплять не сможет, пока не появится реальный аккаунт.</div>}
              <div className="sectionLabel mt20">Занятия</div>
              <div className="chipWrap mt8">{displaySlots.length ? displaySlots.map(slot => <span key={slot.id + (slot.sourceGroupId || '')} className={cx('chip', slot.inherited && 'chipInherited')}>{slot.day} {slot.time} · {slot.durationHours || 0} ч {slot.durationMinutes || 0} мин{slot.inherited ? ` · из группы ${slot.sourceGroupName}` : ''}</span>) : <span className="muted small">Слоты еще не заданы.</span>}</div>
            </Card>
          ) : <EmptyOnboarding role="teacher" title="Список учеников пока пуст" text="Когда вы добавите ученика или примете приглашение, здесь появится карточка с профилем, работами и слотами." />}
        </div>
      </div>

      {showAdd && <StudentModal mode="create" db={db} notify={notify} onClose={() => setShowAdd(false)} onSave={async(payload) => { try { await api.createStudent({ ...payload, teacherId }); await reload(); setShowAdd(false); notify({ type: 'success', text: 'Виртуальный ученик добавлен.' }); } catch (e) { notify({ type: 'error', text: e.message }); } }} />}
      {editing && <StudentModal mode="edit" db={db} student={editing} notify={notify} onClose={() => setEditing(null)} onSave={async(payload) => { try { await api.updateStudent(editing.id, { ...payload, teacherId }); await reload(); setEditing(null); notify({ type: 'success', text: 'Изменения ученика сохранены.' }); } catch (e) { notify({ type: 'error', text: e.message }); } }} />}
      {detachingStudent && <Modal title="Удалить аккаунт" onClose={() => setDetachingStudent(null)}>
        <div className="stack gap16">
          <p className="muted">Мы удалим только связь между вами и учеником. Аккаунт ученика останется в системе, а повторное подключение будет возможно позже.</p>
          <div className="modalActions">
            <button className="secondaryBtn" onClick={() => setDetachingStudent(null)}>Отмена</button>
            <button className="primaryBtn" onClick={async () => {
              try {
                await api.detachTeacherStudent(teacherId, detachingStudent.id);
                await reload();
                setSelectedId(null);
                setSearchParams({});
                setDetachingStudent(null);
                notify({ type: 'success', text: 'Связь с учеником удалена.' });
              } catch (e) {
                notify({ type: 'error', text: e.message });
              }
            }}>Подтвердить</button>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

function StudentModal({ mode, db, student, onClose, onSave, notify }) {
  const [form, setForm] = useState(() => ({
    name: student?.name || '',
    email: student?.email || '',
    phone: student?.phone || '',
    parentName: student?.parentName || '',
    parentEmail: student?.parentEmail || student?.parentContact || '',
    level: student?.level || '',
  }));
  const [slotDraft, setSlotDraft] = useState({ day: 'ПН', time: '10:00', durationHours: 1, durationMinutes: 0 });
  const [slots, setSlots] = useState(student?.lessonSlots || []);
  const [slotError, setSlotError] = useState('');
  const [showSlotEditor, setShowSlotEditor] = useState(false);
  const isCreate = mode === 'create';

  const hasExternalConflict = (candidate) => {
    const start = timeToMinutes(candidate.time);
    const end = start + Number(candidate.durationHours || 0) * 60 + Number(candidate.durationMinutes || 0);
    return db.students.some(other => {
      if (!other.active) return false;
      if (student && other.id === student.id) return false;
      return effectiveStudentSlots(db, other).some(slot => {
        if (candidate.day !== slot.day) return false;
        const slotStart = timeToMinutes(slot.time);
        const slotEnd = slotStart + Number(slot.durationHours || 0) * 60 + Number(slot.durationMinutes || 0);
        return start < slotEnd && slotStart < end;
      });
    }) || db.groups.some(group => group.active && (!student || !group.studentIds?.includes(student.id)) && (group.lessonSlots || []).some(slot => {
      if (candidate.day !== slot.day) return false;
      const slotStart = timeToMinutes(slot.time);
      const slotEnd = slotStart + Number(slot.durationHours || 0) * 60 + Number(slot.durationMinutes || 0);
      return start < slotEnd && slotStart < end;
    }));
  };
  const hasLocalDuplicate = (candidate, ignoreId = null) => slots.some(slot => slot.id !== ignoreId && slot.day === candidate.day && slot.time === candidate.time);

  const addSlot = () => {
    const candidate = { id: `tmp-${Date.now()}`, ...slotDraft, durationHours: Number(slotDraft.durationHours || 0), durationMinutes: Number(slotDraft.durationMinutes || 0) };
    if (hasLocalDuplicate(candidate)) {
      setSlotError('Такой слот уже добавлен в эту карточку. Выбери другое время начала.');
      return;
    }
    if (hasExternalConflict(candidate)) {
      setSlotError('Этот слот уже занят. Сохранить ученика нельзя, пока конфликт не устранен.');
      return;
    }
    setSlots(prev => [...prev, candidate]);
    setSlotError('');
    setShowSlotEditor(false);
  };

  const submit = () => {
    if (!String(form.name || '').trim()) {
      setSlotError('Имя обязательно для сохранения виртуального ученика.');
      return;
    }
    if (slots.some(slot => hasLocalDuplicate(slot, slot.id) || hasExternalConflict(slot))) {
      setSlotError('Есть конфликтующие или дублирующиеся слоты. Сохранение недоступно.');
      return;
    }
    onSave({
      name: form.name,
      email: form.email,
      phone: form.phone,
      parentName: isCreate ? '' : form.parentName,
      parentEmail: form.parentEmail,
      level: isCreate ? '' : form.level,
      lessonSlots: isCreate ? [] : slots.map(slot => ({ ...slot, durationHours: Number(slot.durationHours || 0), durationMinutes: Number(slot.durationMinutes || 0) })),
    });
  };

  return <Modal title={isCreate ? 'Добавить виртуального ученика' : 'Редактировать ученика'} onClose={onClose} wide>
    {isCreate && <div className="cardInner mb16">При добавлении виртуального ученика вы получите идентичный функционал (аналитика, авто-отчеты, проверка работ), но ученик не сможет самостоятельно прикреплять решение.</div>}
    <div className="grid twoCol">
      <label className="field"><span>{isCreate ? 'Имя (обязательно)' : 'Имя'}</span><input className="input" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} /></label>
      <label className="field"><span>{isCreate ? 'Email ученика (необязательно)' : 'Email ученика'}</span><input className="input" type="email" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))} /></label>
      <label className="field"><span>{isCreate ? 'Телефон ученика (необязательно)' : 'Телефон ученика'}</span><input className="input" value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))} /></label>
      <label className="field"><span>{isCreate ? 'Email родителя (необязательно)' : 'Email родителя'}</span><input className="input" type="email" value={form.parentEmail} onChange={e=>setForm(v=>({...v,parentEmail:e.target.value}))} placeholder="parent@example.com" /></label>
      {!isCreate && <label className="field"><span>Имя родителя</span><input className="input" value={form.parentName} onChange={e=>setForm(v=>({...v,parentName:e.target.value}))} placeholder="Опционально" /></label>}
      {!isCreate && <label className="field"><span>Уровень</span><input className="input" value={form.level} onChange={e=>setForm(v=>({...v,level:e.target.value}))} /></label>}
    </div>
    {!isCreate && <>
      <div className="sectionLabel mt20">Слоты занятий (необязательно)</div>
      {!showSlotEditor && <button className="secondaryBtn mt12" onClick={()=>setShowSlotEditor(true)}><Plus size={16} /> Добавить слот</button>}
      {showSlotEditor && <div className="slotHintCard mt12">
        <div className="slotHintLabel">День недели</div>
        <div className="slotHintLabel">Время начала (HH:MM)</div>
        <div className="slotHintLabel">Часы</div>
        <div className="slotHintLabel">Минуты</div>
        <div></div>
        <select className="input selectSmall" value={slotDraft.day} onChange={e=>setSlotDraft(v=>({...v,day:e.target.value}))}>{['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'].map(day=><option key={day}>{day}</option>)}</select>
        <input className="input selectSmall" type="time" value={slotDraft.time} onChange={e=>setSlotDraft(v=>({...v,time:e.target.value}))} />
        <input className="input selectSmall" type="number" min="0" value={slotDraft.durationHours} onChange={e=>setSlotDraft(v=>({...v,durationHours:e.target.value}))} placeholder="0" />
        <input className="input selectSmall" type="number" min="0" max="59" value={slotDraft.durationMinutes} onChange={e=>setSlotDraft(v=>({...v,durationMinutes:e.target.value}))} placeholder="0" />
        <div className="row gap8"><button className="secondaryBtn" onClick={addSlot}>Добавить слот</button><button className="ghostBtn" onClick={()=>{setShowSlotEditor(false); setSlotError('');}}>Скрыть</button></div>
      </div>}
    </>}
    {slotError && <div className="pill danger mt12">{slotError}</div>}
    {!isCreate && !!slots.length && <div className="stack gap8 mt16">{slots.map(slot => <div key={slot.id} className={cx('listRow', (hasLocalDuplicate(slot, slot.id) || hasExternalConflict(slot)) && 'conflictRow')}><span>{slot.day} {slot.time} · {slot.durationHours || 0} ч {slot.durationMinutes || 0} мин</span><button className="iconGhost" onClick={()=>setSlots(prev=>prev.filter(s=>s.id!==slot.id))}><Trash2 size={14}/></button></div>)}</div>}
    {isCreate && <div className="muted small mt16">В будущем вы сможете объединить с аккаунтом реального ученика.</div>}
    <div className="modalActions"><button className="primaryBtn" onClick={submit}>{isCreate ? 'Сохранить виртуального ученика' : 'Сохранить ученика'}</button></div>
  </Modal>;
}


function TeacherGroupsPage({ db, reload, navigate, notify, session }) {
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const teacherId = session.userId;
  const activeGroups = teacherOwnedGroups(db, teacherId);

  return <div className="stack gap24">
    <div className="row between wrap gap16"><div><h2 className="pageTitle">Группы</h2><p className="muted">Карточки групп собраны аккуратно: состав, темы риска, слоты и быстрые действия без визуального шума.</p></div><button className="primaryBtn" onClick={()=>setShowCreate(true)}><Plus size={16}/> Добавить группу</button></div>
    <div className="grid twoCol">
      {activeGroups.map(group => (
        <Card key={group.id} title={group.name} subtitle={group.subject} actions={<div className="row gap8"><button className="iconGhost" onClick={()=>setEditing(group)}><Pencil size={16}/></button><button className="iconGhost danger" onClick={async()=>{await api.archiveGroup(group.id); await reload(); notify({type:'success',text:'Группа удалена из активных процессов.'});}}><Trash2 size={16}/></button></div>}>
          <div className="grid smallGrid betterGroupStats polishedGroupStats">
            <InfoBox label="Средний Score" value={String(db.computed.groupScores[group.id] || 0)} />
            <InfoBox label="Темы риска" value={(group.riskTopics || []).join(', ') || '—'} />
          </div>
          {!!group.lessonSlots?.length && <><div className="sectionLabel mt20">Слоты группы</div><div className="chipWrap mt8">{group.lessonSlots.map(slot => <span key={slot.id} className="chip">{slot.day} {slot.time} · {slot.durationHours || 0} ч {slot.durationMinutes || 0} мин</span>)}</div></>}
          <div className="sectionLabel mt20">Состав</div>
          <div className="chipWrap mt8">{group.studentIds.map(id => { const student = db.students.find(s=>s.id===id && s.active); return student ? <button key={id} className="chip chipButton" onClick={()=>navigate(`/teacher/students?student=${id}`)}>{student.name}</button> : null; })}</div>
        </Card>
      ))}
    </div>
    {!activeGroups.length && <EmptyOnboarding role="teacher" title="Группы пока не созданы" text="Создайте мини-группу, когда у вас появятся первые ученики с общим предметом и расписанием." />}
    {showCreate && (
      <GroupModal
        db={db}
        teacherId={teacherId}
        onClose={()=>setShowCreate(false)}
        onSave={async(payload)=>{
          try {
            await api.createGroup(payload);
            await reload();
            setShowCreate(false);
            notify({type:'success',text:'Группа создана.'});
          } catch (e) {
            notify({type:'error',text:e.message});
          }
        }}
      />
    )}
    {editing && (
      <GroupModal
        group={editing}
        db={db}
        teacherId={teacherId}
        onClose={()=>setEditing(null)}
        onSave={async(payload)=>{
          try {
            await api.updateGroup(editing.id,payload);
            await reload();
            setEditing(null);
            notify({type:'success',text:'Изменения группы сохранены.'});
          } catch (e) {
            notify({type:'error',text:e.message});
          }
        }}
      />
    )}
  </div>;
}


function GroupModal({ group, db, onClose, onSave, teacherId }) {
  const availableStudents = teacherOwnedStudents(db, teacherId);
  const [form, setForm] = useState({ name: group?.name || '', subject: group?.subject || 'Математика', riskTopics: (group?.riskTopics || []).join(', '), studentIds: group?.studentIds || [], lessonSlots: group?.lessonSlots || [] });
  const [slotDraft, setSlotDraft] = useState({ day: 'ПН', time: '10:00', durationHours: 1, durationMinutes: 0 });
  const [slotError, setSlotError] = useState('');
  const [showSlotEditor, setShowSlotEditor] = useState(false);

  const hasExternalConflict = (candidate) => {
    const start = timeToMinutes(candidate.time);
    const end = start + Number(candidate.durationHours || 0) * 60 + Number(candidate.durationMinutes || 0);
    return db.students.some(other => {
      if (!other.active) return false;
      if (group && form.studentIds.includes(other.id)) return false;
      return effectiveStudentSlots(db, other).some(slot => {
        if (candidate.day !== slot.day) return false;
        const slotStart = timeToMinutes(slot.time);
        const slotEnd = slotStart + Number(slot.durationHours || 0) * 60 + Number(slot.durationMinutes || 0);
        return start < slotEnd && slotStart < end;
      });
    });
  };
  const hasLocalDuplicate = (candidate, ignoreId = null) => (form.lessonSlots || []).some(slot => slot.id !== ignoreId && slot.day === candidate.day && slot.time === candidate.time);

  const addSlot = () => {
    const candidate = { id: `gslot-${Date.now()}`, ...slotDraft, durationHours: Number(slotDraft.durationHours || 0), durationMinutes: Number(slotDraft.durationMinutes || 0) };
    if (hasLocalDuplicate(candidate)) { setSlotError('Такой слот уже добавлен в эту группу. Выбери другое время начала.'); return; }
    if (hasExternalConflict(candidate)) { setSlotError('Этот временной слот уже занят.'); return; }
    setForm(v=>({...v, lessonSlots:[...(v.lessonSlots||[]), candidate]}));
    setSlotError('');
    setShowSlotEditor(false);
  };

  return <Modal title={group ? 'Редактировать группу' : 'Добавить группу'} onClose={onClose} wide>
    <div className="grid twoCol">
      <label className="field"><span>Название</span><input className="input" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} /></label>
      <label className="field"><span>Предмет</span><select className="input" value={form.subject} onChange={e=>setForm(v=>({...v,subject:e.target.value}))}>{['Математика','Физика','Химия'].map(s=><option key={s}>{s}</option>)}</select></label>
      <label className="field full"><span>Темы риска (через запятую)</span><input className="input" value={form.riskTopics} onChange={e=>setForm(v=>({...v,riskTopics:e.target.value}))} /></label>
    </div>
    <div className="sectionLabel mt20">Ученики группы</div>
    <div className="checkboxGrid mt12">{availableStudents.length ? availableStudents.map(student => <label key={student.id} className="checkRow"><input type="checkbox" checked={form.studentIds.includes(student.id)} onChange={e=>setForm(v=>({...v,studentIds:e.target.checked?[...v.studentIds, student.id]:v.studentIds.filter(id=>id!==student.id)}))} /><span>{student.name}</span></label>) : <div className="empty">Сначала добавьте учеников в свой список.</div>}</div>
    <div className="sectionLabel mt20">Слоты группы (необязательно)</div>
    {!showSlotEditor && <button className="secondaryBtn mt12" onClick={()=>setShowSlotEditor(true)}><Plus size={16} /> Добавить слот</button>}
    {showSlotEditor && <div className="slotHintCard mt12">
      <div className="slotHintLabel">День недели</div><div className="slotHintLabel">Время начала (HH:MM)</div><div className="slotHintLabel">Часы</div><div className="slotHintLabel">Минуты</div><div></div>
      <select className="input selectSmall" value={slotDraft.day} onChange={e=>setSlotDraft(v=>({...v,day:e.target.value}))}>{['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'].map(day=><option key={day}>{day}</option>)}</select>
      <input className="input selectSmall" type="time" value={slotDraft.time} onChange={e=>setSlotDraft(v=>({...v,time:e.target.value}))} />
      <input className="input selectSmall" type="number" min="0" value={slotDraft.durationHours} onChange={e=>setSlotDraft(v=>({...v,durationHours:e.target.value}))} />
      <input className="input selectSmall" type="number" min="0" max="59" value={slotDraft.durationMinutes} onChange={e=>setSlotDraft(v=>({...v,durationMinutes:e.target.value}))} />
      <div className="row gap8"><button className="secondaryBtn" onClick={addSlot}>Добавить слот</button><button className="ghostBtn" onClick={()=>{setShowSlotEditor(false); setSlotError('');}}>Скрыть</button></div>
    </div>}
    {slotError && <div className="pill danger mt12">{slotError}</div>}
    {!!form.lessonSlots?.length && <div className="stack gap8 mt16">{form.lessonSlots.map(slot => <div key={slot.id} className={cx('listRow', (hasLocalDuplicate(slot, slot.id) || hasExternalConflict(slot)) && 'conflictRow')}><span>{slot.day} {slot.time} · {slot.durationHours || 0} ч {slot.durationMinutes || 0} мин</span><button className="iconGhost" onClick={()=>setForm(v=>({...v, lessonSlots:v.lessonSlots.filter(s=>s.id!==slot.id)}))}><Trash2 size={14}/></button></div>)}</div>}
    <div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Отмена</button><button className="primaryBtn" onClick={()=>onSave({ name: form.name, subject: form.subject, studentIds: [...new Set(form.studentIds)], lessonSlots: form.lessonSlots || [], riskTopics: form.riskTopics.split(',').map(v=>v.trim()).filter(Boolean), teacherId })}>Сохранить</button></div>
  </Modal>;
}


function TeacherAssignmentsPage({ db, reload, notify, session }) {
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('all');
  const [status, setStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const teacherId = session.userId;

  const filtered = teacherOwnedAssignments(db, teacherId).filter(a => (subject === 'all' || a.subject === subject) && (status === 'all' || a.status === status) && a.title.toLowerCase().includes(search.toLowerCase()));

  return <div className="stack gap24">
    <div className="row between wrap gap16"><div><h2 className="pageTitle">Задания</h2><p className="muted">Карточка задания открывает полноценное редактирование. Для вложений поддерживаются одновременно фото и файлы, в том числе множественные.</p></div><button className="primaryBtn" onClick={()=>setShowCreate(true)}><Plus size={16}/> Создать задание</button></div>
    <div className="row gap12 wrap alignCenter">
      <div className="toolbar grow"><Search size={16} /><input className="toolbarInput" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по названию задания" /></div>
      <label className="field compactField"><span>Предмет</span><select className="input selectSmall" value={subject} onChange={e=>setSubject(e.target.value)}><option value="all">Все предметы</option>{SUBJECT_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="field compactField"><span>Статус</span><select className="input selectSmall" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Все статусы</option>{['Активно','Завершено','Черновик'].map(item => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>
    <div className="stack gap12">{filtered.map(item => { const recipient = recipientLabel(db, item); return <button key={item.id} className="assignmentCard polished" onClick={()=>setEditing(item)}><div className="row between wrap gap16"><div><div className="cardTitle">{item.title}</div><div className="muted small mt6">{item.subject} · Получатель: {recipient}</div><div className="muted small mt6">{item.description}</div></div><div className="stack gap8 rightAlign"><span className={pillClass[item.status]}>{item.status}</span>{item.deadline && <span className="muted small">{item.deadline}</span>}</div></div></button>; })}</div>
    {!filtered.length && <div className="empty">Пока нет заданий. Создайте первое задание для ученика или группы.</div>}
    {showCreate && <AssignmentModal mode="create" db={db} notify={notify} teacherId={teacherId} onClose={()=>setShowCreate(false)} onSave={async(payload, draftAction)=>{ try { await api.createAssignment(payload); await reload(); setShowCreate(false); notify({type:'success',text: draftAction === 'publish' ? 'Задание опубликовано.' : 'Черновик сохранен.'}); } catch (e) { notify({type:'error',text:e.message}); } }} />}
    {editing && <AssignmentModal mode="edit" db={db} assignment={editing} notify={notify} teacherId={teacherId} onClose={()=>setEditing(null)} onSave={async(payload, draftAction)=>{ try { if (draftAction === 'publish') { await api.publishDraft(editing.id, payload); notify({type:'success',text:'Черновик опубликован.'}); } else if (draftAction === 'delete') { await api.deleteAssignment(editing.id); notify({type:'success',text:'Черновик удален.'}); } else { await api.updateAssignment(editing.id, payload); notify({type:'success',text:'Карточка задания сохранена.'}); } await reload(); setEditing(null); } catch (e) { notify({type:'error',text:e.message}); } }} />}
  </div>;
}

function AssignmentModal({ mode, db, assignment, onClose, onSave, notify, teacherId }) {
  const availableStudents = teacherOwnedStudents(db, teacherId);
  const availableGroups = teacherOwnedGroups(db, teacherId);
  const [form, setForm] = useState(() => ({
    title: assignment?.title || '',
    subject: assignment?.subject || 'Математика',
    description: assignment?.description || '',
    rubric: assignment?.rubric || assignment?.gradingCriteria || '',
    gradingCriteria: assignment?.gradingCriteria || assignment?.rubric || '',
    expectedAnswer: assignment?.expectedAnswer || '',
    scoringScale: assignment?.scoringScale || assignment?.maxScore || 100,
    toneOfVoiceForFeedback: assignment?.toneOfVoiceForFeedback || 'доброжелательный и понятный ученику',
    recipientType: assignment?.recipientType || 'student',
    recipientId: assignment?.recipientId || availableStudents[0]?.id || availableGroups[0]?.id || null,
    recipientIds: assignment?.recipientIds || [],
    deadline: assignment?.deadline || '',
    maxScore: assignment?.maxScore || 100,
    status: assignment?.status || 'Черновик',
    attachments: assignment?.attachments || [],
  }));

  const uploadMore = async(files) => {
    const uploaded = await api.upload(files);
    setForm(v=>({...v, attachments:[...(v.attachments||[]), ...uploaded.files]}));
  };

  const buildPayload = (nextStatus) => ({
    ...form,
    teacherId,
    status: nextStatus,
    recipientId: form.recipientType === 'students' ? null : form.recipientId,
    recipientIds: form.recipientType === 'students' ? [...new Set(form.recipientIds)] : [],
  });
  const publishDraft = () => onSave(buildPayload('Активно'), 'publish');
  const saveCard = () => onSave(buildPayload(form.status === 'Черновик' ? 'Черновик' : form.status), 'save');

  return <Modal title={mode === 'create' ? 'Создать задание' : form.status === 'Черновик' ? 'Редактировать черновик' : 'Редактировать задание'} onClose={onClose} wide>
    <div className="grid twoCol">
      <label className="field"><span>Название</span><input className="input" value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))} /></label>
      <label className="field"><span>Предмет</span><select className="input" value={form.subject} onChange={e=>setForm(v=>({...v,subject:e.target.value}))}>{['Математика','Физика','Химия'].map(s=><option key={s}>{s}</option>)}</select></label>
      <label className="field full"><span>Описание</span><textarea className="input textarea" value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))} /></label>
      <label className="field full"><span>Критерии / rubric для AI</span><textarea className="input textarea" value={form.gradingCriteria} onChange={e=>setForm(v=>({...v, gradingCriteria:e.target.value, rubric:e.target.value}))} placeholder="Например: 2 балла за верный метод, 2 балла за вычисления, 1 балл за ответ" /></label>
      <label className="field full"><span>Эталонный ответ (необязательно)</span><textarea className="input textarea" value={form.expectedAnswer} onChange={e=>setForm(v=>({...v, expectedAnswer:e.target.value}))} placeholder="Можно оставить пустым, если AI должен восстановить решение по условию" /></label>
      <label className="field"><span>Получатель</span><div className="stack gap10">
        <div className="segmented mini">
          <button className={cx(form.recipientType === 'student' && 'active')} onClick={() => setForm(v => ({ ...v, recipientType: 'student', recipientId: availableStudents[0]?.id || null }))}>Один ученик</button>
          <button className={cx(form.recipientType === 'students' && 'active')} onClick={() => setForm(v => ({ ...v, recipientType: 'students', recipientIds: v.recipientIds.length ? v.recipientIds : availableStudents.slice(0, 1).map(item => item.id), recipientId: null }))}>Несколько учеников</button>
          <button className={cx(form.recipientType === 'group' && 'active')} onClick={() => setForm(v => ({ ...v, recipientType: 'group', recipientId: availableGroups[0]?.id || null, recipientIds: [] }))}>Группа</button>
        </div>
        {form.recipientType === 'student' && <select className="input" value={form.recipientId || ''} onChange={e => setForm(v => ({ ...v, recipientId: e.target.value }))}>{availableStudents.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select>}
        {form.recipientType === 'students' && <div className="checkboxGrid">{availableStudents.length ? availableStudents.map(student => <label key={student.id} className="checkRow"><input type="checkbox" checked={form.recipientIds.includes(student.id)} onChange={e => setForm(v => ({ ...v, recipientIds: e.target.checked ? [...v.recipientIds, student.id] : v.recipientIds.filter(id => id !== student.id) }))} /><span>{student.name}</span></label>) : <div className="empty">Сначала добавьте учеников.</div>}</div>}
        {form.recipientType === 'group' && <select className="input" value={form.recipientId || ''} onChange={e => setForm(v => ({ ...v, recipientId: e.target.value }))}>{availableGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}
      </div></label>
      <label className="field"><span>Дедлайн</span><input className="input" type="datetime-local" value={form.deadline} onChange={e=>setForm(v=>({...v,deadline:e.target.value}))} /></label>
      <label className="field"><span>Максимальный балл</span><input className="input" type="number" value={form.maxScore} onChange={e=>setForm(v=>({...v,maxScore:Number(e.target.value)}))} /></label>
      <label className="field"><span>Шкала оценивания</span><select className="input" value={form.scoringScale} onChange={e=>setForm(v=>({...v, scoringScale:Number(e.target.value)}))}>{[5,10,100].map(scale => <option key={scale} value={scale}>{scale}-балльная</option>)}</select></label>
      <label className="field"><span>Тон комментария ученику</span><input className="input" value={form.toneOfVoiceForFeedback} onChange={e=>setForm(v=>({...v, toneOfVoiceForFeedback:e.target.value}))} placeholder="доброжелательный и понятный ученику" /></label>
    </div>
    <div className="sectionLabel mt20">Вложения</div>
    <label className="uploadZone small"><input type="file" multiple onChange={async e=>{const files=Array.from(e.target.files||[]); if(files.length) await uploadMore(files); e.target.value='';}} /><UploadCloud size={20} /> Добавить несколько фото и/или файлов</label>
    {!!form.attachments?.length && <div className="mt16"><AttachmentGallery files={form.attachments} compact /></div>}
    <div className="modalActions">
      <button className="secondaryBtn" onClick={saveCard}>{mode === 'create' || form.status === 'Черновик' ? 'Сохранить черновик' : 'Сохранить изменения'}</button>
      {form.status === 'Черновик' && <button className="ghostBtn" onClick={()=>onSave({}, 'delete')}><Trash2 size={16}/> Удалить черновик</button>}
      {(mode === 'create' || form.status === 'Черновик') && <button className="primaryBtn" onClick={publishDraft}>Опубликовать</button>}
    </div>
  </Modal>;
}


function TeacherGradingPage({ db, reload, session, notify }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentFilter = searchParams.get('student') || 'all';
  const isLimited = session.role === 'teacher' && session.accessMode === 'limited';
  const tab = isLimited ? 'batch' : (searchParams.get('tab') || 'queue');
  const pendingWorks = teacherOwnedWorks(db, session.userId).filter(w => w.status !== 'Проверено' && (studentFilter === 'all' || w.studentId === studentFilter));

  return <div className="stack gap24">
    <div className="row between wrap gap16"><div><h2 className="pageTitle">Проверка</h2><p className="muted">Очередь преподавателя и пакетная проверка разделены. В Free-режиме доступна только пакетная проверка.</p></div>{!isLimited && <div className="segmentedWide"><button className={cx(tab==='queue' && 'active')} onClick={()=>setSearchParams(studentFilter!=='all'?{ tab:'queue', student:studentFilter }:{ tab:'queue' })}>Очередь проверки</button><button className={cx(tab==='batch' && 'active')} onClick={()=>setSearchParams({ tab:'batch' })}>Пакетная проверка</button></div>}</div>
    {tab === 'queue' && !isLimited ? <QueueReview db={db} reload={reload} notify={notify} pendingWorks={pendingWorks} selectedStudentId={studentFilter} teacherId={session.userId} /> : <BatchReview db={db} reload={reload} session={session} notify={notify} />}
  </div>;
}

function QueueReview({ db, reload, notify, pendingWorks, selectedStudentId, teacherId }) {
  const [selected, setSelected] = useState(null);
  const [finalScore, setFinalScore] = useState(0);
  const [studentComment, setStudentComment] = useState('');
  const [teacherComment, setTeacherComment] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setFinalScore(selected.finalScore ?? selected.suggestedScore ?? 0);
    setStudentComment(selected.finalFeedback?.studentComment || selected.analysisDraft?.studentCommentDraft || selected.aiComment || '');
    setTeacherComment(selected.finalFeedback?.teacherComment || selected.analysisDraft?.teacherCommentDraft || selected.teacherCommentDraft || '');
    setEditMode(selected.processingStatus === 'failed' || selected.processingStatus === 'needs_human_review');
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const fresh = pendingWorks.find(item => item.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [pendingWorks, selected]);

  useEffect(() => {
    if (!pendingWorks.some(work => ['queued', 'processing'].includes(work.processingStatus))) return undefined;
    const timer = setInterval(() => reload(), 4000);
    return () => clearInterval(timer);
  }, [pendingWorks, reload]);

  if (selected) {
    const recognizedText = selected.recognitionPages?.length
      ? selected.recognitionPages.map(page => `Страница ${page.pageNumber}\n${page.recognizedText || ''}`).join('\n\n')
      : selected.ocrText;
    const mistakes = selected.analysisDraft?.detectedMistakes || selected.aiErrors || [];
    const sourceFiles = selected.submissionAssets?.length ? selected.submissionAssets : selected.files || [];

    return <div className="stack gap24">
      <button className="secondaryBtn fit" onClick={()=>setSelected(null)}>← Назад к очереди</button>
      <div className="grid reviewGrid aiReviewGrid">
        <Card title="Оригинал и страницы">
          <ReviewFileViewer files={sourceFiles} />
        </Card>
        <Card title="Распознавание и найденные ошибки">
          <div className="stack gap12">
            <div className="cardInner">
              <div className="sectionLabel">Извлеченное условие</div>
              <div className="mt8">{selected.analysisDraft?.extractedTask || 'AI еще не выделил условие.'}</div>
            </div>
            <pre className="typedText">{recognizedText || 'AI еще не собрал распознанный текст.'}</pre>
            <div className="stack gap12">
              {mistakes.length ? mistakes.map((err, idx) => <div key={idx} className="errorCard"><div className="row gap8 wrap">{(err.types||[]).map(type => <span key={type} className="pill warn">{type}</span>)}{err.severity && <span className="pill info">{err.severity}</span>}</div><div className="cardTitle mt8">{err.label}</div><div className="muted small mt6">{err.description}</div>{err.locationHint && <div className="muted small mt6">Где смотреть: {err.locationHint}</div>}</div>) : <div className="empty">Ошибки пока не выделены или решение корректно.</div>}
            </div>
          </div>
        </Card>
        <Card title="Черновик AI и подтверждение">
          <ReviewSummaryCard
            selected={selected}
            editMode={editMode}
            finalScore={finalScore}
            setFinalScore={setFinalScore}
            studentComment={studentComment}
            setStudentComment={setStudentComment}
            teacherComment={teacherComment}
            setTeacherComment={setTeacherComment}
            busy={busy}
            onEnableEdit={() => setEditMode(true)}
            onReprocess={async () => {
              try {
                setBusy(true);
                await api.reprocessWork(selected.id, { teacherId });
                await reload();
                notify({ type: 'success', text: 'Работа снова поставлена в AI-очередь.' });
                setSelected(prev => prev ? ({ ...prev, processingStatus: 'queued' }) : prev);
              } catch (error) {
                notify({ type: 'error', text: error.message });
              } finally {
                setBusy(false);
              }
            }}
            onManualReview={async () => {
              try {
                setBusy(true);
                await api.markWorkManualReview(selected.id, { actorId: teacherId });
                await reload();
                notify({ type: 'success', text: 'Работа помечена как требующая ручной проверки.' });
                setSelected(prev => prev ? ({ ...prev, processingStatus: 'needs_human_review', needsHumanReview: true }) : prev);
              } catch (error) {
                notify({ type: 'error', text: error.message });
              } finally {
                setBusy(false);
              }
            }}
            onConfirm={async () => {
              try {
                setBusy(true);
                await api.confirmWork(selected.id, { finalScore, aiComment: studentComment, teacherComment, teacherId });
                await reload();
                setSelected(null);
                notify({ type: 'success', text: 'Результат подтвержден и опубликован ученику.' });
              } catch (error) {
                notify({ type: 'error', text: error.message });
              } finally {
                setBusy(false);
              }
            }}
          />
        </Card>
      </div>
    </div>;
  }

  return <div className="stack gap12">
    {selectedStudentId !== 'all' && <div className="banner subtle">Очередь отфильтрована по выбранному ученику</div>}
    {pendingWorks.length ? pendingWorks.map(work => {
      const student = db.students.find(s=>s.id===work.studentId);
      const assignment = db.assignments.find(a=>a.id===work.assignmentId);
      return <button key={work.id} className="listCard polished" onClick={()=>setSelected(work)}>
        <div className="row between wrap gap16">
          <div>
            <div className="cardTitle">{student?.name}</div>
            <div className="muted small mt6">{assignment?.title} · {assignment?.subject}</div>
          </div>
          <div className="row gap8 wrap">
            <span className={pillClass[work.processingStatus || 'uploaded']}>{displayAiStatus(work.processingStatus)}</span>
            <span className={pillClass[work.status]}>{displayWorkStatus(work.status)}</span>
          </div>
        </div>
      </button>;
    }) : <div className="empty">Нет работ для проверки.</div>}
  </div>;
}

function BatchReview({ db, reload, session, notify }) {
  const isLimited = session.role === 'teacher' && session.accessMode === 'limited';
  const [scale, setScale] = useState('100');
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const teacherSessions = (db.batchSessions || []).filter(item => item.teacherId === session.userId);
  const [sessionId, setSessionId] = useState(teacherSessions?.[0]?.id || null);
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const current = teacherSessions.find(s => s.id === sessionId) || null;
  const activeSession = teacherSessions.find(s => s.id === sessionId) || current;
  const progress = activeSession?.results?.length
    ? {
      total: activeSession.results.length,
      ready: activeSession.results.filter(result => ['draft_ready', 'needs_human_review', 'approved'].includes(result.status)).length,
      failed: activeSession.results.filter(result => result.status === 'failed').length,
    }
    : { total: 0, ready: 0, failed: 0 };

  const startBatchReview = async () => {
    if (!files.length) return notify({ type:'error', text:'Добавь файлы перед началом пакетной проверки.' });
    setLoading(true);
    try {
      const created = await api.createBatchSession(files, scale, session.userId);
      setSessionId(created.id);
      await api.analyzeBatch(created.id);
      await reload();
      setFiles([]);
      notify({ type:'success', text:'Файлы загружены и поставлены в AI-очередь.' });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!activeSession?.results?.some(result => ['queued', 'processing'].includes(result.status))) return undefined;
    const timer = setInterval(() => reload(), 4000);
    return () => clearInterval(timer);
  }, [activeSession?.id, activeSession?.results, reload]);

  useEffect(() => {
    if (!selectedResult || !activeSession?.results) return;
    const fresh = activeSession.results.find(result => result.id === selectedResult.id);
    if (fresh && fresh !== selectedResult) setSelectedResult(fresh);
  }, [activeSession?.results, selectedResult]);

  const nextNeedsApproval = activeSession?.results?.find(result => ['draft_ready', 'needs_human_review'].includes(result.status)) || null;
  const onDropFiles = (incoming) => {
    setFiles(prev => [...prev, ...incoming.filter(file => !prev.some(existing => existing.name === file.name && existing.size === file.size))]);
  };

  return <div className="stack gap24">
    <div className="row between wrap gap16"><div><h2 className="pageTitle">Пакетная проверка</h2><p className="muted">Множественные фото и файлы, явный запуск анализа и компактная таблица результатов.</p></div><div className="row gap8"><select className="input selectSmall" value={scale} onChange={e=>setScale(e.target.value)}><option value="5">5-балльная</option><option value="10">10-балльная</option><option value="100">100-балльная</option></select>{isLimited && <span className="pill info">Текущий тариф: Free</span>}</div></div>
    <div className="grid batchSplit">
      <Card title="Исходники для проверки">
        <div className="stack gap12">
          <label
            className={cx('uploadZone', dragActive && 'uploadZoneActive')}
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={e => {
              e.preventDefault();
              setDragActive(false);
              onDropFiles(Array.from(e.dataTransfer.files || []));
            }}
          >
            <input type="file" multiple onChange={e=>{const incoming = Array.from(e.target.files || []); onDropFiles(incoming); e.target.value='';}} />
            <UploadCloud size={24} />
            <div>Добавить несколько фото и/или файлов</div>
            <div className="muted small">Можно перетащить файлы прямо в эту область</div>
          </label>
          <div className="batchFileList">{files.length ? files.map(file => <div key={file.name+file.size} className="listRow compact"><div className="stack"><span>{file.name}</span><span className="muted small">{loading ? 'в обработке' : 'ожидает загрузки'}</span></div></div>) : <div className="empty">Файлы еще не добавлены.</div>}</div>
          {activeSession?.results?.length ? <div className="batchProgressCard"><div className="sectionLabel">Прогресс</div><div className="row between wrap gap8 mt8"><strong>{progress.ready}/{progress.total}</strong><span className="muted small">готово к просмотру</span></div>{progress.failed > 0 && <div className="muted small mt8">Ошибок AI: {progress.failed}</div>}</div> : null}
          <div className="row gap8 wrap">
            <button className="primaryBtn" onClick={startBatchReview} disabled={loading || !files.length}>Начать обработку</button>
            {nextNeedsApproval && <button className="secondaryBtn" onClick={() => setSelectedResult(nextNeedsApproval)}>Открыть следующий требующий подтверждения</button>}
            {activeSession?.results?.some(result => result.status === 'failed') && <button className="ghostBtn" onClick={async () => { try { await api.retryFailedBatch(activeSession.id); await reload(); notify({ type:'success', text:'Ошибочные файлы снова поставлены в очередь.' }); } catch (error) { notify({ type:'error', text:error.message }); } }}>Retry failed</button>}
            {activeSession?.results?.length ? <a className="secondaryBtn linkButton" href={api.exportCsvUrl(activeSession.id)} target="_blank" rel="noreferrer"><FileSpreadsheet size={16}/> CSV</a> : null}
            {activeSession?.results?.length ? <a className="secondaryBtn linkButton" href={api.exportPdfUrl(activeSession.id)} target="_blank" rel="noreferrer"><FileText size={16}/> PDF</a> : null}
          </div>
        </div>
      </Card>
      <Card title="Результаты пакетной обработки">
        {!activeSession || !activeSession.results?.length ? <div className="empty">Таблица пуста. Сначала добавь файлы и нажми «Начать обработку».</div> : <div className="tableScroll compactTableWrap"><table className="dataTable compactTable"><thead><tr><th>Файл</th><th>Статус</th><th>Ошибки</th><th>Балл</th><th>OCR / AI</th></tr></thead><tbody>{activeSession.results.map(result => <tr key={result.id} onClick={()=>setSelectedResult(result)}><td>{result.name}</td><td><span className={pillClass[result.status || 'uploaded']}>{displayAiStatus(result.status)}</span></td><td><div className="chipWrap">{(result.errorTypes||[]).slice(0,3).map(type => <span key={type} className="chip">{type}</span>)}</div></td><td>{result.score ?? '—'}</td><td><span className="muted small">{formatConfidence(result.recognitionConfidence)} / {formatConfidence(result.aiConfidence)}</span></td></tr>)}</tbody></table></div>}
      </Card>
    </div>
    {selectedResult && <BatchResultModal result={selectedResult} sessionId={activeSession.id} onClose={()=>setSelectedResult(null)} onSave={async(payload)=>{await api.updateBatchResult(activeSession.id, selectedResult.id, payload); await reload(); setSelectedResult(null); notify({type:'success',text:'Результат пакетной проверки обновлен.'});}} />}
  </div>;
}


function BatchResultModal({ result, onClose, onSave }) {
  const [score, setScore] = useState(result.score ?? 0);
  const [aiComment, setAiComment] = useState(result.aiComment || '');
  const files = result.submissionAssets?.length ? result.submissionAssets : (result.file ? [result.file] : result.sourceUrl ? [{ id: result.id, url: result.sourceUrl, kind: 'photo', name: result.name }] : []);
  const recognizedText = result.recognitionPages?.length
    ? result.recognitionPages.map(page => `Страница ${page.pageNumber}\n${page.recognizedText || ''}`).join('\n\n')
    : result.typedText;
  return <Modal title={result.name} onClose={onClose} wide>
    <div className="grid reviewGrid aiReviewGrid">
      <Card title="Исходник">
        <ReviewFileViewer files={files} />
      </Card>
      <Card title="Распознанный текст и ошибки">
        <pre className="typedText">{recognizedText || 'AI еще не закончил распознавание.'}</pre>
        <div className="chipWrap mt12">{(result.errorTypes||[]).map(type => <span key={type} className="pill warn">{type}</span>)}</div>
        {result.errorDescription && <p className="muted mt12">{result.errorDescription}</p>}
      </Card>
      <Card title="Черновик результата">
        <div className="row gap8 wrap">
          <span className={pillClass[result.status || 'uploaded']}>{displayAiStatus(result.status)}</span>
          <span className="pill info">OCR {formatConfidence(result.recognitionConfidence)}</span>
          <span className="pill info">AI {formatConfidence(result.aiConfidence)}</span>
        </div>
        <label className="field mt16"><span>Комментарий AI</span><textarea className="input textarea" value={aiComment} onChange={e=>setAiComment(e.target.value)} /></label>
        <label className="field mt16"><span>Итоговый балл</span><input className="input" type="number" value={score} onChange={e=>setScore(Number(e.target.value))} /></label>
        <div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Отмена</button><button className="primaryBtn" onClick={()=>onSave({ score, aiComment })}>Сохранить</button></div>
      </Card>
    </div>
  </Modal>;
}

function TeacherAnalyticsPage({ db, session }) {
  const [drawerMetric, setDrawerMetric] = useState(null);
  const [filters, setFilters] = useState({ subject:'all', period:'all', studentId:'all', groupId:'all' });
  const [compareFilters, setCompareFilters] = useState({ subject:'all', period:'all', studentId:'all', groupId:'all' });
  const teacherId = session.userId;
  const analyticsReady = hasTeacherAnalyticsData(db, teacherId);
  const events = buildErrorEvents(db, teacherId);
  const compareStudents = studentsByFilter(db, compareFilters, teacherId);
  const compareGroup = compareFilters.groupId === 'all' ? null : teacherOwnedGroups(db, teacherId).find(item => item.id === compareFilters.groupId);
  const compareGroupStudents = compareGroup ? compareGroup.studentIds.map(id => db.students.find(student => student.id === id && student.active)).filter(Boolean) : teacherOwnedStudents(db, teacherId);
  const riskStudents = teacherRiskStudents(db, teacherId);
  const metrics = [
    { key:'flowScore', label:'Score по потоку', value: analyticsReady ? avg(studentsByFilter(db, filters, teacherId).map(s => db.computed.studentScores[s.id] || 0)) : 'Недостаточно данных', extractor:(db)=>studentsByFilter(db, filters, teacherId).map(s=>({ name:s.name, value: db.computed.studentScores[s.id] || 0 })) },
    { key:'inTime', label:'Сдано в срок', value: analyticsReady ? `${submissionRate(db, filters, teacherId)}%` : 'Недостаточно данных', extractor:(db)=>studentsByFilter(db, filters, teacherId).map(s=>({ name:s.name, value: timelySubmissionForStudent(db,s.id) })) },
    { key:'errors', label:'Ошибок на работу', value: analyticsReady ? round(avg(Object.values(buildErrorEventsFiltered(db, filters, teacherId).reduce((acc,e)=>{acc[e.workId]=(acc[e.workId]||0)+1; return acc;}, {}))),1) : 'Недостаточно данных', extractor:(db)=>errorCountPerStudent(db, filters, teacherId) },
    { key:'risk', label:'Ученики из зоны риска', value: analyticsReady ? riskStudents.length : 'Недостаточно данных', extractor:()=>riskStudents.map(item => ({ name: item.name, value: item.riskScore })) },
  ];
  const compareModeData = [
    { metric:'Score', student: avg(compareStudents.map(item => db.computed.studentScores[item.id] || 0)), group: avg(compareGroupStudents.map(item => db.computed.studentScores[item.id] || 0)) },
    { metric:'Сдано в срок', student: avg(compareStudents.map(item => timelySubmissionForStudent(db, item.id))), group: avg(compareGroupStudents.map(item => timelySubmissionForStudent(db, item.id))) },
    { metric:'Ошибок на работу', student: round(avg(errorCountPerStudent(db, compareFilters, teacherId).map(item => item.value)), 1), group: round(avg(compareGroupStudents.map(item => errorCountPerStudent(db, { ...compareFilters, studentId: item.id }, teacherId).reduce((sum, row) => sum + row.value, 0))), 1) },
    { metric:'Правки после AI', student: 0, group: 0 },
  ];
  const topErrors = aggregateErrors(events, filters, false);
  return <div className="stack gap24">
    <div><h2 className="pageTitle">Аналитика</h2><p className="muted">KPI открываются в отдельной диаграмме c фильтрами по ученику, группе, времени и предмету.</p></div>
    <div className="grid fourCol">{metrics.map(metric => <button key={metric.key} className={cx('kpiCard', analyticsReady && 'clickable')} onClick={()=>analyticsReady && setDrawerMetric(metric)}><div className="kpiTitle">{metric.label}</div><div className="kpiValue">{metric.value}</div></button>)}</div>
    <div className="grid twoCol">
      <Card title="Ученик против группы">
        {analyticsReady ? <><FilterRow filters={compareFilters} setFilters={setCompareFilters} db={db} includeAllTime teacherId={teacherId} />
        <ResponsiveContainer width="100%" height={280}><BarChart data={compareModeData} layout="vertical" margin={{ left: 12, right: 12 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="metric" width={120} /><Tooltip /><Bar dataKey="student" fill="#2563eb" radius={[0,8,8,0]} /><Bar dataKey="group" fill="#94a3b8" radius={[0,8,8,0]} /></BarChart></ResponsiveContainer></> : <div className="empty">Недостаточно данных</div>}
      </Card>
      <Card title="Топ ошибок по заданию">
        {analyticsReady ? <><FilterRow filters={filters} setFilters={setFilters} db={db} includeAllTime teacherId={teacherId} />
        <ChartBar data={topErrors.map(x=>({name:x.name,value:x.value}))} /></> : <div className="empty">Недостаточно данных</div>}
      </Card>
    </div>
    <Card title="Ученики из зоны риска" subtitle="Риск учитывает оценки, пропуски и просроченные задания в рамках вашего контура преподавателя.">
      <div className="stack gap12">
        {riskStudents.length ? riskStudents.map(item => <div key={item.id} className="riskRow"><div><div>{item.name}</div><div className="muted small">{item.factors.join(' · ')}</div></div><span className={cx('pill', item.riskScore >= 3 ? 'danger' : 'warn')}>Риск {item.riskScore}</span></div>) : <div className="empty">Недостаточно данных</div>}
      </div>
    </Card>
    {drawerMetric && <Drawer title={drawerMetric.label} onClose={()=>setDrawerMetric(null)}>
      <FilterRow filters={filters} setFilters={setFilters} db={db} includeAllTime teacherId={teacherId} />
      <ChartBar data={drawerMetric.extractor(db)} horizontal />
    </Drawer>}
  </div>;
}


function TeacherReportsPage({ db, reload, notify, session }) {
  const teacherId = session.userId;
  const teacherStudents = teacherOwnedStudents(db, teacherId);
  const teacherGroups = teacherOwnedGroups(db, teacherId);
  const [targetType, setTargetType] = useState('student');
  const [targetId, setTargetId] = useState(teacherStudents[0]?.id || '');
  const [frequency, setFrequency] = useState('Еженедельно');
  const [previewStudentId, setPreviewStudentId] = useState(teacherStudents[0]?.id || '');
  const [periodFrom, setPeriodFrom] = useState(() => new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10));
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().slice(0, 10));
  const autoEligibleStudents = targetType === 'student'
    ? [teacherStudents.find(student => student.id === targetId)].filter(Boolean).filter(student => student.parentEmail)
    : (teacherGroups.find(group => group.id === targetId)?.studentIds || []).map(id => teacherStudents.find(student => student.id === id)).filter(Boolean).filter(student => student.parentEmail);
  const previewStudent = teacherStudents.find(student => student.id === previewStudentId) || null;
  const previewRecipient = previewStudent?.parentEmail ? `${previewStudent.parentName || previewStudent.name} <${previewStudent.parentEmail}>` : 'Email родителя не заполнен';
  const savingDisabled = !targetId || !autoEligibleStudents.length;
  const sendingDisabled = !previewStudent?.parentEmail;

  return <div className="stack gap24">
    <div><h2 className="pageTitle">Отчеты</h2><p className="muted">Автоматическую отправку можно сохранить для weekly/monthly режима, а ручной PDF-отчет формируется из превью письма для конкретного ученика.</p></div>
    <div className="grid twoCol">
      <Card title="Настройки отправки">
        <label className="field"><span>Объект</span><div className="segmented mini"><button className={cx(targetType==='student'&&'active')} onClick={()=>{setTargetType('student'); setTargetId(teacherStudents[0]?.id||'');}}>Ученик</button><button className={cx(targetType==='group'&&'active')} onClick={()=>{setTargetType('group'); setTargetId(teacherGroups[0]?.id||'');}}>Группа</button></div></label>
        <label className="field mt16"><span>Кому</span><select className="input" value={targetId} onChange={e=>setTargetId(e.target.value)}>{targetType==='student' ? teacherStudents.map(s=><option key={s.id} value={s.id}>{s.name}</option>) : teacherGroups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <label className="field mt16"><span>Режим отправки</span><select className="input" value={frequency} onChange={e=>setFrequency(e.target.value)}><option>Еженедельно</option><option>Ежемесячно</option></select></label>
        {savingDisabled && <div className="pill warn mt16">{targetType === 'student' ? 'Автоотправка недоступна, пока у выбранного ученика не заполнен Email родителя.' : 'В выбранной группе пока нет учеников с заполненным Email родителя.'}</div>}
        <button className="primaryBtn mt20" disabled={savingDisabled} onClick={async()=>{try { await api.saveReportConfig({ targetType, targetId, frequency, teacherId }); await reload(); notify({type:'success',text:'Настройки автоотправки сохранены.'}); } catch (e) { notify({ type:'error', text:e.message }); }}}>Сохранить</button>
      </Card>
      <Card title="Превью email">
        <div className="grid twoCol">
          <label className="field"><span>Кому</span><select className="input" value={previewStudentId} onChange={e=>setPreviewStudentId(e.target.value)}>{teacherStudents.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
          <label className="field"><span>За период</span><div className="row gap8"><input className="input" type="date" value={periodFrom} onChange={e=>setPeriodFrom(e.target.value)} /><input className="input" type="date" value={periodTo} onChange={e=>setPeriodTo(e.target.value)} /></div></label>
        </div>
        <div className="previewMail">
          <div className="mailTitle">Тема: Отчет по ученику · {new Date().toLocaleDateString('ru-RU')}</div>
          <div className="mailRecipients">Получатель: {previewRecipient}</div>
          <div className="mailRecipients">Период: {formatDateOnly(periodFrom)} - {formatDateOnly(periodTo)}</div>
          <ul className="mailList"><li>Имя ученика</li><li>Частые типы ошибок</li><li>Гистограмма оценок</li></ul>
        </div>
        {sendingDisabled && <div className="pill warn mt16">Отправка недоступна, пока у выбранного ученика не заполнен Email родителя.</div>}
        <button className="primaryBtn mt20" disabled={sendingDisabled} onClick={async()=>{try { const result = await api.sendReport({ targetType: 'student', targetId: previewStudentId, teacherId, periodFrom, periodTo }); await reload(); notify({type:'success',text: result.deliveries?.[0]?.url ? 'PDF-отчет сформирован и добавлен в журнал отправок.' : 'Отчет отправлен.'}); } catch (e) { notify({ type:'error', text:e.message }); }}}>Отправить отчет</button>
      </Card>
    </div>
    <Card title="Журнал отправок"><div className="stack gap10">{(db.reportLogs || []).filter(log => log.teacherId === teacherId).length ? (db.reportLogs || []).filter(log => log.teacherId === teacherId).slice(0,8).map(log => <div key={log.id} className="listRow"><div><div>{log.targetLabel}</div><div className="muted small">{new Date(log.createdAt).toLocaleString('ru-RU')} · {log.mode} · {log.periodLabel || 'Период не указан'}</div></div><div className="row gap8 wrap">{log.deliveries?.[0]?.url && <a className="secondaryBtn linkButton" href={log.deliveries[0].url} target="_blank" rel="noreferrer"><FileText size={16} /> PDF</a>}<div className="muted small">{log.recipients.length} получателей</div></div></div>) : <div className="empty">Отправок пока не было.</div>}</div></Card>
  </div>;
}


function TeacherPricingPage({ db, session }) {
  const current = session.role === 'teacher' && session.accessMode === 'limited' ? 'Free' : 'Pro Trial';
  const plans = [
    { name:'Free', price:'0 ₽', features:['Пакетная проверка','Ограниченный лимит обработок','Базовое распознавание','CSV/PDF экспорт','Без полной очереди ручной проверки и расширенной аналитики'] },
    { name:'Pro Trial', price:'30 дней бесплатно', features:['Полный доступ ко всем функциям','Одиночная и пакетная проверка','Ученики, группы, задания','Редактирование AI-черновиков','Аналитика и отчеты'] },
    { name:'Pro', price:'1 490 ₽/мес', features:['Полный кабинет преподавателя','Ученики, группы, задания','Одиночная и пакетная проверка','Комментарии ученикам','Аналитика и отчеты','Итог всегда подтверждает преподаватель'] }
  ];
  return <div className="stack gap24"><div><h2 className="pageTitle">Тарифы</h2><p className="muted">AI экономит время на распознавании и черновике проверки, но финальный результат всегда подтверждает преподаватель.</p></div><div className="grid threeCol">{plans.map(plan => <Card key={plan.name} title={plan.name} actions={current===plan.name && <span className="pill info">Текущий тариф</span>}><div className="price">{plan.price}</div><ul className="featureList">{plan.features.map(f=><li key={f}>{f}</li>)}</ul></Card>)}</div></div>;
}

function TeacherSettingsPage({ db, reload, notify, session }) {
  const teacher = getTeacherProfile(db, session);
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState({ name: teacher?.name || '', email: teacher?.email || '', phone: teacher?.phone || '', avatarUrl: teacher?.avatarUrl || '' });
  const [subjectsState, setSubjectsState] = useState(teacher?.subjects || []);
  const [notifications, setNotifications] = useState(teacher?.notifications || {});
  const [reportPreferences, setReportPreferences] = useState(Object.fromEntries(PARENT_REPORT_FIELDS.map(key => [key, teacher?.reportPreferences?.[key] ?? true])));

  useEffect(() => {
    setProfile({ name: teacher?.name || '', email: teacher?.email || '', phone: teacher?.phone || '', avatarUrl: teacher?.avatarUrl || '' });
    setSubjectsState(teacher?.subjects || []);
    setNotifications(teacher?.notifications || {});
    setReportPreferences(Object.fromEntries(PARENT_REPORT_FIELDS.map(key => [key, teacher?.reportPreferences?.[key] ?? true])));
  }, [teacher?.id, teacher?.name, teacher?.email, teacher?.phone, teacher?.avatarUrl]);

  const uploadAvatar = async(files) => {
    const uploaded = await api.upload(files);
    if (uploaded.files?.[0]) setProfile(v=>({...v, avatarUrl: uploaded.files[0].url }));
  };
  const saveAll = async (payload) => {
    await api.updateTeacher({ userId: session.userId, ...payload });
    await reload();
    notify({ type: 'success', text: 'Настройки сохранены.' });
  };

  return <div className="stack gap24"><div><h2 className="pageTitle">Настройки</h2><p className="muted">Настройки собраны по разделам: профиль, предметы, уведомления и отчеты.</p></div>
    <div className="settingsHeaderTabs">{['profile','subjects','notifications','reports'].map(key => <button key={key} className={cx('settingsTabBtn', tab===key && 'active')} onClick={()=>setTab(key)}>{key==='profile'?'Профиль':key==='subjects'?'Предметы':key==='notifications'?'Уведомления':'Отчеты'}</button>)}</div>
    {tab==='profile' && <Card title="Профиль"><div className="profileHero"><label className="avatarUploader circularAvatar"><input type="file" accept="image/*" onChange={e=>uploadAvatar(Array.from(e.target.files||[]))} />{profile.avatarUrl ? <img src={normalizeUrl(profile.avatarUrl)} className="avatarCoverImage" /> : <div className="avatarPlaceholderCircle"><UploadCloud size={22} /></div>}</label><div className="profileFields"><div className="grid twoCol"><label className="field"><span>Имя</span><input className="input" value={profile.name} onChange={e=>setProfile(v=>({...v,name:e.target.value}))} /></label><label className="field"><span>Email</span><input className="input" value={profile.email} onChange={e=>setProfile(v=>({...v,email:e.target.value}))} /></label><label className="field"><span>Телефон</span><input className="input" value={profile.phone} onChange={e=>setProfile(v=>({...v,phone:e.target.value}))} /></label></div></div></div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll(profile)}>Сохранить профиль</button></div></Card>}
    {tab==='subjects' && <Card title="Предметы"><div className="checkboxGrid">{['Математика','Физика','Химия'].map(subject => <label key={subject} className="checkRow"><input type="checkbox" checked={subjectsState.includes(subject)} onChange={e=>setSubjectsState(v=>e.target.checked?[...v,subject]:v.filter(s=>s!==subject))} /><span>{subject}</span></label>)}</div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll({ subjects: [...new Set(subjectsState)] })}>Сохранить предметы</button></div></Card>}
    {tab==='notifications' && <Card title="Уведомления"><div className="checkboxGrid">{Object.keys(notifications).map(key => <label key={key} className="checkRow"><input type="checkbox" checked={Boolean(notifications[key])} onChange={e=>setNotifications(v=>({...v,[key]:e.target.checked}))} /><span>{key}</span></label>)}</div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll({ notifications })}>Сохранить уведомления</button></div></Card>}
    {tab==='reports' && <Card title="Содержимое отчета родителям"><div className="checkboxGrid">{PARENT_REPORT_FIELDS.map(key => <label key={key} className="checkRow"><input type="checkbox" checked={Boolean(reportPreferences[key])} onChange={e=>setReportPreferences(v=>({...v,[key]:e.target.checked}))} /><span>{key}</span></label>)}</div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll({ reportPreferences })}>Сохранить настройки отчета</button></div></Card>}
  </div>;
}


function StudentDashboardPage({ db, session, navigate, reload, notify }) {
  const student = getCurrentStudent(db, session);
  const [showUndone, setShowUndone] = useState(false);
  const [detail, setDetail] = useState(null);

  if (!student) return <div className="empty">Не удалось загрузить профиль ученика.</div>;

  const assignments = assignmentsForStudent(db, student.id);
  const works = db.works.filter(w => w.studentId === student.id);
  const undone = assignments.filter(a => !works.some(w => w.assignmentId === a.id));
  const reviewedWorks = works.filter(item => item.status === 'Проверено');
  const recommendations = reviewedWorks
    .flatMap(work => work.finalFeedback?.recommendations?.length ? work.finalFeedback.recommendations : (work.aiErrors || []).map(item => item.description).filter(Boolean))
    .slice(0, 3);
  const decisionNotifications = (db.teacherInvites || [])
    .filter(invite => invite.studentId === student.id && invite.direction === 'student_to_teacher' && ['accepted', 'declined'].includes(invite.status) && !invite.studentNotificationDismissedAt)
    .map(invite => ({
      ...invite,
      teacher: (db.teachers || []).find(teacher => teacher.id === invite.teacherId),
    }));

  return <div className="stack gap24">
    <div className="row between wrap gap16">
      <div>
        <h2 className="pageTitle">Главная</h2>
        <p className="muted">Все, что важно ученику: активные задания, результаты проверок и рекомендации после них.</p>
      </div>
    </div>
    {!!decisionNotifications.length && <Card title="Решения преподавателей">
      <div className="stack gap12">
        {decisionNotifications.map(item => (
          <div key={item.id} className="listRow">
            <div>
              <div>{item.teacher?.name || 'Преподаватель'}: {item.status === 'accepted' ? 'Принято' : 'Отказ'}</div>
              <div className="muted small">{item.teacher?.email || 'Почта не указана'}</div>
            </div>
            <button className="ghostBtn" onClick={async () => {
              try {
                await api.dismissTeacherInviteNotification(item.id);
                await reload();
                notify({ type: 'success', text: 'Уведомление скрыто.' });
              } catch (error) {
                notify({ type: 'error', text: error.message });
              }
            }}><X size={16} /> Закрыть</button>
          </div>
        ))}
      </div>
    </Card>}
    <div className="grid twoCol"><button className="kpiCard clickable" onClick={()=>setShowUndone(true)}><div className="kpiTitle">Задания, которые не сделаны</div><div className="kpiValue">{undone.length}</div></button><KPI title="Score" value={db.computed.studentScores[student.id] || 0} /></div>
    {!studentTeacherIds(student).length && <EmptyOnboarding role="student" title="Новый аккаунт ученика" text="Сейчас кабинет пустой, потому что вы еще не подключили преподавателя и не получили первое задание." actions={[<button key="tutors" className="primaryBtn" onClick={()=>navigate('/student/tutors')}>Открыть репетиторов</button>]} />}
    <div className="grid twoCol">
      <Card title="Последние результаты"><div className="stack gap10">{reviewedWorks.length ? reviewedWorks.slice(0,4).map(w => { const a = db.assignments.find(x=>x.id===w.assignmentId); return <div key={w.id} className="listRow"><div><div>{a?.title}</div>{w.finalFeedback?.studentComment && <div className="muted small mt6">{w.finalFeedback.studentComment}</div>}</div><div>{w.finalFeedback?.finalScore ?? w.finalScore}</div></div>; }) : <div className="empty">Пока нет проверенных работ.</div>}</div></Card>
      <Card title="Рекомендации"><div className="stack gap8">{recommendations.length ? recommendations.map((item, index) => <div key={`${item}-${index}`} className="cardInner">{item}</div>) : <div className="empty">Рекомендации появятся после первых проверенных работ.</div>}</div></Card>
    </div>
    {showUndone && <Modal title="Задания, которые не сделаны" onClose={()=>setShowUndone(false)}><div className="stack gap12">{undone.length ? undone.map(a => <button key={a.id} className="assignmentCard polished" onClick={()=>setDetail(a)}><div className="row between wrap gap12"><div><div className="cardTitle">{a.title}</div><div className="muted small">{a.subject}</div></div><DeadlineBadge assignment={a} hasWork={false} /></div></button>) : <div className="empty">Новых заданий пока нет.</div>}</div></Modal>}
    {detail && <StudentAssignmentDetail assignment={detail} work={works.find(w=>w.assignmentId===detail.id)} onClose={()=>setDetail(null)} onUpload={async(files)=>{ try { await submitAssignmentWork({ assignment: detail, student, works, files, reload, notify }); setDetail(null); } catch (e) { notify({ type: 'error', text: e.message }); } }} />}
  </div>;
}


function StudentAssignmentsPage({ db, reload, notify, session }) {
  const student = getCurrentStudent(db, session);
  const [subject, setSubject] = useState('Все');
  const [detail, setDetail] = useState(null);
  if (!student) return <div className="empty">Не удалось загрузить задания ученика.</div>;
  const assignments = assignmentsForStudent(db, student.id);
  const works = db.works.filter(w => w.studentId === student.id);
  const subjectOptions = ['Все', ...new Set(assignments.map(item => item.subject).filter(Boolean))];
  const filtered = assignments.filter(a => subject === 'Все' || a.subject === subject);

  return <div className="stack gap24">
    <div><h2 className="pageTitle">Мои задания</h2><p className="muted">Здесь собраны только ваши задания. Можно быстро открыть карточку и добавить решение.</p></div>
    <div className="row gap12 wrap alignCenter"><span className="sectionLabel">Предмет</span><select className="input selectSmall" value={subject} onChange={e=>setSubject(e.target.value)}>{subjectOptions.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
    <div className="stack gap12">{filtered.length ? filtered.map(a => { const work = works.find(w => w.assignmentId === a.id); return <button key={a.id} className="assignmentCard polished" onClick={()=>setDetail(a)}><div className="row between wrap gap12"><div><div className="cardTitle">{a.title}</div><div className="muted small">{a.subject} · Дедлайн: {formatDeadline(a.deadline)}</div></div><div className="row gap8">{!work && <DeadlineBadge assignment={a} hasWork={false} />}{work && <span className={pillClass[displayWorkStatus(work.status, 'student')]}>{displayWorkStatus(work.status, 'student')}</span>}</div></div></button>; }) : <div className="empty">У вас пока нет заданий.</div>}</div>
    {detail && <StudentAssignmentDetail assignment={detail} work={works.find(w=>w.assignmentId===detail.id)} onClose={()=>setDetail(null)} onUpload={async(files)=>{ try { await submitAssignmentWork({ assignment: detail, student, works, files, reload, notify }); setDetail(null); } catch (e) { notify({ type: 'error', text: e.message }); } }} />}
  </div>;
}

function StudentAssignmentDetail({ assignment, work, onClose, onUpload, readonly=false }) {
  const [files, setFiles] = useState([]);
  return <Modal title={assignment.title} onClose={onClose} wide>
    <div className="stack gap16">
      <div className="muted">{assignment.description}</div>
      <div className="cardInner">Дедлайн сдачи: {formatDeadline(assignment.deadline)}</div>
      {assignment.attachments?.length > 0 && <AttachmentGallery files={assignment.attachments} />}
      {work && <>
        <div className="cardInner">Решение уже отправлено преподавателю. Повторная дозагрузка файлов для этой работы недоступна.</div>
        <div className="row gap8 wrap"><span className={pillClass[displayWorkStatus(work.status, 'student')]}>{displayWorkStatus(work.status, 'student')}</span>{work.submittedAt && <span className="muted small">Отправлено: {work.submittedAt}</span>}</div>
        {!!work.files?.length && <AttachmentGallery files={work.files} compact />}
        {work.finalFeedback && <div className="cardInner"><div className="sectionLabel">Подтвержденный результат</div><div className="mt8"><strong>Балл:</strong> {work.finalFeedback.finalScore}</div><div className="mt8">{work.finalFeedback.studentComment || 'Комментарий появится после подтверждения преподавателем.'}</div>{work.finalFeedback.recommendations?.length ? <div className="chipWrap mt12">{work.finalFeedback.recommendations.map(item => <span key={item} className="chip">{item}</span>)}</div> : null}</div>}
      </>}
      {!readonly && !work && <><label className="uploadZone small"><input type="file" multiple onChange={e=>setFiles(prev=>[...prev, ...Array.from(e.target.files||[]).filter(file => !prev.some(existing => existing.name === file.name && existing.size === file.size))])} /> <UploadCloud size={20} /> Добавить несколько фото/файлов</label>{files.length>0 && <div className="attachList">{files.map(file => <span key={file.name+file.size} className="attachChip">{file.name}</span>)}</div>}<div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Закрыть</button><button className="primaryBtn" onClick={()=>onUpload(files)} disabled={!files.length}>Загрузить</button></div></>}
      {readonly && <div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Закрыть</button></div>}
      {!readonly && work && <div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Закрыть</button></div>}
    </div>
  </Modal>;
}

function StudentTutorsPage({ db, reload, notify, session }) {
  const student = getCurrentStudent(db, session);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [directory, setDirectory] = useState([]);
  const inviteToken = searchParams.get('invite');
  const invites = (db.teacherInvites || []).filter(item => item.studentId === student?.id);
  const connectedTeachers = (db.teachers || []).filter(item => studentHasTeacher(student, item.id));
  const incomingInvites = invites.filter(item => item.direction === 'teacher_to_student');

  useEffect(() => {
    let active = true;
    if (!searchOpen || search.trim().length < 2) {
      setDirectory([]);
      return () => {
        active = false;
      };
    }
    api.searchTeachers(search).then(result => {
      if (active) setDirectory(result);
    }).catch(error => {
      if (active) notify({ type: 'error', text: error.message });
    });
    return () => {
      active = false;
    };
  }, [search, notify, searchOpen]);

  useEffect(() => {
    if (!inviteToken || !student?.id) return;
    let cancelled = false;
    (async () => {
      try {
        await api.claimTeacherInvite({ token: inviteToken, studentId: student.id });
        if (cancelled) return;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('invite');
        setSearchParams(nextParams);
        await reload();
        notify({ type: 'success', text: 'Приглашение преподавателя найдено. Теперь его можно принять в списке ниже.' });
      } catch (e) {
        if (cancelled) return;
        notify({ type: 'error', text: e.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken, student?.id, searchParams, setSearchParams, reload, notify]);

  const inviteStatusFor = (teacherId) => {
    if (studentHasTeacher(student, teacherId)) return 'accepted';
    const invite = invites.find(item => item.teacherId === teacherId && item.status === 'pending');
    return invite?.status || null;
  };

  if (!student) return <div className="empty">Не удалось загрузить список преподавателей.</div>;

  return <div className="stack gap24">
    <div><h2 className="pageTitle">Репетиторы</h2><p className="muted">Сверху расположен поиск преподавателей, ниже ваши активные подключения и входящие приглашения.</p></div>
    <Card title="Поиск">
      <div className="toolbar">
        <Search size={16} />
        <input className="toolbarInput" value={search} onFocus={() => setSearchOpen(true)} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по имени или email" />
      </div>
      {searchOpen && <div className="suggestions mt12">
        {search.trim().length < 2 ? (
          <div className="searchDropdownHint">Введите минимум 2 символа, чтобы открыть результаты поиска.</div>
        ) : directory.length ? directory.map(teacher => {
          const status = inviteStatusFor(teacher.id);
          return (
            <button key={teacher.id} className="suggestion" onMouseDown={event => event.preventDefault()} onClick={async () => {
              if (status) return;
              try {
                await api.createTeacherInvite({ teacherId: teacher.id, studentId: student.id });
                await reload();
                notify({ type: 'success', text: 'Запрос преподавателю отправлен.' });
              } catch (e) {
                notify({ type: 'error', text: e.message });
              }
            }}>
              <div className="stack gap6 alignStart">
                <div className="cardTitle">{teacher.name}</div>
                <div className="muted small">{teacher.email || 'Почта не указана'}</div>
              </div>
              {status === 'accepted' ? <span className="searchSuccess"><CheckSquare size={16} /> Подключен</span> : status === 'pending' ? <span className="pill info">Запрос отправлен</span> : <span className="primaryInlineAction">Отправить запрос</span>}
            </button>
          );
        }) : <div className="searchDropdownHint">Преподаватели по вашему запросу не найдены.</div>}
      </div>}
    </Card>

    <Card title="Подключенные преподаватели">
      <div className="grid twoCol">
        {connectedTeachers.length ? connectedTeachers.map(teacher => (
          <Card key={`connected-${teacher.id}`} title={teacher.name} subtitle={teacher.email || 'Почта не указана'} actions={<div className="row gap8 wrap"><span className="pill success">Подключен</span><button className="secondaryBtn dangerOutline" onClick={async () => {
            try {
              await api.detachTeacherStudent(teacher.id, student.id);
              await reload();
              notify({ type: 'success', text: 'Связь с преподавателем удалена.' });
            } catch (e) {
              notify({ type: 'error', text: e.message });
            }
          }}>Удалить</button></div>}>
            <div className="chipWrap">{(teacher.subjects || []).map(subject => <span key={`${teacher.id}-${subject}`} className="chip">{subject}</span>)}</div>
          </Card>
        )) : <div className="empty">Пока нет подключенных преподавателей.</div>}
      </div>
    </Card>

    <Card title="Входящие приглашения">
      <div className="stack gap12">
        {incomingInvites.length ? incomingInvites.map(invite => {
          const teacher = (db.teachers || []).find(item => item.id === invite.teacherId);
          return (
            <div key={invite.id} className="listCard polished">
              <div className="row between wrap gap16">
                <div>
                  <div className="cardTitle">{teacher?.name || 'Преподаватель'}</div>
                  <div className="muted small mt6">{teacher?.email || 'Почта не указана'}</div>
                </div>
                <div className="row gap8 wrap">
                  {invite.status === 'pending' ? (
                    <>
                      <button className="secondaryBtn" onClick={async () => {
                        await api.updateTeacherInvite(invite.id, { status: 'declined' });
                        await reload();
                        notify({ type: 'success', text: 'Приглашение отклонено.' });
                      }}>Отклонить</button>
                      <button className="primaryBtn" onClick={async () => {
                        await api.updateTeacherInvite(invite.id, { status: 'accepted' });
                        await reload();
                        notify({ type: 'success', text: 'Преподаватель подключен.' });
                      }}>Принять</button>
                    </>
                  ) : <span className={pillClass[invite.status]}>{invite.status === 'accepted' ? 'Принято' : 'Отклонено'}</span>}
                </div>
              </div>
            </div>
          );
        }) : <div className="empty">Новых приглашений пока нет.</div>}
      </div>
    </Card>
  </div>;
}

function StudentProfilePage({ db, session, reload, notify }) {
  const student = getCurrentStudent(db, session);
  const [form, setForm] = useState({ email: '', phone: '', parentName: '', parentEmail: '' });

  useEffect(() => {
    if (!student) return;
    setForm({ email: student.email || '', phone: student.phone || '', parentName: student.parentName || '', parentEmail: student.parentEmail || student.parentContact || '' });
  }, [student?.id, student?.email, student?.phone, student?.parentName, student?.parentContact, student?.parentEmail]);

  if (!student) return <div className="empty">Не удалось загрузить профиль ученика.</div>;

  const score = db.computed.studentScores[student.id] || 0;
  const teachers = (db.teachers || []).filter(item => studentHasTeacher(student, item.id));
  const slots = effectiveStudentSlots(db, student);
  const assignments = assignmentsForStudent(db, student.id);
  const saveProfile = async () => {
    try {
      await api.updateStudent(student.id, { email: form.email, phone: form.phone, parentName: form.parentName, parentEmail: form.parentEmail });
      await reload();
      notify({ type: 'success', text: 'Профиль обновлен.' });
    } catch (e) {
      notify({ type: 'error', text: e.message });
    }
  };

  return <div className="stack gap24"><div><h2 className="pageTitle">Профиль</h2></div><div className="grid twoCol refinedStudentProfileGrid"><Card title="Основная информация"><div className="studentProfilePanel"><div className="studentProfileName">{student.name}</div><div className="studentProfileMeta">{student.level || 'Статус пока не заполнен'}</div><div className="stack gap12 mt16"><label className="field"><span>Email</span><input className="input" value={form.email} onChange={e=>setForm(v=>({...v, email: e.target.value}))} /></label><label className="field"><span>Телефон</span><input className="input" value={form.phone} onChange={e=>setForm(v=>({...v, phone: e.target.value}))} /></label><label className="field"><span>Имя родителя</span><input className="input" value={form.parentName} onChange={e=>setForm(v=>({...v, parentName: e.target.value}))} placeholder="Опционально" /></label><label className="field"><span>Email родителя</span><input className="input" type="email" value={form.parentEmail} onChange={e=>setForm(v=>({...v, parentEmail: e.target.value}))} placeholder="parent@example.com" /></label><div className="modalActions"><button className="primaryBtn" onClick={async()=>{try { await saveProfile(); } catch (e) { notify({ type: 'error', text: e.message }); }}}>Сохранить изменения</button></div></div></div></Card><Card title="Учебный статус"><div className="studentProfilePanel"><div className="scoreHero">{score}</div><div className="studentProfileMeta">Текущий score</div><div className="stack gap12 mt16"><InfoBox label="Преподаватели" value={teachers.length ? teachers.map(item => item.name).join(', ') : 'Еще не выбраны'} /><InfoBox label="Активные задания" value={String(assignments.length)} /><InfoBox label="Слоты занятий" value={slots.length ? `${slots.length}` : 'Не заданы'} secondary={slots.length ? slots.map(slot => `${slot.day} ${slot.time}`).join(' · ') : 'Добавятся после подключения преподавателя'} /></div>{student.subjects.length ? <div className="chipWrap mt16">{student.subjects.map(subject => <span key={subject} className="chip">{subject}</span>)}</div> : <div className="muted small mt16">Предметы пока не назначены.</div>}</div></Card></div></div>;
}


function KPI({ title, value, onClick }) {
  const Comp = onClick ? 'button' : 'div';
  return <Comp className={cx('kpiCard', onClick && 'clickable')} onClick={onClick}><div className="kpiTitle">{title}</div><div className="kpiValue">{value}</div></Comp>;
}
function Card({ title, subtitle, children, actions }) { return <section className="card"><div className="row between wrap gap12"><div><h3 className="cardHeader">{title}</h3>{subtitle && <div className="muted small">{subtitle}</div>}</div>{actions}</div><div className="mt16">{children}</div></section>; }
function Modal({ title, children, onClose, wide=false }) { return <div className="overlay" onClick={onClose}><div className={cx('modal', wide && 'wide')} onClick={e=>e.stopPropagation()}><div className="modalHead"><div className="modalTitle">{title}</div><button className="iconBtn" onClick={onClose}><X size={16}/></button></div>{children}</div></div>; }
function Drawer({ title, children, onClose }) { return <div className="overlay" onClick={onClose}><div className="drawer" onClick={e=>e.stopPropagation()}><div className="modalHead"><div className="modalTitle">{title}</div><button className="iconBtn" onClick={onClose}><X size={16}/></button></div>{children}</div></div>; }
function Toast({ type, text }) { return <div className={cx('toast', type)}>{text}</div>; }
function CheckSetting({ label, checked, onChange }) { return <label className="checkRow"><input type="checkbox" checked={checked} onChange={onChange} /><span>{label}</span></label>; }
function FilterChip({ active, onClick, children }) { return <button className={cx('chipBtn', active && 'active')} onClick={onClick}>{children}</button>; }
function FilterRow({ filters, setFilters, db, includeAllTime=false, teacherId=null }) {
  const periods = includeAllTime ? PERIODS : PERIODS.filter(p => p.value !== 'all');
  const students = teacherId ? teacherOwnedStudents(db, teacherId) : db.students.filter(s => s.active);
  const groups = teacherId ? teacherOwnedGroups(db, teacherId) : db.groups.filter(g => g.active);
  return <div className="filterRow"><select className="input selectSmall" value={filters.subject} onChange={e=>setFilters(v=>({...v,subject:e.target.value}))}><option value="all">Все предметы</option>{SUBJECT_OPTIONS.map(s=><option key={s}>{s}</option>)}</select><select className="input selectSmall" value={filters.studentId} onChange={e=>setFilters(v=>({...v,studentId:e.target.value}))}><option value="all">Все ученики</option>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select className="input selectSmall" value={filters.groupId} onChange={e=>setFilters(v=>({...v,groupId:e.target.value}))}><option value="all">Все группы</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><select className="input selectSmall" value={filters.period} onChange={e=>setFilters(v=>({...v,period:e.target.value}))}>{periods.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></div>;
}
function InfoBox({ label, value, secondary }) { const textValue = String(value ?? ''); const compact = textValue.length > 16 || /[A-Za-zА-Яа-я]/.test(textValue); return <div className="infoBox refinedInfoBox"><div className="infoLabel">{label}</div><div className={cx('infoValue', compact && 'infoValueCompact')}>{value}</div>{secondary && <div className="muted small">{secondary}</div>}</div>; }
function ChartBar({ data, horizontal=false }) {
  if (!data?.length) return <div className="empty">Недостаточно данных для построения диаграммы.</div>;
  return <ResponsiveContainer width="100%" height={280}>{horizontal ? <BarChart data={data} layout="vertical" margin={{ left: 12, right: 12 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="value" fill="#2563eb" radius={[0,8,8,0]} /></BarChart> : <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-12} textAnchor="end" height={60} /><YAxis /><Tooltip /><Bar dataKey="value" fill="#2563eb" radius={[8,8,0,0]} /></BarChart>}</ResponsiveContainer>;
}
function DeadlineBadge({ assignment, hasWork }) {
  if (hasWork) return null;
  if (!assignment.deadline) return null;
  const hours = (new Date(assignment.deadline).getTime() - Date.now()) / 36e5;
  const cls = hours < 0 ? 'danger' : hours < 24 ? 'warn' : 'success';
  return <span className={cx('pill', cls)}><Clock3 size={12} /> {hours < 0 ? 'Дедлайн прошел' : hours < 24 ? 'Меньше дня' : 'Время есть'}</span>;
}

function effectiveStudentSlots(db, student) {
  const own = (student.lessonSlots || []).map(slot => ({ ...slot, inherited: false }));
  const inherited = db.groups
    .filter(group => group.active && group.studentIds.includes(student.id) && (!studentTeacherIds(student).length || studentTeacherIds(student).includes(group.teacherId)))
    .flatMap(group => (group.lessonSlots || []).map(slot => ({ ...slot, inherited: true, sourceGroupId: group.id, sourceGroupName: group.name })));
  return [...own, ...inherited];
}

function assignmentsForStudent(db, studentId) {
  const student = db.students.find(item => item.id === studentId);
  const allowedTeacherIds = studentTeacherIds(student);
  const visible = (db.assignments || []).filter(assignment => {
    if (assignment.status === 'Черновик') return false;
    if (allowedTeacherIds.length && assignment.teacherId && !allowedTeacherIds.includes(assignment.teacherId)) return false;
    if (assignment.recipientType === 'student') return assignment.recipientId === studentId;
    if (assignment.recipientType === 'students') return (assignment.recipientIds || []).includes(studentId);
    if (assignment.recipientType === 'group') return db.groups.some(group => group.id === assignment.recipientId && group.active && group.studentIds.includes(studentId) && (!allowedTeacherIds.length || allowedTeacherIds.includes(group.teacherId)));
    return false;
  });
  return [...new Map(visible.map(item => [item.id, item])).values()];
}
function buildErrorEvents(db, teacherId=null) { return buildErrorEventsFiltered(db, { subject:'all', period:'all', studentId:'all', groupId:'all' }, teacherId); }
function buildErrorEventsFiltered(db, filters, teacherId=null) {
  const works = teacherId ? teacherOwnedWorks(db, teacherId) : db.works;
  return works.flatMap(work => {
    const assignment = db.assignments.find(a => a.id === work.assignmentId);
    const student = db.students.find(s => s.id === work.studentId);
    const group = db.groups.find(g => g.studentIds.includes(work.studentId) && (!teacherId || g.teacherId === teacherId));
    return (work.aiErrors || []).flatMap(err => (err.types || []).map(type => ({
      workId: work.id,
      name: err.label,
      type,
      description: err.description,
      subject: assignment?.subject || 'Математика',
      studentId: student?.id || '',
      groupId: group?.id || '',
      date: work.submittedAt,
    })));
  }).filter(event => matchFilters(event, filters));
}
function matchFilters(event, filters) {
  const period = PERIODS.find(p => p.value === filters.period) || PERIODS[PERIODS.length-1];
  const timeOk = period.days === Infinity ? true : ((Date.now() - new Date(event.date).getTime()) <= period.days * 864e5);
  return (filters.subject === 'all' || event.subject === filters.subject) && (filters.studentId === 'all' || event.studentId === filters.studentId) && (filters.groupId === 'all' || event.groupId === filters.groupId) && timeOk;
}
function aggregateErrors(events, filters, byType) {
  const source = events.filter(e => matchFilters(e, filters));
  const counts = source.reduce((acc, event) => {
    const key = byType ? event.type : event.name;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value).slice(0,5);
}
function studentsByFilter(db, filters, teacherId=null) {
  const source = teacherId ? teacherOwnedStudents(db, teacherId) : db.students.filter(s => s.active);
  return source.filter(s => (filters.studentId === 'all' || s.id === filters.studentId) && (filters.groupId === 'all' || db.groups.find(g => g.id === filters.groupId)?.studentIds.includes(s.id)));
}
function timelySubmissionForStudent(db, studentId) {
  const assignments = assignmentsForStudent(db, studentId);
  if (!assignments.length) return 0;
  const submittedInTime = assignments.filter(a => db.works.some(w => w.studentId === studentId && w.assignmentId === a.id && (!a.deadline || new Date(w.submittedAt) <= new Date(a.deadline)))).length;
  return Math.round((submittedInTime / assignments.length) * 100);
}
function submissionRate(db, filters, teacherId=null) {
  const students = studentsByFilter(db, filters, teacherId);
  if (!students.length) return 0;
  return round(avg(students.map(student => timelySubmissionForStudent(db, student.id))));
}
function errorCountPerStudent(db, filters, teacherId=null) {
  const ev = buildErrorEventsFiltered(db, filters, teacherId);
  const map = {};
  ev.forEach(e => { map[e.studentId] = (map[e.studentId] || 0) + 1; });
  return Object.entries(map).map(([id, value]) => ({ name: db.students.find(s=>s.id===id)?.name || id, value })).sort((a,b)=>b.value-a.value);
}
function reviewedAverageForTeacher(db, teacherId, studentId) {
  const works = teacherOwnedWorks(db, teacherId).filter(item => item.studentId === studentId && item.status === 'Проверено');
  if (!works.length) return null;
  return round(avg(works.map(work => {
    const assignment = db.assignments.find(item => item.id === work.assignmentId);
    const maxScore = assignment?.maxScore || 100;
    return Math.round(((work.finalScore ?? work.suggestedScore ?? 0) / maxScore) * 100);
  })));
}
function absenceRateForTeacher(db, teacherId, studentId) {
  const records = (db.attendanceRecords || []).filter(item => item.teacherId === teacherId && item.studentId === studentId);
  if (!records.length) return null;
  const absent = records.filter(item => item.status === 'absent').length;
  return Math.round((absent / records.length) * 100);
}
function overdueCountForTeacher(db, teacherId, studentId) {
  return assignmentsForStudent(db, studentId).filter(assignment => assignment.teacherId === teacherId && assignment.deadline && new Date(assignment.deadline) < new Date() && !db.works.some(work => work.studentId === studentId && work.assignmentId === assignment.id && work.teacherId === teacherId)).length;
}
function teacherRiskStudents(db, teacherId) {
  return teacherOwnedStudents(db, teacherId).map(student => {
    const gradePercent = reviewedAverageForTeacher(db, teacherId, student.id);
    const absenceRate = absenceRateForTeacher(db, teacherId, student.id);
    const overdueCount = overdueCountForTeacher(db, teacherId, student.id);
    const factors = [];
    let riskScore = 0;

    if (gradePercent !== null && gradePercent < 60) {
      riskScore += 2;
      factors.push(`низкие оценки: ${gradePercent}%`);
    }
    if (absenceRate !== null && absenceRate >= 25) {
      riskScore += 1;
      factors.push(`пропуски: ${absenceRate}%`);
    }
    if (overdueCount > 0) {
      riskScore += Math.min(2, overdueCount);
      factors.push(`просрочено: ${overdueCount}`);
    }

    return { id: student.id, name: student.name, riskScore, factors };
  }).filter(item => item.riskScore > 0).sort((a, b) => b.riskScore - a.riskScore || a.name.localeCompare(b.name, 'ru'));
}
function hasTeacherAnalyticsData(db, teacherId) {
  return teacherOwnedStudents(db, teacherId).length > 0 && (
    teacherOwnedAssignments(db, teacherId).length > 0
    || teacherOwnedWorks(db, teacherId).length > 0
    || (db.attendanceRecords || []).some(item => item.teacherId === teacherId)
  );
}
function avg(values) { const arr = Array.isArray(values) ? values : Object.values(values || {}); return arr.length ? Math.round(arr.reduce((a,b)=>a+Number(b||0),0)/arr.length) : 0; }
function round(v, p=0) { const m=10**p; return Math.round((Number(v)||0)*m)/m; }
function recipientLabel(db, assignment) {
  if (assignment.recipientType === 'student') return db.students.find(s=>s.id===assignment.recipientId)?.name || 'Неизвестный ученик';
  if (assignment.recipientType === 'students') return (assignment.recipientIds || []).map(id => db.students.find(s => s.id === id)?.name).filter(Boolean).join(', ') || 'Не выбраны ученики';
  if (!assignment.recipientId) return 'Не указан';
  return db.groups.find(g=>g.id===assignment.recipientId)?.name || 'Неизвестная группа';
}
function normalizeUrl(url) { return url?.startsWith('http') ? url : `${API}${url}`; }
function timeToMinutes(time) { const [h,m] = String(time || "00:00").split(":").map(Number); return (h||0)*60 + (m||0); }
function cryptoRandom() { return Math.random().toString(36).slice(2,10); }

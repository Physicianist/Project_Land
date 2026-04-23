import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Archive, ArrowRight, BarChart3, BookOpen, CheckSquare, ChevronRight, Clock3,
  CreditCard, Eye, EyeOff, FileSpreadsheet, FileText, FolderOpen, GraduationCap, ImagePlus,
  LayoutDashboard, Lock, LogOut, Mail, Menu, Pencil, Plus, Save, Search, Send, Settings,
  Sparkles, Trash2, UploadCloud, Users, X
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Landing from './Landing.tsx';
import {
  NORMALIZED_ERROR_TAXONOMY,
  countNormalizedCategories,
  normalizeErrorCategory,
  normalizeErrorTags,
  sanitizeEditableErrorTags,
} from '../shared/error-taxonomy.js';

const API = 'http://127.0.0.1:4000';
const PENDING_INVITE_STORAGE_KEY = 'proveriai_pending_invite_token';
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
  createBatchSession: async (files, scale, teacherId, context = {}) => {
    const fd = new FormData();
    Array.from(files).forEach(file => fd.append('files', file));
    fd.append('scale', scale);
    if (teacherId) fd.append('teacherId', teacherId);
    if (context.assignmentText) fd.append('assignmentText', context.assignmentText);
    if (context.assignmentLinks?.length) fd.append('assignmentLinks', JSON.stringify(context.assignmentLinks));
    if (context.classGroupLabel) fd.append('classGroupLabel', context.classGroupLabel);
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
  resolveTeacherInviteToken: (token) => fetch(`${API}/api/teacher-invites/resolve/${encodeURIComponent(token)}`).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Не удалось проверить ссылку-приглашение');
    return data;
  }),
  acceptTeacherInviteToken: (payload) => jsonPost('/api/teacher-invites/accept-token', payload),
  updateTeacherStudentOverlay: (teacherId, studentId, payload) => jsonPut(`/api/teachers/${teacherId}/students/${studentId}/overlay`, payload),
  previewReport: (payload) => jsonPost('/api/reports/preview', payload),
  getBatchSession: async (sessionId) => {
    const res = await fetch(`${API}/api/batch/sessions/${sessionId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Не удалось обновить пакетную сессию');
    return data;
  },
  saveBatchSession: async (sessionId, payload = {}) => {
    const res = await fetch(`${API}/api/batch/sessions/${sessionId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Не удалось сохранить результаты пакетной проверки');
    return data;
  },
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
function getPendingInviteToken() { return localStorage.getItem(PENDING_INVITE_STORAGE_KEY) || ''; }
function setPendingInviteToken(token) { if (token) localStorage.setItem(PENDING_INVITE_STORAGE_KEY, token); }
function clearPendingInviteToken() { localStorage.removeItem(PENDING_INVITE_STORAGE_KEY); }

const cx = (...items) => items.filter(Boolean).join(' ');
const pillClass = {
  'Активно': 'pill info', 'Черновик': 'pill warn', 'Завершено': 'pill success', 'Прорешено': 'pill success',
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
const PARENT_REPORT_FIELDS = ['Имя ученика', 'Частые типы ошибок', 'Гистограмма оценок', 'Динамика по темам', 'Рекомендации, на что обратить внимание'];
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
    { title: 'Заполнить профиль', text: 'Добавьте телефон и Email родителя, если он нужен для отчетов.', path: '/student/profile', cta: 'Открыть профиль', target: '[data-tour="profile-entry"]' },
    { title: 'Найти преподавателя', text: 'Откройте раздел «Репетиторы» и отправьте запрос нужному преподавателю.', path: '/student/tutors', cta: 'Перейти к репетиторам', target: '[data-tour="nav-/student/tutors"]' },
    { title: 'Открыть первое задание', text: 'Как только преподаватель опубликует задание, оно появится в вашем списке.', path: '/student/assignments', cta: 'Открыть задания', target: '[data-tour="nav-/student/assignments"]' },
  ],
  teacher: [
    { title: 'Заполнить профиль', text: 'Укажите контакты и предметы, с которыми вы работаете.', path: '/teacher/settings', cta: 'Открыть настройки', target: '[data-tour="profile-entry"]' },
    { title: 'Пригласить ученика', text: 'Создайте ученика вручную или отправьте ссылку-приглашение.', path: '/teacher/students', cta: 'Открыть учеников', target: '[data-tour="nav-/teacher/students"]' },
    { title: 'Создать группу или пропустить', text: 'Можно собрать мини-группу сразу или сделать это позже.', path: '/teacher/groups', cta: 'Открыть группы', target: '[data-tour="nav-/teacher/groups"]' },
    { title: 'Выдать первое задание', text: 'После публикации оно сразу появится в аккаунтах нужных учеников.', path: '/teacher/assignments', cta: 'Открыть задания', target: '[data-tour="nav-/teacher/assignments"]' },
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
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateOnly(value) {
  if (!value) return 'Не указан';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU');
}

function deadlineBadgeState(deadline) {
  if (!deadline) return { className: 'neutral', text: 'Без дедлайна' };
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return { className: 'neutral', text: String(deadline) };
  return date < new Date()
    ? { className: 'danger', text: formatDeadline(deadline) }
    : { className: 'success', text: formatDeadline(deadline) };
}

function normalizePhoneForDisplay(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.startsWith('7') ? digits : `7${digits}`;
  const country = normalized.slice(0, 1);
  const area = normalized.slice(1, 4);
  const first = normalized.slice(4, 7);
  const second = normalized.slice(7, 9);
  const third = normalized.slice(9, 11);
  return `+${country}${area ? ` (${area}` : ''}${area.length === 3 ? ')' : ''}${first ? ` ${first}` : ''}${second ? `-${second}` : ''}${third ? `-${third}` : ''}`;
}

function isValidEmailInput(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidPhoneInput(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function formatTeacherVisibleTags(tags = [], fallback = []) {
  const source = sanitizeEditableErrorTags([...(tags || []), ...(fallback || [])]);
  return source.length ? source : normalizeErrorTags(source);
}

function buildNormalizedGroupRiskTopics(db, groupId, teacherId) {
  const group = db.groups.find(item => item.id === groupId && item.teacherId === teacherId);
  if (!group) return [];
  const raw = teacherOwnedWorks(db, teacherId)
    .filter(work => (group.studentIds || []).includes(work.studentId))
    .flatMap(work => [
      ...(work.normalizedErrorCategories || []),
      ...(work.finalErrorTags || []),
      ...(work.aiErrors || []).flatMap(error => [error.normalizedCategory, ...(error.types || []), error.label]),
    ]);
  return countNormalizedCategories(raw).slice(0, 3).map(item => item.name);
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

function AttachmentGallery({ files = [], compact = false, onRemove = null }) {
  const [preview, setPreview] = useState(null);
  if (!files.length) return null;
  return (
    <>
      <div className={cx('gallery', compact && 'attachmentGalleryCompact')}>
        {files.map(file => {
          const href = normalizeUrl(file.url || file.previewUrl || file.normalizedUrl);
          const isPdf = isPdfAttachment(file);
          return (
            <div key={file.id || `${file.name}-${href}`} className="attachmentCard">
              {file.kind === 'photo' ? (
                <button className="attachmentPreviewButton" onClick={() => setPreview(file)}>
                  <img src={href} alt={file.name} className="galleryImg" />
                </button>
              ) : (
                <button className="attachmentFileCard" onClick={() => setPreview(file)}>
                  <FileText size={18} />
                  <span>{file.name}</span>
                  <span className="muted small">{isPdf ? 'PDF' : 'Файл'}</span>
                </button>
              )}
              <div className="row gap8 wrap mt8">
                <button className="secondaryBtn tinyBtn" onClick={() => setPreview(file)}><Eye size={14} /> Открыть</button>
                <a href={href} target="_blank" rel="noreferrer" className="ghostBtn tinyBtn">Скачать</a>
                {onRemove && <button className="iconGhost danger" title="Убрать вложение" aria-label={`Убрать ${file.name}`} onClick={() => onRemove(file)}><Trash2 size={14} /></button>}
              </div>
            </div>
          );
        })}
      </div>
      {preview && <AttachmentPreviewModal file={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function AttachmentPreviewModal({ file, onClose }) {
  const href = normalizeUrl(file.url || file.previewUrl || file.normalizedUrl);
  return <Modal title={file.name || 'Вложение'} onClose={onClose} wide>
    <div className="attachmentFullscreen">
      {file.kind === 'photo' ? (
        <img src={href} alt={file.name} className="attachmentFullscreenImage" />
      ) : (
        <object data={href} type={file.mimeType || 'application/pdf'} className="reviewViewerPdf">
          <a href={href} target="_blank" rel="noreferrer" className="fileTile">Открыть файл</a>
        </object>
      )}
      <div className="modalActions">
        <a href={href} target="_blank" rel="noreferrer" className="secondaryBtn linkButton">Открыть в новой вкладке</a>
        <button className="primaryBtn" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  </Modal>;
}

function formatConfidence(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'н/д';
  return `${Math.round(Number(value) * 100)}%`;
}

function ReviewFileViewer({ files = [], pageIndex = null, onPageChange = null }) {
  const [innerIndex, setInnerIndex] = useState(0);
  const safeFiles = files.length ? files : [];
  const activeIndex = pageIndex === null ? innerIndex : pageIndex;
  const setActiveIndex = onPageChange || setInnerIndex;
  const selected = safeFiles[Math.min(activeIndex, Math.max(safeFiles.length - 1, 0))] || null;
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (pageIndex === null) setInnerIndex(0);
  }, [safeFiles.length, pageIndex]);

  if (!selected) return <div className="empty">Нет приложенных файлов.</div>;
  const href = normalizeUrl(selected.previewUrl || selected.normalizedUrl || selected.url);
  return (
    <>
      <div className="stack gap12">
        <div className="row between wrap gap8">
          <div className="row gap8 alignCenter">
            <button className="iconGhost" onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0}>←</button>
            <span className="muted small">{safeFiles.length > 1 ? `${activeIndex + 1} / ${safeFiles.length}` : '1 / 1'}</span>
            <button className="iconGhost" onClick={() => setActiveIndex(Math.min(safeFiles.length - 1, activeIndex + 1))} disabled={activeIndex >= safeFiles.length - 1}>→</button>
          </div>
          <button className="secondaryBtn tinyBtn" onClick={() => setFullscreen(true)}><Eye size={14} /> Развернуть</button>
        </div>
        <div className="reviewViewerSurface">
          {selected.kind === 'photo'
            ? <img src={href} alt={selected.name} className="reviewViewerImage" />
            : (
              <object data={href} type={selected.mimeType || 'application/pdf'} className="reviewViewerPdf">
                <a href={href} target="_blank" rel="noreferrer" className="fileTile">Открыть файл</a>
              </object>
            )}
        </div>
        <div className="muted small">{selected.originalName || selected.name}</div>
      </div>
      {fullscreen && <AttachmentPreviewModal file={selected} onClose={() => setFullscreen(false)} />}
    </>
  );
}

function RecognizedTextCarousel({ pages = [], pageIndex = null, onPageChange = null }) {
  const [innerIndex, setInnerIndex] = useState(0);
  const activeIndex = pageIndex === null ? innerIndex : pageIndex;
  const setActiveIndex = onPageChange || setInnerIndex;
  const safePages = pages.length ? pages : [{ pageNumber: 1, recognizedText: 'AI еще не собрал распознанный текст.' }];
  const selected = safePages[Math.min(activeIndex, Math.max(safePages.length - 1, 0))] || safePages[0];

  useEffect(() => {
    if (pageIndex === null) setInnerIndex(0);
  }, [safePages.length, pageIndex]);

  return <div className="stack gap12">
    <div className="row between wrap gap8">
      <div className="row gap8 alignCenter">
        <button className="iconGhost" onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0}>←</button>
        <span className="muted small">{`Страница ${selected.pageNumber}`}</span>
        <button className="iconGhost" onClick={() => setActiveIndex(Math.min(safePages.length - 1, activeIndex + 1))} disabled={activeIndex >= safePages.length - 1}>→</button>
      </div>
    </div>
    <pre className="typedText">{selected.recognizedText || 'Текст на этой странице не распознан.'}</pre>
  </div>;
}

function EditableTagList({ tags = [], setTags, disabled = false }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [draftValue, setDraftValue] = useState('');
  const beginEdit = (index) => {
    setEditingIndex(index);
    setDraftValue(tags[index] || '');
  };
  const saveEdit = () => {
    if (editingIndex === null) return;
    const next = [...tags];
    next[editingIndex] = draftValue.trim();
    setTags(sanitizeEditableErrorTags(next));
    setEditingIndex(null);
    setDraftValue('');
  };
  return <div className="chipWrap">
    {tags.length ? tags.map((tag, index) => editingIndex === index ? (
      <input
        key={`${tag}-${index}`}
        className="input chipInput"
        value={draftValue}
        onChange={e => setDraftValue(e.target.value)}
        onBlur={saveEdit}
        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
        autoFocus
      />
    ) : (
      <span key={`${tag}-${index}`} className="editableTag" onDoubleClick={() => !disabled && beginEdit(index)}>
        <span>{tag}</span>
        {!disabled && <button className="tagRemove" onClick={() => setTags(tags.filter((_, currentIndex) => currentIndex !== index))}>×</button>}
      </span>
    )) : <span className="muted small">Теги ошибок появятся после распознавания.</span>}
  </div>;
}

function ReviewSummaryCard({ selected, editMode, finalScore, setFinalScore, studentComment, setStudentComment, errorTags, setErrorTags, onConfirm, onEnableEdit, onReprocess, busy }) {
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
      <div>
        <div className="sectionLabel">Типы ошибок</div>
        <div className="mt8">
          <EditableTagList tags={errorTags} setTags={setErrorTags} disabled={!editMode || busy} />
        </div>
      </div>
      <label className="field">
        <span>Предварительный балл</span>
        <input className="input" type="number" value={finalScore} disabled={!editMode || busy} onChange={e => setFinalScore(Number(e.target.value))} />
      </label>
      <label className="field">
        <span>Комментарий ученику</span>
        <textarea className="input textarea" value={studentComment} disabled={!editMode || busy} onChange={e => setStudentComment(e.target.value)} />
      </label>
      <details className="advancedDisclosure">
        <summary>Расширенный обзор</summary>
        <div className="stack gap12 mt12">
          {(analysis.detectedMistakes || selected.aiErrors || []).length ? (analysis.detectedMistakes || selected.aiErrors || []).map((issue, index) => (
            <div key={`${issue.label || issue.title}-${index}`} className="errorCard">
              <div className="cardTitle">{issue.label || issue.title || 'Замечание'}</div>
              <div className="muted small mt6">{issue.description || 'Подробности будут добавлены после повторной генерации.'}</div>
              <div className="muted small mt8">Где смотреть: {issue.locationHint || 'В соответствующем фрагменте решения'}</div>
            </div>
          )) : <div className="empty">Подробные карточки замечаний пока не сформированы.</div>}
        </div>
      </details>
      <div className="modalActions alignStart">
        <button className="primaryBtn" disabled={busy || !studentComment.trim()} onClick={onConfirm}>Подтвердить</button>
        <button className="secondaryBtn" disabled={busy} onClick={onEnableEdit}>Исправить</button>
        <button className="ghostBtn" disabled={busy} onClick={onReprocess}>Сгенерировать заново</button>
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
        <Route path="/invite/:token" element={<InviteLinkPage session={session} reload={reload} notify={setToast} />} />
        <Route path="/login" element={session ? <Navigate to={session.role === 'teacher' ? (session.accessMode === 'limited' ? '/teacher/grading?tab=batch' : '/teacher') : '/student'} replace /> : <LoginPage onAuth={setServerSession} notify={setToast} />} />
        <Route path="/*" element={session ? <Shell session={session} db={db} reload={reload} logout={logout} notify={setToast} updateSession={updateSession} /> : <Navigate to="/login" replace />} />
      </Routes>
      {toast && <Toast {...toast} />}
    </>
  );
}

function InviteLinkPage({ session, reload, notify }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [inviteInfo, setInviteInfo] = useState(null);
  const [error, setError] = useState('');
  const [binding, setBinding] = useState(false);

  useEffect(() => {
    if (!token) return;
    setPendingInviteToken(token);
    api.resolveTeacherInviteToken(token)
      .then(setInviteInfo)
      .catch(err => setError(err.message));
  }, [token]);

  useEffect(() => {
    if (!token || !session?.userId || session.role !== 'student') return;
    let active = true;
    (async () => {
      try {
        setBinding(true);
        await api.acceptTeacherInviteToken({ token, studentId: session.userId });
        clearPendingInviteToken();
        if (!active) return;
        await reload(session);
        notify({ type: 'success', text: 'Преподаватель успешно подключен.' });
        navigate('/student/tutors', { replace: true });
      } catch (err) {
        if (!active) return;
        setError(err.message);
      } finally {
        if (active) setBinding(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, session?.userId, session?.role, reload, notify, navigate]);

  if (session && session.role !== 'student') {
    return <div className="screen center"><Card title="Ссылка приглашения"><div className="empty">Эта ссылка предназначена для аккаунта ученика.</div></Card></div>;
  }

  return <div className="loginScreen authSplitRefined">
    <section className="hero authShowcase">
      <div className="heroBadge"><Sparkles size={15} /> Приглашение</div>
      <h1>Подключение к преподавателю</h1>
      <p>После входа в аккаунт ученик автоматически привяжется к преподавателю по этой ссылке.</p>
    </section>
    <section className="loginCard authPanel">
      <div className="authTitle">Ссылка приглашения</div>
      {error ? <div className="banner subtle dangerBanner mt16">{error}</div> : (
        <div className="stack gap12 mt16">
          <div className="cardInner">
            <div className="cardTitle">{inviteInfo?.teacher?.name || 'Проверяем приглашение...'}</div>
            <div className="muted mt8">{inviteInfo?.teacher?.email || 'Сейчас получим данные преподавателя'}</div>
          </div>
          {!session ? (
            <div className="row gap8 wrap">
              <button className="primaryBtn" onClick={() => navigate(`/login?mode=login&inviteToken=${encodeURIComponent(token || '')}`)}>Войти как ученик</button>
              <button className="secondaryBtn" onClick={() => navigate(`/login?mode=register&inviteToken=${encodeURIComponent(token || '')}`)}>Создать аккаунт ученика</button>
            </div>
          ) : <div className="muted">{binding ? 'Подключаем преподавателя...' : 'Ожидаем завершения привязки...'}</div>}
        </div>
      )}
    </section>
  </div>;
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
              <button key={item.path} className={cx('navItem', active && 'active', blocked && 'blocked')} onClick={() => onNav(item)} data-tour={`nav-${item.path}`}>
                <Icon size={18} /><span>{item.label}</span>{item.badge ? <span className="navBadge">{item.badge}</span> : null}{blocked && <Lock size={13} />}
              </button>
            );
          })}
        </nav>
        <div className="sidebarFooter stickyFooter">
          <button className="userCard stableUserCard profileEntryButton" data-tour="profile-entry" onClick={() => navigate(session.role === 'teacher' ? '/teacher/settings' : '/student/profile')}>
            <div className="avatar">{session.role === 'teacher' ? 'ЕП' : 'АС'}</div>
            <div>
              <div className="userName">{session.userName}</div>
              <div className="userMeta">{isTeacherLimited ? 'Free-режим после trial' : session.role === 'teacher' ? 'Преподаватель' : 'Ученик'}</div>
            </div>
          </button>
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
      {!session.onboardingCompleted && !!onboardingItems.length && <SpotlightOnboarding
        items={onboardingItems}
        step={onboardingStep}
        setStep={setOnboardingStep}
        onNavigate={path => navigate(path)}
        onComplete={finishOnboarding}
        busy={savingOnboarding}
      />}
    </div>
  );
}

function LoginPage({ onAuth, notify }) {
  const navigate = useNavigate();
  const [role, setRole] = useState('teacher');
  // Determine the initial mode based on the current URL's query params.
  // When `?mode=register` is present, default to the registration screen.
  const [searchParams] = useSearchParams();
  const initialModeParam = searchParams.get('mode');
  const inviteToken = searchParams.get('inviteToken') || getPendingInviteToken();
  const [mode, setMode] = useState(() => initialModeParam === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reg, setReg] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '', parentName: '', parentEmail: '' });
  const [pendingSms, setPendingSms] = useState(null);
  const [smsCode, setSmsCode] = useState('');
  const [working, setWorking] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (inviteToken) setPendingInviteToken(inviteToken);
  }, [inviteToken]);

  const finalizeAuth = async (payload) => {
    if (payload.session.role === 'student' && inviteToken) {
      try {
        await api.acceptTeacherInviteToken({ token: inviteToken, studentId: payload.session.userId });
        clearPendingInviteToken();
        notify({ type: 'success', text: 'Преподаватель автоматически подключен по приглашению.' });
      } catch (error) {
        clearPendingInviteToken();
        notify({ type: 'error', text: error.message });
      }
    }
    onAuth(payload.session);
    if (payload.session.role === 'student' && inviteToken) navigate('/student/tutors');
  };

  const doLogin = async () => {
    setWorking(true);
    try {
      if (!isValidEmailInput(email)) throw new Error('Укажите корректный email.');
      const payload = await api.login({ email, role, password });
      await finalizeAuth(payload);
    } catch (e) {
      notify({ type: 'error', text: e.message });
    } finally { setWorking(false); }
  };

  const doRegister = async () => {
    setWorking(true);
    try {
      if (!isValidEmailInput(reg.email)) throw new Error('Укажите корректный email.');
      if (!isValidPhoneInput(reg.phone)) throw new Error('Укажите корректный телефон.');
      if (role === 'student' && reg.parentEmail && !isValidEmailInput(reg.parentEmail)) throw new Error('Укажите корректный Email родителя.');
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
      await finalizeAuth(payload);
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
              <label className="field"><span>Телефон</span><input className="input" value={reg.phone} onChange={e=>setReg(v=>({...v,phone:normalizePhoneForDisplay(e.target.value)}))} placeholder="+7 (999) 123-45-67" /></label>
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
        <KPI title="Активные ученики" value={activeStudents.length} onClick={() => navigate('/teacher/students')} borderTone="green" />
        <KPI title="Группы" value={activeGroups.length} onClick={() => navigate('/teacher/groups')} borderTone="green" />
        <KPI title="Ждут проверки" value={pendingWorks.length} onClick={() => navigate('/teacher/grading')} borderTone={pendingWorks.length ? 'red' : 'green'} />
        {widgets.totalStudents && <KPI title="Всего учеников" value={teacherHistoricalStudentsCount(db, teacherId)} borderTone="gold" />}
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
          {riskStudents.length ? riskStudents.map(item => <div key={item.id} className="riskRow"><div><div>{item.name}</div><div className="muted small">{item.factors.join(' · ')}</div></div></div>) : <div className="empty">Недостаточно данных.</div>}
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
              setInviteLink(`${window.location.origin}/invite/${invite.token}`);
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
            <Card title={selected.name} subtitle={selected.email || 'Email не указан'} actions={<div className="row gap8 wrap"><button className="iconGhost" onClick={() => setEditing(selected)}><Pencil size={16} /></button><button className="iconGhost danger" title="Удалить аккаунт" aria-label="Удалить аккаунт" onClick={() => setDetachingStudent(selected)}><Trash2 size={16} /></button></div>}>
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
      {editing && <StudentModal mode="edit" db={db} student={editing} notify={notify} onClose={() => setEditing(null)} onSave={async(payload) => { try { await api.updateTeacherStudentOverlay(teacherId, editing.id, payload); await reload(); setEditing(null); notify({ type: 'success', text: 'Изменения ученика сохранены.' }); } catch (e) { notify({ type: 'error', text: e.message }); } }} />}
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
      lessonSlots: slots.map(slot => ({ ...slot, durationHours: Number(slot.durationHours || 0), durationMinutes: Number(slot.durationMinutes || 0) })),
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
    {slotError && <div className="pill danger mt12">{slotError}</div>}
    {!!slots.length && <div className="stack gap8 mt16">{slots.map(slot => <div key={slot.id} className={cx('listRow', (hasLocalDuplicate(slot, slot.id) || hasExternalConflict(slot)) && 'conflictRow')}><span>{slot.day} {slot.time} · {slot.durationHours || 0} ч {slot.durationMinutes || 0} мин</span><button className="iconGhost" onClick={()=>setSlots(prev=>prev.filter(s=>s.id!==slot.id))}><Trash2 size={14}/></button></div>)}</div>}
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
            <InfoBox label="Темы риска" value={buildNormalizedGroupRiskTopics(db, group.id, teacherId).join(', ') || '—'} />
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
      <label className="field compactField"><span>Статус</span><select className="input selectSmall" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Все статусы</option>{['Активно','Прорешено','Черновик'].map(item => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>
    <div className="stack gap12">{filtered.map(item => { const recipient = recipientLabel(db, item); return <button key={item.id} className="assignmentCard polished" onClick={()=>setEditing(item)}><div className="row between wrap gap16"><div><div className="cardTitle">{item.title}</div><div className="muted small mt6">{item.subject} · Получатель: {recipient}</div><div className="muted small mt6">{item.description}</div></div><div className="stack gap8 rightAlign"><span className={pillClass[item.status]}>{item.status}</span>{item.deadline && <span className="muted small">{formatDeadline(item.deadline)}</span>}</div></div></button>; })}</div>
    {!filtered.length && <div className="empty">Пока нет заданий. Создайте первое задание для ученика или группы.</div>}
    {showCreate && <AssignmentModal mode="create" db={db} notify={notify} teacherId={teacherId} onClose={()=>setShowCreate(false)} onSave={async(payload, draftAction)=>{ try { await api.createAssignment(payload); await reload(); setShowCreate(false); notify({type:'success',text: draftAction === 'publish' ? 'Задание опубликовано.' : 'Черновик сохранен.'}); } catch (e) { notify({type:'error',text:e.message}); } }} />}
    {editing && <AssignmentModal mode="edit" db={db} assignment={editing} notify={notify} teacherId={teacherId} onClose={()=>setEditing(null)} onSave={async(payload, draftAction)=>{ try { if (draftAction === 'publish') { await api.publishDraft(editing.id, payload); notify({type:'success',text:'Черновик опубликован.'}); } else if (draftAction === 'delete') { await api.deleteAssignment(editing.id); notify({type:'success',text:'Черновик удален.'}); } else { await api.updateAssignment(editing.id, payload); notify({type:'success',text:'Карточка задания сохранена.'}); } await reload(); setEditing(null); } catch (e) { notify({type:'error',text:e.message}); } }} />}
  </div>;
}

function AssignmentModal({ mode, db, assignment, onClose, onSave, notify, teacherId }) {
  const availableStudents = teacherOwnedStudents(db, teacherId);
  const availableGroups = teacherOwnedGroups(db, teacherId);
  const readOnly = mode === 'edit' && assignment?.status !== 'Черновик';
  const [form, setForm] = useState(() => ({
    title: assignment?.title || '',
    subject: assignment?.subject || 'Математика',
    description: assignment?.description || '',
    recipientType: assignment?.recipientType || 'student',
    recipientId: assignment?.recipientId || availableStudents[0]?.id || availableGroups[0]?.id || null,
    recipientIds: assignment?.recipientIds || [],
    deadline: assignment?.deadline || '',
    status: assignment?.status || 'Черновик',
    links: assignment?.links || [],
    attachments: assignment?.attachments || [],
  }));
  const [linkDraft, setLinkDraft] = useState('');

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
    links: form.links,
  });
  const publishDraft = () => onSave(buildPayload('Активно'), 'publish');
  const saveCard = () => onSave(buildPayload(form.status === 'Черновик' ? 'Черновик' : form.status), 'save');

  return <Modal title={mode === 'create' ? 'Создать задание' : form.status === 'Черновик' ? 'Редактировать черновик' : 'Карточка задания'} onClose={onClose} wide>
    <div className="grid twoCol">
      <label className="field"><span>Название</span><input className="input" value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))} disabled={readOnly} /></label>
      <label className="field"><span>Предмет</span><select className="input" value={form.subject} onChange={e=>setForm(v=>({...v,subject:e.target.value}))} disabled={readOnly}>{['Математика','Физика','Химия'].map(s=><option key={s}>{s}</option>)}</select></label>
      <label className="field full"><span>Задание</span><textarea className="input textarea" value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))} disabled={readOnly} placeholder="Напечатайте задание или укажите задание, которое нужно сделать по прикрепленной ссылке" /></label>
      <div className="field full">
        <span>Ссылка на задание</span>
        {!readOnly && <div className="row gap8 mt8"><input className="input grow" value={linkDraft} onChange={e => setLinkDraft(e.target.value)} placeholder="https://..." /><button className="secondaryBtn" onClick={() => { if (!linkDraft.trim()) return; setForm(v => ({ ...v, links: [...v.links, linkDraft.trim()] })); setLinkDraft(''); }}>Добавить ссылку</button></div>}
        <div className="stack gap8 mt12">
          {form.links.length ? form.links.map(link => <div key={link} className="listRow"><a href={link} target="_blank" rel="noreferrer" className="linkButton">{link}</a>{!readOnly && <button className="iconGhost danger" onClick={() => setForm(v => ({ ...v, links: v.links.filter(item => item !== link) }))}><Trash2 size={14} /></button>}</div>) : <div className="muted small">Ссылки пока не добавлены.</div>}
        </div>
      </div>
      <label className="field"><span>Получатель</span><div className="stack gap10">
        <div className="segmented mini">
          <button className={cx(form.recipientType === 'student' && 'active')} onClick={() => !readOnly && setForm(v => ({ ...v, recipientType: 'student', recipientId: availableStudents[0]?.id || null }))}>Один ученик</button>
          <button className={cx(form.recipientType === 'students' && 'active')} onClick={() => !readOnly && setForm(v => ({ ...v, recipientType: 'students', recipientIds: v.recipientIds.length ? v.recipientIds : availableStudents.slice(0, 1).map(item => item.id), recipientId: null }))}>Несколько учеников</button>
          <button className={cx(form.recipientType === 'group' && 'active')} onClick={() => !readOnly && setForm(v => ({ ...v, recipientType: 'group', recipientId: availableGroups[0]?.id || null, recipientIds: [] }))}>Группа</button>
        </div>
        {form.recipientType === 'student' && <select className="input" value={form.recipientId || ''} onChange={e => setForm(v => ({ ...v, recipientId: e.target.value }))} disabled={readOnly}>{availableStudents.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select>}
        {form.recipientType === 'students' && <div className="checkboxGrid">{availableStudents.length ? availableStudents.map(student => <label key={student.id} className="checkRow"><input type="checkbox" checked={form.recipientIds.includes(student.id)} onChange={e => setForm(v => ({ ...v, recipientIds: e.target.checked ? [...v.recipientIds, student.id] : v.recipientIds.filter(id => id !== student.id) }))} disabled={readOnly} /><span>{student.name}</span></label>) : <div className="empty">Сначала добавьте учеников.</div>}</div>}
        {form.recipientType === 'group' && <select className="input" value={form.recipientId || ''} onChange={e => setForm(v => ({ ...v, recipientId: e.target.value }))} disabled={readOnly}>{availableGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}
      </div></label>
      <div className="field"><span>Дедлайн</span><div className="mt8"><DateOnlyPicker value={form.deadline} onChange={value=>setForm(v=>({...v,deadline:value}))} disabled={readOnly} /></div></div>
    </div>
    <div className="sectionLabel mt20">Вложения</div>
    {!readOnly && <label className="uploadZone small"><input type="file" multiple onChange={async e=>{const files=Array.from(e.target.files||[]); if(files.length) await uploadMore(files); e.target.value='';}} /><UploadCloud size={20} /> Добавить несколько фото и/или файлов</label>}
    {!!form.attachments?.length && <div className="mt16"><AttachmentGallery files={form.attachments} compact onRemove={readOnly ? null : (file => setForm(v => ({ ...v, attachments: v.attachments.filter(item => item.id !== file.id) })))} /></div>}
    <div className="modalActions">
      {readOnly ? <button className="secondaryBtn" onClick={onClose}>Закрыть</button> : <button className="secondaryBtn" onClick={saveCard}>{mode === 'create' || form.status === 'Черновик' ? 'Сохранить черновик' : 'Сохранить изменения'}</button>}
      {mode === 'edit' && form.status === 'Черновик' && <button className="ghostBtn" onClick={()=>onSave({}, 'delete')}><Trash2 size={16}/> Удалить черновик</button>}
      {!readOnly && (mode === 'create' || form.status === 'Черновик') && <button className="primaryBtn" onClick={publishDraft}>Опубликовать</button>}
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
  const [errorTags, setErrorTags] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    if (!selected) return;
    setFinalScore(selected.finalScore ?? selected.suggestedScore ?? 0);
    setStudentComment(selected.finalFeedback?.studentComment || selected.analysisDraft?.studentCommentDraft || selected.aiComment || '');
    setErrorTags(formatTeacherVisibleTags(
      selected.finalFeedback?.errorTags
      || selected.teacherReview?.finalErrorTags
      || selected.analysisDraft?.mistakeTags
      || selected.finalErrorTags
      || selected.normalizedErrorCategories
      || [],
      selected.analysisDraft?.normalizedErrorCategories || [],
    ));
    setEditMode(selected.processingStatus === 'failed' || selected.processingStatus === 'needs_human_review');
    setPageIndex(0);
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
    const recognizedPages = selected.recognitionPages?.length ? selected.recognitionPages : [{ pageNumber: 1, recognizedText: selected.ocrText || 'AI еще не собрал распознанный текст.' }];
    const sourceFiles = selected.submissionAssets?.length ? selected.submissionAssets : selected.files || [];

    return <div className="stack gap24">
      <button className="secondaryBtn fit" onClick={()=>setSelected(null)}>← Назад к очереди</button>
      <div className="grid reviewGrid aiReviewGrid">
        <Card title="Оригинал и страницы">
          <ReviewFileViewer files={sourceFiles} pageIndex={pageIndex} onPageChange={setPageIndex} />
        </Card>
        <Card title="Распознанный текст">
          <div className="stack gap12">
            <RecognizedTextCarousel pages={recognizedPages} pageIndex={pageIndex} onPageChange={setPageIndex} />
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
            errorTags={errorTags}
            setErrorTags={setErrorTags}
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
            onConfirm={async () => {
              try {
                setBusy(true);
                await api.confirmWork(selected.id, { finalScore, aiComment: studentComment, teacherId, errorTags });
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
  const [assignmentText, setAssignmentText] = useState('');
  const [assignmentLinks, setAssignmentLinks] = useState([]);
  const [linkDraft, setLinkDraft] = useState('');
  const [classGroupLabel, setClassGroupLabel] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const teacherSessions = (db.batchSessions || []).filter(item => item.teacherId === session.userId);
  const [sessionId, setSessionId] = useState(teacherSessions?.[0]?.id || null);
  const [sessionState, setSessionState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const activeSession = sessionState || teacherSessions.find(s => s.id === sessionId) || null;

  const startBatchReview = async () => {
    if (!files.length) return notify({ type:'error', text:'Добавь файлы перед началом пакетной проверки.' });
    setLoading(true);
    try {
      const created = await api.createBatchSession(files, scale, session.userId, { assignmentText, assignmentLinks, classGroupLabel });
      setSessionId(created.id);
      setSessionState(created);
      const analyzed = await api.analyzeBatch(created.id);
      setSessionState(analyzed);
      setFiles([]);
      notify({ type:'success', text:'Файлы загружены и поставлены в AI-очередь.' });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!sessionId) return undefined;
    if (!activeSession?.results?.some(result => ['queued', 'processing'].includes(result.status))) return undefined;
    const timer = setInterval(async () => {
      try {
        const fresh = await api.getBatchSession(sessionId);
        setSessionState(previous => {
          if (!previous) return fresh;
          return previous.results === fresh.results ? previous : fresh;
        });
      } catch (error) {
        notify({ type: 'error', text: error.message });
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [sessionId, activeSession?.results, notify]);

  useEffect(() => {
    if (!selectedResult || !activeSession?.results) return;
    const fresh = activeSession.results.find(result => result.id === selectedResult.id);
    if (fresh && fresh !== selectedResult) setSelectedResult(fresh);
  }, [activeSession?.results, selectedResult]);

  const onDropFiles = (incoming) => {
    setFiles(prev => [...prev, ...incoming.filter(file => !prev.some(existing => existing.name === file.name && existing.size === file.size))]);
  };

  return <div className="stack gap24">
    <div className="row between wrap gap16"><div><h2 className="pageTitle">Пакетная проверка</h2><p className="muted">Множественные фото и файлы, явный запуск анализа и компактная таблица результатов.</p></div><div className="row gap8"><select className="input selectSmall" value={scale} onChange={e=>setScale(e.target.value)}><option value="5">5-балльная</option><option value="10">10-балльная</option><option value="100">100-балльная</option></select>{isLimited && <span className="pill info">Текущий тариф: Free</span>}</div></div>
    <div className="grid batchSplit">
      <Card title="Исходники для проверки">
        <div className="stack gap12">
          <label className="field"><span>Задание</span><textarea className="input textarea" value={assignmentText} onChange={e => setAssignmentText(e.target.value)} placeholder="Напечатайте задание или уточните, что нужно сделать по приложенным материалам" /></label>
          <label className="field"><span>Класс/Группа</span><input className="input" value={classGroupLabel} onChange={e => setClassGroupLabel(e.target.value)} placeholder="Например, 8А или Подготовка к ОГЭ" /></label>
          <div className="field"><span>Ссылка на задание</span><div className="row gap8 mt8"><input className="input grow" value={linkDraft} onChange={e => setLinkDraft(e.target.value)} placeholder="https://..." /><button className="secondaryBtn" onClick={() => { if (!linkDraft.trim()) return; setAssignmentLinks(prev => [...prev, linkDraft.trim()]); setLinkDraft(''); }}>Добавить ссылку</button></div>{assignmentLinks.length ? <div className="stack gap8 mt12">{assignmentLinks.map(link => <div key={link} className="listRow"><a href={link} className="linkButton" target="_blank" rel="noreferrer">{link}</a><button className="iconGhost danger" onClick={() => setAssignmentLinks(prev => prev.filter(item => item !== link))}><Trash2 size={14} /></button></div>)}</div> : null}</div>
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
          <div className="batchFileList">{files.length ? files.map(file => <div key={file.name+file.size} className="listRow compact"><div className="stack"><span>{file.name}</span><span className="muted small">{loading ? 'в обработке' : 'ожидает загрузки'}</span></div><button className="iconGhost danger" onClick={() => setFiles(prev => prev.filter(item => !(item.name === file.name && item.size === file.size)))}><Trash2 size={14} /></button></div>) : <div className="empty">Файлы еще не добавлены.</div>}</div>
          <div className="row gap8 wrap">
            <button className="primaryBtn" onClick={startBatchReview} disabled={loading || !files.length}>Начать обработку</button>
            {activeSession?.results?.some(result => result.status === 'failed') && <button className="ghostBtn" onClick={async () => { try { await api.retryFailedBatch(activeSession.id); notify({ type:'success', text:'Ошибочные файлы снова поставлены в очередь.' }); } catch (error) { notify({ type:'error', text:error.message }); } }}>Повторить ошибочные</button>}
          </div>
        </div>
      </Card>
      <Card title="Результаты пакетной обработки">
        {!activeSession || !activeSession.results?.length ? <div className="empty">Таблица пуста. Сначала добавь файлы и нажми «Начать обработку».</div> : <><div className="tableScroll compactTableWrap"><table className="dataTable compactTable"><thead><tr><th>Ученик</th><th>Статус</th><th>Ошибки</th><th>Балл</th></tr></thead><tbody>{activeSession.results.map(result => <tr key={result.id} onClick={()=>setSelectedResult(result)}><td><InlineEditableCell value={result.name} onSave={async (name) => { const saved = await api.updateBatchResult(activeSession.id, result.id, { name }); setSessionState(current => ({ ...current, results: current.results.map(item => item.id === result.id ? { ...item, ...saved } : item) })); }} /></td><td><span className={pillClass[result.status || 'uploaded']}>{displayAiStatus(result.status)}</span></td><td><div className="chipWrap">{(result.errorTypes||[]).slice(0,3).map(type => <span key={type} className="chip">{type}</span>)}</div></td><td>{result.score ?? '—'}</td></tr>)}</tbody></table></div><div className="modalActions"><button className="primaryBtn" onClick={async () => { try { await api.saveBatchSession(activeSession.id, { teacherId: session.userId }); notify({ type: 'success', text: 'Результаты пакетной проверки сохранены.' }); } catch (error) { notify({ type: 'error', text: error.message }); } }}>Сохранить</button></div></>}
      </Card>
    </div>
    {selectedResult && <BatchResultModal result={selectedResult} sessionId={activeSession.id} onClose={()=>setSelectedResult(null)} onSave={async(payload)=>{const updated = await api.updateBatchResult(activeSession.id, selectedResult.id, payload); setSessionState(current => ({ ...current, results: current.results.map(item => item.id === selectedResult.id ? { ...item, ...updated } : item) })); setSelectedResult(null); notify({type:'success',text:'Результат пакетной проверки обновлен.'});}} />}
  </div>;
}


function BatchResultModal({ result, onClose, onSave }) {
  const [score, setScore] = useState(result.score ?? 0);
  const [aiComment, setAiComment] = useState(result.aiComment || '');
  const [errorTags, setErrorTags] = useState(formatTeacherVisibleTags(result.errorTypes || result.normalizedErrorCategories || []));
  const [pageIndex, setPageIndex] = useState(0);
  const files = result.submissionAssets?.length ? result.submissionAssets : (result.file ? [result.file] : result.sourceUrl ? [{ id: result.id, url: result.sourceUrl, kind: 'photo', name: result.name }] : []);
  const recognizedPages = result.recognitionPages?.length ? result.recognitionPages : [{ pageNumber: 1, recognizedText: result.typedText || 'AI еще не закончил распознавание.' }];
  return <Modal title={result.name} onClose={onClose} wide>
    <div className="grid reviewGrid aiReviewGrid">
      <Card title="Оригинал и страницы">
        <ReviewFileViewer files={files} pageIndex={pageIndex} onPageChange={setPageIndex} />
      </Card>
      <Card title="Распознанный текст">
        <RecognizedTextCarousel pages={recognizedPages} pageIndex={pageIndex} onPageChange={setPageIndex} />
      </Card>
      <Card title="Черновик результата">
        <div className="row gap8 wrap">
          <span className={pillClass[result.status || 'uploaded']}>{displayAiStatus(result.status)}</span>
        </div>
        <div className="sectionLabel mt16">Типы ошибок</div>
        <div className="mt8"><EditableTagList tags={errorTags} setTags={setErrorTags} /></div>
        <label className="field mt16"><span>Комментарий AI</span><textarea className="input textarea" value={aiComment} onChange={e=>setAiComment(e.target.value)} /></label>
        <label className="field mt16"><span>Итоговый балл</span><input className="input" type="number" value={score} onChange={e=>setScore(Number(e.target.value))} /></label>
        <details className="advancedDisclosure">
          <summary>Расширенный обзор</summary>
          <div className="stack gap12 mt12">
            {result.errorDescription ? <div className="errorCard"><div className="cardTitle">Краткий обзор замечаний</div><div className="muted small mt6">{result.errorDescription}</div><div className="muted small mt8">Где смотреть: По соответствующим страницам распознанного текста и оригинала</div></div> : <div className="empty">Подробный обзор появится после обработки.</div>}
          </div>
        </details>
        <div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Отмена</button><button className="primaryBtn" onClick={()=>onSave({ score, aiComment, errorTypes: errorTags })}>Сохранить</button></div>
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
        {riskStudents.length ? riskStudents.map(item => <div key={item.id} className="riskRow"><div><div>{item.name}</div><div className="muted small">{item.factors.join(' · ')}</div></div></div>) : <div className="empty">Недостаточно данных</div>}
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
  const reportTemplates = db.meta?.reportTemplates || [
    { id: 'concise', label: 'Краткое резюме' },
    { id: 'progress', label: 'Фокус на прогрессе' },
    { id: 'recommendations', label: 'Фокус на рекомендациях' },
  ];
  const [targetType, setTargetType] = useState('student');
  const [targetId, setTargetId] = useState(teacherStudents[0]?.id || '');
  const [frequency, setFrequency] = useState('Еженедельно');
  const [previewStudentId, setPreviewStudentId] = useState(teacherStudents[0]?.id || '');
  const [periodFrom, setPeriodFrom] = useState(() => new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10));
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [template, setTemplate] = useState(reportTemplates[0]?.id || 'concise');
  const [previewHtml, setPreviewHtml] = useState('');
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
        <label className="field mt16"><span>Шаблон</span><select className="input" value={template} onChange={e=>setTemplate(e.target.value)}>{reportTemplates.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        {savingDisabled && <div className="pill warn mt16">{targetType === 'student' ? 'Автоотправка недоступна, пока у выбранного ученика не заполнен Email родителя.' : 'В выбранной группе пока нет учеников с заполненным Email родителя.'}</div>}
        <button className="primaryBtn mt20" disabled={savingDisabled} onClick={async()=>{try { await api.saveReportConfig({ targetType, targetId, frequency, teacherId, template }); await reload(); notify({type:'success',text:'Настройки автоотправки сохранены.'}); } catch (e) { notify({ type:'error', text:e.message }); }}}>Сохранить</button>
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
          <ul className="mailList"><li>Имя ученика</li><li>Частые типы ошибок</li><li>Гистограмма оценок</li><li>Динамика по темам</li><li>Рекомендации, на что обратить внимание</li></ul>
        </div>
        {sendingDisabled && <div className="pill warn mt16">Отправка недоступна, пока у выбранного ученика не заполнен Email родителя.</div>}
        <div className="row gap8 wrap mt20">
          <button className="secondaryBtn" disabled={sendingDisabled} onClick={async()=>{try { const result = await api.previewReport({ targetType: 'student', targetId: previewStudentId, teacherId, periodFrom, periodTo, template }); setPreviewHtml(result.html || ''); } catch (e) { notify({ type:'error', text:e.message }); }}}>Посмотреть отчет</button>
          <button className="primaryBtn" disabled={sendingDisabled} onClick={async()=>{try { const result = await api.sendReport({ targetType: 'student', targetId: previewStudentId, teacherId, periodFrom, periodTo, template }); await reload(); notify({type:'success',text: result.deliveries?.[0]?.url ? 'PDF-отчет сформирован и добавлен в журнал отправок.' : 'Отчет отправлен.'}); } catch (e) { notify({ type:'error', text:e.message }); }}}>Отправить отчет</button>
        </div>
      </Card>
    </div>
    <Card title="Журнал отправок"><div className="stack gap10">{(db.reportLogs || []).filter(log => log.teacherId === teacherId).length ? (db.reportLogs || []).filter(log => log.teacherId === teacherId).slice(0,8).map(log => <div key={log.id} className="listRow"><div><div>{log.targetLabel}</div><div className="muted small">{new Date(log.createdAt).toLocaleString('ru-RU')} · {log.mode} · {log.periodLabel || 'Период не указан'}</div></div><div className="row gap8 wrap">{log.deliveries?.[0]?.url && <a className="secondaryBtn linkButton" href={log.deliveries[0].url} target="_blank" rel="noreferrer"><FileText size={16} /> PDF</a>}<div className="muted small">{log.recipients.length} получателей</div></div></div>) : <div className="empty">Отправок пока не было.</div>}</div></Card>
    {previewHtml && <Modal title="Превью отчета" onClose={() => setPreviewHtml('')} wide><div className="reportPreviewFrame" dangerouslySetInnerHTML={{ __html: previewHtml }} /></Modal>}
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
      {!!assignment.links?.length && <div className="stack gap8"><div className="sectionLabel">Ссылки на задание</div>{assignment.links.map(link => <a key={link} href={link} target="_blank" rel="noreferrer" className="linkButton">{link}</a>)}</div>}
      {assignment.attachments?.length > 0 && <AttachmentGallery files={assignment.attachments} />}
      {work && <>
        <div className="cardInner">Решение уже отправлено преподавателю. Повторная дозагрузка файлов для этой работы недоступна.</div>
        <div className="row gap8 wrap"><span className={pillClass[displayWorkStatus(work.status, 'student')]}>{displayWorkStatus(work.status, 'student')}</span>{work.submittedAt && <span className="muted small">Отправлено: {work.submittedAt}</span>}</div>
        {!!work.files?.length && <AttachmentGallery files={work.files} compact />}
        {work.finalFeedback && <div className="cardInner"><div className="sectionLabel">Подтвержденный результат</div><div className="mt8"><strong>Балл:</strong> {work.finalFeedback.finalScore}</div><div className="mt8">{work.finalFeedback.studentComment || 'Комментарий появится после подтверждения преподавателем.'}</div>{work.finalFeedback.recommendations?.length ? <div className="chipWrap mt12">{work.finalFeedback.recommendations.map(item => <span key={item} className="chip">{item}</span>)}</div> : null}</div>}
      </>}
      {!readonly && !work && <><label className="uploadZone small"><input type="file" multiple onChange={e=>setFiles(prev=>[...prev, ...Array.from(e.target.files||[]).filter(file => !prev.some(existing => existing.name === file.name && existing.size === file.size))])} /> <UploadCloud size={20} /> Добавить несколько фото/файлов</label>{files.length>0 && <div className="attachList">{files.map(file => <span key={file.name+file.size} className="attachChip">{file.name}<button className="tagRemove" onClick={() => setFiles(prev => prev.filter(item => !(item.name === file.name && item.size === file.size)))}>×</button></span>)}</div>}<div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Закрыть</button><button className="primaryBtn" onClick={()=>onUpload(files)} disabled={!files.length}>Загрузить</button></div></>}
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


function KPI({ title, value, onClick, borderTone = 'blue' }) {
  const Comp = onClick ? 'button' : 'div';
  return <Comp className={cx('kpiCard', onClick && 'clickable', `kpiBorder-${borderTone}`)} onClick={onClick}><div className="kpiTitle">{title}</div><div className="kpiValue">{value}</div></Comp>;
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
function InlineEditableCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (editing) {
    return <input className="input inlineCellInput" value={draft} onClick={e => e.stopPropagation()} onChange={e => setDraft(e.target.value)} onBlur={async () => { await onSave(draft.trim() || value); setEditing(false); }} onKeyDown={async e => { if (e.key === 'Enter') { await onSave(draft.trim() || value); setEditing(false); } }} autoFocus />;
  }
  return <button className="inlineCellButton" onClick={e => e.stopPropagation()} onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}>{value}</button>;
}
function SpotlightOnboarding({ items = [], step = 0, setStep, onNavigate, onComplete, busy }) {
  const [rect, setRect] = useState(null);
  const current = items[step] || null;

  useEffect(() => {
    const updateRect = () => {
      if (!current?.target) return setRect(null);
      const element = document.querySelector(current.target);
      if (!element) return setRect(null);
      const nextRect = element.getBoundingClientRect();
      setRect(nextRect);
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [current?.target, step]);

  if (!current) return null;
  const tooltipStyle = rect ? {
    top: Math.min(window.innerHeight - 220, rect.bottom + 18),
    left: Math.min(window.innerWidth - 360, Math.max(24, rect.left)),
  } : { top: '18%', left: '50%', transform: 'translateX(-50%)' };
  const spotlightStyle = rect ? {
    top: rect.top - 8,
    left: rect.left - 8,
    width: rect.width + 16,
    height: rect.height + 16,
  } : null;

  return <div className="spotlightOverlay">
    {spotlightStyle && <div className="spotlightTarget" style={spotlightStyle} />}
    <div className="spotlightTooltip" style={tooltipStyle}>
      <div className="chipWrap">
        {items.map((item, index) => <span key={item.title} className={cx('chip', index === step && 'chipInherited')}>{index + 1}</span>)}
      </div>
      <div className="cardTitle mt12">{current.title}</div>
      <div className="muted mt8">{current.text}</div>
      <div className="modalActions">
        <button className="secondaryBtn" onClick={() => setStep(value => Math.max(0, value - 1))} disabled={step === 0}>Назад</button>
        <button className="ghostBtn" onClick={() => onNavigate(current.path)}>{current.cta}</button>
        {step < items.length - 1 ? (
          <button className="primaryBtn" onClick={() => setStep(value => Math.min(items.length - 1, value + 1))}>Далее</button>
        ) : (
          <button className="primaryBtn" onClick={onComplete} disabled={busy}>Завершить</button>
        )}
      </div>
      <button className="linkButton alignStart mt8" onClick={onComplete}>Больше не показывать</button>
    </div>
  </div>;
}
function DateOnlyPicker({ value, onChange, placeholder = 'ДД.ММ.ГГГГ', disabled = false }) {
  const inputRef = useRef(null);
  const displayValue = value ? formatDeadline(value) : placeholder;
  return <div className={cx('dateOnlyField', disabled && 'disabled')} onClick={() => !disabled && (inputRef.current?.showPicker?.() || inputRef.current?.focus())} role="button" tabIndex={disabled ? -1 : 0} onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.showPicker?.() || inputRef.current?.focus(); }}>
    <span>{displayValue}</span>
    <input ref={inputRef} className="dateOnlyInput" type="date" value={value ? new Date(value).toISOString().slice(0, 10) : ''} onChange={e => onChange(e.target.value)} disabled={disabled} />
  </div>;
}
function ChartBar({ data, horizontal=false }) {
  if (!data?.length) return <div className="empty">Недостаточно данных для построения диаграммы.</div>;
  return <ResponsiveContainer width="100%" height={280}>{horizontal ? <BarChart data={data} layout="vertical" margin={{ left: 12, right: 12 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="value" fill="#2563eb" radius={[0,8,8,0]} /></BarChart> : <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-12} textAnchor="end" height={60} /><YAxis /><Tooltip /><Bar dataKey="value" fill="#2563eb" radius={[8,8,0,0]} /></BarChart>}</ResponsiveContainer>;
}
function DeadlineBadge({ assignment, hasWork }) {
  if (hasWork) return null;
  const badge = deadlineBadgeState(assignment.deadline);
  return <span className={cx('pill', badge.className)}><Clock3 size={12} /> {badge.text}</span>;
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
  const workEvents = works.flatMap(work => {
    const assignment = db.assignments.find(a => a.id === work.assignmentId);
    const student = db.students.find(s => s.id === work.studentId);
    const group = db.groups.find(g => g.studentIds.includes(work.studentId) && (!teacherId || g.teacherId === teacherId));
    const rawTypes = [
      ...(work.normalizedErrorCategories || []),
      ...(work.finalErrorTags || []),
      ...(work.aiErrors || []).flatMap(err => [err.normalizedCategory, ...(err.types || []), err.label]),
    ];
    return rawTypes.map(type => ({
      workId: work.id,
      name: normalizeErrorCategory(type),
      type: normalizeErrorCategory(type),
      normalizedCategory: normalizeErrorCategory(type),
      description: type,
      subject: assignment?.subject || 'Математика',
      studentId: student?.id || '',
      groupId: group?.id || '',
      date: work.submittedAt,
    }));
  });
  const batchEvents = (db.savedBatchResults || [])
    .filter(item => !teacherId || item.teacherId === teacherId)
    .flatMap(item => (item.normalizedErrorCategories || []).map(category => ({
      workId: item.id,
      name: normalizeErrorCategory(category),
      type: normalizeErrorCategory(category),
      normalizedCategory: normalizeErrorCategory(category),
      description: category,
      subject: 'Пакетная проверка',
      studentId: 'all',
      groupId: 'all',
      date: item.savedAt,
    })));
  return [...workEvents, ...batchEvents].filter(event => matchFilters(event, filters));
}
function matchFilters(event, filters) {
  const period = PERIODS.find(p => p.value === filters.period) || PERIODS[PERIODS.length-1];
  const timeOk = period.days === Infinity ? true : ((Date.now() - new Date(event.date).getTime()) <= period.days * 864e5);
  return (filters.subject === 'all' || event.subject === filters.subject) && (filters.studentId === 'all' || event.studentId === filters.studentId) && (filters.groupId === 'all' || event.groupId === filters.groupId) && timeOk;
}
function aggregateErrors(events, filters, byType) {
  const source = events.filter(e => matchFilters(e, filters));
  const counts = source.reduce((acc, event) => {
    const key = byType ? event.type : event.normalizedCategory || event.name;
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

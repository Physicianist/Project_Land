import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BarChart3, BookOpen, CheckSquare, ChevronLeft, ChevronRight, Clock3,
  CreditCard, Download, ExternalLink, Expand, FileText, FolderOpen, GraduationCap,
  LayoutDashboard, Link2, Lock, LogOut, Maximize2, Minimize2, Pencil, Plus, RotateCw, Save, Search, Send, Settings,
  Sparkles, Trash2, UploadCloud, User, Users, X
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Landing from './Landing.tsx';

const API = 'http://127.0.0.1:4000';

const ERROR_TAXONOMY = [
  'Арифметическая ошибка',
  'Вычислительная ошибка',
  'Ошибка в формуле',
  'Несоответствие условию',
  'Ошибка в единицах измерения',
  'Логическая ошибка в решении',
  'Ошибка в преобразованиях',
  'Ошибка в построении графика/рисунка',
];

function normalizeErrorType(raw = '') {
  const s = String(raw).toLowerCase();
  if (s.includes('арифмет')) return ERROR_TAXONOMY[0];
  if (s.includes('вычислит') || s.includes('расчет') || s.includes('подсчет')) return ERROR_TAXONOMY[1];
  if (s.includes('формул') || s.includes('уравнен')) return ERROR_TAXONOMY[2];
  if (s.includes('условие') || s.includes('несоответ') || s.includes('задани')) return ERROR_TAXONOMY[3];
  if (s.includes('единиц') || s.includes('размерн') || s.includes('измерен')) return ERROR_TAXONOMY[4];
  if (s.includes('логич') || s.includes('рассужд') || s.includes('вывод')) return ERROR_TAXONOMY[5];
  if (s.includes('преобразован') || s.includes('конверт') || s.includes('перевод')) return ERROR_TAXONOMY[6];
  if (s.includes('график') || s.includes('рисун') || s.includes('чертеж') || s.includes('схем')) return ERROR_TAXONOMY[7];
  // Map to closest category by first word
  if (s.includes('ошибк') && s.includes('вычисл')) return ERROR_TAXONOMY[1];
  return raw;
}

function normalizeErrorTypesInErrors(errors = []) {
  return errors.map(err => ({
    ...err,
    types: (err.types || []).map(t => normalizeErrorType(t)),
  }));
}

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
  createBatchSession: async (files, scale, teacherId, assignmentFiles = [], assignmentLinks = []) => {
    const fd = new FormData();
    Array.from(files).forEach(file => fd.append('files', file));
    Array.from(assignmentFiles).forEach(file => fd.append('assignmentFiles', file));
    fd.append('scale', scale);
    if (teacherId) fd.append('teacherId', teacherId);
    if (assignmentLinks.length) fd.append('assignmentLinks', JSON.stringify(assignmentLinks));
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
  register: async (payload) => {
    const res = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(data.error || 'Запрос завершился с ошибкой'); err.fields = data.fields || null; throw err; }
    return data;
  },
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
  validateInviteToken: (token) => fetch(`${API}/api/invite/validate/${encodeURIComponent(token)}`).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Ссылка недействительна.'); return d; }),
  claimInviteToken: (token, studentId) => jsonPost(`/api/invite/claim-auto/${encodeURIComponent(token)}`, { studentId }),
  saveStudentOverlay: (studentId, payload) => jsonPut(`/api/students/${studentId}/overlay`, payload),
  getInviteInfo: (token) => fetch(`${API}/api/invite/validate/${encodeURIComponent(token)}`).then(async r => { const d = await r.json().catch(() => ({})); return { ok: r.ok, data: d }; }),
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
    { title: 'Заполните профиль', text: 'Добавьте телефон и Email родителя, если он нужен для отчетов.' },
    { title: 'Подключите преподавателя', text: 'Откройте раздел «Репетиторы» и отправьте запрос нужному преподавателю.' },
    { title: 'Откройте первое задание', text: 'Как только преподаватель опубликует задание, оно появится в вашем списке.' },
    { title: 'Прикрепите решение', text: 'В карточке задания выберите фото или файл и нажмите «Загрузить».' },
    { title: 'Дождитесь проверки', text: 'После отправки преподаватель получит вашу работу и начнёт проверку.' },
    { title: 'Посмотрите результат и рекомендации', text: 'Проверенные работы появятся в разделе «Главная» с баллом и комментарием.' },
  ],
  teacher: [
    { title: 'Заполните профиль', text: 'Укажите контакты и предметы, с которыми вы работаете.' },
    { title: 'Добавьте ученика', text: 'Создайте ученика вручную или отправьте ссылку-приглашение.' },
    { title: 'Создайте группу', text: 'Объедините учеников с одним предметом и расписанием в группу.' },
    { title: 'Создайте задание', text: 'Добавьте задание и опубликуйте его для нужного ученика или группы.' },
    { title: 'Проверьте работу', text: 'Откройте «Проверка → Очередь» и подтвердите AI-черновик для каждой работы.' },
    { title: 'Используйте пакетную проверку', text: 'Загрузите несколько работ сразу в «Пакетная проверка» для быстрого анализа.' },
    { title: 'Сформируйте отчет', text: 'В разделе «Отчеты» настройте автоотправку или сформируйте PDF вручную.' },
    { title: 'Настройте тариф и параметры кабинета', text: 'В «Настройки → Тарифы» выберите подходящий план.' },
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

function ImageCarousel({ files = [] }) {
  const [idx, setIdx] = useState(0);
  const [rotations, setRotations] = useState({});
  const safeFiles = files.length ? files : [];
  const cur = safeFiles[Math.min(idx, Math.max(safeFiles.length - 1, 0))] || null;

  useEffect(() => { setIdx(0); setRotations({}); }, [safeFiles.length]);

  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(safeFiles.length - 1, i + 1));
  const rotate = () => setRotations(r => ({ ...r, [idx]: ((r[idx] || 0) + 90) % 360 }));

  if (!cur) return <div className="empty">Нет приложенных файлов.</div>;
  const href = normalizeUrl(cur.previewUrl || cur.normalizedUrl || cur.url);
  const currentRotation = rotations[idx] || 0;

  return (
    <div className="carouselViewer">
      <div className="carouselImageWrap">
        {cur.kind === 'photo'
          ? <img src={href} alt={cur.name} className="carouselImage" style={{ transform: `rotate(${currentRotation}deg)`, transition: 'transform .25s ease' }} />
          : <object data={href} type={cur.mimeType || 'application/pdf'} className="reviewViewerPdf"><a href={href} target="_blank" rel="noreferrer" className="fileTile">Открыть файл</a></object>}
      </div>
      <div className="carouselControls">
        <button className="iconGhost" onClick={prev} disabled={idx === 0}><ChevronLeft size={18}/></button>
        <span className="muted small">{idx + 1} / {safeFiles.length}</span>
        <button className="iconGhost" onClick={next} disabled={idx === safeFiles.length - 1}><ChevronRight size={18}/></button>
        <button className="iconGhost" onClick={rotate} title="Повернуть"><RotateCw size={16}/></button>
        <a href={href} download target="_blank" rel="noreferrer" className="iconGhost" title="Скачать"><Download size={16}/></a>
      </div>
      <div className="muted small mt4">{cur.originalName || cur.name}</div>
    </div>
  );
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

function ReviewSummaryCard({ selected, finalScore, setFinalScore, studentComment, setStudentComment, onConfirm, onReprocess, busy }) {
  const analysis = selected.analysisDraft || {};
  const warnings = [...new Set([...(selected.reviewWarnings || []), ...(analysis.warnings || [])].filter(Boolean))];
  const mistakes = normalizeErrorTypesInErrors(selected.analysisDraft?.detectedMistakes || selected.aiErrors || []);
  return (
    <div className="stack gap12">
      <div className="row gap8 wrap">
        <span className={pillClass[selected.processingStatus || 'uploaded']}>{displayAiStatus(selected.processingStatus)}</span>
        {selected.needsHumanReview && <span className="pill warn">Нужна ручная проверка</span>}
      </div>
      {!!warnings.length && <div className="stack gap8">{warnings.map((warning, index) => <div key={`${warning}-${index}`} className="banner subtle">{warning}</div>)}</div>}
      <label className="field">
        <span>Предварительный балл</span>
        <input className="input" type="number" value={finalScore} disabled={busy} onChange={e => setFinalScore(Number(e.target.value))} />
      </label>
      <label className="field">
        <span>Комментарий ученику</span>
        <textarea className="input textarea" value={studentComment} disabled={busy} onChange={e => setStudentComment(e.target.value)} />
      </label>
      {!!mistakes.length && <details className="advancedDisclosure">
        <summary>Расширенный обзор</summary>
        <div className="stack gap12 mt12">
          {mistakes.map((err, idx) => (
            <div key={idx} className="errorCard">
              <div className="row gap8 wrap">{(err.types||[]).map(type => <span key={type} className="pill warn">{type}</span>)}</div>
              <div className="cardTitle mt8">{err.label}</div>
              <div className="muted small mt6">{err.description}</div>
              {err.locationHint && <div className="muted small mt6">Где смотреть: {err.locationHint}</div>}
            </div>
          ))}
        </div>
      </details>}
      <div className="modalActions alignStart">
        <button className="primaryBtn" disabled={busy || !studentComment.trim()} onClick={onConfirm}>Подтвердить</button>
        <button className="ghostBtn" disabled={busy} onClick={onReprocess}>Сгенерировать заново</button>
      </div>
    </div>
  );
}


function InvitePage({ notify, onAuth }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [session] = useState(getSession());
  const [info, setInfo] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | valid | invalid | done

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    api.getInviteInfo(token).then(({ ok, data }) => {
      if (!ok) { setStatus('invalid'); return; }
      setInfo(data);
      setStatus('valid');
      if (!session) {
        // Redirect to login, preserve token
        navigate(`/login?mode=register&inviteToken=${encodeURIComponent(token)}`, { replace: true });
      }
    });
  }, [token]);

  useEffect(() => {
    if (status !== 'valid' || !session || !info) return;
    if (session.role !== 'student') {
      notify({ type: 'error', text: 'Ссылка-приглашение предназначена для ученика.' });
      navigate('/teacher', { replace: true });
      return;
    }
    api.claimInviteToken(token, session.userId).then(() => {
      setStatus('done');
      notify({ type: 'success', text: `Преподаватель ${info.invite?.teacherName || ''} подключён.` });
      navigate('/student/tutors', { replace: true });
    }).catch(e => {
      notify({ type: 'error', text: e.message });
      navigate('/student', { replace: true });
    });
  }, [status, session, info]);

  if (status === 'loading') return <div className="screen center">Проверка ссылки-приглашения…</div>;
  if (status === 'invalid') return (
    <div className="screen center">
      <div className="card" style={{maxWidth:420,textAlign:'center'}}>
        <h2>Ссылка недействительна</h2>
        <p className="muted">Эта ссылка-приглашение уже использована или не существует.</p>
        <button className="primaryBtn mt16" onClick={() => navigate('/login')}>На главную</button>
      </div>
    </div>
  );
  return <div className="screen center">Подключение преподавателя…</div>;
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
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const setServerSession = (next) => updateSession(next);
  const logout = () => updateSession(null);

  if (loading || !db) return <div className="screen center">Загрузка проекта…</div>;

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/invite/:token" element={<InvitePage notify={setToast} onAuth={setServerSession} />} />
        <Route path="/login" element={session ? <Navigate to={session.role === 'teacher' ? (session.accessMode === 'limited' ? '/teacher/grading?tab=batch' : '/teacher') : '/student'} replace /> : <LoginPage onAuth={setServerSession} notify={setToast} />} />
        <Route path="/*" element={session ? <Shell session={session} db={db} reload={reload} logout={logout} notify={setToast} updateSession={updateSession} /> : <Navigate to="/login" replace />} />
      </Routes>
      {toast && <Toast {...toast} />}
    </>
  );
}

function SpotlightOnboarding({ session, onFinish }) {
  const items = onboardingVariants[session.role] || [];
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try { await onFinish(); } finally { setSaving(false); }
  };

  if (!items.length) return null;
  const cur = items[step];

  return (
    <div className="spotlightOverlay">
      <div className="spotlightCard" role="dialog" aria-modal="true">
        <div className="spotlightDots">{items.map((_,i) => <div key={i} className={cx('spotlightDot', i===step && 'active', i<step && 'done')} onClick={()=>setStep(i)}/>)}</div>
        <div className="spotlightStep">{step+1} из {items.length}</div>
        <h3 className="spotlightTitle">{cur.title}</h3>
        <p className="spotlightText">{cur.text}</p>
        <div className="modalActions">
          {step > 0 && <button className="secondaryBtn" onClick={()=>setStep(s=>s-1)}>Назад</button>}
          {step < items.length - 1
            ? <button className="primaryBtn" onClick={()=>setStep(s=>s+1)}>Далее</button>
            : <button className="primaryBtn" disabled={saving} onClick={finish}>Завершить</button>}
        </div>
        <div style={{textAlign:'center',marginTop:14}}>
          <button className="linkButton muted small" disabled={saving} onClick={finish} style={{fontSize:13,color:'var(--muted)',background:'none',border:'none',cursor:'pointer',padding:'4px 8px'}}>Пропустить обучение</button>
        </div>
      </div>
    </div>
  );
}

function Shell({ session, db, reload, logout, notify, updateSession }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [teaser, setTeaser] = useState(null);
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
  ];
  // Count pending teacher→student invites (teacher wants to connect, student hasn't responded)
  const studentIncomingInvites = session.role === 'student'
    ? (db.teacherInvites || []).filter(item => item.direction === 'teacher_to_student' && item.status === 'pending' && item.studentId).length
    : 0;

  const studentItems = [
    { path: '/student', label: 'Главная', icon: LayoutDashboard },
    { path: '/student/assignments', label: 'Мои задания', icon: BookOpen },
    { path: '/student/tutors', label: 'Репетиторы', icon: Search, badge: studentIncomingInvites || null },
  ];
  const navItems = session.role === 'teacher' ? teacherItems : studentItems;

  const onNav = (item) => {
    if (isTeacherLimited && item.path !== '/teacher/grading') {
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

  const profilePath = session.role === 'teacher' ? '/teacher/settings' : '/student/profile';
  const avatarLetters = session.userName ? session.userName.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '?';

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
          <button className="userCard stableUserCard profileTrigger" onClick={() => navigate(profilePath)} title="Открыть профиль">
            <div className="avatar">{avatarLetters}</div>
            <div style={{textAlign:'left',minWidth:0}}>
              <div className="userName" style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session.userName}</div>
              <div className="userMeta">{isTeacherLimited ? 'Free-режим' : session.role === 'teacher' ? 'Преподаватель' : 'Ученик'}</div>
            </div>
            <User size={14} style={{marginLeft:'auto',flexShrink:0,opacity:.5}}/>
          </button>
          <button className="ghostBtn wide" onClick={logout}><LogOut size={16} /> Выйти</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar noCollapseTopbar">
          {isTeacherLimited ? <div className="banner"><Sparkles size={14} /> Пробный период завершен. Доступна только Пакетная проверка и <button className="linkButton" style={{background:'none',border:'none',color:'inherit',fontWeight:700,cursor:'pointer',padding:0}} onClick={() => navigate('/teacher/settings?tab=pricing')}>Тарифы</button></div> : null}
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
            <Route path="/teacher/pricing" element={<Navigate to="/teacher/settings?tab=pricing" replace />} />
            <Route path="/teacher/settings" element={<TeacherSettingsPage db={db} reload={reload} notify={notify} session={session} />} />
            <Route path="/student" element={<StudentDashboardPage db={db} session={session} navigate={navigate} reload={reload} notify={notify} />} />
            <Route path="/student/assignments" element={<StudentAssignmentsPage db={db} reload={reload} notify={notify} session={session} />} />
            <Route path="/student/tutors" element={<StudentTutorsPage db={db} reload={reload} notify={notify} session={session} />} />
            <Route path="/student/profile" element={<StudentProfilePage db={db} session={session} reload={reload} notify={notify} />} />
            <Route path="*" element={<Navigate to={session.role === 'teacher' ? (isTeacherLimited ? '/teacher/grading?tab=batch' : '/teacher') : '/student'} replace />} />
          </Routes>
        </main>
      </div>
      {teaser && <Modal title={teaser.title} onClose={() => setTeaser(null)}><p>{teaser.text}</p><div className="modalActions"><button className="secondaryBtn" onClick={() => setTeaser(null)}>Понятно</button><button className="primaryBtn" onClick={() => { setTeaser(null); navigate('/teacher/settings?tab=pricing'); }}>Перейти к тарифам</button></div></Modal>}
      {!session.onboardingCompleted && <SpotlightOnboarding session={session} onFinish={finishOnboarding} />}
    </div>
  );
}

function validateEmail(email = '') { return /.+@.+\..+/.test(email.trim()); }
function validatePhone(phone = '') {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function LoginPage({ onAuth, notify }) {
  const [role, setRole] = useState('teacher');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialModeParam = searchParams.get('mode');
  const inviteToken = searchParams.get('inviteToken');
  const [mode, setMode] = useState(() => initialModeParam === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reg, setReg] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '', parentName: '', parentEmail: '' });
  const [pendingSms, setPendingSms] = useState(null);
  const [smsCode, setSmsCode] = useState('');
  const [working, setWorking] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const smsRef = useRef(null);

  useEffect(() => {
    if (pendingSms && smsRef.current) {
      smsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [pendingSms]);

  const validateReg = () => {
    const errs = {};
    if (!reg.firstName.trim()) errs.firstName = 'Обязательно';
    if (!reg.lastName.trim()) errs.lastName = 'Обязательно';
    if (!validateEmail(reg.email)) errs.email = 'Неверный формат email';
    if (!validatePhone(reg.phone)) errs.phone = 'Телефон должен быть 10-15 цифр (международный формат)';
    if (!reg.password) errs.password = 'Обязательно';
    if (role === 'student' && reg.parentEmail && !validateEmail(reg.parentEmail)) errs.parentEmail = 'Неверный формат email';
    return errs;
  };

  const doLogin = async () => {
    if (!validateEmail(email)) { notify({ type: 'error', text: 'Введите корректный email.' }); return; }
    setWorking(true);
    try {
      const payload = await api.login({ email, role, password });
      if (inviteToken && payload.session?.role === 'student') {
        await api.claimInviteToken(inviteToken, payload.session.userId).catch(() => {});
      }
      onAuth(payload.session);
    } catch (e) {
      notify({ type: 'error', text: e.message });
    } finally { setWorking(false); }
  };

  const doRegister = async () => {
    const errs = validateReg();
    if (Object.keys(errs).length) { setValidationErrors(errs); return; }
    setValidationErrors({});
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
        setPendingSms({ email: result.email, role: result.role, password: reg.password });
        notify({ type: 'success', text: 'Аккаунт создан. Введите SMS-код для подтверждения.' });
      }
    } catch (e) {
      if (e.fields) setValidationErrors(e.fields);
      notify({ type: 'error', text: e.message });
    } finally { setWorking(false); }
  };

  const verifySms = async () => {
    setWorking(true);
    try {
      await api.verifySms({ email: pendingSms.email, role: pendingSms.role, code: smsCode });
      const payload = await api.login({ email: pendingSms.email, role: pendingSms.role, password: pendingSms.password });
      if (inviteToken && payload.session?.role === 'student') {
        await api.claimInviteToken(inviteToken, payload.session.userId).catch(() => {});
      }
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
            {inviteToken && <div className="banner subtle">Вы принимаете приглашение от преподавателя. После регистрации связь установится автоматически.</div>}
            <div className="grid twoCol compactAuthGrid">
              <label className="field"><span>Имя</span><input className={cx('input', validationErrors.firstName && 'inputError')} value={reg.firstName} onChange={e=>setReg(v=>({...v,firstName:e.target.value}))} placeholder="Имя" />{validationErrors.firstName && <span className="fieldError">{validationErrors.firstName}</span>}</label>
              <label className="field"><span>Фамилия</span><input className={cx('input', validationErrors.lastName && 'inputError')} value={reg.lastName} onChange={e=>setReg(v=>({...v,lastName:e.target.value}))} placeholder="Фамилия" />{validationErrors.lastName && <span className="fieldError">{validationErrors.lastName}</span>}</label>
              <label className="field"><span>Email</span><input className={cx('input', validationErrors.email && 'inputError')} value={reg.email} onChange={e=>setReg(v=>({...v,email:e.target.value}))} placeholder="email@example.com" />{validationErrors.email && <span className="fieldError">{validationErrors.email}</span>}</label>
              <label className="field"><span>Телефон (международный)</span><input className={cx('input', validationErrors.phone && 'inputError')} value={reg.phone} onChange={e=>setReg(v=>({...v,phone:e.target.value}))} placeholder="+7 999 123 45 67" />{validationErrors.phone && <span className="fieldError">{validationErrors.phone}</span>}</label>
              <label className="field"><span>Пароль</span><input className={cx('input', validationErrors.password && 'inputError')} type="password" value={reg.password} onChange={e=>setReg(v=>({...v,password:e.target.value}))} placeholder="Пароль" />{validationErrors.password && <span className="fieldError">{validationErrors.password}</span>}</label>
              {role === 'student' && <label className="field"><span>Имя родителя</span><input className="input" value={reg.parentName} onChange={e=>setReg(v=>({...v,parentName:e.target.value}))} placeholder="Опционально" /></label>}
              {role === 'student' && <label className="field"><span>Email родителя (необязательно)</span><input className={cx('input', validationErrors.parentEmail && 'inputError')} type="email" value={reg.parentEmail} onChange={e=>setReg(v=>({...v,parentEmail:e.target.value}))} placeholder="parent@example.com" />{validationErrors.parentEmail && <span className="fieldError">{validationErrors.parentEmail}</span>}</label>}
            </div>
            <button className="primaryBtn wide" onClick={doRegister} disabled={working}>Создать аккаунт</button>
          </div>
        )}

        {pendingSms && <div ref={smsRef} className="mt20 cardInner"><div className="cardTitle">Подтверди аккаунт по SMS</div><div className="muted small mt8">Код отправлен на номер из регистрации. Для локального запуска используй код {pendingSms.debugCode}</div><div className="row gap8 mt12"><input className="input" value={smsCode} onChange={e=>setSmsCode(e.target.value)} placeholder="Введите код" /><button className="primaryBtn" onClick={verifySms} disabled={working}>Подтвердить</button></div></div>}
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
        <KPI title="Ждут проверки" value={pendingWorks.length} onClick={() => navigate('/teacher/grading')} variant={pendingWorks.length > 0 ? 'red' : 'green'} />
        <KPI title="Активные ученики" value={activeStudents.length} onClick={() => navigate('/teacher/students')} variant="green" />
        <KPI title="Группы" value={activeGroups.length} onClick={() => navigate('/teacher/groups')} variant="green" />
        {widgets.totalStudents && <KPI title="Всего учеников" value={teacherHistoricalStudentsCount(db, teacherId)} variant="gold" />}
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
          <Card title="Самые частые типы ошибок" subtitle="По нормализованным категориям: 8 типов.">
            <FilterRow filters={typeFilters} setFilters={setTypeFilters} db={db} includeAllTime teacherId={teacherId} />
            <ChartBar data={topTypes.map(item => ({ name: item.name, value: item.value }))} horizontal />
          </Card>
        )}
      </div>

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
            <Card title={selected.name} subtitle={selected.email || 'Email не указан'} actions={<div className="row gap8 wrap"><button className="iconGhost" title="Редактировать" onClick={() => setEditing(selected)}><Pencil size={16} /></button><button className="iconGhost danger" title="Удалить связь" onClick={() => setDetachingStudent(selected)}><Trash2 size={16} /></button></div>}>
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
      {editing && <StudentModal mode="edit" db={db} student={editing} notify={notify} onClose={() => setEditing(null)} onSave={async(payload) => {
        try {
          // Save to teacher-local overlay — student's own view remains unchanged
          await api.saveStudentOverlay(editing.id, {
            teacherId,
            display_name_override: payload.name,
            student_email_label: payload.email,
            student_phone_label: payload.phone,
            parent_name_override: payload.parentName,
            parent_email_override: payload.parentEmail,
            level_override: payload.level,
            schedule_slots_override: payload.lessonSlots,
          });
          await reload();
          setEditing(null);
          notify({ type: 'success', text: 'Изменения ученика сохранены.' });
        } catch (e) {
          notify({ type: 'error', text: e.message });
        }
      }} />}
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
      parentName: form.parentName,
      parentEmail: form.parentEmail,
      level: form.level,
      lessonSlots: slots.map(slot => ({ ...slot, durationHours: Number(slot.durationHours || 0), durationMinutes: Number(slot.durationMinutes || 0) })),
    });
  };

  return <Modal title={isCreate ? 'Добавить виртуального ученика' : 'Редактировать ученика'} onClose={onClose} wide>
    {isCreate && <div className="cardInner mb16">При добавлении виртуального ученика вы получите идентичный функционал (аналитика, авто-отчеты, проверка работ), но ученик не сможет самостоятельно прикреплять решение.</div>}
    <div className="grid twoCol">
      <label className="field"><span>{isCreate ? 'Имя (обязательно)' : 'Имя'}</span><input className="input" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} /></label>
      <label className="field"><span>Email ученика</span><input className="input" type="email" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))} placeholder={isCreate ? 'Необязательно' : ''} /></label>
      <label className="field"><span>Телефон ученика</span><input className="input" value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))} placeholder={isCreate ? 'Необязательно' : ''} /></label>
      <label className="field"><span>Email родителя</span><input className="input" type="email" value={form.parentEmail} onChange={e=>setForm(v=>({...v,parentEmail:e.target.value}))} placeholder="parent@example.com" /></label>
      <label className="field"><span>Имя родителя</span><input className="input" value={form.parentName} onChange={e=>setForm(v=>({...v,parentName:e.target.value}))} placeholder="Опционально" /></label>
      <label className="field"><span>Уровень</span><input className="input" value={form.level} onChange={e=>setForm(v=>({...v,level:e.target.value}))} placeholder="Опционально" /></label>
    </div>
    {/* Slot editor inlined to avoid focus loss from inner component redefinition */}
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
      <input className="input selectSmall" type="number" min="0" max="23" value={slotDraft.durationHours} onChange={e=>setSlotDraft(v=>({...v,durationHours:e.target.value}))} placeholder="0" />
      <input className="input selectSmall" type="number" min="0" max="59" value={slotDraft.durationMinutes} onChange={e=>setSlotDraft(v=>({...v,durationMinutes:e.target.value}))} placeholder="0" />
      <div className="row gap8"><button className="secondaryBtn" onClick={addSlot}>Добавить слот</button><button className="ghostBtn" onClick={()=>{setShowSlotEditor(false); setSlotError('');}}>Скрыть</button></div>
    </div>}
    {!!slots.length && <div className="stack gap8 mt16">{slots.map(slot => <div key={slot.id} className={cx('listRow', (hasLocalDuplicate(slot, slot.id) || hasExternalConflict(slot)) && 'conflictRow')}><span>{slot.day} {slot.time} · {slot.durationHours || 0} ч {slot.durationMinutes || 0} мин</span><button className="iconGhost" onClick={()=>setSlots(prev=>prev.filter(s=>s.id!==slot.id))}><Trash2 size={14}/></button></div>)}</div>}
    {slotError && <div className="pill danger mt12">{slotError}</div>}
    {isCreate && <div className="muted small mt16">В будущем вы сможете объединить с аккаунтом реального ученика.</div>}
    <div className="modalActions"><button className="primaryBtn" onClick={submit}>{isCreate ? 'Сохранить виртуального ученика' : 'Сохранить ученика'}</button></div>
  </Modal>;
}


function groupTopErrors(db, group, teacherId) {
  const works = db.works.filter(w => {
    const student = db.students.find(s => s.id === w.studentId);
    return w.teacherId === teacherId && (group.studentIds || []).includes(w.studentId);
  });
  const counts = {};
  works.forEach(work => {
    const errors = normalizeErrorTypesInErrors(work.aiErrors || []);
    errors.forEach(err => {
      (err.types || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    });
  });
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name]) => name);
}

function TeacherGroupsPage({ db, reload, navigate, notify, session }) {
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const teacherId = session.userId;
  const activeGroups = teacherOwnedGroups(db, teacherId);

  return <div className="stack gap24">
    <div className="row between wrap gap16"><div><h2 className="pageTitle">Группы</h2><p className="muted">Карточки групп собраны аккуратно: состав, темы риска, слоты и быстрые действия без визуального шума.</p></div><button className="primaryBtn" onClick={()=>setShowCreate(true)}><Plus size={16}/> Добавить группу</button></div>
    <div className="grid twoCol">
      {activeGroups.map(group => {
        const topErrors = groupTopErrors(db, group, teacherId);
        return (
          <Card key={group.id} title={group.name} subtitle={group.subject} actions={<div className="row gap8"><button className="iconGhost" onClick={()=>setEditing(group)}><Pencil size={16}/></button><button className="iconGhost danger" onClick={async()=>{await api.archiveGroup(group.id); await reload(); notify({type:'success',text:'Группа удалена из активных процессов.'});}}><Trash2 size={16}/></button></div>}>
            <div className="grid smallGrid betterGroupStats polishedGroupStats">
              <InfoBox label="Средний Score" value={String(db.computed.groupScores[group.id] || 0)} />
              <InfoBox label="Темы риска" value={topErrors.length ? topErrors.join(', ') : ((group.riskTopics || []).join(', ') || '—')} />
            </div>
            {!!group.lessonSlots?.length && <><div className="sectionLabel mt20">Слоты группы</div><div className="chipWrap mt8">{group.lessonSlots.map(slot => <span key={slot.id} className="chip">{slot.day} {slot.time} · {slot.durationHours || 0} ч {slot.durationMinutes || 0} мин</span>)}</div></>}
            <div className="sectionLabel mt20">Состав</div>
            <div className="chipWrap mt8">{group.studentIds.map(id => { const student = db.students.find(s=>s.id===id && s.active); return student ? <button key={id} className="chip chipButton" onClick={()=>navigate(`/teacher/students?student=${id}`)}>{student.name}</button> : null; })}</div>
          </Card>
        );
      })}
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

function parseDDMMYYYY(str = '') {
  const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function toDDMMYYYY(isoDate = '') {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

// Input mask: ДД.ММ.ГГГГ — accepts only digit keystrokes, inserts dots automatically
function applyDateMask(raw = '') {
  const digits = String(raw).replace(/\D/g, '').slice(0, 8);
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 2 || i === 4) result += '.';
    result += digits[i];
  }
  return result;
}
function isValidRuDate(value = '') {
  const m = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return false;
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || y < 2000 || y > 2100) return false;
  return d <= new Date(y, mo, 0).getDate();
}

// Input mask: ЧЧ:ММ — accepts only digits, inserts colon automatically
function applyTimeMask(raw = '') {
  const digits = String(raw).replace(/\D/g, '').slice(0, 4);
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 2) result += ':';
    result += digits[i];
  }
  return result;
}

function AssignmentModal({ mode, db, assignment, onClose, onSave, notify, teacherId }) {
  const availableStudents = teacherOwnedStudents(db, teacherId);
  const availableGroups = teacherOwnedGroups(db, teacherId);
  const isActive = assignment?.status === 'Активно';
  const isCreate = mode === 'create';
  const isDraft = !isActive;

  const [form, setForm] = useState(() => ({
    title: assignment?.title || '',
    subject: assignment?.subject || 'Математика',
    description: assignment?.description || '',
    expectedAnswer: assignment?.expectedAnswer || '',
    recipientType: assignment?.recipientType || 'student',
    recipientId: assignment?.recipientId || availableStudents[0]?.id || availableGroups[0]?.id || null,
    recipientIds: assignment?.recipientIds || [],
    deadlineDisplay: toDDMMYYYY(assignment?.deadline || ''),
    deadline: assignment?.deadline || '',
    status: assignment?.status || 'Черновик',
    attachments: assignment?.attachments || [],
    links: assignment?.links || [],
  }));
  const [linkInput, setLinkInput] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);

  const addLink = () => {
    const url = linkInput.trim();
    if (!url) return;
    setForm(v => ({ ...v, links: [...(v.links || []), { id: `lnk-${Date.now()}`, url, label: url }] }));
    setLinkInput('');
  };

  const removeLink = (id) => setForm(v => ({ ...v, links: (v.links || []).filter(l => l.id !== id) }));
  const removeAttachment = (fileId) => setForm(v => ({ ...v, attachments: (v.attachments || []).filter(a => a.id !== fileId) }));

  const handleDeadlineInput = (isoDate) => {
    // isoDate is YYYY-MM-DD from native date picker
    setForm(v => ({
      ...v,
      deadline: isoDate ? `${isoDate}T23:59:59` : '',
      deadlineDisplay: isoDate ? toDDMMYYYY(`${isoDate}T00:00:00`) : '',
    }));
  };

  const uploadMore = async(files) => {
    setUploadBusy(true);
    try {
      const uploaded = await api.upload(files);
      setForm(v=>({...v, attachments:[...(v.attachments||[]), ...uploaded.files]}));
    } catch(e) { notify({ type: 'error', text: e.message }); }
    finally { setUploadBusy(false); }
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

  return <Modal title={isCreate ? 'Создать задание' : isActive ? 'Просмотр задания (Активно)' : 'Редактировать черновик'} onClose={onClose} wide>
    <div className="grid twoCol">
      <label className="field"><span>Название</span><input className="input" value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))} disabled={isActive} /></label>
      <label className="field"><span>Предмет</span><select className="input" value={form.subject} onChange={e=>setForm(v=>({...v,subject:e.target.value}))} disabled={isActive}>{['Математика','Физика','Химия'].map(s=><option key={s}>{s}</option>)}</select></label>
      <label className="field"><span>Получатель</span><div className="stack gap10">
        <div className={cx('segmented mini', isActive && 'disabledSegment')}>
          <button className={cx(form.recipientType === 'student' && 'active')} onClick={() => !isActive && setForm(v => ({ ...v, recipientType: 'student', recipientId: availableStudents[0]?.id || null }))}>Один ученик</button>
          <button className={cx(form.recipientType === 'students' && 'active')} onClick={() => !isActive && setForm(v => ({ ...v, recipientType: 'students', recipientIds: v.recipientIds.length ? v.recipientIds : availableStudents.slice(0, 1).map(item => item.id), recipientId: null }))}>Несколько учеников</button>
          <button className={cx(form.recipientType === 'group' && 'active')} onClick={() => !isActive && setForm(v => ({ ...v, recipientType: 'group', recipientId: availableGroups[0]?.id || null, recipientIds: [] }))}>Группа</button>
        </div>
        {!isActive && <>
          {form.recipientType === 'student' && <select className="input" value={form.recipientId || ''} onChange={e => setForm(v => ({ ...v, recipientId: e.target.value }))}>{availableStudents.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select>}
          {form.recipientType === 'students' && <div className="checkboxGrid">{availableStudents.length ? availableStudents.map(student => <label key={student.id} className="checkRow"><input type="checkbox" checked={form.recipientIds.includes(student.id)} onChange={e => setForm(v => ({ ...v, recipientIds: e.target.checked ? [...v.recipientIds, student.id] : v.recipientIds.filter(id => id !== student.id) }))} /><span>{student.name}</span></label>) : <div className="empty">Сначала добавьте учеников.</div>}</div>}
          {form.recipientType === 'group' && <select className="input" value={form.recipientId || ''} onChange={e => setForm(v => ({ ...v, recipientId: e.target.value }))}>{availableGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}
        </>}
        {isActive && <div className="cardInner"><span className="pill info">Активно</span> · Получатель: {recipientLabel(db, form)}</div>}
      </div></label>
      <label className="field"><span>Дедлайн</span>
        <input
          className="input"
          type="date"
          value={form.deadline ? form.deadline.slice(0, 10) : ''}
          onChange={e => handleDeadlineInput(e.target.value)}
          disabled={isActive}
        />
      </label>
    </div>

    {/* Block 1: Задание */}
    <div className="sectionLabel mt20">Задание</div>
    <textarea className="input textarea mt8" value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))} disabled={isActive}
      placeholder="Напечатайте задание или укажите задание, которое нужно сделать по прикреплённой ссылке" />

    {/* Block 2: Ссылка на задание */}
    <div className="sectionLabel mt20">Ссылка на задание</div>
    {!isActive && <div className="row gap8 mt8 wrap">
      <input className="input grow" value={linkInput} onChange={e=>setLinkInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault(); addLink();}}} placeholder="https://..." />
      <button className="secondaryBtn" onClick={addLink}><Link2 size={16}/> Добавить</button>
    </div>}
    {(form.links||[]).length > 0 && <div className="stack gap8 mt8">
      {form.links.map(link => <div key={link.id} className="listRow"><a href={link.url} target="_blank" rel="noreferrer" className="row gap8 alignStart grow"><ExternalLink size={14}/><span className="linkText">{link.url}</span></a>{!isActive && <button className="iconGhost danger" onClick={()=>removeLink(link.id)}><Trash2 size={14}/></button>}</div>)}
    </div>}

    {/* Block 3: Вложения */}
    <div className="sectionLabel mt20">Вложения</div>
    {!isActive && <label className="uploadZone small mt8"><input type="file" multiple onChange={async e=>{const files=Array.from(e.target.files||[]); if(files.length) await uploadMore(files); e.target.value='';}} disabled={uploadBusy} /><UploadCloud size={20} /> {uploadBusy ? 'Загрузка...' : 'Добавить несколько фото и/или файлов'}</label>}
    {!!(form.attachments||[]).length && <div className="mt8 stack gap8">
      {form.attachments.map(file => <div key={file.id} className="listRow"><div className="row gap8 grow"><span>{file.name || file.originalName}</span></div>{!isActive && <button className="iconGhost danger" onClick={()=>removeAttachment(file.id)}><Trash2 size={14}/></button>}<a href={normalizeUrl(file.url)} target="_blank" rel="noreferrer" className="iconGhost"><ExternalLink size={14}/></a></div>)}
    </div>}

    <div className="modalActions">
      {!isActive && <button className="secondaryBtn" onClick={saveCard}>{isCreate || isDraft ? 'Сохранить черновик' : 'Сохранить изменения'}</button>}
      {!isCreate && isDraft && <button className="ghostBtn" onClick={()=>onSave({}, 'delete')}><Trash2 size={16}/> Удалить черновик</button>}
      {(isCreate || isDraft) && <button className="primaryBtn" onClick={publishDraft}>Опубликовать</button>}
      {isActive && <button className="secondaryBtn" onClick={onClose}>Закрыть</button>}
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setFinalScore(selected.finalScore ?? selected.suggestedScore ?? 0);
    setStudentComment(selected.finalFeedback?.studentComment || selected.analysisDraft?.studentCommentDraft || selected.aiComment || '');
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    const fresh = pendingWorks.find(item => item.id === selected.id);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(selected)) setSelected(fresh);
  }, [pendingWorks]);

  const hasActiveJobs = pendingWorks.some(work => ['queued', 'processing'].includes(work.processingStatus));
  useEffect(() => {
    if (!hasActiveJobs) return undefined;
    const timer = setInterval(() => reload(), 5000);
    return () => clearInterval(timer);
  }, [hasActiveJobs]);

  if (selected) {
    const pages = selected.recognitionPages || [];
    const ocrText = pages.length
      ? pages.map(page => {
          const hasDrawing = page.hasDrawing || (page.recognizedText || '').toLowerCase().includes('[рисунок');
          const text = hasDrawing ? (page.recognizedText || '') + '\n[рисунок смотри на оригинале слева]' : (page.recognizedText || '');
          return pages.length > 1 ? `Страница ${page.pageNumber}\n${text}` : text;
        }).join('\n\n---\n\n')
      : selected.ocrText;
    const mistakes = normalizeErrorTypesInErrors(selected.analysisDraft?.detectedMistakes || selected.aiErrors || []);
    const sourceFiles = selected.submissionAssets?.length ? selected.submissionAssets : selected.files || [];
    const assignment = db.assignments.find(a => a.id === selected.assignmentId);
    const student = db.students.find(s => s.id === selected.studentId);
    const group = db.groups.find(g => g.studentIds?.includes(selected.studentId) && g.teacherId === teacherId);

    return <div className="stack gap24">
      <button className="secondaryBtn fit" onClick={()=>setSelected(null)}>← Назад к очереди</button>
      {assignment && <div className="cardInner"><div className="row gap12 wrap"><span className="sectionLabel">Задание:</span><span>{assignment.title}</span>{group && <><span className="sectionLabel">Класс/Группа:</span><span>{group.name}</span></>}</div></div>}
      <div className="grid reviewGrid aiReviewGrid">
        <Card title="Оригинал">
          <ImageCarousel files={sourceFiles} />
        </Card>
        <Card title="Распознанный текст">
          <div className="stack gap12">
            <pre className="typedText">{ocrText || 'AI еще не собрал распознанный текст.'}</pre>
            <div className="sectionLabel">Расширенный обзор</div>
            <div className="stack gap12">
              {mistakes.length ? mistakes.map((err, idx) => <div key={idx} className="errorCard">
                <div className="row gap8 wrap">{(err.types||[]).map(type => <span key={type} className="pill warn">{type}</span>)}</div>
                <div className="cardTitle mt8">{err.label}</div>
                <div className="muted small mt6">{err.description}</div>
                {err.locationHint && <div className="muted small mt6">Где смотреть: {err.locationHint}</div>}
              </div>) : <div className="empty">Ошибки пока не выделены или решение корректно.</div>}
            </div>
          </div>
        </Card>
        <Card title="Черновик AI и подтверждение">
          <ReviewSummaryCard
            selected={selected}
            finalScore={finalScore}
            setFinalScore={setFinalScore}
            studentComment={studentComment}
            setStudentComment={setStudentComment}
            busy={busy}
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
                await api.confirmWork(selected.id, { finalScore, aiComment: studentComment, teacherComment: '', teacherId });
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
  const [assignmentFiles, setAssignmentFiles] = useState([]);
  const [assignmentLinks, setAssignmentLinks] = useState([]);
  const [assignmentLinkInput, setAssignmentLinkInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const teacherSessions = (db.batchSessions || []).filter(item => item.teacherId === session.userId);
  const [sessionId, setSessionId] = useState(teacherSessions?.[0]?.id || null);
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const activeSession = teacherSessions.find(s => s.id === sessionId) || teacherSessions[0] || null;

  const startBatchReview = async () => {
    if (!files.length) return notify({ type:'error', text:'Добавь файлы перед началом пакетной проверки.' });
    setLoading(true);
    try {
      const created = await api.createBatchSession(files, scale, session.userId, assignmentFiles, assignmentLinks);
      setSessionId(created.id);
      await api.analyzeBatch(created.id);
      await reload();
      setFiles([]);
      notify({ type:'success', text:'Файлы загружены и поставлены в AI-очередь.' });
    } finally { setLoading(false); }
  };

  const hasActiveJobs = !!(activeSession?.results?.some(r => ['queued','processing'].includes(r.status)));
  useEffect(() => {
    if (!hasActiveJobs) return undefined;
    const timer = setInterval(() => reload(), 5000);
    return () => clearInterval(timer);
  }, [hasActiveJobs]);

  useEffect(() => {
    if (!selectedResult || !activeSession?.results) return;
    const fresh = activeSession.results.find(r => r.id === selectedResult.id);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedResult)) setSelectedResult(fresh);
  }, [activeSession?.results]);

  const onDropFiles = useCallback((incoming) => {
    setFiles(prev => [...prev, ...incoming.filter(f => !prev.some(e => e.name === f.name && e.size === f.size))]);
  }, []);

  const addAssignmentLink = () => {
    const url = assignmentLinkInput.trim();
    if (!url) return;
    setAssignmentLinks(prev => [...prev, url]);
    setAssignmentLinkInput('');
  };

  const noAssignmentContext = !assignmentFiles.length && !assignmentLinks.length;

  return <div className="stack gap24">
    <div className="row between wrap gap16">
      <div><h2 className="pageTitle">Пакетная проверка</h2><p className="muted">Множественные фото и файлы, явный запуск анализа и компактная таблица результатов.</p></div>
      <div className="row gap8"><select className="input selectSmall" value={scale} onChange={e=>setScale(e.target.value)}><option value="5">5-балльная</option><option value="10">10-балльная</option><option value="100">100-балльная</option></select>{isLimited && <span className="pill info">Текущий тариф: Free</span>}</div>
    </div>
    <div className="grid batchTriple">
      <Card title="Задание">
        <div className="stack gap12">
          <div className="muted small">Загрузите фото/файлы с условием задания или добавьте ссылку. AI использует их как эталон при проверке.</div>
          <label className="uploadZone small">
            <input type="file" multiple onChange={e=>{setAssignmentFiles(prev=>[...prev,...Array.from(e.target.files||[]).filter(f=>!prev.some(e2=>e2.name===f.name&&e2.size===f.size))]); e.target.value='';}} />
            <UploadCloud size={20}/><div className="muted small">Фото/файлы с условием</div>
          </label>
          {assignmentFiles.length > 0 && <div className="stack gap6">{assignmentFiles.map(f=><div key={f.name+f.size} className="listRow compact"><span>{f.name}</span><button className="iconGhost danger" onClick={()=>setAssignmentFiles(prev=>prev.filter(x=>x!==f))}><Trash2 size={13}/></button></div>)}</div>}
          <div className="row gap8 mt4">
            <input className="input grow" value={assignmentLinkInput} onChange={e=>setAssignmentLinkInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addAssignmentLink();}}} placeholder="https://ссылка на задание" />
            <button className="secondaryBtn" onClick={addAssignmentLink}><Link2 size={14}/></button>
          </div>
          {assignmentLinks.length > 0 && <div className="stack gap6">{assignmentLinks.map((url,i)=><div key={url+i} className="listRow compact"><a href={url} target="_blank" rel="noreferrer" className="linkText grow">{url}</a><button className="iconGhost danger" onClick={()=>setAssignmentLinks(prev=>prev.filter((_,j)=>j!==i))}><Trash2 size={13}/></button></div>)}</div>}
          {noAssignmentContext && files.length > 0 && <div className="banner subtle" style={{fontSize:12}}>ИИ будет проверять без условия задания. Добавьте файл или ссылку для точности.</div>}
        </div>
      </Card>
      <Card title="Исходники для проверки">
        <div className="stack gap12">
          <label className={cx('uploadZone', dragActive && 'uploadZoneActive')}
            onDragOver={e=>{e.preventDefault();setDragActive(true);}}
            onDragLeave={()=>setDragActive(false)}
            onDrop={e=>{e.preventDefault();setDragActive(false);onDropFiles(Array.from(e.dataTransfer.files||[]));}}
          >
            <input type="file" multiple onChange={e=>{onDropFiles(Array.from(e.target.files||[])); e.target.value='';}} />
            <UploadCloud size={24}/>
            <div>Работы учеников</div>
            <div className="muted small">Перетащите сюда или выберите файлы</div>
          </label>
          <div className="batchFileList">{files.length ? files.map(file=><div key={file.name+file.size} className="listRow compact"><div className="stack"><span>{file.name}</span><span className="muted small">{loading ? 'в обработке' : 'ожидает загрузки'}</span></div><button className="iconGhost danger" onClick={()=>setFiles(prev=>prev.filter(f=>f!==file))}><Trash2 size={13}/></button></div>) : <div className="empty">Файлы еще не добавлены.</div>}</div>
          <div className="row gap8 wrap">
            <button className="primaryBtn" onClick={startBatchReview} disabled={loading || !files.length}>Начать обработку</button>
            {activeSession?.results?.some(r=>r.status==='failed') && <button className="ghostBtn" onClick={async()=>{try{await api.retryFailedBatch(activeSession.id);await reload();notify({type:'success',text:'Ошибочные файлы снова поставлены в очередь.'});}catch(e){notify({type:'error',text:e.message});}}}>Повторить ошибки</button>}
          </div>
        </div>
      </Card>
      <Card title="Результаты пакетной обработки">
        {!activeSession || !activeSession.results?.length
          ? <div className="empty">Таблица пуста. Сначала добавь файлы и нажми «Начать обработку».</div>
          : <div className="tableScroll compactTableWrap"><table className="dataTable compactTable">
              <thead><tr><th>Ученик</th><th>Статус</th><th>Ошибки</th><th>Балл</th></tr></thead>
              <tbody>{activeSession.results.map(result=>{
                const normErrors = (result.errorTypes||[]).map(t=>normalizeErrorType(t));
                return <tr key={result.id} onClick={()=>setSelectedResult(result)}>
                  <td>{result.studentName || result.name}</td>
                  <td><span className={pillClass[result.status||'uploaded']}>{displayAiStatus(result.status)}</span></td>
                  <td><div className="chipWrap">{normErrors.slice(0,3).map(type=><span key={type} className="chip">{type}</span>)}</div></td>
                  <td>{result.score??'—'}</td>
                </tr>;
              })}</tbody>
            </table></div>}
      </Card>
    </div>
    {selectedResult && <BatchResultModal
      result={selectedResult}
      db={db}
      sessionId={activeSession.id}
      onClose={()=>setSelectedResult(null)}
      onSave={async(payload)=>{
        await api.updateBatchResult(activeSession.id, selectedResult.id, payload);
        await reload();
        notify({type:'success',text:'Результат пакетной проверки сохранён.'});
      }}
    />}
  </div>;
}


function BatchResultModal({ result, db, onClose, onSave }) {
  const [score, setScore] = useState(result.score ?? 0);
  const [aiComment, setAiComment] = useState(result.aiComment || '');
  const [studentName, setStudentName] = useState(result.studentName || result.name || '');
  const [tags, setTags] = useState(result.tags || (result.errorTypes || []).map(normalizeErrorType));
  const [editingTagIdx, setEditingTagIdx] = useState(null);
  const [tagEditVal, setTagEditVal] = useState('');
  const [saving, setSaving] = useState(false);

  const files = result.submissionAssets?.length
    ? result.submissionAssets
    : result.file ? [result.file]
    : result.sourceUrl ? [{ id: result.id, url: result.sourceUrl, kind: 'photo', name: result.name }]
    : [];

  const pages = result.recognitionPages || [];
  const ocrText = pages.length
    ? pages.map(page => {
        const hasDrawing = page.hasDrawing || (page.recognizedText || '').toLowerCase().includes('[рисунок');
        const text = hasDrawing ? (page.recognizedText || '') + '\n[рисунок смотри на оригинале слева]' : (page.recognizedText || '');
        return pages.length > 1 ? `Страница ${page.pageNumber}\n${text}` : text;
      }).join('\n\n---\n\n')
    : result.typedText || result.ocrText;

  const assignment = db?.assignments?.find(a => a.id === result.assignmentId);
  const group = db?.groups?.find(g => g.studentIds?.includes(result.studentId));

  const saveAll = async () => {
    setSaving(true);
    try {
      await onSave({ score, aiComment, studentName, tags, errorTypes: tags });
    } finally { setSaving(false); }
  };

  return <Modal title={studentName || result.name} onClose={onClose} wide>
    {(assignment || group) && <div className="cardInner mb16 row gap12 wrap">
      {assignment && <><span className="sectionLabel">Задание:</span><span>{assignment.title}</span></>}
      {group && <><span className="sectionLabel">Класс/Группа:</span><span>{group.name}</span></>}
    </div>}
    <div className="grid reviewGrid aiReviewGrid">
      <Card title="Оригинал">
        <ImageCarousel files={files} />
      </Card>
      <Card title="Распознанный текст">
        <pre className="typedText">{ocrText || 'AI еще не закончил распознавание.'}</pre>
        <div className="sectionLabel mt16">Теги ошибок</div>
        <div className="chipWrap mt8">
          {tags.map((tag, idx) => editingTagIdx === idx
            ? <span key={idx} className="row gap4"><input className="input selectSmall" autoFocus value={tagEditVal} onChange={e=>setTagEditVal(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){const next=[...tags];next[idx]=tagEditVal;setTags(next);setEditingTagIdx(null);} if(e.key==='Escape')setEditingTagIdx(null);}} /><button className="iconGhost" onClick={()=>{const next=[...tags];next[idx]=tagEditVal;setTags(next);setEditingTagIdx(null);}}><Save size={12}/></button></span>
            : <span key={idx} className="chip row gap4" style={{cursor:'pointer'}} onDoubleClick={()=>{setTagEditVal(tag);setEditingTagIdx(idx);}}>{tag}<button className="iconGhost" style={{padding:'2px'}} onClick={()=>setTags(prev=>prev.filter((_,i)=>i!==idx))}><X size={10}/></button></span>
          )}
        </div>
        {result.errorDescription && <p className="muted mt12">{result.errorDescription}</p>}
      </Card>
      <Card title="Черновик результата">
        <div className="row gap8 wrap"><span className={pillClass[result.status||'uploaded']}>{displayAiStatus(result.status)}</span></div>
        <label className="field mt12"><span>Ученик</span><input className="input" value={studentName} onChange={e=>setStudentName(e.target.value)} /></label>
        <label className="field mt12"><span>Комментарий</span><textarea className="input textarea" value={aiComment} onChange={e=>setAiComment(e.target.value)} /></label>
        <label className="field mt12"><span>Итоговый балл</span><input className="input" type="number" value={score} onChange={e=>setScore(Number(e.target.value))} /></label>
        <div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Отмена</button><button className="primaryBtn" disabled={saving} onClick={saveAll}>Сохранить</button></div>
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


function buildPreviewReportData(db, teacherId, studentId, periodFrom, periodTo) {
  const student = db.students?.find(s => s.id === studentId);
  if (!student) return null;
  const start = new Date(periodFrom); start.setHours(0,0,0,0);
  const end = new Date(periodTo); end.setHours(23,59,59,999);
  const worksAll = (db.works || []).filter(w => w.teacherId === teacherId && w.studentId === studentId);
  const worksInPeriod = worksAll.filter(w => { const d = new Date(w.submittedAt); return d >= start && d <= end; });
  const checkedWorks = worksInPeriod.filter(w => w.status === 'Проверено');
  const scores = checkedWorks.map(w => {
    const a = (db.assignments || []).find(x => x.id === w.assignmentId);
    return Math.round(((w.finalScore ?? w.suggestedScore ?? 0) / (a?.maxScore || 100)) * 100);
  });
  const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
  const lastScore = scores.length ? scores[scores.length-1] : null;
  let trendLabel = 'Недостаточно данных для оценки динамики';
  if (scores.length >= 2) {
    const earlierAvg = Math.round(scores.slice(0,-1).reduce((a,b)=>a+b,0)/(scores.length-1));
    if (lastScore > earlierAvg + 5) trendLabel = 'Положительная';
    else if (lastScore < earlierAvg - 5) trendLabel = 'Требует внимания';
    else trendLabel = 'Стабильная';
  }
  const errorCounts = worksInPeriod.flatMap(w=>(w.aiErrors||[]).flatMap(e=>e.types||[])).reduce((acc,t)=>({...acc,[t]:(acc[t]||0)+1}),{});
  const topErrors = Object.entries(errorCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t])=>t);
  const recs = [];
  if (trendLabel==='Требует внимания') recs.push('Рекомендуем уделить больше времени практическим задачам.');
  if (topErrors.length) recs.push(`Акцент на: ${topErrors.slice(0,2).join(', ')}.`);
  if (!recs.length) recs.push('Продолжайте в том же темпе.');
  const buckets={'0–49':0,'50–69':0,'70–84':0,'85–100':0};
  scores.forEach(p => { if(p<50)buckets['0–49']++; else if(p<70)buckets['50–69']++; else if(p<85)buckets['70–84']++; else buckets['85–100']++; });
  const histogramData = Object.entries(buckets).map(([name,value])=>({name,value}));
  const hasHistogram = scores.length > 0;
  let shortConclusion = '';
  if (!checkedWorks.length) shortConclusion = 'За выбранный период нет проверенных работ.';
  else if (trendLabel==='Положительная') shortConclusion = `Положительная динамика. Средний результат: ${avg}%.`;
  else if (trendLabel==='Требует внимания') shortConclusion = `Есть области для улучшения. Средний результат: ${avg}%. Рекомендуется дополнительная практика.`;
  else shortConclusion = `Стабильный результат. Средний показатель: ${avg !== null ? avg+'%' : 'нет данных'}.`;
  const teacher = (db.teachers||[]).find(t=>t.id===teacherId);
  return { student, teacher, checkedWorksCount: checkedWorks.length, averageScore: avg !== null ? `${avg}%` : 'Нет данных', lastScore: lastScore !== null ? `${lastScore}%` : 'Нет данных', trendLabel, topErrorsList: topErrors.length ? topErrors.join('; ') : 'Не выявлено', recommendationsList: recs.join(' '), shortConclusion, histogramData, hasHistogram };
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
  const [lastReportUrl, setLastReportUrl] = useState(null);
  const autoEligibleStudents = targetType === 'student'
    ? [teacherStudents.find(student => student.id === targetId)].filter(Boolean).filter(student => student.parentEmail)
    : (teacherGroups.find(group => group.id === targetId)?.studentIds || []).map(id => teacherStudents.find(student => student.id === id)).filter(Boolean).filter(student => student.parentEmail);
  const previewStudent = teacherStudents.find(student => student.id === previewStudentId) || null;
  const previewRecipient = previewStudent?.parentEmail ? `${previewStudent.parentName || previewStudent.name} <${previewStudent.parentEmail}>` : 'Email родителя не заполнен';
  const savingDisabled = !targetId || !autoEligibleStudents.length;
  const sendingDisabled = !previewStudent?.parentEmail;
  const previewData = previewStudentId ? buildPreviewReportData(db, teacherId, previewStudentId, periodFrom, periodTo) : null;
  const teacher = (db.teachers||[]).find(t=>t.id===teacherId);
  const periodLabel = `${formatDateOnly(periodFrom)} – ${formatDateOnly(periodTo)}`;

  return <div className="stack gap24">
    <div><h2 className="pageTitle">Отчеты</h2><p className="muted">Ручной PDF-отчет формируется по шаблону А. Превью показывает данные за выбранный период.</p></div>
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
          <label className="field"><span>Кому</span><select className="input" value={previewStudentId} onChange={e=>{setPreviewStudentId(e.target.value);setLastReportUrl(null);}}>{teacherStudents.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
          <label className="field"><span>За период</span><div className="row gap8"><input className="input" type="date" value={periodFrom} onChange={e=>{setPeriodFrom(e.target.value);setLastReportUrl(null);}} /><input className="input" type="date" value={periodTo} onChange={e=>{setPeriodTo(e.target.value);setLastReportUrl(null);}} /></div></label>
        </div>
        <div className="previewMail mt12">
          <div className="mailTitle">Тема: Отчет по ученику: {previewData?.student?.name || '—'} · {periodLabel}</div>
          <div className="mailRecipients">Получатель: {previewRecipient}</div>
          <div className="mailRecipients mt6">Здравствуйте!</div>
          <div className="mailRecipients">Направляем краткий отчет по занятиям и проверенным работам ученика: <strong>{previewData?.student?.name || '—'}</strong>.</div>
          <div className="mailRecipients">Период: {periodLabel} · Преподаватель: {teacher?.name || '—'}</div>
          <div className="mailSection mt8"><strong>1. Общая динамика</strong>
            <ul className="mailList">
              <li>Проверено работ: {previewData?.checkedWorksCount ?? '—'}</li>
              <li>Средний балл: {previewData?.averageScore ?? '—'}</li>
              <li>Последний результат: {previewData?.lastScore ?? '—'}</li>
              <li>Динамика: {previewData?.trendLabel ?? '—'}</li>
            </ul>
          </div>
          <div className="mailSection mt8"><strong>2. Частые ошибки</strong>
            <div className="muted small mt4">{previewData?.topErrorsList || 'Не выявлено'}</div>
          </div>
          <div className="mailSection mt8"><strong>3. Распределение оценок</strong>
            {previewData?.hasHistogram ? (
              <div className="reportHistogram mt8">
                {(previewData.histogramData || []).map(bucket => (
                  <div key={bucket.name} className="reportHistBucket">
                    <div className="reportHistBar" style={{height: Math.max(4, (bucket.value / Math.max(...(previewData.histogramData||[]).map(b=>b.value),1)) * 60)+'px'}}></div>
                    <div className="reportHistLabel">{bucket.name}</div>
                    <div className="reportHistCount">{bucket.value}</div>
                  </div>
                ))}
              </div>
            ) : <div className="muted small mt4">Недостаточно данных за выбранный период</div>}
          </div>
          <div className="mailSection mt8"><strong>4. Рекомендации</strong>
            <div className="muted small mt4">{previewData?.recommendationsList || '—'}</div>
          </div>
          <div className="mailSection mt8"><strong>Итог:</strong> {previewData?.shortConclusion || '—'}</div>
        </div>
        {sendingDisabled && <div className="pill warn mt16">Отправка недоступна, пока у выбранного ученика не заполнен Email родителя.</div>}
        <div className="row gap8 wrap mt20">
          <button className="primaryBtn" disabled={sendingDisabled} onClick={async()=>{try {
            const result = await api.sendReport({ targetType: 'student', targetId: previewStudentId, teacherId, periodFrom, periodTo });
            await reload();
            const url = result.deliveries?.[0]?.url || null;
            if (url) setLastReportUrl(url);
            notify({type:'success',text:'PDF-отчет сформирован и добавлен в журнал отправок.'});
          } catch (e) { notify({ type:'error', text:e.message }); }}}>Отправить отчет</button>
          {lastReportUrl && <a className="secondaryBtn" href={lastReportUrl} target="_blank" rel="noreferrer"><FileText size={16}/> Посмотреть отчет</a>}
        </div>
      </Card>
    </div>
    <Card title="Журнал отправок"><div className="stack gap10">{(db.reportLogs || []).filter(log => log.teacherId === teacherId).length ? (db.reportLogs || []).filter(log => log.teacherId === teacherId).slice(0,8).map(log => <div key={log.id} className="listRow"><div><div>{log.targetLabel}</div><div className="muted small">{new Date(log.createdAt).toLocaleString('ru-RU')} · {log.mode} · {log.periodLabel || 'Период не указан'}</div></div><div className="row gap8 wrap">{log.deliveries?.[0]?.url && <a className="secondaryBtn linkButton" href={log.deliveries[0].url} target="_blank" rel="noreferrer"><FileText size={16}/> Посмотреть отчет</a>}<div className="muted small">{log.recipients.length} получателей</div></div></div>) : <div className="empty">Отправок пока не было.</div>}</div></Card>
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

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && ['profile','subjects','notifications','reports','pricing'].includes(t)) setTab(t);
  }, [searchParams]);

  const pricingPlans = [
    { name:'Free', price:'0 ₽', features:['Пакетная проверка','Ограниченный лимит обработок','Базовое распознавание','CSV/PDF экспорт'], disabled:['Полная очередь ручной проверки','Расширенная аналитика','Отчеты'] },
    { name:'Pro Trial', price:'30 дней бесплатно', featured:true, features:['Полный доступ ко всем функциям','Одиночная и пакетная проверка','Ученики, группы, задания','Редактирование AI-черновиков','Аналитика и отчеты'], disabled:[] },
    { name:'Pro', price:'1 490 ₽/мес', features:['Полный кабинет преподавателя','Ученики, группы, задания','Одиночная и пакетная проверка','Комментарии ученикам','Аналитика и отчеты','Итог подтверждает преподаватель'], disabled:[] },
  ];
  const currentPlan = session.accessMode === 'limited' ? 'Free' : 'Pro Trial';

  return <div className="stack gap24"><div><h2 className="pageTitle">Настройки</h2><p className="muted">Профиль, предметы, уведомления, отчеты и тарифы.</p></div>
    <div className="settingsHeaderTabs">{['profile','subjects','notifications','reports','pricing'].map(key => <button key={key} className={cx('settingsTabBtn', tab===key && 'active')} onClick={()=>setTab(key)}>{key==='profile'?'Профиль':key==='subjects'?'Предметы':key==='notifications'?'Уведомления':key==='reports'?'Отчеты':'Тарифы'}</button>)}</div>
    {tab==='profile' && <Card title="Профиль"><div className="profileHero"><label className="avatarUploader circularAvatar"><input type="file" accept="image/*" onChange={e=>uploadAvatar(Array.from(e.target.files||[]))} />{profile.avatarUrl ? <img src={normalizeUrl(profile.avatarUrl)} className="avatarCoverImage" /> : <div className="avatarPlaceholderCircle"><UploadCloud size={22} /></div>}</label><div className="profileFields"><div className="grid twoCol"><label className="field"><span>Имя</span><input className="input" value={profile.name} onChange={e=>setProfile(v=>({...v,name:e.target.value}))} /></label><label className="field"><span>Email</span><input className="input" value={profile.email} onChange={e=>setProfile(v=>({...v,email:e.target.value}))} /></label><label className="field"><span>Телефон</span><input className="input" value={profile.phone} onChange={e=>setProfile(v=>({...v,phone:e.target.value}))} /></label></div></div></div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll(profile)}>Сохранить профиль</button></div></Card>}
    {tab==='subjects' && <Card title="Предметы"><div className="checkboxGrid">{['Математика','Физика','Химия'].map(subject => <label key={subject} className="checkRow"><input type="checkbox" checked={subjectsState.includes(subject)} onChange={e=>setSubjectsState(v=>e.target.checked?[...v,subject]:v.filter(s=>s!==subject))} /><span>{subject}</span></label>)}</div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll({ subjects: [...new Set(subjectsState)] })}>Сохранить предметы</button></div></Card>}
    {tab==='notifications' && <Card title="Уведомления"><div className="checkboxGrid">{Object.keys(notifications).map(key => <label key={key} className="checkRow"><input type="checkbox" checked={Boolean(notifications[key])} onChange={e=>setNotifications(v=>({...v,[key]:e.target.checked}))} /><span>{key}</span></label>)}</div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll({ notifications })}>Сохранить уведомления</button></div></Card>}
    {tab==='reports' && <Card title="Содержимое отчета родителям"><div className="checkboxGrid">{PARENT_REPORT_FIELDS.map(key => <label key={key} className="checkRow"><input type="checkbox" checked={Boolean(reportPreferences[key])} onChange={e=>setReportPreferences(v=>({...v,[key]:e.target.checked}))} /><span>{key}</span></label>)}</div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll({ reportPreferences })}>Сохранить настройки отчета</button></div></Card>}
    {tab==='pricing' && <div><p className="muted">AI экономит время на распознавании и черновике проверки, но финальный результат всегда подтверждает преподаватель.</p><div className="grid threeCol mt16">{pricingPlans.map(plan=><Card key={plan.name} title={plan.name} actions={currentPlan===plan.name?<span className="pill info">Текущий тариф</span>:plan.featured?<span className="pill success">Рекомендуем</span>:null}><div className="price">{plan.price}</div><ul className="featureList">{plan.features.map(f=><li key={f} style={{color:'var(--text)'}}>{f}</li>)}</ul>{plan.disabled?.length?<ul className="featureList" style={{opacity:.45}}>{plan.disabled.map(f=><li key={f} style={{textDecoration:'line-through'}}>{f}</li>)}</ul>:null}</Card>)}</div></div>}
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

function StudentAttachmentViewer({ files = [] }) {
  const [fullscreen, setFullscreen] = useState(null);
  if (!files.length) return null;
  return (
    <div className="stack gap8">
      <div className="row wrap gap8">
        {files.map(file => {
          const href = normalizeUrl(file.url);
          const isPhoto = file.kind === 'photo' || /\.(jpg|jpeg|png|webp|heic)$/i.test(file.name || '');
          return (
            <div key={file.id || file.name} className="attachmentThumb">
              {isPhoto
                ? <img src={href} alt={file.name} className="attachThumbImg" onClick={() => setFullscreen(file)} />
                : <a href={href} download target="_blank" rel="noreferrer" className="fileTile"><Download size={14}/> {file.name || file.originalName}</a>}
              <div className="attachThumbActions">
                {isPhoto && <button className="iconGhost" onClick={() => setFullscreen(file)} title="Полный экран"><Maximize2 size={12}/></button>}
                <a href={href} download target="_blank" rel="noreferrer" className="iconGhost" title="Скачать"><Download size={12}/></a>
              </div>
            </div>
          );
        })}
      </div>
      {fullscreen && (
        <div className="carouselOverlay" onClick={() => setFullscreen(null)}>
          <div className="carouselFullscreenContent" onClick={e => e.stopPropagation()}>
            <img src={normalizeUrl(fullscreen.url)} alt={fullscreen.name} style={{maxWidth:'90vw',maxHeight:'90vh',borderRadius:12}} />
            <button className="iconGhost" style={{position:'absolute',top:12,right:12}} onClick={() => setFullscreen(null)}><X size={20}/></button>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentFilePreview({ files, onRemove }) {
  const [previews, setPreviews] = useState({});
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    const urls = {};
    files.forEach(f => {
      if (f.type.startsWith('image/')) urls[f.name + f.size] = URL.createObjectURL(f);
    });
    setPreviews(urls);
    return () => { Object.values(urls).forEach(u => URL.revokeObjectURL(u)); };
  }, [files]);

  if (!files.length) return null;
  return (
    <>
      <div className="previewFileList">
        {files.map(file => {
          const key = file.name + file.size;
          const isImage = file.type.startsWith('image/');
          return (
            <div key={key} className="previewFileItem">
              {isImage ? (
                <img src={previews[key]} alt={file.name} className="previewFileThumb" onClick={() => setLightbox(previews[key])} />
              ) : (
                <div className="previewFileIcon"><FileText size={20}/></div>
              )}
              <div className="previewFileName">{file.name}</div>
              <button className="iconGhost danger previewFileRemove" onClick={() => onRemove(file)} title="Удалить"><X size={12}/></button>
            </div>
          );
        })}
      </div>
      {lightbox && (
        <div className="carouselOverlay" onClick={() => setLightbox(null)}>
          <div className="carouselFullscreenContent" onClick={e => e.stopPropagation()}>
            <img src={lightbox} alt="" style={{maxWidth:'90vw',maxHeight:'86vh',borderRadius:12}} />
            <button className="iconGhost" style={{position:'absolute',top:12,right:12}} onClick={() => setLightbox(null)}><X size={20}/></button>
          </div>
        </div>
      )}
    </>
  );
}

function StudentAssignmentDetail({ assignment, work, onClose, onUpload, readonly=false }) {
  const [files, setFiles] = useState([]);
  const deadline = assignment.deadline ? new Date(assignment.deadline) : null;
  const deadlineStr = deadline && !isNaN(deadline.getTime())
    ? deadline.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;
  const deadlinePast = deadline && deadline < new Date();

  return <Modal title={assignment.title} onClose={onClose} wide>
    <div className="stack gap16">
      {assignment.description && <div className="cardInner">{assignment.description}</div>}
      {deadlineStr && <div className="row gap8"><Clock3 size={14}/><span className={cx('muted', deadlinePast && 'dangerText')}>Дедлайн: {deadlineStr}{deadlinePast ? ' (просрочено)' : ''}</span></div>}
      {!!(assignment.links || []).length && <div className="stack gap6">
        <div className="sectionLabel">Ссылки на задание</div>
        {assignment.links.map(link => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="row gap8 linkText"><ExternalLink size={14}/>{link.url}</a>)}
      </div>}
      {!!(assignment.attachments || []).length && <div><div className="sectionLabel">Вложения к заданию</div><StudentAttachmentViewer files={assignment.attachments} /></div>}
      {work && <>
        <div className="cardInner">Решение уже отправлено преподавателю.</div>
        <div className="row gap8 wrap">
          <DeadlineBadge assignment={assignment} hasWork={true} />
          <span className={pillClass[displayWorkStatus(work.status, 'student')]}>{displayWorkStatus(work.status, 'student')}</span>
          {work.submittedAt && <span className="muted small">Отправлено: {work.submittedAt}</span>}
        </div>
        {!!work.files?.length && <div><div className="sectionLabel">Ваш ответ</div><StudentAttachmentViewer files={work.files} /></div>}
        {work.finalFeedback && <div className="cardInner"><div className="sectionLabel">Подтвержденный результат</div><div className="mt8"><strong>Балл:</strong> {work.finalFeedback.finalScore}</div><div className="mt8">{work.finalFeedback.studentComment || 'Комментарий появится после подтверждения преподавателем.'}</div>{work.finalFeedback.recommendations?.length ? <div className="chipWrap mt12">{work.finalFeedback.recommendations.map(item => <span key={item} className="chip">{item}</span>)}</div> : null}</div>}
      </>}
      {!readonly && !work && <>
        <label className="uploadZone small">
          <input type="file" multiple onChange={e=>setFiles(prev=>[...prev, ...Array.from(e.target.files||[]).filter(f => !prev.some(e2=>e2.name===f.name&&e2.size===f.size))])} />
          <UploadCloud size={20}/> Добавить несколько фото/файлов
        </label>
        {files.length > 0 && <>
          <div className="sectionLabel mt12">Выбранные файлы ({files.length})</div>
          <StudentFilePreview files={files} onRemove={file => setFiles(prev => prev.filter(f => f !== file))} />
        </>}
        <div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Закрыть</button><button className="primaryBtn" onClick={()=>onUpload(files)} disabled={!files.length}>Загрузить</button></div>
      </>}
      {(readonly || work) && <div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Закрыть</button></div>}
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

    {!!incomingInvites.filter(i => i.status === 'pending').length && (
      <Card title="Входящие приглашения" subtitle="Преподаватели, желающие с вами работать">
        <div className="stack gap12">
          {incomingInvites.filter(i => i.status === 'pending').map(invite => {
            const teacher = (db.teachers || []).find(item => item.id === invite.teacherId);
            return (
              <div key={invite.id} className="listCard polished">
                <div className="row between wrap gap16">
                  <div>
                    <div className="cardTitle">{teacher?.name || 'Преподаватель'}</div>
                    <div className="muted small mt6">{teacher?.email || 'Почта не указана'}</div>
                    {(teacher?.subjects || []).length > 0 && (
                      <div className="chipWrap mt8">
                        {teacher.subjects.map(s => <span key={s} className="chip">{s}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="row gap8 wrap">
                    <button className="secondaryBtn" onClick={async () => {
                      try {
                        await api.updateTeacherInvite(invite.id, { status: 'declined' });
                        await reload();
                        notify({ type: 'success', text: 'Приглашение отклонено.' });
                      } catch (e) {
                        notify({ type: 'error', text: e.message });
                      }
                    }}>Отклонить</button>
                    <button className="primaryBtn" onClick={async () => {
                      try {
                        await api.updateTeacherInvite(invite.id, { status: 'accepted' });
                        await reload();
                        notify({ type: 'success', text: 'Преподаватель подключён.' });
                      } catch (e) {
                        notify({ type: 'error', text: e.message });
                      }
                    }}>Принять</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    )}

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
      const updated = await api.updateStudent(student.id, { email: form.email, phone: form.phone, parentName: form.parentName, parentEmail: form.parentEmail });
      await reload();
      // Explicit sync in case effect dependencies don't detect the change
      setForm(prev => ({
        ...prev,
        parentEmail: updated?.parentEmail || updated?.parentContact || prev.parentEmail,
        parentName: updated?.parentName || prev.parentName,
      }));
      notify({ type: 'success', text: 'Профиль обновлен.' });
    } catch (e) {
      notify({ type: 'error', text: e.message });
    }
  };

  return <div className="stack gap24"><div><h2 className="pageTitle">Профиль</h2></div><div className="grid twoCol refinedStudentProfileGrid"><Card title="Основная информация"><div className="studentProfilePanel"><div className="studentProfileName">{student.name}</div><div className="studentProfileMeta">{student.level || 'Статус пока не заполнен'}</div><div className="stack gap12 mt16"><label className="field"><span>Email</span><input className="input" value={form.email} onChange={e=>setForm(v=>({...v, email: e.target.value}))} /></label><label className="field"><span>Телефон</span><input className="input" value={form.phone} onChange={e=>setForm(v=>({...v, phone: e.target.value}))} /></label><label className="field"><span>Имя родителя</span><input className="input" value={form.parentName} onChange={e=>setForm(v=>({...v, parentName: e.target.value}))} placeholder="Опционально" /></label><label className="field"><span>Email родителя</span><input className="input" type="email" value={form.parentEmail} onChange={e=>setForm(v=>({...v, parentEmail: e.target.value}))} placeholder="parent@example.com" /></label><div className="modalActions"><button className="primaryBtn" onClick={async()=>{try { await saveProfile(); } catch (e) { notify({ type: 'error', text: e.message }); }}}>Сохранить изменения</button></div></div></div></Card><Card title="Учебный статус"><div className="studentProfilePanel"><div className="scoreHero">{score}</div><div className="studentProfileMeta">Текущий score</div><div className="stack gap12 mt16"><InfoBox label="Преподаватели" value={teachers.length ? teachers.map(item => item.name).join(', ') : 'Еще не выбраны'} /><InfoBox label="Активные задания" value={String(assignments.length)} /><InfoBox label="Слоты занятий" value={slots.length ? `${slots.length}` : 'Не заданы'} secondary={slots.length ? slots.map(slot => `${slot.day} ${slot.time}`).join(' · ') : 'Добавятся после подключения преподавателя'} /></div>{student.subjects.length ? <div className="chipWrap mt16">{student.subjects.map(subject => <span key={subject} className="chip">{subject}</span>)}</div> : <div className="muted small mt16">Предметы пока не назначены.</div>}</div></Card></div></div>;
}


function KPI({ title, value, onClick, variant }) {
  const Comp = onClick ? 'button' : 'div';
  const borderStyle = variant === 'red'
    ? { borderColor: 'rgba(220,38,38,.45)', boxShadow: '0 0 0 2px rgba(220,38,38,.1), 0 14px 40px rgba(15,23,42,.05)' }
    : variant === 'green'
    ? { borderColor: 'rgba(5,150,105,.45)', boxShadow: '0 0 0 2px rgba(5,150,105,.1), 0 14px 40px rgba(15,23,42,.05)' }
    : variant === 'gold'
    ? { borderColor: 'rgba(217,119,6,.45)', boxShadow: '0 0 0 2px rgba(217,119,6,.1), 0 14px 40px rgba(15,23,42,.05)' }
    : {};
  return (
    <Comp className={cx('kpiCard', onClick && 'clickable')} onClick={onClick} style={borderStyle}>
      <div className="kpiTitle">{title}</div>
      <div className="kpiValue">{value}</div>
    </Comp>
  );
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
  if (!assignment.deadline) return null;
  const d = new Date(assignment.deadline);
  if (isNaN(d.getTime())) return null;
  const hours = (d.getTime() - Date.now()) / 36e5;
  const dateStr = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (hasWork) return <span className="pill info"><Clock3 size={12}/> {dateStr}</span>;
  const cls = hours < 0 ? 'danger' : hours < 24 ? 'warn' : 'success';
  return <span className={cx('pill', cls)}><Clock3 size={12}/> {hours < 0 ? `Просрочено · ${dateStr}` : `до ${dateStr}`}</span>;
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
      type: normalizeErrorType(type),
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

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
  bootstrap: () => fetch(`${API}/api/bootstrap`).then(r => r.json()),
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
  saveReportConfig: post('/api/reports/configs'),
  sendReport: post('/api/reports/send'),
  createBatchSession: async (files, scale) => {
    const fd = new FormData();
    Array.from(files).forEach(file => fd.append('files', file));
    fd.append('scale', scale);
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
  exportCsvUrl: (sessionId) => `${API}/api/batch/sessions/${sessionId}/export.csv`,
  exportPdfUrl: (sessionId) => `${API}/api/batch/sessions/${sessionId}/export.pdf`,
  register: (payload) => jsonPost('/api/auth/register', payload),
  verifySms: (payload) => jsonPost('/api/auth/verify-sms', payload),
  login: (payload) => jsonPost('/api/auth/login', payload),
  requestReset: (payload) => jsonPost('/api/auth/request-reset', payload),
  verifyReset: (payload) => jsonPost('/api/auth/verify-reset', payload),
  completeReset: (payload) => jsonPost('/api/auth/complete-reset', payload),
  updateTeacher: (payload) => jsonPut('/api/teacher/profile', payload),
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
  'Проверена': 'pill success', 'Ожидает подтверждения': 'pill info', 'На пересмотре': 'pill warn'
};


export default function App() {
  const [session, setSessionState] = useState(getSession());
  const [db, setDb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const payload = await api.bootstrap();
      setDb(payload);
    } catch {
      setToast({ type: 'error', text: 'Не удалось загрузить данные backend.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const setServerSession = (next) => { setSession(next); setSessionState(next); };
  const logout = () => { clearSession(); setSessionState(null); };

  if (loading) return <div className="screen center">Загрузка проекта…</div>;

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={session ? <Navigate to={session.role === 'teacher' ? (session.accessMode === 'limited' ? '/teacher/grading?tab=batch' : '/teacher') : '/student'} replace /> : <LoginPage onAuth={setServerSession} notify={setToast} reload={reload} />} />
        <Route path="/*" element={session ? <Shell session={session} db={db} reload={reload} logout={logout} notify={setToast} /> : <Navigate to="/login" replace />} />
      </Routes>
      {toast && <Toast {...toast} />}
    </>
  );
}

function Shell({ session, db, reload, logout, notify }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [teaser, setTeaser] = useState(null);
  const isTeacherLimited = session.role === 'teacher' && session.accessMode === 'limited';

  const teacherItems = [
    { path: '/teacher', label: 'Дашборд', icon: LayoutDashboard },
    { path: '/teacher/students', label: 'Ученики', icon: Users },
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
    { path: '/student/profile', label: 'Профиль', icon: Users },
  ];
  const navItems = session.role === 'teacher' ? teacherItems : studentItems;

  const onNav = (item) => {
    if (isTeacherLimited && !['/teacher/grading', '/teacher/pricing'].includes(item.path)) {
      setTeaser({ title: item.label, text: 'Пробный период завершен. В Free-режиме доступна только пакетная проверка и тарифы.' });
      return;
    }
    if (item.path === '/teacher/grading' && isTeacherLimited) navigate('/teacher/grading?tab=batch');
    else navigate(item.path);
  };

  return (
    <div className="shell fixedSidebarShell">
      <aside className="sidebar alwaysOpen">
        <div className="brand">
          <div className="logo"><Sparkles size={18} /></div>
          <div><div className="brandTitle">ПроверьAI</div><div className="brandSub">clean teacher workflow</div></div>
        </div>
        <nav className="navList">
          {navItems.map(item => {
            const active = location.pathname === item.path || (item.path === '/teacher/grading' && location.pathname === '/teacher/grading');
            const blocked = isTeacherLimited && session.role === 'teacher' && !['/teacher/grading', '/teacher/pricing'].includes(item.path);
            const Icon = item.icon;
            return (
              <button key={item.path} className={cx('navItem', active && 'active', blocked && 'blocked')} onClick={() => onNav(item)}>
                <Icon size={18} /><span>{item.label}</span>{blocked && <Lock size={13} />}
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
          {isTeacherLimited ? <div className="banner"><Sparkles size={14} /> Пробный период завершен. Доступна только Пакетная проверка и Тарифы</div> : <div className="banner subtle">Учебный workflow без перегруза</div>}
        </header>
        <main className="content">
          <Routes>
            <Route path="/teacher" element={<TeacherDashboard db={db} session={session} navigate={navigate} />} />
            <Route path="/teacher/students" element={<TeacherStudentsPage db={db} reload={reload} navigate={navigate} notify={notify} />} />
            <Route path="/teacher/groups" element={<TeacherGroupsPage db={db} reload={reload} navigate={navigate} notify={notify} />} />
            <Route path="/teacher/assignments" element={<TeacherAssignmentsPage db={db} reload={reload} notify={notify} />} />
            <Route path="/teacher/grading" element={<TeacherGradingPage db={db} reload={reload} session={session} notify={notify} />} />
            <Route path="/teacher/analytics" element={<TeacherAnalyticsPage db={db} />} />
            <Route path="/teacher/reports" element={<TeacherReportsPage db={db} reload={reload} notify={notify} />} />
            <Route path="/teacher/pricing" element={<TeacherPricingPage db={db} session={session} />} />
            <Route path="/teacher/settings" element={<TeacherSettingsPage db={db} reload={reload} notify={notify} />} />
            <Route path="/student" element={<StudentDashboardPage db={db} />} />
            <Route path="/student/assignments" element={<StudentAssignmentsPage db={db} reload={reload} notify={notify} />} />
            <Route path="/student/profile" element={<StudentProfilePage db={db} />} />
            <Route path="*" element={<Navigate to={session.role === 'teacher' ? (isTeacherLimited ? '/teacher/grading?tab=batch' : '/teacher') : '/student'} replace />} />
          </Routes>
        </main>
      </div>
      {teaser && <Modal title={teaser.title} onClose={() => setTeaser(null)}><p>{teaser.text}</p><div className="modalActions"><button className="secondaryBtn" onClick={() => setTeaser(null)}>Понятно</button><button className="primaryBtn" onClick={() => { setTeaser(null); navigate('/teacher/pricing'); }}>Перейти к тарифам</button></div></Modal>}
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
  const [email, setEmail] = useState(role === 'teacher' ? 'teacher@demo.ru' : 'student@demo.ru');
  const [password, setPassword] = useState('demo12345');
  const [reg, setReg] = useState({ name: '', email: '', password: '', phone: '' });
  const [pendingSms, setPendingSms] = useState(null);
  const [smsCode, setSmsCode] = useState('');
  const [working, setWorking] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => { setEmail(role === 'teacher' ? 'teacher@demo.ru' : 'student@demo.ru'); }, [role]);

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
      const result = await api.register({ role, name: reg.name, email: reg.email, password: reg.password, phone: reg.phone });
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
        <p>Один аккуратный workflow для репетиторов, мини-групп и пакетной проверки. AI берет на себя первичную обработку, а преподаватель сохраняет контроль над результатом.</p>
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
              <label className="field"><span>Имя и фамилия</span><input className="input" value={reg.name} onChange={e=>setReg(v=>({...v,name:e.target.value}))} placeholder="Имя и фамилия" /></label>
              <label className="field"><span>Email</span><input className="input" value={reg.email} onChange={e=>setReg(v=>({...v,email:e.target.value}))} placeholder="Email" /></label>
              <label className="field"><span>Телефон</span><input className="input" value={reg.phone} onChange={e=>setReg(v=>({...v,phone:e.target.value}))} placeholder="Телефон" /></label>
              <label className="field"><span>Пароль</span><input className="input" type="password" value={reg.password} onChange={e=>setReg(v=>({...v,password:e.target.value}))} placeholder="Пароль" /></label>
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

function TeacherDashboard({ db, session, navigate }) {
  const [widgets, setWidgets] = useState({ totalStudents: true, topErrors: true, errorTypes: true });
  const [showSettings, setShowSettings] = useState(false);
  const [topFilters, setTopFilters] = useState({ subject: 'all', period: 'all', studentId: 'all', groupId: 'all' });
  const [typeFilters, setTypeFilters] = useState({ subject: 'all', period: 'all', studentId: 'all', groupId: 'all' });

  const activeStudents = db.students.filter(s => s.active);
  const activeGroups = db.groups.filter(g => g.active);
  const pendingWorks = db.works.filter(w => w.status === 'Ожидает подтверждения' || w.status === 'На пересмотре');

  const events = buildErrorEvents(db);
  const topErrors = aggregateErrors(events, topFilters, false);
  const topTypes = aggregateErrors(events, typeFilters, true);
  const riskStudents = activeStudents.map(s => ({ id: s.id, name: s.name, score: db.computed.studentScores[s.id] || 0 })).sort((a,b)=>a.score-b.score).slice(0,5);

  return (
    <div className="stack gap24">
      <div className="row between wrap gap16">
        <div>
          <h2 className="pageTitle">Добро пожаловать, {session.userName}</h2>
          <p className="muted maxw">Дашборд показывает только те сигналы, которые нужны для ежедневной работы: поток проверки, риск по ученикам и типовые ошибки.</p>
        </div>
        <button className="secondaryBtn" onClick={() => setShowSettings(true)}><Settings size={16} /> Настроить дашборд</button>
      </div>

      <div className="grid kpiGrid fourNoOverdue">
        <KPI title="Активные ученики" value={activeStudents.length} onClick={() => navigate('/teacher/students')} />
        <KPI title="Группы" value={activeGroups.length} onClick={() => navigate('/teacher/groups')} />
        <KPI title="Ждут проверки" value={pendingWorks.length} onClick={() => navigate('/teacher/grading')} />
        {widgets.totalStudents && <KPI title="Всего учеников" value={db.students.length} />}
      </div>

      <div className="grid twoCol">
        {widgets.topErrors && (
          <Card title="Топ-5 самых распространенных ошибок" subtitle="Фильтры независимы от соседней диаграммы.">
            <FilterRow filters={topFilters} setFilters={setTopFilters} db={db} includeAllTime />
            <ChartBar data={topErrors.map(x => ({ name: x.name, value: x.value }))} />
          </Card>
        )}
        {widgets.errorTypes && (
          <Card title="Самые частые типы ошибок">
            <FilterRow filters={typeFilters} setFilters={setTypeFilters} db={db} includeAllTime />
            <ChartBar data={topTypes.map(x => ({ name: x.name, value: x.value }))} horizontal />
          </Card>
        )}
      </div>

      <Card title="Ученики из зоны риска" subtitle="Score = доля сданных работ × средний нормализованный процент.">
        <div className="stack gap12">{riskStudents.map(s => <div key={s.id} className="riskRow"><span>{s.name}</span><span className={cx('pill', s.score < 50 ? 'danger' : 'warn')}>Score {s.score}</span></div>)}</div>
      </Card>

      {showSettings && <Modal title="Настройка дашборда" onClose={() => setShowSettings(false)}>
        <CheckSetting label="Всего учеников" checked={widgets.totalStudents} onChange={() => setWidgets(v => ({ ...v, totalStudents: !v.totalStudents }))} />
        <CheckSetting label="Топ ошибок" checked={widgets.topErrors} onChange={() => setWidgets(v => ({ ...v, topErrors: !v.topErrors }))} />
        <CheckSetting label="Типы ошибок" checked={widgets.errorTypes} onChange={() => setWidgets(v => ({ ...v, errorTypes: !v.errorTypes }))} />
      </Modal>}
    </div>
  );
}

function TeacherStudentsPage({ db, reload, navigate, notify }) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const sid = searchParams.get('student');
    if (sid) setSelectedId(sid);
  }, [searchParams]);

  const activeStudents = db.students.filter(s => s.active && (`${s.name} ${s.email}`.toLowerCase().includes(search.toLowerCase())));
  const selected = db.students.find(s => s.id === selectedId) || activeStudents[0] || null;
  const selectedWorks = selected ? db.works.filter(w => w.studentId === selected.id) : [];
  const pendingWorks = selected ? selectedWorks.filter(w => w.status !== 'Проверена') : [];
  const displaySlots = selected ? effectiveStudentSlots(db, selected) : [];

  return (
    <div className="stack gap24">
      <div className="row between wrap gap16">
        <div>
          <h2 className="pageTitle">Ученики</h2>
          <p className="muted">Аккуратные карточки, быстрый доступ к работам ученика и управлению расписанием без перегруженного CRM-подхода.</p>
        </div>
        <button className="primaryBtn" onClick={() => setShowAdd(true)}><Plus size={16} /> Добавить ученика</button>
      </div>

      <div className="toolbar"><Search size={16} /><input className="toolbarInput" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по ученику" /></div>

      <div className="grid onePlusSide alignedTop">
        <div className="stack gap14">
          {activeStudents.map(student => (
            <button key={student.id} className={cx('studentCard polished elegantStudentCard', selected?.id === student.id && 'active')} onClick={() => { setSelectedId(student.id); setSearchParams({ student: student.id }); }}>
              <div className="row between gap12 wrap alignStart">
                <div className="stack gap6">
                  <div className="studentNameSerifless">{student.name}</div>
                  <div className="studentMetaLine">{student.level} · {student.email}</div>
                  <div className="chipWrap mt8">{student.subjects.map(subject => <span key={subject} className="chip">{subject}</span>)}</div>
                </div>
                <div className="scoreChip">Score {db.computed.studentScores[student.id] || 0}</div>
              </div>
            </button>
          ))}
        </div>

        <div>
          {selected ? (
            <Card title={selected.name} subtitle={selected.email} actions={<div className="row gap8"><button className="iconGhost" onClick={() => setEditing(selected)}><Pencil size={16} /></button><button className="iconGhost danger" onClick={async () => { await api.archiveStudent(selected.id); await reload(); setSelectedId(null); notify({ type: 'success', text: 'Ученик переведен в неактивные.' }); }}><Archive size={16} /></button></div>}>
              <div className="grid detailGrid betterDetails refinedInfoGrid">
                <InfoBox label="Родитель" value={selected.parentName || '—'} secondary={selected.parentEmail || '—'} />
                <InfoBox label="Score" value={String(db.computed.studentScores[selected.id] || 0)} />
                <button className="infoBox clickable accentBox" onClick={() => pendingWorks.length ? navigate(`/teacher/grading?tab=queue&student=${selected.id}`) : notify({ type: 'error', text: 'Нет работ для проверки.' })}>
                  <div className="infoLabel">Работы для проверки</div>
                  <div className="infoValue">{pendingWorks.length}</div>
                  <div className="muted small">Открыть только работы этого ученика</div>
                </button>
              </div>
              <div className="sectionLabel mt20">Занятия</div>
              <div className="chipWrap mt8">{displaySlots.length ? displaySlots.map(slot => <span key={slot.id + (slot.sourceGroupId || '')} className={cx('chip', slot.inherited && 'chipInherited')}>{slot.day} {slot.time} · {slot.durationHours || 0} ч {slot.durationMinutes || 0} мин{slot.inherited ? ` · из группы ${slot.sourceGroupName}` : ''}</span>) : <span className="muted small">Слоты еще не заданы.</span>}</div>
            </Card>
          ) : <div className="empty">Нет активных учеников.</div>}
        </div>
      </div>

      {showAdd && <StudentModal mode="create" db={db} notify={notify} onClose={() => setShowAdd(false)} onSave={async(payload) => { try { await api.createStudent(payload); await reload(); setShowAdd(false); notify({ type: 'success', text: 'Ученик добавлен.' }); } catch (e) { notify({ type: 'error', text: e.message }); } }} />}
      {editing && <StudentModal mode="edit" db={db} student={editing} notify={notify} onClose={() => setEditing(null)} onSave={async(payload) => { try { await api.updateStudent(editing.id, payload); await reload(); setEditing(null); notify({ type: 'success', text: 'Изменения ученика сохранены.' }); } catch (e) { notify({ type: 'error', text: e.message }); } }} />}
    </div>
  );
}

function StudentModal({ mode, db, student, onClose, onSave, notify }) {
  const [form, setForm] = useState(() => ({
    name: student?.name || '',
    email: student?.email || '',
    parentName: student?.parentName || '',
    parentEmail: student?.parentEmail || '',
    level: student?.level || '',
    subjects: student?.subjects || ['Математика'],
    newGroupName: '',
    newGroupSubject: 'Математика',
  }));
  const [slotDraft, setSlotDraft] = useState({ day: 'ПН', time: '10:00', durationHours: 1, durationMinutes: 0 });
  const [slots, setSlots] = useState(student?.lessonSlots || []);
  const [slotError, setSlotError] = useState('');
  const [showSlotEditor, setShowSlotEditor] = useState(false);

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
    if (slots.some(slot => hasLocalDuplicate(slot, slot.id) || hasExternalConflict(slot))) {
      setSlotError('Есть конфликтующие или дублирующиеся слоты. Сохранение недоступно.');
      return;
    }
    onSave({ ...form, lessonSlots: slots.map(slot => ({ ...slot, durationHours: Number(slot.durationHours || 0), durationMinutes: Number(slot.durationMinutes || 0) })) });
  };

  return <Modal title={mode === 'create' ? 'Добавить ученика' : 'Редактировать ученика'} onClose={onClose} wide>
    <div className="grid twoCol">
      <label className="field"><span>Имя</span><input className="input" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} /></label>
      <label className="field"><span>Email ученика</span><input className="input" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))} /></label>
      <label className="field"><span>Имя родителя</span><input className="input" value={form.parentName} onChange={e=>setForm(v=>({...v,parentName:e.target.value}))} /></label>
      <label className="field"><span>Почта родителя</span><input className="input" value={form.parentEmail} onChange={e=>setForm(v=>({...v,parentEmail:e.target.value}))} /></label>
      <label className="field"><span>Уровень</span><input className="input" value={form.level} onChange={e=>setForm(v=>({...v,level:e.target.value}))} /></label>
      {mode === 'create' && <label className="field"><span>Новая группа (опционально)</span><input className="input" value={form.newGroupName} onChange={e=>setForm(v=>({...v,newGroupName:e.target.value}))} /></label>}
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
    <div className="modalActions"><button className="primaryBtn" onClick={submit}>Сохранить ученика</button></div>
  </Modal>;
}


function TeacherGroupsPage({ db, reload, navigate, notify }) {
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const activeGroups = db.groups.filter(group => group.active);

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
    {showCreate && (
      <GroupModal
        db={db}
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


function GroupModal({ group, db, onClose, onSave }) {
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
    <div className="checkboxGrid mt12">{db.students.filter(s=>s.active).map(student => <label key={student.id} className="checkRow"><input type="checkbox" checked={form.studentIds.includes(student.id)} onChange={e=>setForm(v=>({...v,studentIds:e.target.checked?[...v.studentIds, student.id]:v.studentIds.filter(id=>id!==student.id)}))} /><span>{student.name}</span></label>)}</div>
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
    <div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Отмена</button><button className="primaryBtn" onClick={()=>onSave({ name: form.name, subject: form.subject, studentIds: [...new Set(form.studentIds)], lessonSlots: form.lessonSlots || [], riskTopics: form.riskTopics.split(',').map(v=>v.trim()).filter(Boolean) })}>Сохранить</button></div>
  </Modal>;
}


function TeacherAssignmentsPage({ db, reload, notify }) {
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('all');
  const [status, setStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);

  const filtered = db.assignments.filter(a => (subject === 'all' || a.subject === subject) && (status === 'all' || a.status === status) && a.title.toLowerCase().includes(search.toLowerCase()));

  return <div className="stack gap24">
    <div className="row between wrap gap16"><div><h2 className="pageTitle">Задания</h2><p className="muted">Карточка задания открывает полноценное редактирование. Для вложений поддерживаются одновременно фото и файлы, в том числе множественные.</p></div><button className="primaryBtn" onClick={()=>setShowCreate(true)}><Plus size={16}/> Создать задание</button></div>
    <div className="toolbar"><Search size={16} /><input className="toolbarInput" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по заданию" /></div>
    <div className="row gap8 wrap">{['all','Математика','Физика','Химия'].map(s => <FilterChip key={s} active={subject===s} onClick={()=>setSubject(s)}>{s==='all'?'Все предметы':s}</FilterChip>)}{['all','Активно','Завершено','Черновик'].map(s => <FilterChip key={s} active={status===s} onClick={()=>setStatus(s)}>{s==='all'?'Все статусы':s}</FilterChip>)}</div>
    <div className="stack gap12">{filtered.map(item => { const recipient = item.recipientId ? (item.recipientType === 'student' ? db.students.find(s=>s.id===item.recipientId)?.name : db.groups.find(g=>g.id===item.recipientId)?.name) : 'Не выбран'; return <button key={item.id} className="assignmentCard polished" onClick={()=>setEditing(item)}><div className="row between wrap gap16"><div><div className="cardTitle">{item.title}</div><div className="muted small mt6">{item.subject} · Получатель: {recipient}</div><div className="muted small mt6">{item.description}</div></div><div className="stack gap8 rightAlign"><span className={pillClass[item.status]}>{item.status}</span>{item.deadline && <span className="muted small">{item.deadline}</span>}</div></div></button>; })}</div>
    {showCreate && <AssignmentModal mode="create" db={db} notify={notify} onClose={()=>setShowCreate(false)} onSave={async(payload, draftAction)=>{ try { if (draftAction === 'create') await api.createAssignment(payload); else await api.createAssignment(payload); await reload(); setShowCreate(false); notify({type:'success',text: payload.status === 'Черновик' ? 'Черновик сохранен.' : 'Задание создано.'}); } catch (e) { notify({type:'error',text:e.message}); } }} />}
    {editing && <AssignmentModal mode="edit" db={db} assignment={editing} notify={notify} onClose={()=>setEditing(null)} onSave={async(payload, draftAction)=>{ try { if (draftAction === 'publish') { await api.publishDraft(editing.id, payload); notify({type:'success',text:'Черновик активирован как новое задание.'}); } else if (draftAction === 'delete') { await api.deleteAssignment(editing.id); notify({type:'success',text:'Черновик удален.'}); } else { await api.updateAssignment(editing.id, payload); notify({type:'success',text:'Карточка задания сохранена.'}); } await reload(); setEditing(null); } catch (e) { notify({type:'error',text:e.message}); } }} />}
  </div>;
}

function AssignmentModal({ mode, db, assignment, onClose, onSave, notify }) {
  const [form, setForm] = useState(() => ({
    title: assignment?.title || '',
    subject: assignment?.subject || 'Математика',
    description: assignment?.description || '',
    recipientType: assignment?.recipientType || 'student',
    recipientId: assignment?.recipientId || null,
    deadline: assignment?.deadline || '',
    maxScore: assignment?.maxScore || 100,
    status: assignment?.status || 'Черновик',
    attachments: assignment?.attachments || [],
  }));
  const [recipientQuery, setRecipientQuery] = useState(recipientLabel(db, form));
  const [showSuggestions, setShowSuggestions] = useState(false);

  const recipients = [
    ...db.students.filter(s=>s.active).map(s=>({ id:s.id, name:s.name, type:'student' })),
    ...db.groups.filter(g=>g.active).map(g=>({ id:g.id, name:g.name, type:'group' }))
  ].filter(item => item.name.toLowerCase().includes(recipientQuery.toLowerCase()));

  const uploadMore = async(files) => {
    const uploaded = await api.upload(files);
    setForm(v=>({...v, attachments:[...(v.attachments||[]), ...uploaded.files]}));
  };

  const publishDraft = () => onSave({ ...form, status:'Активно' }, 'publish');
  const saveCard = () => onSave(form, 'save');

  return <Modal title={mode === 'create' ? 'Создать задание' : form.status === 'Черновик' ? 'Редактировать черновик' : 'Редактировать задание'} onClose={onClose} wide>
    <div className="grid twoCol">
      <label className="field"><span>Название</span><input className="input" value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))} /></label>
      <label className="field"><span>Предмет</span><select className="input" value={form.subject} onChange={e=>setForm(v=>({...v,subject:e.target.value}))}>{['Математика','Физика','Химия'].map(s=><option key={s}>{s}</option>)}</select></label>
      <label className="field full"><span>Описание</span><textarea className="input textarea" value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))} /></label>
      <label className="field"><span>Получатель</span><div className="stack gap8"><input className="input" value={recipientQuery} onFocus={()=>setShowSuggestions(true)} onChange={e=>{setRecipientQuery(e.target.value); setShowSuggestions(true);}} placeholder="Начни печатать имя ученика или группы" />{showSuggestions && <div className="suggestions">{recipients.map(rec => <button key={rec.type+rec.id} className="suggestion" onClick={()=>{setForm(v=>({...v,recipientType:rec.type, recipientId:rec.id})); setRecipientQuery(rec.name); setShowSuggestions(false);}}><span>{rec.name}</span><span className="muted small">{rec.type==='student'?'Ученик':'Группа'}</span></button>)}</div>}</div></label>
      <label className="field"><span>Дедлайн</span><input className="input" type="datetime-local" value={form.deadline} onChange={e=>setForm(v=>({...v,deadline:e.target.value}))} /></label>
      <label className="field"><span>Максимальный балл</span><input className="input" type="number" value={form.maxScore} onChange={e=>setForm(v=>({...v,maxScore:Number(e.target.value)}))} /></label>
    </div>
    <div className="sectionLabel mt20">Вложения</div>
    <label className="uploadZone small"><input type="file" multiple onChange={async e=>{const files=Array.from(e.target.files||[]); if(files.length) await uploadMore(files); e.target.value='';}} /><UploadCloud size={20} /> Добавить несколько фото и/или файлов</label>
    {!!form.attachments?.length && <div className="gallery mt16">{form.attachments.map(att => att.kind==='photo' ? <img key={att.id} src={normalizeUrl(att.url)} alt={att.name} className="galleryImg" /> : <a key={att.id} href={normalizeUrl(att.url)} target="_blank" rel="noreferrer" className="fileTile">{att.name}</a>)}</div>}
    <div className="modalActions">
      <button className="secondaryBtn" onClick={saveCard}>{form.status === 'Черновик' ? 'Сохранить черновик' : 'Сохранить изменения'}</button>
      {form.status === 'Черновик' && <button className="ghostBtn" onClick={()=>onSave({}, 'delete')}><Trash2 size={16}/> Удалить черновик</button>}
      {form.status === 'Черновик' && <button className="primaryBtn" onClick={publishDraft}>Активировать черновик</button>}
    </div>
  </Modal>;
}


function TeacherGradingPage({ db, reload, session, notify }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentFilter = searchParams.get('student') || 'all';
  const isLimited = session.role === 'teacher' && session.accessMode === 'limited';
  const tab = isLimited ? 'batch' : (searchParams.get('tab') || 'queue');
  const pendingWorks = db.works.filter(w => w.status !== 'Проверена' && (studentFilter === 'all' || w.studentId === studentFilter));
  const [selected, setSelected] = useState(null);

  if (selected) {
    const [finalScore, setFinalScore] = [selected.finalScore ?? selected.suggestedScore ?? 0, ()=>{}];
  }

  return <div className="stack gap24">
    <div className="row between wrap gap16"><div><h2 className="pageTitle">Проверка</h2><p className="muted">Очередь преподавателя и пакетная проверка разделены. В Free-режиме доступна только пакетная проверка.</p></div>{!isLimited && <div className="segmentedWide"><button className={cx(tab==='queue' && 'active')} onClick={()=>setSearchParams(studentFilter!=='all'?{ tab:'queue', student:studentFilter }:{ tab:'queue' })}>Очередь проверки</button><button className={cx(tab==='batch' && 'active')} onClick={()=>setSearchParams({ tab:'batch' })}>Пакетная проверка</button></div>}</div>
    {tab === 'queue' && !isLimited ? <QueueReview db={db} reload={reload} notify={notify} pendingWorks={pendingWorks} selectedStudentId={studentFilter} /> : <BatchReview db={db} reload={reload} session={session} notify={notify} />}
  </div>;
}

function QueueReview({ db, reload, notify, pendingWorks, selectedStudentId }) {
  const [selected, setSelected] = useState(null);
  const [finalScore, setFinalScore] = useState(0);
  const [aiComment, setAiComment] = useState('');

  useEffect(() => {
    if (!selected) return;
    setFinalScore(selected.finalScore ?? selected.suggestedScore ?? 0);
    setAiComment(selected.aiComment || '');
  }, [selected]);

  if (selected) {
    return <div className="stack gap24"><button className="secondaryBtn fit" onClick={()=>setSelected(null)}>← Назад к очереди</button><div className="grid reviewGrid"><Card title="Распознанный текст"><pre className="typedText">{selected.ocrText}</pre></Card><Card title="Исходные файлы">{selected.files?.length ? <div className="gallery">{selected.files.map(file => file.kind==='photo' ? <img key={file.id} src={normalizeUrl(file.url)} alt={file.name} className="galleryImg" /> : <a key={file.id} href={normalizeUrl(file.url)} target="_blank" rel="noreferrer" className="fileTile">{file.name}</a>)}</div> : <div className="empty">Нет приложенных файлов.</div>}</Card><Card title="AI-анализ и подтверждение"><div className="stack gap12">{(selected.aiErrors || []).map((err, idx) => <div key={idx} className="errorCard"><div className="row gap8 wrap">{(err.types||[]).map(type => <span key={type} className="pill warn">{type}</span>)}</div><div className="cardTitle mt8">{err.label}</div><div className="muted small mt6">{err.description}</div></div>)}<label className="field"><span>Итоговый балл</span><input className="input" type="number" value={finalScore} onChange={e=>setFinalScore(Number(e.target.value))} /></label><label className="field"><span>Комментарий для ученика</span><textarea className="input textarea" value={aiComment} onChange={e=>setAiComment(e.target.value)} /></label><button className="primaryBtn" onClick={async()=>{await api.confirmWork(selected.id,{ finalScore, aiComment }); await reload(); setSelected(null); notify({type:'success',text:'Изменения сохранены и результат отправлен ученику.'});}}>Подтвердить</button></div></Card></div></div>;
  }

  return <div className="stack gap12">{selectedStudentId !== 'all' && <div className="banner subtle">Очередь отфильтрована по выбранному ученику</div>}{pendingWorks.length ? pendingWorks.map(work => { const student = db.students.find(s=>s.id===work.studentId); const assignment = db.assignments.find(a=>a.id===work.assignmentId); return <button key={work.id} className="listCard polished" onClick={()=>setSelected(work)}><div className="row between wrap gap16"><div><div className="cardTitle">{student?.name}</div><div className="muted small mt6">{assignment?.title} · {assignment?.subject}</div></div><div className="row gap8"><span className={pillClass[work.status]}>{work.status}</span></div></div></button>; }) : <div className="empty">Нет работ для проверки.</div>}</div>;
}

function BatchReview({ db, reload, session, notify }) {
  const isLimited = session.role === 'teacher' && session.accessMode === 'limited';
  const [scale, setScale] = useState('100');
  const [files, setFiles] = useState([]);
  const [sessionId, setSessionId] = useState(db.batchSessions?.[0]?.id || null);
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const current = db.batchSessions.find(s => s.id === sessionId) || null;

  const startBatchReview = async () => {
    if (!files.length) return notify({ type:'error', text:'Добавь файлы перед началом пакетной проверки.' });
    setLoading(true);
    try {
      const created = await api.createBatchSession(files, scale);
      setSessionId(created.id);
      await api.analyzeBatch(created.id);
      await reload();
      setFiles([]);
      notify({ type:'success', text:'AI-анализ завершен.' });
    } finally { setLoading(false); }
  };
  const activeSession = db.batchSessions.find(s => s.id === sessionId) || current;

  return <div className="stack gap24">
    <div className="row between wrap gap16"><div><h2 className="pageTitle">Пакетная проверка</h2><p className="muted">Множественные фото и файлы, явный запуск анализа и компактная таблица результатов.</p></div><div className="row gap8"><select className="input selectSmall" value={scale} onChange={e=>setScale(e.target.value)}><option value="5">5-балльная</option><option value="10">10-балльная</option><option value="100">100-балльная</option></select>{isLimited && <span className="pill info">Текущий тариф: Free</span>}</div></div>
    <div className="grid batchSplit">
      <Card title="Исходники для проверки">
        <div className="stack gap12">
          <label className="uploadZone"><input type="file" multiple onChange={e=>{const incoming = Array.from(e.target.files || []); setFiles(prev => [...prev, ...incoming.filter(file => !prev.some(existing => existing.name === file.name && existing.size === file.size))]); e.target.value='';}} /><UploadCloud size={24} /> Добавить несколько фото и/или файлов</label>
          <div className="batchFileList">{files.length ? files.map(file => <div key={file.name+file.size} className="listRow compact"><div className="stack"><span>{file.name}</span><span className="muted small">{loading ? 'в обработке' : 'загружено'}</span></div></div>) : <div className="empty">Файлы еще не добавлены.</div>}</div>
          <div className="row gap8 wrap"><button className="primaryBtn" onClick={startBatchReview} disabled={loading || !files.length}>Начать проверку</button>{activeSession?.results?.length ? <a className="secondaryBtn linkButton" href={api.exportCsvUrl(activeSession.id)} target="_blank" rel="noreferrer"><FileSpreadsheet size={16}/> Экспорт</a> : null}</div>
        </div>
      </Card>
      <Card title="Результаты пакетной обработки">
        {!activeSession || !activeSession.results?.length ? <div className="empty">Таблица пуста. Сначала добавь файлы и нажми «Начать проверку».</div> : <div className="tableScroll compactTableWrap"><table className="dataTable compactTable"><thead><tr><th>Имя</th><th>Типы ошибок</th><th>Описание ошибок</th><th>Итоговый балл</th><th>Дата</th></tr></thead><tbody>{activeSession.results.map(result => <tr key={result.id} onClick={()=>setSelectedResult(result)}><td>{result.name}</td><td><div className="chipWrap">{(result.errorTypes||[]).map(type => <span key={type} className="chip">{type}</span>)}</div></td><td>{result.errorDescription}</td><td>{result.score}</td><td>{result.submittedAt}</td></tr>)}</tbody></table></div>}
      </Card>
    </div>
    {selectedResult && <BatchResultModal result={selectedResult} sessionId={activeSession.id} onClose={()=>setSelectedResult(null)} onSave={async(payload)=>{await api.updateBatchResult(activeSession.id, selectedResult.id, payload); await reload(); setSelectedResult(null); notify({type:'success',text:'Результат пакетной проверки обновлен.'});}} />}
  </div>;
}


function BatchResultModal({ result, onClose, onSave }) {
  const [score, setScore] = useState(result.score);
  const [aiComment, setAiComment] = useState(result.aiComment || '');
  return <Modal title={result.name} onClose={onClose} wide>
    <div className="grid reviewGrid">
      <Card title="Печатный формат работы"><pre className="typedText">{result.typedText}</pre></Card>
      <Card title="Рукописный исходник">{result.sourceUrl ? <img src={normalizeUrl(result.sourceUrl)} alt={result.name} className="galleryImg tall" /> : <div className="empty">Нет исходника</div>}</Card>
      <Card title="Комментарии AI и итоговый балл"><div className="chipWrap">{(result.errorTypes||[]).map(type => <span key={type} className="pill warn">{type}</span>)}</div><p className="muted mt12">{result.errorDescription}</p><label className="field mt16"><span>Комментарий AI</span><textarea className="input textarea" value={aiComment} onChange={e=>setAiComment(e.target.value)} /></label><label className="field mt16"><span>Итоговый балл</span><input className="input" type="number" value={score} onChange={e=>setScore(Number(e.target.value))} /></label><div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Отмена</button><button className="primaryBtn" onClick={()=>onSave({ score, aiComment })}>Сохранить</button></div></Card>
    </div>
  </Modal>;
}

function TeacherAnalyticsPage({ db }) {
  const [drawerMetric, setDrawerMetric] = useState(null);
  const [filters, setFilters] = useState({ subject:'all', period:'all', studentId:'all', groupId:'all' });
  const [compareFilters, setCompareFilters] = useState({ subject:'all', period:'all', studentId:'all', groupId:'all' });
  const events = buildErrorEvents(db);
  const metrics = [
    { key:'flowScore', label:'Score по потоку', value: avg(Object.values(db.computed.studentScores || {})), extractor:(db)=>studentsByFilter(db, filters).map(s=>({ name:s.name, value: db.computed.studentScores[s.id] || 0 })) },
    { key:'inTime', label:'Сдано в срок', value: `${submissionRate(db, filters)}%`, extractor:(db)=>studentsByFilter(db, filters).map(s=>({ name:s.name, value: timelySubmissionForStudent(db,s.id) })) },
    { key:'errors', label:'Ошибок на работу', value: round(avg(Object.values(buildErrorEventsFiltered(db, filters).reduce((acc,e)=>{acc[e.workId]=(acc[e.workId]||0)+1; return acc;}, {}))),1), extractor:(db)=>errorCountPerStudent(db, filters) },
    { key:'ai', label:'Правки после AI', value: '18%', extractor:(db)=>studentsByFilter(db, filters).map(s=>({ name:s.name, value: 18 })) },
  ];
  const compareModeData = [
    { metric:'Score', student:61, group:54 },
    { metric:'Сдано в срок', student:88, group:76 },
    { metric:'Ошибок на работу', student:1.8, group:2.4 },
    { metric:'Правки после AI', student:17, group:18 },
  ];
  const topErrors = aggregateErrors(events, filters, false);
  return <div className="stack gap24">
    <div><h2 className="pageTitle">Аналитика</h2><p className="muted">KPI открываются в отдельной диаграмме c фильтрами по ученику, группе, времени и предмету.</p></div>
    <div className="grid fourCol">{metrics.map(metric => <button key={metric.key} className="kpiCard clickable" onClick={()=>setDrawerMetric(metric)}><div className="kpiTitle">{metric.label}</div><div className="kpiValue">{metric.value}</div></button>)}</div>
    <div className="grid twoCol">
      <Card title="Ученик против группы">
        <FilterRow filters={compareFilters} setFilters={setCompareFilters} db={db} includeAllTime />
        <ResponsiveContainer width="100%" height={280}><BarChart data={compareModeData} layout="vertical" margin={{ left: 12, right: 12 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="metric" width={120} /><Tooltip /><Bar dataKey="student" fill="#2563eb" radius={[0,8,8,0]} /><Bar dataKey="group" fill="#94a3b8" radius={[0,8,8,0]} /></BarChart></ResponsiveContainer>
      </Card>
      <Card title="Топ ошибок по заданию">
        <FilterRow filters={filters} setFilters={setFilters} db={db} includeAllTime />
        <ChartBar data={topErrors.map(x=>({name:x.name,value:x.value}))} />
      </Card>
    </div>
    {drawerMetric && <Drawer title={drawerMetric.label} onClose={()=>setDrawerMetric(null)}>
      <FilterRow filters={filters} setFilters={setFilters} db={db} includeAllTime />
      <ChartBar data={drawerMetric.extractor(db)} horizontal />
    </Drawer>}
  </div>;
}


function TeacherReportsPage({ db, reload, notify }) {
  const [targetType, setTargetType] = useState('student');
  const [targetId, setTargetId] = useState(db.students[0]?.id || '');
  const [frequency, setFrequency] = useState('Самостоятельно');
  const [period, setPeriod] = useState('7');
  const [saved, setSaved] = useState(false);
  const previewRecipients = targetType === 'student' ? [db.students.find(s=>s.id===targetId)].filter(Boolean).map(s=>`${s.parentName} <${s.parentEmail}>`) : (db.groups.find(g=>g.id===targetId)?.studentIds || []).map(id => db.students.find(s=>s.id===id)).filter(Boolean).filter(s => s.parentEmail).map(s => `${s.parentName} <${s.parentEmail}>`);

  return <div className="stack gap24">
    <div><h2 className="pageTitle">Отчеты</h2><p className="muted">Настройки можно сохранить для weekly/monthly режима, а ручную отправку запускать из превью письма.</p></div>
    <div className="grid twoCol">
      <Card title="Настройки отправки">
        <label className="field"><span>Объект</span><div className="segmented mini"><button className={cx(targetType==='student'&&'active')} onClick={()=>{setTargetType('student'); setTargetId(db.students[0]?.id||'');}}>Ученик</button><button className={cx(targetType==='group'&&'active')} onClick={()=>{setTargetType('group'); setTargetId(db.groups[0]?.id||'');}}>Группа</button></div></label>
        <label className="field mt16"><span>Кому</span><select className="input" value={targetId} onChange={e=>setTargetId(e.target.value)}>{targetType==='student' ? db.students.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>) : db.groups.filter(g=>g.active).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <label className="field mt16"><span>Режим отправки</span><select className="input" value={frequency} onChange={e=>setFrequency(e.target.value)}><option>Самостоятельно</option><option>Еженедельно</option><option>Ежемесячно</option></select></label>
        <label className="field mt16"><span>Период</span><select className="input" value={period} onChange={e=>setPeriod(e.target.value)}><option value="7">7 дней</option><option value="30">30 дней</option></select></label>
        <button className="primaryBtn mt20" onClick={async()=>{await api.saveReportConfig({ targetType, targetId, frequency, period }); setSaved(true); await reload(); notify({type:'success',text:'Настройки отчетов сохранены.'});}}>Сохранить</button>
      </Card>
      <Card title="Превью email">
        <div className="previewMail">
          <div className="mailTitle">Тема: Отчет по {targetType === 'student' ? 'ученику' : 'группе'} · {new Date().toLocaleDateString('ru-RU')}</div>
          <div className="mailRecipients">Получатели: {previewRecipients.length ? previewRecipients.join('; ') : 'Нет родительских email'}</div>
          <ul className="mailList"><li>Имя</li><li>Типы ошибок</li><li>Описание ошибок</li><li>Итоговый балл</li><li>Дата</li></ul>
        </div>
        <button className="primaryBtn mt20" onClick={async()=>{await api.sendReport({ targetType, targetId, period }); await reload(); notify({type:'success',text:'Отчет отправлен по логике backend.'});}}>Отправить отчет</button>
      </Card>
    </div>
    <Card title="Журнал отправок"><div className="stack gap10">{(db.reportLogs || []).length ? db.reportLogs.slice(0,8).map(log => <div key={log.id} className="listRow"><div><div>{log.targetLabel}</div><div className="muted small">{new Date(log.createdAt).toLocaleString('ru-RU')} · {log.mode}</div></div><div className="muted small">{log.recipients.length} получателей</div></div>) : <div className="empty">Отправок пока не было.</div>}</div></Card>
  </div>;
}


function TeacherPricingPage({ db, session }) {
  const current = session.role === 'teacher' && session.accessMode === 'limited' ? 'Free' : 'Pro Trial';
  const plans = [
    { name:'Free', price:'0 ₽', features:['Только пакетная проверка','CSV/PDF экспорт','Без очереди ручной проверки'] },
    { name:'Pro Trial', price:'Первые 30 дней бесплатно', features:['Полный teacher workflow','Ученики, группы, задания, аналитика','Настройки и отчеты'] },
    { name:'Pro', price:'1 490 ₽/мес', features:['Без лимита учеников','Полный teacher workflow','Пакетная проверка и отчеты'] }
  ];
  return <div className="stack gap24"><div><h2 className="pageTitle">Тарифы</h2><p className="muted">После 30 дней trial преподаватель автоматически переходит в Free-режим с доступом только к пакетной проверке.</p></div><div className="grid threeCol">{plans.map(plan => <Card key={plan.name} title={plan.name} actions={current===plan.name && <span className="pill info">Текущий тариф</span>}><div className="price">{plan.price}</div><ul className="featureList">{plan.features.map(f=><li key={f}>{f}</li>)}</ul></Card>)}</div></div>;
}

function TeacherSettingsPage({ db, reload, notify }) {
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState({ name: db.teacher?.name || '', email: db.teacher?.email || '', phone: db.teacher?.phone || '', avatarUrl: db.teacher?.avatarUrl || '' });
  const [subjectsState, setSubjectsState] = useState(db.teacher?.subjects || []);
  const [notifications, setNotifications] = useState(db.teacher?.notifications || {});
  const [reportPreferences, setReportPreferences] = useState(db.teacher?.reportPreferences || {});

  const uploadAvatar = async(files) => {
    const uploaded = await api.upload(files);
    if (uploaded.files?.[0]) setProfile(v=>({...v, avatarUrl: uploaded.files[0].url }));
  };
  const saveAll = async (payload) => {
    await api.updateTeacher(payload);
    await reload();
    notify({ type: 'success', text: 'Настройки сохранены.' });
  };

  return <div className="stack gap24"><div><h2 className="pageTitle">Настройки</h2><p className="muted">Настройки собраны по разделам: профиль, предметы, уведомления и отчеты.</p></div>
    <div className="settingsHeaderTabs">{['profile','subjects','notifications','reports'].map(key => <button key={key} className={cx('settingsTabBtn', tab===key && 'active')} onClick={()=>setTab(key)}>{key==='profile'?'Профиль':key==='subjects'?'Предметы':key==='notifications'?'Уведомления':'Отчеты'}</button>)}</div>
    {tab==='profile' && <Card title="Профиль"><div className="profileHero"><label className="avatarUploader circularAvatar"><input type="file" accept="image/*" onChange={e=>uploadAvatar(Array.from(e.target.files||[]))} />{profile.avatarUrl ? <img src={normalizeUrl(profile.avatarUrl)} className="avatarCoverImage" /> : <div className="avatarPlaceholderCircle"><UploadCloud size={22} /></div>}</label><div className="profileFields"><div className="grid twoCol"><label className="field"><span>Имя</span><input className="input" value={profile.name} onChange={e=>setProfile(v=>({...v,name:e.target.value}))} /></label><label className="field"><span>Email</span><input className="input" value={profile.email} onChange={e=>setProfile(v=>({...v,email:e.target.value}))} /></label><label className="field"><span>Телефон</span><input className="input" value={profile.phone} onChange={e=>setProfile(v=>({...v,phone:e.target.value}))} /></label></div></div></div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll(profile)}>Сохранить профиль</button></div></Card>}
    {tab==='subjects' && <Card title="Предметы"><div className="checkboxGrid">{['Математика','Физика','Химия'].map(subject => <label key={subject} className="checkRow"><input type="checkbox" checked={subjectsState.includes(subject)} onChange={e=>setSubjectsState(v=>e.target.checked?[...v,subject]:v.filter(s=>s!==subject))} /><span>{subject}</span></label>)}</div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll({ subjects: [...new Set(subjectsState)] })}>Сохранить предметы</button></div></Card>}
    {tab==='notifications' && <Card title="Уведомления"><div className="checkboxGrid">{Object.keys(notifications).map(key => <label key={key} className="checkRow"><input type="checkbox" checked={Boolean(notifications[key])} onChange={e=>setNotifications(v=>({...v,[key]:e.target.checked}))} /><span>{key}</span></label>)}</div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll({ notifications })}>Сохранить уведомления</button></div></Card>}
    {tab==='reports' && <Card title="Содержимое отчета родителям"><div className="checkboxGrid">{Object.keys(reportPreferences).map(key => <label key={key} className="checkRow"><input type="checkbox" checked={Boolean(reportPreferences[key])} onChange={e=>setReportPreferences(v=>({...v,[key]:e.target.checked}))} /><span>{key}</span></label>)}</div><div className="modalActions nicerSettingsActions"><button className="primaryBtn" onClick={()=>saveAll({ reportPreferences })}>Сохранить настройки отчета</button></div></Card>}
  </div>;
}


function StudentDashboardPage({ db }) {
  const student = db.students.find(s=>s.active) || db.students[0];
  const assignments = assignmentsForStudent(db, student.id);
  const works = db.works.filter(w => w.studentId === student.id);
  const undone = assignments.filter(a => !works.some(w => w.assignmentId === a.id));
  const [showUndone, setShowUndone] = useState(false);
  const [detail, setDetail] = useState(null);
  return <div className="stack gap24">
    <div><h2 className="pageTitle">Главная</h2><p className="muted">Главный акцент — задания, которые еще не сделаны, и рекомендации.</p></div>
    <div className="grid twoCol"><button className="kpiCard clickable" onClick={()=>setShowUndone(true)}><div className="kpiTitle">Задания, которые не сделаны</div><div className="kpiValue">{undone.length}</div></button><KPI title="Score" value={db.computed.studentScores[student.id] || 0} /></div>
    <div className="grid twoCol"><Card title="Последние результаты"><div className="stack gap10">{works.filter(w=>w.status==='Проверена').slice(0,4).map(w => { const a = db.assignments.find(x=>x.id===w.assignmentId); return <div key={w.id} className="listRow"><div>{a?.title}</div><div>{w.finalScore}</div></div>; })}</div></Card><Card title="Рекомендации"><div className="stack gap8"><div className="cardInner">Повторить цепное правило и проверять коэффициенты в финальном ответе.</div><div className="cardInner">Следить за единицами измерения и записью условия в физике.</div></div></Card></div>
    {showUndone && <Modal title="Задания, которые не сделаны" onClose={()=>setShowUndone(false)}><div className="stack gap12">{undone.map(a => <button key={a.id} className="assignmentCard polished" onClick={()=>setDetail(a)}><div className="row between wrap gap12"><div><div className="cardTitle">{a.title}</div><div className="muted small">{a.subject}</div></div><DeadlineBadge assignment={a} hasWork={false} /></div></button>)}</div></Modal>}
    {detail && <StudentAssignmentDetail assignment={detail} work={works.find(w=>w.assignmentId===detail.id)} onClose={()=>setDetail(null)} onUpload={async()=>{}} readonly />}
  </div>;
}


function StudentAssignmentsPage({ db, reload, notify }) {
  const student = db.students.find(s => s.active) || db.students[0];
  const assignments = assignmentsForStudent(db, student.id);
  const works = db.works.filter(w => w.studentId === student.id);
  const [subject, setSubject] = useState('Все');
  const [detail, setDetail] = useState(null);
  const filtered = assignments.filter(a => subject === 'Все' || a.subject === subject);

  const uploadWork = async (assignment, files) => {
    const uploaded = await api.upload(files);
    const existing = works.find(w => w.assignmentId === assignment.id);
    if (existing) {
      await api.updateWork(existing.id, { files: [...(existing.files || []), ...uploaded.files] });
      notify({ type:'success', text:'Файлы добавлены к существующей работе.' });
    } else {
      await api.createWork({ assignmentId: assignment.id, studentId: student.id, files: uploaded.files, ocrText: 'Распознанный текст будет добавлен после обработки.', aiComment: 'AI-анализ будет добавлен после обработки.', aiErrors: [], suggestedScore: 0, finalScore: null, status: 'Ожидает подтверждения' });
      notify({ type:'success', text:'Решение загружено.' });
    }
    await reload();
  };

  return <div className="stack gap24">
    <div><h2 className="pageTitle">Мои задания</h2><p className="muted">Фильтр только по предметам ученика. К каждому заданию можно добавлять несколько фото и файлов даже после дедлайна.</p></div>
    <div className="row wrap gap8">{['Все', ...student.subjects].map(s => <FilterChip key={s} active={subject===s} onClick={()=>setSubject(s)}>{s}</FilterChip>)}</div>
    <div className="stack gap12">{filtered.map(a => { const work = works.find(w => w.assignmentId === a.id); return <button key={a.id} className="assignmentCard polished" onClick={()=>setDetail(a)}><div className="row between wrap gap12"><div><div className="cardTitle">{a.title}</div><div className="muted small">{a.subject}</div></div><div className="row gap8">{!work && <DeadlineBadge assignment={a} hasWork={false} />}{work && <span className={pillClass[work.status]}>{work.status}</span>}</div></div></button>; })}</div>
    {detail && <StudentAssignmentDetail assignment={detail} work={works.find(w=>w.assignmentId===detail.id)} onClose={()=>setDetail(null)} onUpload={async(files)=>{await uploadWork(detail, files); setDetail(null);}} />}
  </div>;
}

function StudentAssignmentDetail({ assignment, work, onClose, onUpload, readonly=false }) {
  const [files, setFiles] = useState([]);
  return <Modal title={assignment.title} onClose={onClose} wide>
    <div className="stack gap16">
      <div className="muted">{assignment.description}</div>
      {assignment.attachments?.length > 0 && <div className="gallery">{assignment.attachments.map(att => att.kind === 'photo' ? <img key={att.id} src={normalizeUrl(att.url)} className="galleryImg" /> : <a key={att.id} href={normalizeUrl(att.url)} target="_blank" rel="noreferrer" className="fileTile">{att.name}</a>)}</div>}
      {work && <div className="cardInner">К этому заданию уже загружено решение. Можно добавить еще файлы или фотографии.</div>}
      {!readonly && <><label className="uploadZone small"><input type="file" multiple onChange={e=>setFiles(prev=>[...prev, ...Array.from(e.target.files||[]).filter(file => !prev.some(existing => existing.name === file.name && existing.size === file.size))])} /> <UploadCloud size={20} /> Добавить несколько фото/файлов</label>{files.length>0 && <div className="attachList">{files.map(file => <span key={file.name+file.size} className="attachChip">{file.name}</span>)}</div>}<div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Закрыть</button><button className="primaryBtn" onClick={()=>onUpload(files)} disabled={!files.length}>Загрузить</button></div></>}
      {readonly && <div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Закрыть</button></div>}
    </div>
  </Modal>;
}

function StudentProfilePage({ db }) {
  const student = db.students.find(s=>s.active) || db.students[0];
  const score = db.computed.studentScores[student.id] || 0;
  return <div className="stack gap24"><div><h2 className="pageTitle">Профиль</h2></div><div className="grid twoCol refinedStudentProfileGrid"><Card title="Основная информация"><div className="studentProfilePanel"><div className="studentProfileName">{student.name}</div><div className="studentProfileMeta">{student.level}</div><div className="stack gap12 mt16"><InfoBox label="Email" value={student.email} /><InfoBox label="Телефон" value={student.phone || '—'} /><InfoBox label="Родитель" value={student.parentName || '—'} secondary={student.parentEmail || '—'} /></div></div></Card><Card title="Учебный статус"><div className="studentProfilePanel"><div className="scoreHero">{score}</div><div className="studentProfileMeta">Текущий score</div><div className="chipWrap mt16">{student.subjects.map(subject => <span key={subject} className="chip">{subject}</span>)}</div>{effectiveStudentSlots(db, student).length ? <div className="chipWrap mt16">{effectiveStudentSlots(db, student).map(slot => <span key={slot.id + (slot.sourceGroupId || '')} className={cx('chip', slot.inherited && 'chipInherited')}>{slot.day} {slot.time} · {slot.durationHours || 0} ч {slot.durationMinutes || 0} мин</span>)}</div> : <div className="muted small mt16">Слоты занятий не заданы.</div>}</div></Card></div></div>;
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
function FilterRow({ filters, setFilters, db, includeAllTime=false }) {
  const periods = includeAllTime ? PERIODS : PERIODS.filter(p => p.value !== 'all');
  return <div className="filterRow"><select className="input selectSmall" value={filters.subject} onChange={e=>setFilters(v=>({...v,subject:e.target.value}))}><option value="all">Все предметы</option>{['Математика','Физика','Химия'].map(s=><option key={s}>{s}</option>)}</select><select className="input selectSmall" value={filters.studentId} onChange={e=>setFilters(v=>({...v,studentId:e.target.value}))}><option value="all">Все ученики</option>{db.students.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select className="input selectSmall" value={filters.groupId} onChange={e=>setFilters(v=>({...v,groupId:e.target.value}))}><option value="all">Все группы</option>{db.groups.filter(g=>g.active).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><select className="input selectSmall" value={filters.period} onChange={e=>setFilters(v=>({...v,period:e.target.value}))}>{periods.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></div>;
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
    .filter(group => group.active && group.studentIds.includes(student.id))
    .flatMap(group => (group.lessonSlots || []).map(slot => ({ ...slot, inherited: true, sourceGroupId: group.id, sourceGroupName: group.name })));
  return [...own, ...inherited];
}

function assignmentsForStudent(db, studentId) {
  const groupIds = db.groups.filter(g => g.active && g.studentIds.includes(studentId)).map(g => g.id);
  return db.assignments.filter(a => a.recipientType === 'student' ? a.recipientId === studentId : groupIds.includes(a.recipientId));
}
function buildErrorEvents(db) { return buildErrorEventsFiltered(db, { subject:'all', period:'all', studentId:'all', groupId:'all' }); }
function buildErrorEventsFiltered(db, filters) {
  return db.works.flatMap(work => {
    const assignment = db.assignments.find(a => a.id === work.assignmentId);
    const student = db.students.find(s => s.id === work.studentId);
    const group = db.groups.find(g => g.studentIds.includes(work.studentId));
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
function studentsByFilter(db, filters) {
  return db.students.filter(s => s.active && (filters.studentId === 'all' || s.id === filters.studentId) && (filters.groupId === 'all' || db.groups.find(g => g.id === filters.groupId)?.studentIds.includes(s.id)));
}
function timelySubmissionForStudent(db, studentId) {
  const assignments = assignmentsForStudent(db, studentId);
  if (!assignments.length) return 0;
  const submittedInTime = assignments.filter(a => db.works.some(w => w.studentId === studentId && w.assignmentId === a.id && (!a.deadline || new Date(w.submittedAt) <= new Date(a.deadline)))).length;
  return Math.round((submittedInTime / assignments.length) * 100);
}
function submissionRate(db, filters) {
  const students = studentsByFilter(db, filters);
  if (!students.length) return 0;
  return round(avg(students.map(student => timelySubmissionForStudent(db, student.id))));
}
function errorCountPerStudent(db, filters) {
  const ev = buildErrorEventsFiltered(db, filters);
  const map = {};
  ev.forEach(e => { map[e.studentId] = (map[e.studentId] || 0) + 1; });
  return Object.entries(map).map(([id, value]) => ({ name: db.students.find(s=>s.id===id)?.name || id, value })).sort((a,b)=>b.value-a.value);
}
function avg(values) { const arr = Array.isArray(values) ? values : Object.values(values || {}); return arr.length ? Math.round(arr.reduce((a,b)=>a+Number(b||0),0)/arr.length) : 0; }
function round(v, p=0) { const m=10**p; return Math.round((Number(v)||0)*m)/m; }
function recipientLabel(db, assignment) {
  if (!assignment.recipientId) return 'Не указан';
  if (assignment.recipientType === 'student') return db.students.find(s=>s.id===assignment.recipientId)?.name || 'Неизвестный ученик';
  return db.groups.find(g=>g.id===assignment.recipientId)?.name || 'Неизвестная группа';
}
function normalizeUrl(url) { return url?.startsWith('http') ? url : `${API}${url}`; }
function timeToMinutes(time) { const [h,m] = String(time || "00:00").split(":").map(Number); return (h||0)*60 + (m||0); }
function cryptoRandom() { return Math.random().toString(36).slice(2,10); }

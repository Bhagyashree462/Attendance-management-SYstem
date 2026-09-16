import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import {
  LogOut, LayoutDashboard, ClipboardList, FileText, CalendarCheck, Users, GraduationCap,
  ShieldCheck, Search, Upload, Check, X, AlertTriangle, BookOpen, ClipboardCheck, UserCog,
  Landmark, Bell, Send, ArrowRightCircle, Eye, EyeOff
} from 'lucide-react';

/* ============================================================
   THE REGISTER — College Attendance Management System
   Client-side demo. window.storage (shared) stands in for the
   database; there is no real server, JWT, bcrypt or mail relay
   here — see "About this build" on the landing page for what a
   real Node/Express/MongoDB version would add.

   v2 changes: OTP-verified student registration, 10-digit phone
   + @coep.sveri.ac.in email + unique roll-number validation,
   Year (1st–4th) replacing Class, a fixed Department dropdown,
   an absence-notification system, and a CC → HOD leave-forwarding
   workflow (HOD only sees a leave after CC reviews + forwards it).
   ============================================================ */

const DEPARTMENTS = [
  'Computer Science and Engineering',
  'Electronics and Telecommunication Engineering',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Artificial Intelligence and Data Science',
];
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const SUBJECTS = [
  { id: 'DBMS', name: 'Database Management Systems' },
  { id: 'OS', name: 'Operating Systems' },
  { id: 'DAA', name: 'Design & Analysis of Algorithms' },
  { id: 'CN', name: 'Computer Networks' },
];
const MIN_ATTENDANCE = 75;
const STUDENT_EMAIL_DOMAIN = '@coep.sveri.ac.in';
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_S = 30;
const TIME_SLOTS = { 1: '9:00 AM', 2: '10:00 AM', 3: '11:00 AM', 4: '12:00 PM', 5: '2:00 PM', 6: '3:00 PM' };

const LEAVE_STATUSES = ['Pending CC', 'Reviewed by CC', 'Forwarded to HOD', 'Approved by HOD', 'Rejected by HOD'];

const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

async function storeGet(key, shared = true) {
  try { const r = await window.storage.get(key, shared); return r ? JSON.parse(r.value) : null; } catch { return null; }
}
async function storeSet(key, value, shared = true) {
  try { await window.storage.set(key, JSON.stringify(value), shared); } catch (e) { console.error(e); }
}

/* ---------- validation ---------- */
const isValidPhone = (v) => /^[0-9]{10}$/.test(v || '');
const isValidStudentEmail = (v) => new RegExp(`^[^\\s@]+${STUDENT_EMAIL_DOMAIN.replace('.', '\\.')}$`, 'i').test(v || '');
const isValidEmailShape = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
const isStrongPassword = (v) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(v || '');
const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter, a lowercase letter, a number and a special character.';

function formatDDMonYYYY(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

/* ---------- seed records ---------- */
function seedRecords(studentId, staffId, department, year, subjectId, present, absent, startDate) {
  const out = [];
  let d = new Date(startDate);
  let lecture = 1;
  const total = present + absent;
  const presentSlots = new Set();
  while (presentSlots.size < present) presentSlots.add(Math.floor(Math.random() * total));
  for (let i = 0; i < total; i++) {
    out.push({
      id: uid('att'), studentId, staffId, subjectId, department, year,
      date: d.toISOString().slice(0, 10), lecture,
      status: presentSlots.has(i) ? 'Present' : 'Absent',
      createdAt: d.toISOString(),
    });
    lecture = lecture === 2 ? 1 : lecture + 1;
    if (lecture === 1) d.setDate(d.getDate() + 1);
  }
  return out;
}

function buildSeed() {
  const dept = DEPARTMENTS[0];
  const student = {
    id: uid('stu'), role: 'student', fullName: 'Aditi Rao', email: 'aditi.rao@coep.sveri.ac.in', password: 'demo123',
    rollNo: 'CSE21001', phone: '9876500001', year: '3rd Year', department: dept, emailVerified: true,
  };
  const student2 = {
    id: uid('stu'), role: 'student', fullName: 'Rohan Bhat', email: 'rohan.bhat@coep.sveri.ac.in', password: 'demo123',
    rollNo: 'CSE21002', phone: '9876500004', year: '3rd Year', department: dept, emailVerified: true,
  };
  const student3 = {
    id: uid('stu'), role: 'student', fullName: 'Meera Shah', email: 'meera.shah@coep.sveri.ac.in', password: 'demo123',
    rollNo: 'CSE21003', phone: '9876500005', year: '3rd Year', department: dept, emailVerified: true,
  };
  const staff = {
    id: uid('stf'), role: 'staff', fullName: 'Prof. Kiran Mehta', email: 'staff@demo.edu', password: 'demo123',
    employeeId: 'EMP-101', department: dept, subjects: ['DBMS', 'OS', 'DAA', 'CN'], years: ['3rd Year'], phone: '9876500002',
  };
  const cc = {
    id: uid('cc'), role: 'cc', fullName: 'Prof. Alok Verma', email: 'cc@demo.edu', password: 'demo123',
    employeeId: 'EMP-050', department: dept, phone: '9876500006',
  };
  const hod = {
    id: uid('hod'), role: 'hod', fullName: 'Dr. Sunita Iyer', email: 'hod@demo.edu', password: 'demo123',
    employeeId: 'EMP-001', department: dept, phone: '9876500003',
  };
  const users = [student, student2, student3, staff, cc, hod];

  let attendance = [];
  attendance = attendance.concat(seedRecords(student.id, staff.id, dept, '3rd Year', 'DBMS', 35, 5, '2026-02-02'));
  attendance = attendance.concat(seedRecords(student.id, staff.id, dept, '3rd Year', 'OS', 38, 4, '2026-02-02'));
  attendance = attendance.concat(seedRecords(student.id, staff.id, dept, '3rd Year', 'DAA', 30, 5, '2026-02-02'));
  attendance = attendance.concat(seedRecords(student.id, staff.id, dept, '3rd Year', 'CN', 32, 6, '2026-02-02'));
  attendance = attendance.concat(seedRecords(student2.id, staff.id, dept, '3rd Year', 'DBMS', 20, 20, '2026-02-02'));
  attendance = attendance.concat(seedRecords(student2.id, staff.id, dept, '3rd Year', 'OS', 22, 18, '2026-02-02'));
  attendance = attendance.concat(seedRecords(student3.id, staff.id, dept, '3rd Year', 'DBMS', 38, 2, '2026-02-02'));
  attendance = attendance.concat(seedRecords(student3.id, staff.id, dept, '3rd Year', 'OS', 39, 3, '2026-02-02'));

  const student1Pct = subjectStats(attendance, student.id, null).pct;
  const notifications = attendance
    .filter(a => a.studentId === student.id && a.status === 'Absent')
    .slice(0, 6)
    .map(a => {
      const subj = SUBJECTS.find(s => s.id === a.subjectId)?.name || a.subjectId;
      return {
        id: uid('ntf'), studentId: a.studentId, isRead: false, title: 'Attendance Notification',
        subject: subj, date: a.date, time: TIME_SLOTS[a.lecture] || `Period ${a.lecture}`,
        message: `You were marked absent for ${subj} on ${formatDDMonYYYY(a.date)}. Your current attendance is ${student1Pct}%.`,
        createdAt: a.createdAt,
      };
    });

  const leaves = [
    { id: uid('lv'), studentId: student.id, fromDate: '2026-08-10', toDate: '2026-08-11', reason: 'Personal work', document: 'none',
      status: 'Approved by HOD', ccId: cc.id, ccComment: 'Genuine reason, recommend approval.', hodId: hod.id, hodComment: 'Approved.',
      forwardedAt: '2026-08-09T09:00:00.000Z', appliedAt: '2026-08-08T10:00:00.000Z' },
    { id: uid('lv'), studentId: student.id, fromDate: '2026-08-02', toDate: '2026-08-03', reason: 'Medical', document: 'medical_slip.jpg',
      status: 'Rejected by HOD', ccId: cc.id, ccComment: 'Document looks incomplete.', hodId: hod.id, hodComment: 'Invalid document.',
      forwardedAt: '2026-08-01T12:00:00.000Z', appliedAt: '2026-08-01T10:00:00.000Z' },
    { id: uid('lv'), studentId: student.id, fromDate: '2026-08-21', toDate: '2026-08-22', reason: 'Medical — fever', document: 'prescription.pdf',
      status: 'Pending CC', ccId: '', ccComment: '', hodId: '', hodComment: '', forwardedAt: '', appliedAt: '2026-08-19T10:00:00.000Z' },
  ];

  return { users, attendance, leaves, notifications };
}

/* ---------- attendance math ---------- */
function subjectStats(attendance, studentId, subjectId) {
  const recs = attendance.filter(a => a.studentId === studentId && (!subjectId || a.subjectId === subjectId));
  const total = recs.length;
  const present = recs.filter(r => r.status === 'Present').length;
  const absent = total - present;
  const pct = total ? Math.round((present / total) * 1000) / 10 : 0;
  return { total, present, absent, pct };
}
function studentSubjectBreakdown(attendance, studentId) {
  const ids = [...new Set(attendance.filter(a => a.studentId === studentId).map(a => a.subjectId))];
  return ids.map(id => ({ subjectId: id, name: SUBJECTS.find(s => s.id === id)?.name || id, ...subjectStats(attendance, studentId, id) }));
}

/* ---------- shared UI atoms ---------- */
const STATUS_TONE = {
  Present: 'ok', Absent: 'bad',
  'Pending CC': 'warn', 'Reviewed by CC': 'warn', 'Forwarded to HOD': 'warn',
  'Approved by HOD': 'ok', 'Rejected by HOD': 'bad',
};
function Stamp({ status }) {
  return <span className={`acs-stamp acs-stamp-${STATUS_TONE[status] || 'warn'}`}>{status}</span>;
}
function StatCard({ label, value, sub, icon: Icon }) {
  return (
    <div className="acs-card acs-stat">
      <div className="acs-stat-top"><span className="acs-stat-label">{label}</span>{Icon && <Icon size={16} strokeWidth={1.75} />}</div>
      <div className="acs-stat-value">{value}</div>
      {sub && <div className="acs-stat-sub">{sub}</div>}
    </div>
  );
}
function Empty({ text }) { return <div className="acs-empty">{text}</div>; }
function FieldError({ msg }) { return msg ? <div className="acs-error">{msg}</div> : null; }

function PasswordInput({ value, onChange, error, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        className={`acs-input ${error ? 'err' : ''}`}
        style={{ paddingRight: 38 }}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="new-password"
      />
      <span
        onClick={() => setShow(s => !s)}
        role="button"
        aria-label={show ? 'Hide password' : 'Show password'}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}
      >
        {show ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
      </span>
    </div>
  );
}

/* ============================================================ */

export default function App() {
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState('landing');
  const [authRole, setAuthRole] = useState('student');
  const [toast, setToast] = useState(null);

  const notify = useCallback((msg, tone = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 3200); }, []);

  useEffect(() => {
    (async () => {
      let u = await storeGet('acs-users'); let a = await storeGet('acs-attendance');
      let l = await storeGet('acs-leaves'); let n = await storeGet('acs-notifications');
      if (!u || !u.length) {
        const seed = buildSeed();
        u = seed.users; a = seed.attendance; l = seed.leaves; n = seed.notifications;
        await storeSet('acs-users', u); await storeSet('acs-attendance', a);
        await storeSet('acs-leaves', l); await storeSet('acs-notifications', n);
      }
      setUsers(u || []); setAttendance(a || []); setLeaves(l || []); setNotifications(n || []);
      setReady(true);
    })();
  }, []);

  const persistUsers = async (next) => { setUsers(next); await storeSet('acs-users', next); };
  const persistAttendance = async (next) => { setAttendance(next); await storeSet('acs-attendance', next); };
  const persistLeaves = async (next) => { setLeaves(next); await storeSet('acs-leaves', next); };
  const persistNotifications = async (next) => { setNotifications(next); await storeSet('acs-notifications', next); };

  const login = (role, email, password) => {
    const u = users.find(x => x.role === role && x.email.toLowerCase() === email.toLowerCase() && x.password === password);
    if (!u) { notify('No matching account for that role, email and password.', 'bad'); return false; }
    setSession(u); setPage(role); notify(`Welcome back, ${u.fullName.split(' ')[0]}.`); return true;
  };
  const registerDirect = async (role, form) => {
    if (users.some(u => u.role === role && u.email.toLowerCase() === form.email.toLowerCase())) {
      notify('An account with that email already exists for this role.', 'bad'); return false;
    }
    const u = { id: uid(role.slice(0, 3)), role, ...form };
    await persistUsers([...users, u]);
    setSession(u); setPage(role); notify('Account created. You are logged in.'); return true;
  };
  const registerStudentVerified = async (form) => {
    const u = { id: uid('stu'), role: 'student', ...form, emailVerified: true };
    await persistUsers([...users, u]);
    setSession(u); setPage('student'); notify('Email verified successfully. Registration completed.'); return true;
  };
  const logout = () => { setSession(null); setPage('landing'); };

  // Mark attendance + auto-generate absence notifications
  const saveAttendance = async (recs) => {
    const updatedAttendance = [...attendance, ...recs];
    await persistAttendance(updatedAttendance);
    const staffUser = users.find(u => recs[0] && u.id === recs[0].staffId);
    const newNotifs = recs.filter(r => r.status === 'Absent').map(r => {
      const subj = SUBJECTS.find(s => s.id === r.subjectId)?.name || r.subjectId;
      const time = TIME_SLOTS[r.lecture] || `Period ${r.lecture}`;
      const pct = subjectStats(updatedAttendance, r.studentId, null).pct;
      return {
        id: uid('ntf'), studentId: r.studentId, isRead: false, title: 'Attendance Notification',
        subject: subj, date: r.date, time,
        message: `You were marked absent for ${subj} on ${formatDDMonYYYY(r.date)}. Your current attendance is ${pct}%.${staffUser ? ` — ${staffUser.fullName}` : ''}`,
        createdAt: new Date().toISOString(),
      };
    });
    if (newNotifs.length) await persistNotifications([...notifications, ...newNotifs]);
  };

  if (!ready) return <Shell><div className="acs-loading">Opening the register…</div></Shell>;

  return (
    <Shell>
      {toast && <div className={`acs-toast acs-toast-${toast.tone}`}>{toast.msg}</div>}
      {page === 'landing' && <Landing onGo={(p, r) => { setAuthRole(r || 'student'); setPage(p); }} />}
      {page === 'login' && (
        <AuthLogin role={authRole} setRole={setAuthRole} onSubmit={login} onSwap={() => setPage('register')} onHome={() => setPage('landing')} />
      )}
      {page === 'register' && (
        <AuthRegister role={authRole} setRole={setAuthRole} users={users}
          onSubmitDirect={registerDirect} onSubmitStudentVerified={registerStudentVerified}
          onSwap={() => setPage('login')} onHome={() => setPage('landing')} notify={notify} />
      )}
      {page === 'student' && session && (
        <StudentApp me={session} users={users} attendance={attendance} leaves={leaves} notifications={notifications}
          onLogout={logout} onAddLeave={async (lv) => await persistLeaves([...leaves, lv])}
          onMarkRead={async (id) => await persistNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n))}
          notify={notify} />
      )}
      {page === 'staff' && session && (
        <StaffApp me={session} users={users} attendance={attendance}
          onLogout={logout} onSaveAttendance={saveAttendance} notify={notify} />
      )}
      {page === 'cc' && session && (
        <CcApp me={session} users={users} leaves={leaves}
          onLogout={logout}
          onUpdateLeave={async (id, patch) => await persistLeaves(leaves.map(l => l.id === id ? { ...l, ...patch } : l))}
          notify={notify} />
      )}
      {page === 'hod' && session && (
        <HodApp me={session} users={users} attendance={attendance} leaves={leaves}
          onLogout={logout}
          onUpdateLeave={async (id, patch) => await persistLeaves(leaves.map(l => l.id === id ? { ...l, ...patch } : l))}
          notify={notify} />
      )}
    </Shell>
  );
}

/* ============================== SHELL / STYLE ============================== */
function Shell({ children }) {
  return (
    <div className="acs-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .acs-root{--bg:#F5F4EF;--surface:#FFFFFF;--ink:#1C2A2E;--muted:#5C6B6E;--primary:#28454C;--primary-dark:#182F34;--accent:#C08A3E;--danger:#AE4438;--success:#3D6E4C;--warn:#B98A2E;--line:#DAD4C4;font-family:'Inter',sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;width:100%;}
        .acs-root *{box-sizing:border-box;}
        .acs-serif{font-family:'Source Serif 4',serif;} .acs-mono{font-family:'IBM Plex Mono',monospace;}
        .acs-loading{padding:80px 20px;text-align:center;font-family:'Source Serif 4',serif;font-size:20px;color:var(--muted);}
        .acs-card{background:var(--surface);border:1px solid var(--line);border-radius:4px;}
        .acs-btn{font-family:'Inter',sans-serif;font-weight:600;font-size:13.5px;padding:10px 18px;border-radius:3px;border:1px solid var(--primary);background:transparent;color:var(--primary);cursor:pointer;letter-spacing:.2px;transition:all .15s ease;}
        .acs-btn:hover{background:var(--primary);color:#fff;}
        .acs-btn-primary{background:var(--primary);color:#fff;} .acs-btn-primary:hover{background:var(--primary-dark);border-color:var(--primary-dark);}
        .acs-btn-accent{background:var(--accent);border-color:var(--accent);color:#fff;} .acs-btn-accent:hover{background:#a5701f;border-color:#a5701f;}
        .acs-btn-ghost{border-color:transparent;color:var(--muted);} .acs-btn-ghost:hover{background:#00000008;color:var(--ink);}
        .acs-btn-danger{border-color:var(--danger);color:var(--danger);} .acs-btn-danger:hover{background:var(--danger);color:#fff;}
        .acs-btn:disabled{opacity:.4;cursor:not-allowed;}
        .acs-input,.acs-select,.acs-textarea{font-family:'Inter',sans-serif;font-size:14px;padding:9px 11px;border:1px solid var(--line);border-radius:3px;background:#fff;color:var(--ink);width:100%;}
        .acs-input:focus,.acs-select:focus,.acs-textarea:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent);}
        .acs-input.err,.acs-select.err{border-color:var(--danger);}
        .acs-label{font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);display:block;margin-bottom:5px;}
        .acs-field{margin-bottom:14px;} .acs-error{color:var(--danger);font-size:12px;margin-top:4px;}
        .acs-table{width:100%;border-collapse:collapse;font-size:13.5px;}
        .acs-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);border-bottom:1px solid var(--line);padding:8px 10px;font-weight:600;}
        .acs-table td{padding:10px 10px;border-bottom:1px solid #EFEBDD;} .acs-table tr:hover td{background:#FBFAF5;}
        .acs-stamp{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.5px;padding:4px 10px;border-radius:20px;border:1.5px solid;text-transform:uppercase;display:inline-block;}
        .acs-stamp-ok{color:var(--success);border-color:var(--success);background:#3D6E4C10;}
        .acs-stamp-bad{color:var(--danger);border-color:var(--danger);background:#AE443810;}
        .acs-stamp-warn{color:var(--warn);border-color:var(--warn);background:#B98A2E10;}
        .acs-badge-role{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--accent);border:1px solid var(--accent);padding:2px 8px;border-radius:2px;}
        .acs-toast{position:fixed;top:18px;right:18px;z-index:999;background:var(--primary-dark);color:#fff;padding:12px 18px;border-radius:4px;font-size:13.5px;box-shadow:0 8px 24px #0004;max-width:340px;}
        .acs-toast-bad{background:var(--danger);}
        .acs-empty{padding:36px 12px;text-align:center;color:var(--muted);font-size:13.5px;border:1px dashed var(--line);border-radius:4px;}
        .acs-scroll{overflow-x:auto;}
        .acs-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:18px;flex-wrap:wrap;}
        .acs-tab{padding:9px 4px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-right:18px;}
        .acs-tab.active{color:var(--primary);border-color:var(--accent);}
        .acs-notif{padding:12px 14px;border-bottom:1px solid #EFEBDD;cursor:pointer;display:flex;gap:10px;align-items:flex-start;}
        .acs-notif:hover{background:#FBFAF5;} .acs-notif.unread{background:#C08A3E0a;}
        .acs-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);margin-top:5px;flex-shrink:0;}
      `}</style>
      {children}
    </div>
  );
}

/* ============================== LANDING ============================== */
function Landing({ onGo }) {
  return (
    <div>
      <header style={{ borderBottom: '1px solid var(--line)', padding: '16px 6vw', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Landmark size={22} color="var(--primary)" strokeWidth={1.6} />
          <span className="acs-serif" style={{ fontSize: 19, fontWeight: 600 }}>The Register</span>
        </div>
        <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="acs-btn acs-btn-ghost" onClick={() => onGo('login', 'student')}>Student login</button>
          <button className="acs-btn acs-btn-ghost" onClick={() => onGo('login', 'staff')}>Staff login</button>
          <button className="acs-btn acs-btn-ghost" onClick={() => onGo('login', 'cc')}>CC login</button>
          <button className="acs-btn acs-btn-ghost" onClick={() => onGo('login', 'hod')}>HOD login</button>
        </nav>
      </header>

      <section style={{ padding: '9vh 6vw 8vh', borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg,#F9F8F3,transparent)' }}>
        <div style={{ maxWidth: 720 }}>
          <span className="acs-mono" style={{ fontSize: 12, color: 'var(--accent)', letterSpacing: 1 }}>COLLEGE ATTENDANCE MANAGEMENT SYSTEM</span>
          <h1 className="acs-serif" style={{ fontSize: 'clamp(34px,5vw,54px)', lineHeight: 1.08, margin: '14px 0 18px', fontWeight: 600 }}>
            One roll call. Every desk covered.
          </h1>
          <p style={{ fontSize: 16.5, color: 'var(--muted)', maxWidth: 560, lineHeight: 1.6 }}>
            Students see their own record and get notified the moment they're marked absent. Staff mark attendance for
            their years. A leave request travels from student to CC to HOD — the HOD only ever sees it once CC has
            reviewed it and added a comment.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap' }}>
            <button className="acs-btn acs-btn-primary" onClick={() => onGo('login', 'student')}>Sign in as Student</button>
            <button className="acs-btn" onClick={() => onGo('login', 'staff')}>Sign in as Staff</button>
            <button className="acs-btn" onClick={() => onGo('login', 'cc')}>Sign in as CC</button>
            <button className="acs-btn" onClick={() => onGo('login', 'hod')}>Sign in as HOD</button>
          </div>
          <div className="acs-mono" style={{ marginTop: 20, fontSize: 12, color: 'var(--muted)' }}>
            Demo — aditi.rao@coep.sveri.ac.in / staff@demo.edu / cc@demo.edu / hod@demo.edu — password: demo123
          </div>
        </div>
      </section>

      <section style={{ padding: '7vh 6vw', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 22, borderBottom: '1px solid var(--line)' }}>
        {[
          { icon: CalendarCheck, title: 'Mark & track attendance', body: 'Year and subject-wise marking, with duplicate protection per lecture.' },
          { icon: Bell, title: 'Absence notifications', body: 'A student is notified the moment they are marked absent for a lecture.' },
          { icon: ArrowRightCircle, title: 'CC reviews before HOD', body: 'A leave only reaches the HOD after CC adds a comment and forwards it — never directly.' },
          { icon: ShieldCheck, title: 'Verified registration', body: 'Student sign-up checks phone, college email domain and roll number, then confirms by OTP.' },
        ].map((f, i) => (
          <div key={i}>
            <f.icon size={20} strokeWidth={1.6} color="var(--primary)" />
            <div className="acs-serif" style={{ fontSize: 17, fontWeight: 600, margin: '10px 0 6px' }}>{f.title}</div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55 }}>{f.body}</div>
          </div>
        ))}
      </section>

      <section style={{ padding: '6vh 6vw', textAlign: 'center' }}>
        <div className="acs-serif" style={{ fontSize: 22, fontWeight: 600, marginBottom: 14 }}>New here?</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="acs-btn" onClick={() => onGo('register', 'student')}>Register as Student</button>
          <button className="acs-btn" onClick={() => onGo('register', 'staff')}>Register as Staff</button>
          <button className="acs-btn" onClick={() => onGo('register', 'cc')}>Register as CC</button>
          <button className="acs-btn" onClick={() => onGo('register', 'hod')}>Register as HOD</button>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--line)', padding: '22px 6vw', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
        <strong>About this build:</strong> this runs entirely in your browser as one interactive app — there is no separate
        Node/Express server, MongoDB instance, or mail relay behind it. Login checks records held in the app's shared
        storage rather than real JWTs/bcrypt; the student OTP is generated in-app and shown to you directly (via a
        notice) instead of being emailed, since there's no mail server to send it through; and leave "documents" are
        filenames rather than uploaded files. In this demo, only student accounts require OTP verification — staff, CC
        and HOD accounts are treated as issued by the college. Say the word if you'd like the equivalent as a real
        Node.js + Express + MongoDB + JWT + Nodemailer project instead, with backend-enforced validation throughout.
      </footer>
    </div>
  );
}

/* ============================== AUTH ============================== */
const AUTH_ROLES = ['student', 'staff', 'cc', 'hod'];
function roleLabel(r) { return r === 'hod' ? 'HOD' : r === 'cc' ? 'CC' : r[0].toUpperCase() + r.slice(1); }
function RoleTabs({ role, setRole }) {
  return (
    <div className="acs-tabs">
      {AUTH_ROLES.map(r => (
        <div key={r} className={`acs-tab ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>{roleLabel(r)}</div>
      ))}
    </div>
  );
}
function AuthShell({ title, children, onHome }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6vh 20px' }}>
      <div className="acs-card" style={{ width: 460, maxWidth: '100%', padding: '30px 28px' }}>
        <div onClick={onHome} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <Landmark size={18} color="var(--primary)" /><span className="acs-serif" style={{ fontSize: 15, fontWeight: 600 }}>The Register</span>
        </div>
        <h2 className="acs-serif" style={{ fontSize: 22, marginBottom: 4 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
function AuthLogin({ role, setRole, onSubmit, onSwap, onHome }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AuthShell title="Sign in" onHome={onHome}>

      <RoleTabs role={role} setRole={setRole} />

      {/* Email */}
      <div className="acs-field">
        <label className="acs-label">Email</label>

        <input
          className="acs-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={
            role === 'student'
              ? 'you@coep.sveri.ac.in'
              : `${role}@demo.edu`
          }
        />
      </div>

      {/* Password */}
      <div className="acs-field">
        <label className="acs-label">Password</label>

        <div
          style={{
            position: 'relative',
            width: '100%'
          }}
        >
          <input
            className="acs-input"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="demo123"
            style={{
              width: '100%',
              paddingRight: '45px',
              boxSizing: 'border-box'
            }}
          />

          {/* Eye Button */}
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '4px',
              color: 'var(--muted)'
            }}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      {/* Login Button */}
      <button
        type="button"
        className="acs-btn acs-btn-primary"
        style={{
          width: '100%',
          marginTop: 4
        }}
        onClick={() => onSubmit(role, email, password)}
      >
        Sign in as {roleLabel(role)}
      </button>

      {/* Register */}
      <div
        style={{
          fontSize: 13,
          color: 'var(--muted)',
          marginTop: 16,
          textAlign: 'center'
        }}
      >
        No account?{' '}

        <span
          style={{
            color: 'var(--primary)',
            cursor: 'pointer',
            fontWeight: 600
          }}
          onClick={onSwap}
        >
          Register
        </span>
      </div>

    </AuthShell>
  );
}
function AuthRegister({ role, setRole, users, onSubmitDirect, onSubmitStudentVerified, onSwap, onHome, notify }) {
  if (role === 'student') {
    return <StudentOtpRegister users={users} setRole={setRole} onSubmitStudentVerified={onSubmitStudentVerified} onSwap={onSwap} onHome={onHome} notify={notify} />;
  }
  return <StaffCcHodRegister role={role} setRole={setRole} users={users} onSubmitDirect={onSubmitDirect} onSwap={onSwap} onHome={onHome} notify={notify} />;
}

function StaffCcHodRegister({ role, setRole, users, onSubmitDirect, onSwap, onHome, notify }) {
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', confirm: '', phone: '', employeeId: '',
    department: DEPARTMENTS[0], subjects: [], years: [],
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleMulti = (k, v) => setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }));

  const validate = () => {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Name is required.';
    if (!isValidEmailShape(form.email)) e.email = 'Enter a valid email address.';
    if (!isValidPhone(form.phone)) e.phone = 'Please enter a valid 10-digit phone number.';
    if (!form.employeeId.trim()) e.employeeId = 'Employee ID is required.';
    if (!isStrongPassword(form.password)) e.password = PASSWORD_HINT;
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match.';
    if (role === 'staff' && !form.subjects.length) e.subjects = 'Select at least one subject.';
    if (role === 'staff' && !form.years.length) e.years = 'Select at least one year handled.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const submit = async () => {
    if (!validate()) return;
    const { confirm, ...payload } = form;
    const ok = await onSubmitDirect(role, payload);
    if (!ok) notify('An account with that email already exists.', 'bad');
  };

  return (
    <AuthShell title="Create account" onHome={onHome}>
      <RoleTabs role={role} setRole={setRole} />
      <div className="acs-field"><label className="acs-label">Full name</label>
        <input className={`acs-input ${errors.fullName ? 'err' : ''}`} value={form.fullName} onChange={e => set('fullName', e.target.value)} />
        <FieldError msg={errors.fullName} /></div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">Email</label>
          <input className={`acs-input ${errors.email ? 'err' : ''}`} value={form.email} onChange={e => set('email', e.target.value)} />
          <FieldError msg={errors.email} /></div>
        <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">Phone number</label>
          <input className={`acs-input ${errors.phone ? 'err' : ''}`} maxLength={10} value={form.phone}
            onChange={e => set('phone', e.target.value.replace(/[^0-9]/g, ''))} placeholder="10 digits" />
          <FieldError msg={errors.phone} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">Password</label>
          <PasswordInput value={form.password} onChange={e => set('password', e.target.value)} error={errors.password} />
          <FieldError msg={errors.password} /></div>
        <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">Confirm password</label>
          <PasswordInput value={form.confirm} onChange={e => set('confirm', e.target.value)} error={errors.confirm} />
          <FieldError msg={errors.confirm} /></div>
      </div>
      <div className="acs-field"><label className="acs-label">Employee ID</label>
        <input className={`acs-input ${errors.employeeId ? 'err' : ''}`} value={form.employeeId} onChange={e => set('employeeId', e.target.value)} />
        <FieldError msg={errors.employeeId} /></div>
      <div className="acs-field"><label className="acs-label">Department</label>
        <select className="acs-select" value={form.department} onChange={e => set('department', e.target.value)}>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select></div>

      {role === 'staff' && (
        <>
          <div className="acs-field"><label className="acs-label">Subjects taught</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SUBJECTS.map(s => (
                <span key={s.id} onClick={() => toggleMulti('subjects', s.id)}
                  className="acs-badge-role" style={{ cursor: 'pointer', opacity: form.subjects.includes(s.id) ? 1 : .35 }}>{s.id}</span>
              ))}
            </div><FieldError msg={errors.subjects} /></div>
          <div className="acs-field"><label className="acs-label">Years handled</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {YEARS.map(y => (
                <span key={y} onClick={() => toggleMulti('years', y)}
                  className="acs-badge-role" style={{ cursor: 'pointer', opacity: form.years.includes(y) ? 1 : .35 }}>{y}</span>
              ))}
            </div><FieldError msg={errors.years} /></div>
        </>
      )}

      <button className="acs-btn acs-btn-primary" style={{ width: '100%', marginTop: 4 }} onClick={submit}>
        Create {roleLabel(role)} account
      </button>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 16, textAlign: 'center' }}>
        Already registered? <span style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }} onClick={onSwap}>Sign in</span>
      </div>
    </AuthShell>
  );
}

function StudentOtpRegister({ users, setRole, onSubmitStudentVerified, onSwap, onHome, notify }) {
  const [step, setStep] = useState('details'); // details | otp
  const [form, setForm] = useState({
    fullName: '', rollNo: '', email: '', phone: '', year: YEARS[0], department: DEPARTMENTS[0], password: '', confirm: '',
  });
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(null); // { otp, expiresAt }
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validateDetails = () => {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Name is required.';
    if (!form.rollNo.trim()) e.rollNo = 'Roll number is required.';
    else if (users.some(u => u.role === 'student' && u.rollNo.toLowerCase() === form.rollNo.trim().toLowerCase()))
      e.rollNo = 'This roll number is already registered.';
    if (!isValidStudentEmail(form.email)) e.email = `Please use your official ${STUDENT_EMAIL_DOMAIN} email address.`;
    else if (users.some(u => u.role === 'student' && u.email.toLowerCase() === form.email.trim().toLowerCase()))
      e.email = 'This email is already registered. Please use another email or login.';
    if (!isValidPhone(form.phone)) e.phone = 'Please enter a valid 10-digit phone number.';
    if (!isStrongPassword(form.password)) e.password = PASSWORD_HINT;
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };
const sendOtp = async () => {
  if (!validateDetails()) return;

  try {
    notify('Sending OTP to your college email...');

    const response = await fetch('http://localhost:5000/api/send-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: form.email.trim(),
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      notify(data.message || 'Failed to send OTP.', 'bad');
      return;
    }

    setPending({
      email: form.email.trim(),
      expiresAt: Date.now() + OTP_TTL_MS,
    });

    setOtpInput('');
    setOtpError('');
    setStep('otp');
    setCooldown(OTP_RESEND_COOLDOWN_S);

    notify(`OTP sent successfully to ${form.email}.`);
  } catch (error) {
    console.error('Send OTP error:', error);

    notify(
      'Cannot connect to the backend. Make sure server.js is running on port 5000.',
      'bad'
    );
  }
};
const resendOtp = async () => {
  if (cooldown > 0) return;

  try {
    notify('Sending new OTP...');

    const response = await fetch('http://localhost:5000/api/send-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: form.email.trim(),
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      notify(data.message || 'Failed to resend OTP.', 'bad');
      return;
    }

    setPending({
      email: form.email.trim(),
      expiresAt: Date.now() + OTP_TTL_MS,
    });

    setOtpInput('');
    setOtpError('');
    setCooldown(OTP_RESEND_COOLDOWN_S);

    notify(`New OTP sent to ${form.email}.`);
  } catch (error) {
    console.error('Resend OTP error:', error);

    notify(
      'Cannot connect to backend. Make sure server.js is running.',
      'bad'
    );
  }
};
const verifyOtp = async () => {
  if (!pending) return;

  if (Date.now() > pending.expiresAt) {
    setOtpError('OTP has expired. Please request a new OTP.');
    return;
  }

  if (otpInput.trim().length !== 6) {
    setOtpError('Please enter the complete 6-digit OTP.');
    return;
  }

  try {
    const response = await fetch('http://localhost:5000/api/verify-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: form.email.trim(),
        otp: otpInput.trim(),
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      setOtpError(data.message || 'Invalid OTP.');
      return;
    }

    setOtpError('');

    const { confirm, ...payload } = form;

    await onSubmitStudentVerified(payload);
  } catch (error) {
    console.error('Verify OTP error:', error);

    setOtpError(
      'Cannot connect to backend. Make sure server.js is running.'
    );
  }
};
  return (
    <AuthShell title="Create student account" onHome={onHome}>
      <RoleTabs role="student" setRole={setRole} />
      {step === 'details' && (
        <>
          <div className="acs-field"><label className="acs-label">Full name</label>
            <input className={`acs-input ${errors.fullName ? 'err' : ''}`} value={form.fullName} onChange={e => set('fullName', e.target.value)} />
            <FieldError msg={errors.fullName} /></div>
          <div className="acs-field"><label className="acs-label">Roll number</label>
            <input className={`acs-input ${errors.rollNo ? 'err' : ''}`} value={form.rollNo} onChange={e => set('rollNo', e.target.value)} />
            <FieldError msg={errors.rollNo} /></div>
          <div className="acs-field"><label className="acs-label">College email</label>
            <input className={`acs-input ${errors.email ? 'err' : ''}`} value={form.email} onChange={e => set('email', e.target.value)} placeholder={`name${STUDENT_EMAIL_DOMAIN}`} />
            <FieldError msg={errors.email} /></div>
          <div className="acs-field"><label className="acs-label">Phone number</label>
            <input className={`acs-input ${errors.phone ? 'err' : ''}`} maxLength={10} value={form.phone}
              onChange={e => set('phone', e.target.value.replace(/[^0-9]/g, ''))} placeholder="10 digits" />
            <FieldError msg={errors.phone} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">Year</label>
              <select className="acs-select" value={form.year} onChange={e => set('year', e.target.value)}>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select></div>
            <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">Department</label>
              <select className="acs-select" value={form.department} onChange={e => set('department', e.target.value)}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">Password</label>
              <PasswordInput value={form.password} onChange={e => set('password', e.target.value)} error={errors.password} />
              <FieldError msg={errors.password} /></div>
            <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">Confirm password</label>
              <PasswordInput value={form.confirm} onChange={e => set('confirm', e.target.value)} error={errors.confirm} />
              <FieldError msg={errors.confirm} /></div>
          </div>
          <button className="acs-btn acs-btn-primary" style={{ width: '100%', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={sendOtp}>
            <Send size={14} /> Send OTP
          </button>
        </>
      )}

      {step === 'otp' && (
        <>
          <div className="acs-serif" style={{ fontSize: 17, fontWeight: 600, textAlign: 'center', marginBottom: 6 }}>Verify your email</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginBottom: 16 }}>
            OTP sent to<br /><strong style={{ color: 'var(--ink)' }}>{form.email}</strong>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 6 }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <input key={i} maxLength={1} inputMode="numeric"
                className={`acs-input ${otpError ? 'err' : ''}`}
                style={{ width: 42, height: 46, textAlign: 'center', fontSize: 18, fontFamily: "'IBM Plex Mono',monospace", padding: 0 }}
                value={otpInput[i] || ''}
                onChange={e => {
                  const d = e.target.value.replace(/[^0-9]/g, '').slice(-1);
                  const next = (otpInput.padEnd(6, ' ').split(''));
                  next[i] = d || ' ';
                  setOtpInput(next.join('').trimEnd());
                  setOtpError('');
                  if (d && e.target.nextSibling) e.target.nextSibling.focus?.();
                }}
                onKeyDown={e => { if (e.key === 'Backspace' && !otpInput[i] && e.target.previousSibling) e.target.previousSibling.focus(); }}
              />
            ))}
          </div>
          <FieldError msg={otpError} />
          <button className="acs-btn acs-btn-primary" style={{ width: '100%', margin: '14px 0 8px' }} onClick={verifyOtp}>Verify OTP</button>
          <button className="acs-btn acs-btn-ghost" style={{ width: '100%' }} disabled={cooldown > 0} onClick={resendOtp}>
            {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
          </button>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12, textAlign: 'center' }}>
            <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setStep('details')}>Edit details</span>
          </div>
        </>
      )}

      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 16, textAlign: 'center' }}>
        Already registered? <span style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }} onClick={onSwap}>Sign in</span>
      </div>
    </AuthShell>
  );
}

/* ============================== APP FRAME ============================== */
function AppFrame({ me, roleTag, tabs, active, setActive, onLogout, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 230, background: 'var(--primary-dark)', color: '#EDEAE0', padding: '22px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 26, padding: '0 4px' }}>
          <Landmark size={19} /><span className="acs-serif" style={{ fontSize: 16, fontWeight: 600 }}>The Register</span>
        </div>
        <nav style={{ flex: 1 }}>
          {tabs.map(t => (
            <div key={t.key} onClick={() => setActive(t.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 4, cursor: 'pointer', marginBottom: 2, fontSize: 13.5, fontWeight: 500, background: active === t.key ? '#ffffff14' : 'transparent', color: active === t.key ? '#fff' : '#C9CFC9', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><t.icon size={16} strokeWidth={1.7} /> {t.label}</span>
              {!!t.badge && <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 10.5, borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>{t.badge}</span>}
            </div>
          ))}
        </nav>
        <div style={{ borderTop: '1px solid #ffffff1f', paddingTop: 14, marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{me.fullName}</div>
          <div className="acs-mono" style={{ fontSize: 10.5, color: '#9FA89C', marginBottom: 10 }}>{roleTag}</div>
          <div onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#C9CFC9' }}>
            <LogOut size={15} /> Log out
          </div>
        </div>
      </aside>
      <main style={{ flex: 1, padding: '30px 4vw', maxWidth: '100%', overflow: 'auto' }}>{children}</main>
    </div>
  );
}
function PageHead({ title, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h1 className="acs-serif" style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>{title}</h1>
      {sub && <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  );
}
const PIE_COLORS = ['#3D6E4C', '#AE4438'];

/* ============================== STUDENT ============================== */
function StudentApp({ me, users, attendance, leaves, notifications, onLogout, onAddLeave, onMarkRead, notify }) {
  const [active, setActive] = useState('dashboard');
  const myNotifs = notifications.filter(n => n.studentId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = myNotifs.filter(n => !n.isRead).length;
  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'attendance', label: 'My Attendance', icon: CalendarCheck },
    { key: 'leave-apply', label: 'Apply Leave', icon: Upload },
    { key: 'leave-mine', label: 'My Leave Applications', icon: ClipboardList },
    { key: 'notifications', label: 'Notifications', icon: Bell, badge: unread || null },
    { key: 'profile', label: 'My Profile', icon: UserCog },
  ];
  const overall = subjectStats(attendance, me.id, null);
  const bySubject = studentSubjectBreakdown(attendance, me.id);
  const myLeaves = leaves.filter(l => l.studentId === me.id).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));

  return (
    <AppFrame me={me} roleTag={`Student · ${me.rollNo}`} tabs={tabs} active={active} setActive={setActive} onLogout={onLogout}>
      {active === 'dashboard' && (
        <div>
          <PageHead title={`Welcome, ${me.fullName.split(' ')[0]}`} sub={`${me.department} · ${me.year}`} />
          {overall.pct < MIN_ATTENDANCE && overall.total > 0 && (
            <div className="acs-card" style={{ padding: '12px 16px', marginBottom: 18, borderColor: 'var(--danger)', display: 'flex', gap: 10, alignItems: 'center', background: '#AE443808' }}>
              <AlertTriangle size={17} color="var(--danger)" />
              <span style={{ fontSize: 13.5 }}>Your overall attendance is below the {MIN_ATTENDANCE}% minimum. Contact your class teacher.</span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 24 }}>
            <StatCard label="Overall attendance" value={`${overall.pct}%`} icon={CalendarCheck} />
            <StatCard label="Total classes" value={overall.total} icon={BookOpen} />
            <StatCard label="Present" value={overall.present} icon={Check} />
            <StatCard label="Absent" value={overall.absent} icon={X} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div className="acs-card" style={{ padding: 18 }}>
              <div className="acs-serif" style={{ fontWeight: 600, marginBottom: 10 }}>Present vs Absent</div>
              {overall.total ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={[{ name: 'Present', value: overall.present }, { name: 'Absent', value: overall.absent }]} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <Empty text="No attendance recorded yet." />}
            </div>
            <div className="acs-card" style={{ padding: 18 }}>
              <div className="acs-serif" style={{ fontWeight: 600, marginBottom: 10 }}>Subject-wise percentage</div>
              {bySubject.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={bySubject}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0000000f" />
                    <XAxis dataKey="subjectId" fontSize={12} /><YAxis fontSize={12} domain={[0, 100]} />
                    <Tooltip /><Bar dataKey="pct" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty text="No subject data yet." />}
            </div>
          </div>
        </div>
      )}

      {active === 'attendance' && (
        <div>
          <PageHead title="My Attendance" sub="Subject-wise totals, computed from every recorded lecture." />
          <div className="acs-card acs-scroll" style={{ padding: 4 }}>
            <table className="acs-table">
              <thead><tr><th>Subject</th><th>Total classes</th><th>Present</th><th>Absent</th><th>Percentage</th></tr></thead>
              <tbody>
                {bySubject.map(s => (
                  <tr key={s.subjectId}>
                    <td>{s.name}</td><td className="acs-mono">{s.total}</td><td className="acs-mono">{s.present}</td>
                    <td className="acs-mono">{s.absent}</td>
                    <td><span className="acs-mono" style={{ color: s.pct < MIN_ATTENDANCE ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{s.pct}%</span></td>
                  </tr>
                ))}
                {!bySubject.length && <tr><td colSpan={5}><Empty text="No records yet." /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {active === 'leave-apply' && (
        <LeaveApplyForm me={me} onSubmit={(lv) => { onAddLeave(lv); notify('Leave application submitted to CC.'); setActive('leave-mine'); }} />
      )}

      {active === 'leave-mine' && (
        <div>
          <PageHead title="My Leave Applications" />
          <div className="acs-card acs-scroll" style={{ padding: 4 }}>
            <table className="acs-table">
              <thead><tr><th>From</th><th>To</th><th>Reason</th><th>Status</th><th>CC comment</th><th>HOD comment</th></tr></thead>
              <tbody>
                {myLeaves.map(l => (
                  <tr key={l.id}>
                    <td className="acs-mono">{l.fromDate}</td><td className="acs-mono">{l.toDate}</td><td>{l.reason}</td>
                    <td><Stamp status={l.status} /></td>
                    <td style={{ color: 'var(--muted)' }}>{l.ccComment || '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>{l.hodComment || '—'}</td>
                  </tr>
                ))}
                {!myLeaves.length && <tr><td colSpan={6}><Empty text="No leave applications yet." /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {active === 'notifications' && (
        <div>
          <PageHead title="Notifications" sub={`${unread} unread`} />
          <div className="acs-card">
            {myNotifs.map(n => (
              <div key={n.id} className={`acs-notif ${n.isRead ? '' : 'unread'}`} onClick={() => !n.isRead && onMarkRead(n.id)}>
                {!n.isRead && <div className="acs-dot" />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{n.title} — {n.subject}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{n.message}</div>
                  <div className="acs-mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>{formatDDMonYYYY(n.date)} · {n.time}</div>
                </div>
              </div>
            ))}
            {!myNotifs.length && <Empty text="No notifications yet." />}
          </div>
        </div>
      )}

      {active === 'profile' && <ProfileCard user={me} extra={[
        ['Roll number', me.rollNo], ['Year', me.year], ['Department', me.department], ['Phone', me.phone],
        ['Email verified', me.emailVerified ? 'Yes' : 'No'],
      ]} />}
    </AppFrame>
  );
}

function LeaveApplyForm({ me, onSubmit }) {
  const [fromDate, setFrom] = useState(''); const [toDate, setTo] = useState('');
  const [reason, setReason] = useState(''); const [doc, setDoc] = useState('');
  const submit = () => {
    if (!fromDate || !toDate || !reason) return;
    onSubmit({
      id: uid('lv'), studentId: me.id, fromDate, toDate, reason, document: doc || 'none',
      status: 'Pending CC', ccId: '', ccComment: '', hodId: '', hodComment: '', forwardedAt: '',
      appliedAt: new Date().toISOString(),
    });
    setFrom(''); setTo(''); setReason(''); setDoc('');
  };
  return (
    <div>
      <PageHead title="Apply Leave" sub="Your request goes to the CC first, and only reaches the HOD once CC forwards it." />
      <div className="acs-card" style={{ padding: 22, maxWidth: 520 }}>
        <div className="acs-field"><label className="acs-label">Student name</label><input className="acs-input" value={me.fullName} disabled /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">Roll number</label><input className="acs-input" value={me.rollNo} disabled /></div>
          <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">Year</label><input className="acs-input" value={me.year} disabled /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">From date</label><input type="date" className="acs-input" value={fromDate} onChange={e => setFrom(e.target.value)} /></div>
          <div className="acs-field" style={{ flex: 1 }}><label className="acs-label">To date</label><input type="date" className="acs-input" value={toDate} onChange={e => setTo(e.target.value)} /></div>
        </div>
        <div className="acs-field"><label className="acs-label">Reason</label>
          <textarea className="acs-textarea" rows={3} value={reason} onChange={e => setReason(e.target.value)} /></div>
        <div className="acs-field"><label className="acs-label">Supporting document (file name — demo only)</label>
          <input className="acs-input" placeholder="e.g. medical_certificate.pdf" value={doc} onChange={e => setDoc(e.target.value)} /></div>
        <button className="acs-btn acs-btn-primary" onClick={submit}>Submit application</button>
      </div>
    </div>
  );
}

function ProfileCard({ user, extra }) {
  return (
    <div>
      <PageHead title="My Profile" />
      <div className="acs-card" style={{ padding: 22, maxWidth: 480 }}>
        <div className="acs-serif" style={{ fontSize: 19, fontWeight: 600, marginBottom: 2 }}>{user.fullName}</div>
        <div className="acs-mono" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>{user.email}</div>
        {[['Department', user.department], ...extra].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #EFEBDD', fontSize: 13.5 }}>
            <span style={{ color: 'var(--muted)' }}>{k}</span><span style={{ fontWeight: 500 }}>{Array.isArray(v) ? v.join(', ') : v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== STAFF ============================== */
function StaffApp({ me, users, attendance, onLogout, onSaveAttendance, notify }) {
  const [active, setActive] = useState('dashboard');
  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'mark', label: 'Mark Attendance', icon: ClipboardCheck },
    { key: 'records', label: 'Attendance Records', icon: CalendarCheck },
    { key: 'profile', label: 'My Profile', icon: UserCog },
  ];
  const myStudents = users.filter(u => u.role === 'student' && u.department === me.department && me.years.includes(u.year));
  const today = new Date().toISOString().slice(0, 10);
  const myRecordsToday = attendance.filter(a => a.staffId === me.id && a.date === today);

  return (
    <AppFrame me={me} roleTag={`Staff · ${me.employeeId}`} tabs={tabs} active={active} setActive={setActive} onLogout={onLogout}>
      {active === 'dashboard' && (
        <div>
          <PageHead title={`Welcome, ${me.fullName}`} sub={`${me.department} · Teaching ${me.subjects.join(', ')}`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
            <StatCard label="Students" value={myStudents.length} icon={Users} />
            <StatCard label="Subjects assigned" value={me.subjects.length} icon={BookOpen} />
            <StatCard label="Years handled" value={me.years.join(', ')} icon={GraduationCap} />
            <StatCard label="Marked today" value={myRecordsToday.length} icon={CalendarCheck} />
          </div>
        </div>
      )}
      {active === 'mark' && <MarkAttendance me={me} students={myStudents} attendance={attendance} onSave={onSaveAttendance} notify={notify} />}
      {active === 'records' && <AttendanceRecords me={me} students={myStudents} attendance={attendance} />}
      {active === 'profile' && <ProfileCard user={me} extra={[
        ['Employee ID', me.employeeId], ['Subjects', me.subjects], ['Years handled', me.years], ['Phone', me.phone],
      ]} />}
    </AppFrame>
  );
}

function MarkAttendance({ me, students, attendance, onSave, notify }) {
  const [year, setYear] = useState(me.years[0] || '');
  const [subjectId, setSubjectId] = useState(me.subjects[0] || '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lecture, setLecture] = useState(1);
  const roster = students.filter(s => s.year === year);
  const [statusMap, setStatusMap] = useState({});

  useEffect(() => {
    const m = {}; roster.forEach(s => { m[s.id] = statusMap[s.id] || 'Present'; });
    setStatusMap(m);
    // eslint-disable-next-line
  }, [year, subjectId, date, lecture]);

  const already = attendance.some(a => a.staffId === me.id && a.subjectId === subjectId && a.date === date && a.lecture === lecture && roster.some(s => s.id === a.studentId));

  const save = () => {
    if (already) { notify('Attendance for this year, subject, date and lecture is already saved.', 'bad'); return; }
    const recs = roster.map(s => ({
      id: uid('att'), studentId: s.id, staffId: me.id, subjectId, department: me.department, year,
      date, lecture, status: statusMap[s.id] || 'Present', createdAt: new Date().toISOString(),
    }));
    onSave(recs);
    notify(`Attendance saved for ${recs.length} students.`);
  };

  return (
    <div>
      <PageHead title="Mark Attendance" sub="Select a year, subject, date and lecture, then record each student." />
      <div className="acs-card" style={{ padding: 18, marginBottom: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
        <div><label className="acs-label">Year</label>
          <select className="acs-select" value={year} onChange={e => setYear(e.target.value)}>
            {me.years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
        <div><label className="acs-label">Subject</label>
          <select className="acs-select" value={subjectId} onChange={e => setSubjectId(e.target.value)}>
            {me.subjects.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label className="acs-label">Date</label>
          <input type="date" className="acs-input" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label className="acs-label">Lecture / period</label>
          <input type="number" min={1} max={8} className="acs-input" value={lecture} onChange={e => setLecture(+e.target.value)} /></div>
      </div>

      {already && (
        <div className="acs-card" style={{ padding: '10px 16px', marginBottom: 14, borderColor: 'var(--warn)', background: '#B98A2E0c', fontSize: 13.5 }}>
          Attendance for this exact year / subject / date / lecture has already been saved.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button className="acs-btn" onClick={() => setStatusMap(Object.fromEntries(roster.map(s => [s.id, 'Present'])))}>Mark all present</button>
        <button className="acs-btn" onClick={() => setStatusMap(Object.fromEntries(roster.map(s => [s.id, 'Absent'])))}>Mark all absent</button>
      </div>

      <div className="acs-card acs-scroll" style={{ padding: 4, marginBottom: 16 }}>
        <table className="acs-table">
          <thead><tr><th>Roll No</th><th>Student</th><th>Status</th></tr></thead>
          <tbody>
            {roster.map(s => (
              <tr key={s.id}>
                <td className="acs-mono">{s.rollNo}</td><td>{s.fullName}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="acs-btn" style={statusMap[s.id] === 'Present' ? { background: 'var(--success)', color: '#fff', borderColor: 'var(--success)' } : {}}
                    onClick={() => setStatusMap(m => ({ ...m, [s.id]: 'Present' }))}>Present</button>
                  <button className="acs-btn" style={statusMap[s.id] === 'Absent' ? { background: 'var(--danger)', color: '#fff', borderColor: 'var(--danger)' } : {}}
                    onClick={() => setStatusMap(m => ({ ...m, [s.id]: 'Absent' }))}>Absent</button>
                </td>
              </tr>
            ))}
            {!roster.length && <tr><td colSpan={3}><Empty text="No students in this year yet." /></td></tr>}
          </tbody>
        </table>
      </div>
      <button className="acs-btn acs-btn-primary" disabled={!roster.length || already} onClick={save}>Save attendance</button>
    </div>
  );
}

function AttendanceRecords({ me, students, attendance }) {
  const [subjectId, setSubjectId] = useState('all'); const [studentId, setStudentId] = useState('all'); const [month, setMonth] = useState('all');
  const mine = attendance.filter(a => a.staffId === me.id);
  const months = [...new Set(mine.map(a => a.date.slice(0, 7)))].sort();
  const filtered = mine.filter(a => (subjectId === 'all' || a.subjectId === subjectId) && (studentId === 'all' || a.studentId === studentId) && (month === 'all' || a.date.slice(0, 7) === month));

  const perStudent = students.map(s => {
    const recs = filtered.filter(a => a.studentId === s.id);
    const total = recs.length, present = recs.filter(r => r.status === 'Present').length;
    return { s, total, present, absent: total - present, pct: total ? Math.round((present / total) * 1000) / 10 : 0 };
  }).filter(r => r.total > 0);

  return (
    <div>
      <PageHead title="Attendance Records" sub="Records you've marked, filterable by subject, student and month." />
      <div className="acs-card" style={{ padding: 16, marginBottom: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <div><label className="acs-label">Subject</label><select className="acs-select" value={subjectId} onChange={e => setSubjectId(e.target.value)}>
          <option value="all">All subjects</option>{me.subjects.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label className="acs-label">Student</label><select className="acs-select" value={studentId} onChange={e => setStudentId(e.target.value)}>
          <option value="all">All students</option>{students.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></div>
        <div><label className="acs-label">Month</label><select className="acs-select" value={month} onChange={e => setMonth(e.target.value)}>
          <option value="all">All months</option>{months.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
      </div>
      <div className="acs-card acs-scroll" style={{ padding: 4 }}>
        <table className="acs-table">
          <thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Total</th><th>Percentage</th></tr></thead>
          <tbody>
            {perStudent.map(r => (
              <tr key={r.s.id}><td>{r.s.fullName}</td><td className="acs-mono">{r.present}</td><td className="acs-mono">{r.absent}</td>
                <td className="acs-mono">{r.total}</td>
                <td><span className="acs-mono" style={{ color: r.pct < MIN_ATTENDANCE ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{r.pct}%</span></td></tr>
            ))}
            {!perStudent.length && <tr><td colSpan={5}><Empty text="No matching records." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================== CC ============================== */
function CcApp({ me, users, leaves, onLogout, onUpdateLeave, notify }) {
  const [active, setActive] = useState('dashboard');
  const students = users.filter(u => u.role === 'student' && u.department === me.department);
  const inbox = leaves.filter(l => students.some(s => s.id === l.studentId) && (l.status === 'Pending CC' || l.status === 'Reviewed by CC'));
  const forwarded = leaves.filter(l => students.some(s => s.id === l.studentId) && (l.status === 'Forwarded to HOD' || l.status === 'Approved by HOD' || l.status === 'Rejected by HOD'));
  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'inbox', label: 'Requests', icon: FileText, badge: inbox.filter(l => l.status === 'Pending CC').length || null },
    { key: 'forwarded', label: 'Forwarded', icon: ArrowRightCircle },
    { key: 'profile', label: 'My Profile', icon: UserCog },
  ];
  return (
    <AppFrame me={me} roleTag={`CC · ${me.employeeId}`} tabs={tabs} active={active} setActive={setActive} onLogout={onLogout}>
      {active === 'dashboard' && (
        <div>
          <PageHead title={`Welcome, ${me.fullName}`} sub={`${me.department} — leave requests awaiting your review`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
            <StatCard label="Students in department" value={students.length} icon={Users} />
            <StatCard label="Pending your review" value={inbox.filter(l => l.status === 'Pending CC').length} icon={FileText} />
            <StatCard label="Forwarded to HOD" value={forwarded.length} icon={ArrowRightCircle} />
          </div>
        </div>
      )}
      {active === 'inbox' && <CcInbox students={students} leaves={inbox} onUpdate={onUpdateLeave} me={me} notify={notify} />}
      {active === 'forwarded' && <CcForwarded students={students} leaves={forwarded} />}
      {active === 'profile' && <ProfileCard user={me} extra={[['Employee ID', me.employeeId], ['Phone', me.phone]]} />}
    </AppFrame>
  );
}

function CcInbox({ students, leaves, onUpdate, me, notify }) {
  const [draft, setDraft] = useState({});
  const sorted = leaves.slice().sort((a, b) => a.appliedAt.localeCompare(b.appliedAt));

  const saveReview = (l) => {
    const comment = (draft[l.id] ?? l.ccComment ?? '').trim();
    if (!comment) { notify('Please add a comment before forwarding the request to HOD.', 'bad'); return; }
    onUpdate(l.id, { status: 'Reviewed by CC', ccComment: comment, ccId: me.id });
    notify('Review saved.');
  };
  const forward = (l) => {
    const comment = (draft[l.id] ?? l.ccComment ?? '').trim();
    if (!comment) { notify('Please add a comment before forwarding the request to HOD.', 'bad'); return; }
    onUpdate(l.id, { status: 'Forwarded to HOD', ccComment: comment, ccId: me.id, forwardedAt: new Date().toISOString() });
    notify('Forwarded to HOD.');
  };

  return (
    <div>
      <PageHead title="Requests" sub="Add a comment before forwarding — the HOD cannot see a request until it's forwarded." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sorted.map(l => {
          const s = students.find(x => x.id === l.studentId);
          const comment = draft[l.id] ?? l.ccComment ?? '';
          return (
            <div key={l.id} className="acs-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{s?.fullName} <span className="acs-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{s?.rollNo}</span></div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{s?.department} · {s?.year}</div>
                </div>
                <Stamp status={l.status} />
              </div>
              <div style={{ fontSize: 13.5, marginBottom: 4 }}><strong>From:</strong> <span className="acs-mono">{l.fromDate}</span> &nbsp; <strong>To:</strong> <span className="acs-mono">{l.toDate}</span></div>
              <div style={{ fontSize: 13.5, marginBottom: 4 }}><strong>Reason:</strong> {l.reason}</div>
              <div style={{ fontSize: 13.5, marginBottom: 12, color: 'var(--muted)' }}><strong>Document:</strong> {l.document}</div>
              <label className="acs-label">CC comment</label>
              <textarea className="acs-textarea" rows={2} value={comment} onChange={e => setDraft(d => ({ ...d, [l.id]: e.target.value }))} placeholder="Required before forwarding" />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="acs-btn" onClick={() => saveReview(l)}>Save review</button>
                <button className="acs-btn acs-btn-accent" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => forward(l)}>
                  <ArrowRightCircle size={14} /> Forward to HOD
                </button>
              </div>
            </div>
          );
        })}
        {!sorted.length && <Empty text="No pending requests." />}
      </div>
    </div>
  );
}
function CcForwarded({ students, leaves }) {
  const rows = leaves.slice().sort((a, b) => (b.forwardedAt || '').localeCompare(a.forwardedAt || ''));
  return (
    <div>
      <PageHead title="Forwarded requests" sub="Requests you've sent to the HOD, and their outcome." />
      <div className="acs-card acs-scroll" style={{ padding: 4 }}>
        <table className="acs-table">
          <thead><tr><th>Student</th><th>From</th><th>To</th><th>CC comment</th><th>Status</th><th>HOD comment</th></tr></thead>
          <tbody>
            {rows.map(l => {
              const s = students.find(x => x.id === l.studentId);
              return (
                <tr key={l.id}><td>{s?.fullName}</td><td className="acs-mono">{l.fromDate}</td><td className="acs-mono">{l.toDate}</td>
                  <td>{l.ccComment}</td><td><Stamp status={l.status} /></td><td style={{ color: 'var(--muted)' }}>{l.hodComment || '—'}</td></tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6}><Empty text="Nothing forwarded yet." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================== HOD ============================== */
function HodApp({ me, users, attendance, leaves, onLogout, onUpdateLeave, notify }) {
  const [active, setActive] = useState('dashboard');
  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'students', label: 'All Students', icon: GraduationCap },
    { key: 'staff', label: 'All Staff', icon: Users },
    { key: 'reports', label: 'Attendance Reports', icon: CalendarCheck },
    { key: 'leaves', label: 'Leave Management', icon: FileText },
    { key: 'profile', label: 'My Profile', icon: UserCog },
  ];
  const students = users.filter(u => u.role === 'student');
  const staff = users.filter(u => u.role === 'staff');
  const deptRecs = attendance;
  const present = deptRecs.filter(r => r.status === 'Present').length;
  const deptPct = deptRecs.length ? Math.round((present / deptRecs.length) * 1000) / 10 : 0;
  const today = new Date().toISOString().slice(0, 10);
  const todayRecs = deptRecs.filter(r => r.date === today);
  const lowStudents = students.map(s => ({ s, ...subjectStats(attendance, s.id, null) })).filter(x => x.total > 0 && x.pct < MIN_ATTENDANCE);
  const visibleLeaves = leaves.filter(l => l.status === 'Forwarded to HOD' || l.status === 'Approved by HOD' || l.status === 'Rejected by HOD');
  const pendingHod = visibleLeaves.filter(l => l.status === 'Forwarded to HOD');

  return (
    <AppFrame me={me} roleTag={`HOD · ${me.employeeId}`} tabs={tabs} active={active} setActive={setActive} onLogout={onLogout}>
      {active === 'dashboard' && (
        <div>
          <PageHead title={`Welcome, ${me.fullName}`} sub={`${me.department} — department overview`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 22 }}>
            <StatCard label="Total students" value={students.length} icon={GraduationCap} />
            <StatCard label="Total staff" value={staff.length} icon={Users} />
            <StatCard label="Departments" value={DEPARTMENTS.length} icon={BookOpen} />
            <StatCard label="Subjects" value={SUBJECTS.length} icon={ClipboardList} />
            <StatCard label="Department attendance" value={`${deptPct}%`} icon={CalendarCheck} />
            <StatCard label="Marked today" value={todayRecs.length} icon={ClipboardCheck} />
            <StatCard label="Low attendance" value={lowStudents.length} icon={AlertTriangle} />
            <StatCard label="Awaiting HOD decision" value={pendingHod.length} icon={FileText} />
          </div>
          <div className="acs-card" style={{ padding: 18 }}>
            <div className="acs-serif" style={{ fontWeight: 600, marginBottom: 10 }}>Student attendance overview</div>
            {students.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={students.map(s => ({ name: s.fullName.split(' ')[0], pct: subjectStats(attendance, s.id, null).pct }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0000000f" />
                  <XAxis dataKey="name" fontSize={12} /><YAxis domain={[0, 100]} fontSize={12} />
                  <Tooltip /><Bar dataKey="pct" radius={[3, 3, 0, 0]}>
                    {students.map((s, i) => <Cell key={i} fill={subjectStats(attendance, s.id, null).pct < MIN_ATTENDANCE ? 'var(--danger)' : 'var(--primary)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty text="No students yet." />}
          </div>
        </div>
      )}

      {active === 'students' && <HodStudents students={students} attendance={attendance} />}
      {active === 'staff' && <HodStaff staff={staff} attendance={attendance} />}
      {active === 'reports' && <HodReports attendance={attendance} lowStudents={lowStudents} />}
      {active === 'leaves' && <HodLeaves leaves={visibleLeaves} students={students} onUpdate={onUpdateLeave} notify={notify} me={me} />}
      {active === 'profile' && <ProfileCard user={me} extra={[['Employee ID', me.employeeId], ['Phone', me.phone]]} />}
    </AppFrame>
  );
}

function HodStudents({ students, attendance }) {
  const [q, setQ] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const rows = students
    .map(s => ({ s, ...subjectStats(attendance, s.id, null) }))
    .filter(r => (deptFilter === 'all' || r.s.department === deptFilter))
    .filter(r => r.s.fullName.toLowerCase().includes(q.toLowerCase()) || r.s.rollNo.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHead title="All Students" sub="Every student in the department, with live attendance." />
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }} />
          <input className="acs-input" style={{ paddingLeft: 30 }} placeholder="Search by name or roll no." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="acs-select" style={{ width: 220 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="all">All departments</option>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="acs-card acs-scroll" style={{ padding: 4 }}>
        <table className="acs-table">
          <thead><tr><th>Name</th><th>Roll no.</th><th>Department</th><th>Year</th><th>Overall %</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.s.id}>
                <td>{r.s.fullName}</td><td className="acs-mono">{r.s.rollNo}</td><td>{r.s.department}</td><td>{r.s.year}</td>
                <td className="acs-mono" style={{ fontWeight: 600, color: r.pct < MIN_ATTENDANCE ? 'var(--danger)' : 'var(--success)' }}>{r.pct}%</td>
                <td>{r.pct < MIN_ATTENDANCE && r.total > 0 ? <Stamp status="Pending CC" /> : <span style={{ color: 'var(--muted)', fontSize: 12 }}>OK</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6}><Empty text="No matching students." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function HodStaff({ staff, attendance }) {
  return (
    <div>
      <PageHead title="All Staff" sub="Teaching staff across the department." />
      <div className="acs-card acs-scroll" style={{ padding: 4 }}>
        <table className="acs-table">
          <thead><tr><th>Name</th><th>Employee ID</th><th>Department</th><th>Subjects</th><th>Years</th><th>Records marked</th></tr></thead>
          <tbody>
            {staff.map(s => (
              <tr key={s.id}><td>{s.fullName}</td><td className="acs-mono">{s.employeeId}</td><td>{s.department}</td>
                <td>{s.subjects.join(', ')}</td><td>{s.years.join(', ')}</td>
                <td className="acs-mono">{attendance.filter(a => a.staffId === s.id).length}</td></tr>
            ))}
            {!staff.length && <tr><td colSpan={6}><Empty text="No staff yet." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function HodReports({ attendance, lowStudents }) {
  const bySubject = SUBJECTS.map(sub => {
    const recs = attendance.filter(a => a.subjectId === sub.id);
    const present = recs.filter(r => r.status === 'Present').length;
    return { ...sub, total: recs.length, present, pct: recs.length ? Math.round((present / recs.length) * 1000) / 10 : 0 };
  }).filter(s => s.total > 0);
  return (
    <div>
      <PageHead title="Attendance Reports" sub="Department summary and students below the minimum threshold." />
      <div className="acs-card" style={{ padding: 18, marginBottom: 20 }}>
        <div className="acs-serif" style={{ fontWeight: 600, marginBottom: 10 }}>Subject-wise department average</div>
        {bySubject.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bySubject}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0000000f" />
              <XAxis dataKey="id" fontSize={12} /><YAxis domain={[0, 100]} fontSize={12} />
              <Tooltip /><Bar dataKey="pct" fill="var(--accent)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty text="No records yet." />}
      </div>
      <div className="acs-serif" style={{ fontWeight: 600, marginBottom: 10, fontSize: 16 }}>Students below {MIN_ATTENDANCE}%</div>
      <div className="acs-card acs-scroll" style={{ padding: 4 }}>
        <table className="acs-table">
          <thead><tr><th>Student</th><th>Department</th><th>Year</th><th>Total</th><th>Present</th><th>Percentage</th></tr></thead>
          <tbody>
            {lowStudents.map(r => (
              <tr key={r.s.id}><td>{r.s.fullName}</td><td>{r.s.department}</td><td>{r.s.year}</td>
                <td className="acs-mono">{r.total}</td><td className="acs-mono">{r.present}</td>
                <td className="acs-mono" style={{ color: 'var(--danger)', fontWeight: 600 }}>{r.pct}%</td></tr>
            ))}
            {!lowStudents.length && <tr><td colSpan={6}><Empty text="No students currently below the threshold." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function HodLeaves({ leaves, students, onUpdate, notify, me }) {
  const [filter, setFilter] = useState('All');
  const [commentDraft, setCommentDraft] = useState({});
  const filters = ['All', 'Forwarded to HOD', 'Approved by HOD', 'Rejected by HOD'];
  const rows = leaves.filter(l => filter === 'All' || l.status === filter).sort((a, b) => (b.forwardedAt || '').localeCompare(a.forwardedAt || ''));
  const act = (l, status) => { onUpdate(l.id, { status, hodComment: commentDraft[l.id] || status, hodId: me.id, approvedAt: new Date().toISOString() }); notify(`Leave ${status.split(' ')[0].toLowerCase()} by HOD.`); };
  return (
    <div>
      <PageHead title="Leave Management" sub="Only requests CC has reviewed and forwarded appear here." />
      <div className="acs-tabs">
        {filters.map(f => (<div key={f} className={`acs-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</div>))}
      </div>
      <div className="acs-card acs-scroll" style={{ padding: 4 }}>
        <table className="acs-table">
          <thead><tr><th>Student</th><th>Dept / Year</th><th>From</th><th>To</th><th>CC comment</th><th>Status</th><th>HOD action</th></tr></thead>
          <tbody>
            {rows.map(l => {
              const s = students.find(x => x.id === l.studentId);
              return (
                <tr key={l.id}>
                  <td>{s?.fullName}<div className="acs-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{s?.rollNo}</div></td>
                  <td>{s?.department}<br />{s?.year}</td>
                  <td className="acs-mono">{l.fromDate}</td><td className="acs-mono">{l.toDate}</td>
                  <td>{l.ccComment}</td><td><Stamp status={l.status} /></td>
                  <td>
                    {l.status === 'Forwarded to HOD' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="acs-input" style={{ width: 110 }} placeholder="Comment"
                          value={commentDraft[l.id] || ''} onChange={e => setCommentDraft(m => ({ ...m, [l.id]: e.target.value }))} />
                        <button className="acs-btn" style={{ borderColor: 'var(--success)', color: 'var(--success)' }} onClick={() => act(l, 'Approved by HOD')}>Approve</button>
                        <button className="acs-btn acs-btn-danger" onClick={() => act(l, 'Rejected by HOD')}>Reject</button>
                      </div>
                    ) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>Resolved</span>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7}><Empty text="No leave applications in this filter." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

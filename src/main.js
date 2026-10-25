import { createClient } from '@supabase/supabase-js';
import './style.css';

const $ = (s, root = document) => root.querySelector(s);
const env = import.meta.env;
const hasConfig = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY &&
  !env.VITE_SUPABASE_URL.includes('YOUR-PROJECT') &&
  !env.VITE_SUPABASE_ANON_KEY.includes('YOUR_SUPABASE'));
const supabase = hasConfig ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY) : null;
let user = null;
let portions = [];
let exams = [];
let studySessions = [];
let focusSeconds = 25 * 60;
let focusRemaining = focusSeconds;
let focusInterval = null;
let focusStartedAt = null;
let profile = { notifications_enabled: false, reminder_minutes: 1440 };
let authMode = 'signup';
let notificationInterval = null;

const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const niceDate = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'No date set';
const todayISO = () => new Date().toISOString().slice(0, 10);
const toast = message => {
  const node = document.createElement('div');
  node.className = 'toast'; node.textContent = message;
  document.body.append(node); setTimeout(() => node.remove(), 4200);
};
const showError = (error, fallback = 'Something went wrong.') => {
  console.error(error);
  toast(error?.message || fallback);
};

function renderAuth(message = '') {
  $('#app').innerHTML = `
    <div class="auth-wrap"><section class="auth-card">
      <div class="brand"><div class="brand-mark">CC</div><div><h1>CLA Command Center</h1><p>Your study plan, under control.</p></div></div>
      <h2>${authMode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
      <p>${authMode === 'signup' ? 'Build your exam plan and track every portion.' : 'Sign in to continue your preparation.'}</p>
      ${message ? `<div class="notice ${message.startsWith('Error:') ? 'error' : ''}">${esc(message)}</div>` : ''}
      <form id="auth-form" class="stack">
        ${authMode === 'signup' ? `<div class="field"><label for="display-name">Name</label><input id="display-name" maxlength="80" autocomplete="name" placeholder="Your name" required></div>` : ''}
        <div class="field"><label for="auth-email">Email</label><input id="auth-email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
        <div class="field"><label for="auth-password">Password</label><input id="auth-password" type="password" minlength="8" autocomplete="${authMode === 'signup' ? 'new-password' : 'current-password'}" placeholder="At least 8 characters" required></div>
        <button class="btn" type="submit">${authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
      </form>
      <div class="auth-switch">${authMode === 'signup' ? 'Already registered?' : 'New here?'} <button id="switch-auth" class="link-btn" type="button">${authMode === 'signup' ? 'Sign in' : 'Create an account'}</button></div>
    </section></div>`;
  $('#switch-auth').addEventListener('click', () => { authMode = authMode === 'signup' ? 'signin' : 'signup'; renderAuth(); });
  $('#auth-form').addEventListener('submit', submitAuth);
}

async function submitAuth(event) {
  event.preventDefault();
  const button = $('#auth-form button[type="submit"]');
  button.disabled = true; button.textContent = 'Please wait…';
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  try {
    let result;
    if (authMode === 'signup') {
      result = await supabase.auth.signUp({
        email, password,
        options: { data: { display_name: $('#display-name').value.trim() } }
      });
      if (result.error) throw result.error;
      if (!result.data.session) {
        renderAuth('Account created. Check your email to confirm the account, then sign in.');
        return;
      }
      user = result.data.user;
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      user = result.data.user;
    }
    await loadData();
    renderDashboard();
  } catch (error) {
    renderAuth(`Error: ${error.message || 'Could not authenticate.'}`);
  } finally {
    const current = $('#auth-form button[type="submit"]');
    if (current) { current.disabled = false; current.textContent = authMode === 'signup' ? 'Create account' : 'Sign in'; }
  }
}

async function loadData() {
  const [p, e, prof, sessions] = await Promise.all([
    supabase.from('portions').select('*').order('created_at', { ascending: false }),
    supabase.from('exams').select('*').order('exam_at', { ascending: true }),
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('study_sessions').select('*').order('studied_at', { ascending: false }).limit(100)
  ]);
  if (p.error) throw p.error;
  if (e.error) throw e.error;
  if (prof.error) throw prof.error;
  if (sessions.error) throw sessions.error;
  portions = p.data || [];
  exams = e.data || [];
  studySessions = sessions.data || [];
  if (prof.data) profile = prof.data;
}

function renderDashboard() {
  const completed = portions.filter(p => p.status === 'completed').length;
  const progress = portions.length ? Math.round(completed / portions.length * 100) : 0;
  const upcoming = exams.filter(e => new Date(e.exam_at).getTime() >= Date.now()).slice(0, 4);
  const name = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Student';
  $('#app').innerHTML = `
    <main class="shell">
      <nav class="topbar">
        <div class="brand"><div class="brand-mark">CC</div><div><h1>CLA Command Center</h1><p>Study with a plan, not panic.</p></div></div>
        <div class="top-actions"><span class="pill">${esc(user.email)}</span><button class="btn secondary small-btn" id="signout">Sign out</button></div>
      </nav>
      <section class="hero"><div><span class="eyebrow">Your preparation hub</span><h2>Let's make progress, ${esc(name)}.</h2><p>Keep your portions organised, save exam dates, and track what is done before exam day.</p></div><div class="hero-date">${new Date().toLocaleDateString([], {weekday:'long', month:'short', day:'numeric'})}</div></section>
      <section class="stats">
        <div class="stat"><div class="stat-label">Syllabus completed</div><div class="stat-value">${progress}%</div><div class="stat-note">${completed} of ${portions.length} portions complete</div></div>
        <div class="stat"><div class="stat-label">Upcoming exams</div><div class="stat-value">${upcoming.length}</div><div class="stat-note">Next: ${upcoming.length ? esc(niceDate(upcoming[0].exam_at)) : 'Add your first exam'}</div></div>
        <div class="stat"><div class="stat-label">In progress</div><div class="stat-value">${portions.filter(p=>p.status==='in_progress').length}</div><div class="stat-note">Keep the momentum going</div></div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h3>Syllabus progress</h3><p>Track portions across all your subjects.</p></div><strong>${progress}%</strong></div>
        <div class="track"><div style="width:${progress}%"></div></div>
      </section>
      <div class="layout">
        <div>
          <section class="panel">
            <div class="panel-head"><div><h3>Add a portion</h3><p>Add a topic, unit, or syllabus section.</p></div></div>
            <form id="portion-form" class="stack">
              <div class="form-grid">
                <div class="field"><label for="portion-subject">Subject</label><input id="portion-subject" maxlength="100" placeholder="Engineering Mathematics" required></div>
                <div class="field"><label for="portion-title">Portion / topic</label><input id="portion-title" maxlength="160" placeholder="Eigenvalues and eigenvectors" required></div>
              </div>
              <div class="form-grid">
                <div class="field"><label for="portion-date">Target date (optional)</label><input id="portion-date" type="date" min="${todayISO()}"></div>
                <div class="field"><label for="portion-status">Status</label><select id="portion-status"><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></div>
              </div>
              <div class="field"><label for="portion-notes">Notes (optional)</label><textarea id="portion-notes" maxlength="2000" placeholder="Important formulas, exercise numbers, doubts…"></textarea></div>
              <div class="form-actions"><button class="btn" type="submit">Save portion</button></div>
            </form>
          </section>
          <section class="panel">
            <div class="panel-head"><div><h3>Your syllabus</h3><p>Update status as you study.</p></div><span class="pill">${portions.length} portions</span></div>
            <div class="field" style="margin-bottom:12px"><label for="portion-search">Find a topic</label><input id="portion-search" type="search" placeholder="Search subject or topic…"></div>
            <div id="portion-list" class="list">${renderPortions()}</div>
          </section>
        </div>
        <div>
          <section class="panel">
            <div class="panel-head"><div><h3>Add an exam date</h3><p>Keep every assessment in one place.</p></div></div>
            <form id="exam-form" class="stack">
              <div class="field"><label for="exam-title">Exam name</label><input id="exam-title" maxlength="160" placeholder="CLA 2 - Mathematics" required></div>
              <div class="field"><label for="exam-subject">Subject</label><input id="exam-subject" maxlength="100" placeholder="Engineering Mathematics" required></div>
              <div class="field"><label for="exam-date">Date and time</label><input id="exam-date" type="datetime-local" required></div>
              <div class="field"><label for="exam-location">Room / location (optional)</label><input id="exam-location" maxlength="160" placeholder="Classroom / hall"></div>
              <div class="field"><label for="exam-notes">Notes (optional)</label><textarea id="exam-notes" maxlength="2000" placeholder="Syllabus, materials to carry…"></textarea></div>
              <button class="btn" type="submit">Save exam date</button>
            </form>
          </section>
          <section class="panel">
            <div class="panel-head"><div><h3>Exam calendar</h3><p>Your saved dates.</p></div></div>
            <div id="exam-list" class="list">${renderExams()}</div>
          </section>
          <section class="panel">
            <div class="panel-head"><div><h3>Focus sprint</h3><p>Use a short timer, then log your study time.</p></div><span class="pill">Pomodoro</span></div>
            <div class="focus-clock" id="focus-clock">${formatClock(focusRemaining)}</div>
            <div class="focus-controls"><select id="focus-duration" aria-label="Focus duration"><option value="15">15 min</option><option value="25" selected>25 min</option><option value="45">45 min</option><option value="60">60 min</option></select><button class="btn" id="focus-start">Start focus</button><button class="btn secondary" id="focus-reset">Reset</button></div>
            <div class="field" style="margin-top:14px"><label for="focus-subject">What are you studying?</label><select id="focus-subject"><option value="General study">General study</option>${[...new Set(portions.map(p=>p.subject))].map(subject=>`<option value="${esc(subject)}">${esc(subject)}</option>`).join('')}</select></div>
            <p class="muted small" id="focus-message" style="margin-top:10px">Completed focus sessions are saved to your study history.</p>
          </section>
          <section class="panel">
            <div class="panel-head"><div><h3>Study stats</h3><p>Your recent effort, not just good intentions.</p></div></div>
            <div class="stats study-stats"><div class="stat"><div class="stat-label">Today</div><div class="stat-value">${Math.round(studySessions.filter(s=>new Date(s.studied_at).toDateString()===new Date().toDateString()).reduce((n,s)=>n+s.duration_minutes,0))}<span class="stat-unit">m</span></div><div class="stat-note">Minutes studied</div></div><div class="stat"><div class="stat-label">Sessions</div><div class="stat-value">${studySessions.filter(s=>new Date(s.studied_at).toDateString()===new Date().toDateString()).length}</div><div class="stat-note">Logged today</div></div></div>
            <button class="btn secondary" id="export-data">Export my study data</button>
            <p class="muted small" style="margin-top:10px">Downloads your portions, exam dates and study history as a JSON backup.</p>
          </section>
          <section class="panel">
            <div class="panel-head"><div><h3>Reminder settings</h3><p>Browser reminders while this app is open.</p></div></div>
            <div class="settings-row"><div><strong>Notifications</strong><span id="notification-status">${profile.notifications_enabled ? 'Enabled in preferences' : 'Currently off'}</span></div><button id="enable-notifications" class="btn secondary small-btn">${profile.notifications_enabled ? 'Update permission' : 'Enable'}</button></div>
            <div class="settings-row"><div><strong>Remind me before exams</strong><span>Browser notification lead time</span></div><select id="reminder-minutes" aria-label="Reminder lead time" style="max-width:150px;background:#0d1426;color:#f4f5ff;border:1px solid #35405b;border-radius:9px;padding:9px"><option value="10" ${profile.reminder_minutes===10?'selected':''}>10 minutes</option><option value="30" ${profile.reminder_minutes===30?'selected':''}>30 minutes</option><option value="60" ${profile.reminder_minutes===60?'selected':''}>1 hour</option><option value="1440" ${profile.reminder_minutes===1440?'selected':''}>1 day</option></select></div>
            <p class="muted small">Important: browser notifications require permission and this page to remain open. Reliable reminders while the app is closed need a push-notification service and scheduled backend job.</p>
          </section>
        </div>
      </div>
    </main>`;
  bindDashboard();
  startReminderChecks();
}

function renderPortions(query = '') {
  const filtered = portions.filter(p => `${p.title} ${p.subject} ${p.notes}`.toLowerCase().includes(query));
  if (!filtered.length) return '<div class="empty">No portions yet. Add your first topic above.</div>';
  return filtered.map(p => `<article class="item" data-portion="${p.id}">
    <div class="item-top"><div><h4>${esc(p.title)}</h4><p>${esc(p.subject)}${p.target_date ? ` · Target ${esc(p.target_date)}` : ''}</p></div><span class="status ${p.status}">${p.status.replace('_',' ')}</span></div>
    ${p.notes ? `<p style="margin-top:9px">${esc(p.notes)}</p>` : ''}
    <div class="item-actions"><select class="status-select" aria-label="Update ${esc(p.title)} status" style="background:#0d1426;color:#f4f5ff;border:1px solid #35405b;border-radius:9px;padding:8px"><option value="not_started" ${p.status==='not_started'?'selected':''}>Not started</option><option value="in_progress" ${p.status==='in_progress'?'selected':''}>In progress</option><option value="completed" ${p.status==='completed'?'selected':''}>Completed</option></select><button class="btn danger small-btn delete-portion" type="button">Delete</button></div>
  </article>`).join('');
}
function renderExams() {
  if (!exams.length) return '<div class="empty">No exams saved. Add your CLA 2 date above when announced.</div>';
  return exams.map(e => `<article class="item" data-exam="${e.id}"><div class="item-top"><div><h4>${esc(e.title)}</h4><p>${esc(e.subject)}</p></div><span class="status">${new Date(e.exam_at).getTime() < Date.now() ? 'past' : 'upcoming'}</span></div><p style="margin-top:9px">📅 ${esc(niceDate(e.exam_at))}</p>${e.location?`<p>📍 ${esc(e.location)}</p>`:''}${e.notes?`<p style="margin-top:6px">${esc(e.notes)}</p>`:''}<div class="item-actions"><button class="btn danger small-btn delete-exam" type="button">Delete exam</button></div></article>`).join('');
}

function bindDashboard() {
  $('#signout').addEventListener('click', async () => { const {error} = await supabase.auth.signOut(); if(error) return showError(error); user = null; portions=[]; exams=[]; renderAuth(); });
  $('#portion-form').addEventListener('submit', savePortion);
  $('#exam-form').addEventListener('submit', saveExam);
  $('#portion-list').addEventListener('change', async event => {
    if (!event.target.matches('.status-select')) return;
    const id = event.target.closest('[data-portion]').dataset.portion;
    const {error} = await supabase.from('portions').update({status:event.target.value, updated_at:new Date().toISOString()}).eq('id',id);
    if (error) return showError(error);
    await refreshDashboard(); toast('Portion status updated.');
  });
  $('#portion-list').addEventListener('click', async event => {
    if (!event.target.matches('.delete-portion')) return;
    const id = event.target.closest('[data-portion]').dataset.portion;
    if (!confirm('Delete this portion?')) return;
    const {error} = await supabase.from('portions').delete().eq('id',id);
    if (error) return showError(error);
    await refreshDashboard(); toast('Portion deleted.');
  });
  $('#exam-list').addEventListener('click', async event => {
    if (!event.target.matches('.delete-exam')) return;
    const id = event.target.closest('[data-exam]').dataset.exam;
    if (!confirm('Delete this exam date?')) return;
    const {error} = await supabase.from('exams').delete().eq('id',id);
    if (error) return showError(error);
    await refreshDashboard(); toast('Exam date deleted.');
  });
  $('#enable-notifications').addEventListener('click', enableNotifications);
  $('#reminder-minutes').addEventListener('change', saveReminderMinutes);
  $('#portion-search').addEventListener('input', filterPortions);
  $('#focus-duration').addEventListener('change', changeFocusDuration);
  $('#focus-start').addEventListener('click', toggleFocus);
  $('#focus-reset').addEventListener('click', resetFocus);
  $('#export-data').addEventListener('click', exportStudyData);
}

async function savePortion(event) {
  event.preventDefault();
  const payload = {
    user_id:user.id, subject:$('#portion-subject').value.trim(), title:$('#portion-title').value.trim(),
    target_date:$('#portion-date').value || null, status:$('#portion-status').value, notes:$('#portion-notes').value.trim()
  };
  if (!payload.subject || !payload.title) return toast('Enter both a subject and a portion name.');
  const {error} = await supabase.from('portions').insert(payload);
  if (error) return showError(error, 'Could not save the portion.');
  await refreshDashboard(); toast('Portion saved to your account.');
}
async function saveExam(event) {
  event.preventDefault();
  const rawDate = $('#exam-date').value;
  const parsedDate = new Date(rawDate);
  if (!rawDate || Number.isNaN(parsedDate.getTime())) return toast('Enter a valid exam date and time.');
  if (parsedDate.getTime() < Date.now() && !confirm('This exam date is in the past. Save it anyway?')) return;
  const payload = {
    user_id:user.id, title:$('#exam-title').value.trim(), subject:$('#exam-subject').value.trim(),
    exam_at:parsedDate.toISOString(), location:$('#exam-location').value.trim(), notes:$('#exam-notes').value.trim()
  };
  if (!payload.title || !payload.subject) return toast('Enter an exam name and subject.');
  const {error} = await supabase.from('exams').insert(payload);
  if (error) return showError(error, 'Could not save the exam date.');
  await refreshDashboard(); toast('Exam date saved.');
}
async function refreshDashboard() {
  await loadData();
  renderDashboard();
}
async function enableNotifications() {
  if (!('Notification' in window)) return toast('This browser does not support notifications.');
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      $('#notification-status').textContent = 'Permission not granted';
      return toast('Notifications are blocked in browser settings.');
    }
    const {error} = await supabase.from('profiles').update({notifications_enabled:true}).eq('id',user.id);
    if (error) return showError(error);
    profile.notifications_enabled = true;
    $('#notification-status').textContent = 'Enabled (while app is open)';
    $('#enable-notifications').textContent = 'Enabled';
    toast('Browser notification permission granted.');
    checkReminders();
  } catch (error) { showError(error); }
}
async function saveReminderMinutes(event) {
  const value = Number(event.target.value);
  if (![10,30,60,1440].includes(value)) return;
  const {error} = await supabase.from('profiles').update({reminder_minutes:value}).eq('id',user.id);
  if (error) return showError(error);
  profile.reminder_minutes = value;
  toast('Reminder preference saved.');
}
function checkReminders() {
  if (!user || !profile.notifications_enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now(), lead = profile.reminder_minutes * 60000;
  for (const exam of exams) {
    const remaining = new Date(exam.exam_at).getTime() - now;
    const key = `cla-reminded-${user.id}-${exam.id}-${profile.reminder_minutes}`;
    if (remaining > 0 && remaining <= lead && !sessionStorage.getItem(key)) {
      new Notification(`Upcoming exam: ${exam.title}`, { body: `${exam.subject} · ${niceDate(exam.exam_at)}` });
      sessionStorage.setItem(key, '1');
    }
  }
}
function startReminderChecks() {
  if (notificationInterval) clearInterval(notificationInterval);
  checkReminders();
  notificationInterval = setInterval(checkReminders, 60000);
}

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2,'0')}:${String(safe % 60).padStart(2,'0')}`;
}
function changeFocusDuration(event) {
  if (focusInterval) return toast('Pause or reset the timer before changing its length.');
  focusSeconds = Number(event.target.value) * 60;
  focusRemaining = focusSeconds;
  $('#focus-clock').textContent = formatClock(focusRemaining);
}
function toggleFocus() {
  if (focusInterval) {
    clearInterval(focusInterval); focusInterval = null;
    $('#focus-start').textContent = 'Resume focus';
    return;
  }
  if (focusRemaining <= 0) focusRemaining = focusSeconds;
  focusStartedAt = Date.now();
  $('#focus-start').textContent = 'Pause';
  focusInterval = setInterval(async () => {
    focusRemaining = Math.max(0, focusRemaining - 1);
    const clock = $('#focus-clock'); if (clock) clock.textContent = formatClock(focusRemaining);
    if (focusRemaining <= 0) {
      clearInterval(focusInterval); focusInterval = null;
      if ($('#focus-start')) $('#focus-start').textContent = 'Start focus';
      try {
        const duration = Number($('#focus-duration')?.value || 25);
        const subject = $('#focus-subject')?.value || 'General study';
        const {error} = await supabase.from('study_sessions').insert({user_id:user.id, subject, duration_minutes:duration, studied_at:new Date().toISOString()});
        if (error) throw error;
        await refreshDashboard(); toast(`Focus sprint complete. ${duration} minutes logged. Take a short break.`);
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Focus sprint complete', {body:`${duration} minutes of ${subject} logged. Take a short break.`});
      } catch (error) { showError(error, 'Timer finished, but the session could not be saved.'); }
    }
  }, 1000);
}
function resetFocus() {
  if (focusInterval) clearInterval(focusInterval);
  focusInterval = null;
  focusSeconds = Number($('#focus-duration')?.value || 25) * 60;
  focusRemaining = focusSeconds;
  $('#focus-clock').textContent = formatClock(focusRemaining);
  $('#focus-start').textContent = 'Start focus';
}
function filterPortions(event) {
  const query = event.target.value.trim().toLowerCase();
  $('#portion-list').innerHTML = renderPortions(query);
}
function exportStudyData() {
  const backup = { exported_at:new Date().toISOString(), portions, exams, study_sessions:studySessions };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='cla-command-center-backup.json'; a.click();
  URL.revokeObjectURL(url); toast('Study backup downloaded. Keep it somewhere safe.');
}

async function init() {
  if (!hasConfig) {
    $('#app').innerHTML = `<div class="auth-wrap"><section class="auth-card"><div class="brand"><div class="brand-mark">CC</div><div><h1>CLA Command Center</h1><p>Setup required</p></div></div><h2>Connect your database</h2><p>Add your Supabase project URL and publishable/anon key to <code>.env.local</code>, then restart the dev server.</p><div class="notice">1. Create a project at supabase.com<br>2. Run <code>supabase/schema.sql</code> in the SQL Editor<br>3. Copy <code>.env.example</code> to <code>.env.local</code> and fill in your project values<br>4. Restart using <code>npm run dev</code></div><p class="muted small">Setup instructions are also in README.md.</p></section></div>`;
    return;
  }
  const {data:{session}, error} = await supabase.auth.getSession();
  if (error) return renderAuth(`Error: ${error.message}`);
  if (session?.user) {
    user = session.user;
    try { await loadData(); renderDashboard(); } catch (e) { renderAuth(`Error: ${e.message}`); }
  } else renderAuth();
  supabase.auth.onAuthStateChange(async (_event, sessionNow) => {
    if (!sessionNow?.user) {
      user = null;
      if (supabase) renderAuth();
    }
  });
}
init();

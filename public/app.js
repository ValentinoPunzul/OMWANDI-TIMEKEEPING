/* ==========================================================================
   CHRONOS FLOW - ADVANCED DASHBOARD CLIENT WITH SCORO MAPPER
   ========================================================================== */

const state = {
  employees: [],
  projects: [],
  timeEntries: [],
  activeProfileId: localStorage.getItem('chronos_user_id') || null, 
  activeView: 'dashboard',
  isOnline: navigator.onLine,
  userRole: 'Employee',
  scoroMapping: {}
};

const API_BASE = window.location.origin;

window.addEventListener('DOMContentLoaded', () => {
  setupNetworkMonitoring();
  initializeState().then(() => {
    setupGlobalEventListeners();
    checkAuth();
    startDashboardClock();
  });
});

function checkAuth() {
    const loginOverlay = document.getElementById('loginOverlay');
    const appLayout = document.getElementById('appLayout');
    if (state.activeProfileId) {
        const me = state.employees.find(e => e.id === state.activeProfileId);
        if (me) {
            state.userRole = me.access_role || 'Employee';
            const nameEl = document.getElementById('activeName');
            const roleEl = document.getElementById('activeRole');
            const avatarEl = document.getElementById('activeAvatar');
            if(nameEl) nameEl.textContent = me.name;
            if(roleEl) roleEl.textContent = me.designation || me.role || 'Staff';
            if(avatarEl) { avatarEl.textContent = me.avatar || '??'; avatarEl.style.background = me.color || '#6366f1'; }
            updateSidebarVisibility(state.userRole);
            if (loginOverlay) loginOverlay.classList.add('hidden');
            if (appLayout) appLayout.classList.remove('hidden');
            switchView(state.activeView);
        } else { handleLogout(); }
    } else {
        if (loginOverlay) loginOverlay.classList.remove('hidden');
        if (appLayout) appLayout.classList.add('hidden');
    }
}

function updateSidebarVisibility(role) {
    const layout = document.getElementById('appLayout');
    if (role === 'Employee') { layout.classList.add('no-sidebar'); state.activeView = 'timer'; }
    else { layout.classList.remove('no-sidebar'); }
}

async function initializeState() {
  try {
    const [employees, projects, entries, mapping] = await Promise.all([
      apiRequest('/api/employees'),
      apiRequest('/api/projects'),
      apiRequest('/api/entries'),
      apiRequest('/api/settings/mapping')
    ]);
    state.employees = employees;
    state.projects = projects;
    state.timeEntries = entries;
    state.scoroMapping = mapping;
  } catch (e) { console.error('Init Error:', e); }
}

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaultHeaders = { 'Content-Type': 'application/json' };
  options.headers = { ...defaultHeaders, ...options.headers };
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function startDashboardClock() {
    setInterval(() => {
        const timeEl = document.getElementById('dashboardTime');
        const faceClock = document.getElementById('faceClock');
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        if (timeEl) timeEl.textContent = timeStr;
        if (faceClock) faceClock.textContent = timeStr;
    }, 1000);
}

function switchView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.getAttribute('data-view') === viewName));
  const container = document.getElementById('mainContent');
  if (!container) return;
  switch(viewName) {
    case 'dashboard': renderDashboard(container); break;
    case 'timer': renderTimer(container); break;
    case 'projects': renderProjects(container); break;
    case 'team': renderTeam(container); break;
    case 'timesheets': renderTimesheets(container); break;
    case 'settings': renderSettings(container); break;
  }
}

function renderDashboard(container) {
    const activeTimers = state.timeEntries.filter(e => e.total_hours === 0 || !e.end_time);
    const grouped = {};
    activeTimers.forEach(timer => { if (!grouped[timer.project_id]) grouped[timer.project_id] = []; grouped[timer.project_id].push(timer); });
    let html = activeTimers.length === 0 ? '<div style="text-align:center; padding:40px;">No active sessions.</div>' : 
        Object.entries(grouped).map(([pid, timers]) => {
            const proj = state.projects.find(p => p.id === pid) || { name: 'Internal', color: '#6366f1' };
            const list = timers.map(t => {
                const emp = state.employees.find(e => e.id === t.employee_id) || { name: 'Unknown', avatar: '??', color: '#888' };
                return `<div class="timer-card glass-panel"><div class="timer-avatar" style="background:${emp.color}">${emp.avatar}</div><div class="timer-user-info"><div>${emp.name}</div><div style="font-size:0.8rem; opacity:0.7;">${emp.designation || ''}</div></div><button class="btn-text" style="color:#ef4444;" onclick="stopUserTimer('${t.id}')">STOP</button></div>`;
            }).join('');
            return `<div class="project-group"><h3>${proj.name}</h3>${list}</div>`;
        }).join('');
    container.innerHTML = `<div class="clock-card glass-container"><div class="dashboard-time" id="dashboardTime">00:00:00</div></div><div class="active-timers-section">${html}</div>`;
}

async function stopUserTimer(id) {
    if (!confirm('Stop tracking?')) return;
    const entry = state.timeEntries.find(e => e.id === id);
    const hours = Math.abs(new Date() - new Date(entry.start_time)) / 36e5;
    await apiRequest(`/api/entries/${id}`, { method: 'PUT', body: JSON.stringify({ end_time: new Date().toISOString(), total_hours: Math.floor(hours * 4) / 4 }) });
    await initializeState(); switchView(state.activeView);
}

function renderTimer(container) {
    const projects = state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    container.innerHTML = `<div class="timer-view-container glass-container"><div id="faceClock" style="font-size:4rem; font-weight:800; margin-bottom:20px;">00:00:00</div><select id="timerProjectSelect" class="form-control" style="margin-bottom:20px;">${projects}</select><button class="btn primary" style="width:100%;" onclick="startTimer()">START SESSION</button></div>`;
}

async function startTimer() {
    const pid = document.getElementById('timerProjectSelect').value;
    await apiRequest('/api/entries', { method: 'POST', body: JSON.stringify({ employee_id: state.activeProfileId, project_id: pid, start_time: new Date().toISOString(), total_hours: 0 }) });
    await initializeState(); switchView('dashboard');
}

function renderProjects(container) {
    const html = state.projects.map(p => `<div class="glass-container" style="margin-bottom:10px;"><h3>${p.name}</h3><p>Client: ${p.client}</p></div>`).join('');
    container.innerHTML = `<h2>Projects</h2>${html}`;
}

function renderTeam(container) {
    const html = state.employees.map(e => `<div class="timer-card glass-panel" style="margin-bottom:10px;"><div class="timer-avatar" style="background:${e.color}">${e.avatar}</div><div>${e.name} (${e.designation})</div></div>`).join('');
    container.innerHTML = `<h2>Team</h2>${html}`;
}

function renderTimesheets(container) {
    const rows = state.timeEntries.map(e => `<tr><td>${e.start_time.split('T')[0]}</td><td>${e.employee_name}</td><td>${e.project_name}</td><td>${(e.total_hours || 0).toFixed(2)}h</td></tr>`).join('');
    container.innerHTML = `<h2>Timesheets</h2><div class="glass-container"><table><thead><tr><th>Date</th><th>Member</th><th>Project</th><th>Hours</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderSettings(container) {
    const isAdmin = state.userRole === 'Administrator';
    if (!isAdmin && state.userRole !== 'Editor') { container.innerHTML = 'Access Denied'; return; }

    const userOptions = state.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    const projectOptions = state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    container.innerHTML = `
        <div class="view-header"><h2>Settings</h2></div>
        
        <!-- SCORO MAPPER (New) -->
        <div class="glass-container" style="margin-bottom:24px; border-left: 4px solid #8b5cf6;">
            <h3>SCORO Webhook Mapper</h3>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:20px;">Map SCORO JSON paths to App fields. Use 'entity.no' for standard fields or 'cf:c_vesselname' for custom fields.</p>
            
            <div id="mappingForm" class="settings-form">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;">
                    <div><label style="font-size:0.7rem; opacity:0.7;">PROJECT NUMBER PATH</label><input type="text" id="mapProjNo" value="${state.scoroMapping.proj_no || 'entity.no'}" class="form-control"></div>
                    <div><label style="font-size:0.7rem; opacity:0.7;">PROJECT NAME PATH</label><input type="text" id="mapName" value="${state.scoroMapping.name || 'entity.project_name'}" class="form-control"></div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;">
                    <div><label style="font-size:0.7rem; opacity:0.7;">CLIENT NAME PATH</label><input type="text" id="mapClient" value="${state.scoroMapping.client || 'entity.company_name'}" class="form-control"></div>
                    <div><label style="font-size:0.7rem; opacity:0.7;">VESSEL NAME PATH</label><input type="text" id="mapVessel" value="${state.scoroMapping.vessel_name || 'cf:c_vesselname'}" class="form-control"></div>
                </div>
                <button class="btn primary" onclick="saveMapping()">Save Mapping Configuration</button>
                <button class="btn outline" style="margin-left:10px;" onclick="viewLatestWebhook()">View Latest Webhook JSON</button>
            </div>
        </div>

        <!-- Existing Employee Management -->
        <div class="glass-container" style="margin-bottom:24px;">
            <h3>Employee Management</h3>
            <select id="userSelect" class="form-control" style="margin:20px 0;" onchange="editEmployee(this.value)">
                <option value="">-- Add New Employee --</option>${userOptions}
            </select>
            <div id="userForm" class="settings-form">
                <input type="hidden" id="userId">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
                    <input type="text" id="userEmpNo" placeholder="Emp No" class="form-control">
                    <input type="text" id="userName" placeholder="Full Name" class="form-control">
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
                    <input type="text" id="userDesignation" placeholder="Designation" class="form-control">
                    <select id="userAccessRole" class="form-control"><option value="Employee">Employee</option><option value="Editor">Editor</option><option value="Administrator">Administrator</option></select>
                </div>
                <button class="btn primary" onclick="handleUserSubmit()">Save Employee</button>
            </div>
        </div>

        <div class="glass-container">
            <h3>Project Management</h3>
            <select id="projectSelect" class="form-control" style="margin:20px 0;" onchange="handleProjectSelect(this.value)">
                <option value="">-- Add New Project --</option>${projectOptions}
            </select>
            <div id="projectForm" class="settings-form">
                <input type="hidden" id="projectId">
                <input type="text" id="projectName" placeholder="Project Name" class="form-control" style="margin-bottom:16px;">
                <button class="btn primary" onclick="handleProjectSubmit()">Save Project</button>
            </div>
        </div>
    `;
}

async function saveMapping() {
    const data = {
        proj_no: document.getElementById('mapProjNo').value,
        name: document.getElementById('mapName').value,
        client: document.getElementById('mapClient').value,
        vessel_name: document.getElementById('mapVessel').value
    };
    await apiRequest('/api/settings/mapping', { method: 'POST', body: JSON.stringify(data) });
    showNotification('Mapping saved!', 'success');
}

async function viewLatestWebhook() {
    const logs = await apiRequest('/api/admin/webhooks');
    if (logs.length > 0) {
        const win = window.open("", "Webhook JSON", "width=600,height=600");
        win.document.body.innerHTML = `<pre style="background:#222; color:#0f0; padding:20px;">${JSON.stringify(logs[0].content, null, 2)}</pre>`;
    } else { alert('No logs found.'); }
}

// Reuse existing handleUserSubmit, handleProjectSubmit, etc.
async function handleUserSubmit() {
    const name = document.getElementById('userName').value;
    const userData = { emp_no: document.getElementById('userEmpNo').value, name, designation: document.getElementById('userDesignation').value, access_role: document.getElementById('userAccessRole').value, avatar: name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) };
    const id = document.getElementById('userId').value;
    if (id) await apiRequest(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(userData) });
    else await apiRequest('/api/employees', { method: 'POST', body: JSON.stringify(userData) });
    await initializeState(); renderSettings(document.getElementById('mainContent'));
}

function editEmployee(id) {
    const emp = state.employees.find(e => e.id === id);
    if (!emp) return;
    document.getElementById('userId').value = emp.id;
    document.getElementById('userEmpNo').value = emp.emp_no || '';
    document.getElementById('userName').value = emp.name || '';
    document.getElementById('userDesignation').value = emp.designation || '';
    document.getElementById('userAccessRole').value = emp.access_role || 'Employee';
}

function handleProjectSelect(id) {
    const proj = state.projects.find(p => p.id === id);
    if (!proj) return;
    document.getElementById('projectId').value = proj.id;
    document.getElementById('projectName').value = proj.name;
}

async function handleProjectSubmit() {
    const name = document.getElementById('projectName').value;
    const id = document.getElementById('projectId').value;
    if (id) await apiRequest(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    else await apiRequest('/api/projects', { method: 'POST', body: JSON.stringify({ name }) });
    await initializeState(); renderSettings(document.getElementById('mainContent'));
}

function handleLogout() { state.activeProfileId = null; localStorage.removeItem('chronos_user_id'); location.reload(); }
function setupGlobalEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => { item.addEventListener('click', (e) => switchView(e.currentTarget.getAttribute('data-view'))); });
    document.getElementById('loginForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const empNo = document.getElementById('loginEmpNo').value;
        const emp = state.employees.find(e => e.emp_no === empNo);
        if (emp) { state.activeProfileId = emp.id; localStorage.setItem('chronos_user_id', emp.id); checkAuth(); }
        else { document.getElementById('loginError').classList.remove('hidden'); }
    });
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
}
function setupNetworkMonitoring() {
    window.addEventListener('online', () => document.getElementById('statusDot').className = 'status-dot online');
    window.addEventListener('offline', () => document.getElementById('statusDot').className = 'status-dot offline');
}
function showNotification(msg, type) {
    const c = document.getElementById('notificationContainer');
    if (!c) return;
    const n = document.createElement('div');
    n.className = `notification ${type}`; n.textContent = msg;
    n.style.padding = '12px 24px'; n.style.background = type === 'success' ? '#10b981' : '#ef4444';
    n.style.color = '#fff'; n.style.borderRadius = '8px'; n.style.marginTop = '10px';
    c.appendChild(n); setTimeout(() => n.remove(), 3000);
}

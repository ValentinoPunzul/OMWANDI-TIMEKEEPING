/* ==========================================================================
   OMWANDI TIMEKEEPER - FOREMAN & MOBILE OPTIMIZED CLIENT
   ========================================================================== */

const state = {
  employees: [],
  projects: [],
  timeEntries: [],
  activeProfileId: localStorage.getItem('chronos_user_id') || null, 
  activeView: 'dashboard',
  isOnline: navigator.onLine,
  employeeSortField: 'name',
  employeeSortDir: 'asc',
  userRole: 'Employee',
  scoroMapping: {}
};

const API_BASE = ""; 
const isMobile = () => window.innerWidth <= 768;

window.addEventListener('DOMContentLoaded', () => {
  setupNetworkMonitoring();
  initializeState().then(() => {
    setupGlobalEventListeners();
    checkAuth();
    startDashboardClock();
    startBackgroundRefresh();
  });
});

function checkAuth() {
    const loginOverlay = document.getElementById('loginOverlay');
    const appLayout = document.getElementById('appLayout');
    if (state.activeProfileId) {
        const me = state.employees.find(e => e.id === state.activeProfileId);
        if (me) {
            state.userRole = me.access_role || 'Employee';
            document.getElementById('activeName').textContent = me.name;
            document.getElementById('activeRole').textContent = me.designation || 'Staff';
            const avatarEl = document.getElementById('activeAvatar');
            if(avatarEl) { avatarEl.textContent = me.avatar || '??'; avatarEl.style.background = me.color || '#6366f1'; }
            
            updateSidebarVisibility(me);
            if (loginOverlay) loginOverlay.classList.add('hidden');
            if (appLayout) appLayout.classList.remove('hidden');
            
            // Set initial view based on role
            if (state.userRole === 'Employee' || state.userRole === 'Viewer') state.activeView = 'timer';
            switchView(state.activeView);
        } else { handleLogout(); }
    } else {
        if (loginOverlay) loginOverlay.classList.remove('hidden');
        if (appLayout) appLayout.classList.add('hidden');
    }
}

function updateSidebarVisibility(me) {
    const layout = document.getElementById('appLayout');
    const mobileNav = document.getElementById('mobileNav');
    const isForeman = me.designation === "Foreman Marine Outfitting";
    
    // Default: Show sidebar for Admin/Editor, hide for others or Mobile
    if (state.userRole === 'Employee' || state.userRole === 'Viewer' || isMobile()) {
        layout.classList.add('no-sidebar');
        // If Foreman on mobile, show bottom nav
        if (isMobile() && (isForeman || state.userRole === 'Administrator' || state.userRole === 'Editor')) {
            mobileNav.classList.remove('hidden');
            mobileNav.style.display = 'flex';
        } else {
            mobileNav.classList.add('hidden');
            mobileNav.style.display = 'none';
        }
    } else {
        layout.classList.remove('no-sidebar');
        mobileNav.classList.add('hidden');
        mobileNav.style.display = 'none';
    }
}

async function initializeState() {
  try {
    const [employees, projects, entries, mapping] = await Promise.all([
      apiRequest('/api/employees'),
      apiRequest('/api/projects'),
      apiRequest('/api/entries'),
      apiRequest('/api/settings/mapping')
    ]);
    state.employees = employees || [];
    state.projects = projects || [];
    state.timeEntries = entries || [];
    state.scoroMapping = mapping || {};
  } catch (e) { console.error('Sync Error:', e); }
}

function startBackgroundRefresh() {
    setInterval(async () => {
        await initializeState();
        const content = document.getElementById('mainContent');
        if (state.activeView === 'dashboard' && content) renderDashboard(content);
    }, 60000);
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
        const dateEl = document.getElementById('dashboardDate');
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        if (timeEl) timeEl.textContent = timeStr;
        if (faceClock) faceClock.textContent = timeStr;
        if (dateEl) dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase();
    }, 1000);
}

function switchView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.getAttribute('data-view') === viewName));
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
      const target = item.getAttribute('onclick').match(/'([^']+)'/)[1];
      item.classList.toggle('active', target === viewName);
  });
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
    const me = state.employees.find(e => e.id === state.activeProfileId);
    const isForeman = me?.designation === "Foreman Marine Outfitting";
    
    const activeTimers = state.timeEntries.filter(e => (e.total_hours === 0 || !e.end_time) && e.start_time);
    
    // Foremen only see their team on the dashboard
    const filteredTimers = isForeman ? activeTimers.filter(t => {
        const staff = state.employees.find(e => e.id === t.employee_id);
        return staff && staff.reports_to === me.name;
    }) : activeTimers;

    const grouped = {};
    filteredTimers.forEach(timer => { if (!grouped[timer.project_id]) grouped[timer.project_id] = []; grouped[timer.project_id].push(timer); });
    
    let html = filteredTimers.length === 0 ? '<div style="text-align:center; padding:40px; color:var(--text-muted);">No active sessions for your team.</div>' : 
        Object.entries(grouped).map(([pid, timers]) => {
            const proj = state.projects.find(p => p.id === pid) || { name: 'Internal', color: '#6366f1' };
            const list = timers.map(t => {
                const emp = state.employees.find(e => e.id === t.employee_id) || { name: 'Unknown', avatar: '??', color: '#888' };
                return `<div class="timer-card glass-panel">
                    <div class="timer-avatar" style="background:${emp.color}">${emp.avatar}</div>
                    <div class="timer-user-info"><div>${emp.name}</div><div style="font-size:0.8rem; opacity:0.7;">${emp.designation || ''}</div></div>
                    <button class="btn-text" style="color:#ef4444; font-weight:800;" onclick="stopUserTimer('${t.id}')">STOP</button>
                </div>`;
            }).join('');
            return `<div class="project-group"><h3>[${proj.proj_no || '---'}] ${proj.name}</h3>${list}</div>`;
        }).join('');

    const header = (state.userRole === 'Employee' || state.userRole === 'Viewer' || isMobile()) ? `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; width:100%;">
            <div>
                <h1 style="margin:0; font-size:1.2rem;">OMWANDI <span style="color:var(--accent-primary)">Timekeeper</span></h1>
                <p style="margin:0; font-size:0.75rem; color:var(--text-muted);">${me?.name} (Dashboard)</p>
            </div>
            <button class="btn outline" style="padding:6px 12px; font-size:0.75rem;" onclick="handleLogout()">Logout</button>
        </div>
    ` : '<h2>Dashboard</h2>';

    container.innerHTML = `${header}<div class="clock-card glass-container"><div class="dashboard-time" id="dashboardTime">00:00:00</div><div class="dashboard-date" id="dashboardDate">LOADING...</div></div><div class="active-timers-section">${html}</div>`;
}

function renderTimer(container) {
    const me = state.employees.find(e => e.id === state.activeProfileId);
    const isForeman = me?.designation === "Foreman Marine Outfitting";
    
    // If Foreman, find their team members
    const myTeam = state.employees.filter(e => e.reports_to === me?.name && e.designation === "Team Member Marine Outfitting");
    
    const staffOptions = isForeman ? `
        <div style="text-align:left; margin-bottom:20px;">
            <label style="font-size:0.7rem; opacity:0.7; font-weight:700;">SELECT TEAM MEMBER</label>
            <select id="timerStaffSelect" class="form-control">
                <option value="${me.id}">MYSELF (${me.name})</option>
                ${myTeam.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
        </div>
    ` : `<input type="hidden" id="timerStaffSelect" value="${state.activeProfileId}">`;

    const projects = state.projects.map(p => `<option value="${p.id}">[${p.proj_no}] ${p.name}</option>`).join('');
    
    const header = (state.userRole === 'Employee' || state.userRole === 'Viewer' || isMobile()) ? `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; width:100%;">
            <div>
                <h1 style="margin:0; font-size:1.2rem;">OMWANDI <span style="color:var(--accent-primary)">Timekeeper</span></h1>
                <p style="margin:0; font-size:0.75rem; color:var(--text-muted);">${me?.name}</p>
            </div>
            <button class="btn outline" style="padding:6px 12px; font-size:0.75rem;" onclick="handleLogout()">Logout</button>
        </div>
    ` : '<div class="view-header"><h2>Live Tracker</h2></div>';

    container.innerHTML = `
        <div class="timer-view-wrapper">
            ${header}
            <div class="timer-view-container glass-container">
                <div id="faceClock" class="timer-face">00:00:00</div>
                
                ${staffOptions}

                <div style="text-align:left; margin-bottom:20px;">
                    <label style="font-size:0.7rem; opacity:0.7; font-weight:700;">FIND PROJECT</label>
                    <input type="text" id="projectSearch" class="form-control" style="margin-bottom:12px;" placeholder="Search..." oninput="window.filterTimerProjects(this.value)">
                    <select id="timerProjectSelect" class="form-control" onchange="window.handleTimerProjectChange(this.value)">
                        <option value="">-- Select Project --</option>${projects}
                    </select>
                </div>
                <div id="nptNotesContainer" class="hidden" style="text-align:left; margin-bottom:20px;">
                    <label style="font-size:0.7rem; opacity:0.7; font-weight:700;">NPT NOTES (REQUIRED)</label>
                    <textarea id="nptNotes" class="form-control" style="height:100px; resize:none;" placeholder="Enter details..."></textarea>
                </div>
                <button class="btn primary" style="width:100%; padding:20px; font-weight:800;" onclick="startTimer()">START SESSION</button>
            </div>
        </div>
    `;
    window.handleTimerProjectChange(document.getElementById('timerProjectSelect').value);
}

async function startTimer() {
    const staffId = document.getElementById('timerStaffSelect').value;
    const pid = document.getElementById('timerProjectSelect').value;
    if (!pid) return alert('Select project.');
    
    // One Timer Check for target staff
    const active = state.timeEntries.find(e => e.employee_id === staffId && (!e.end_time || e.total_hours === 0));
    if (active) return alert('This member already has an active session.');

    const project = state.projects.find(p => p.id === pid);
    let desc = 'Track Log';
    if (project && project.proj_no === '1000') {
        desc = document.getElementById('nptNotes').value.trim();
        if (!desc) return alert('Notes required for NPT');
    }

    await apiRequest('/api/entries', { method: 'POST', body: JSON.stringify({ employee_id: staffId, project_id: pid, start_time: new Date().toISOString(), total_hours: 0, description: desc }) });
    await initializeState(); 
    showNotification('Session started!', 'success');
    switchView('dashboard');
}

async function stopUserTimer(id) {
    if (!confirm('Stop tracking?')) return;
    const entry = state.timeEntries.find(e => e.id === id);
    const hours = Math.abs(new Date() - new Date(entry.start_time)) / 36e5;
    await apiRequest(`/api/entries/${id}`, { method: 'PUT', body: JSON.stringify({ end_time: new Date().toISOString(), total_hours: Math.floor(hours * 4) / 4 }) });
    await initializeState(); switchView(state.activeView);
}

function renderProjects(container) {
    const html = state.projects.map(p => {
        const spent = state.timeEntries.filter(e => e.project_id === p.id).reduce((sum, e) => sum + (e.total_hours || 0), 0);
        const budget = parseFloat(p.budget_hours) || 0;
        const progress = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
        return `<div class="glass-container project-card-v2">
            <div class="card-header"><h3>${p.name}</h3><span class="project-indicator" style="background:${p.color || 'var(--accent-primary)'}; width:12px; height:12px; border-radius:3px;"></span></div>
            <p class="client-label">${p.client || 'Internal'}</p>
            <div class="stats-row"><span class="spent-val">${spent.toFixed(2)} <small>HRS</small></span><span class="budget-val">${budget > 0 ? budget : '∞'}</span></div>
            <div class="progress-container"><div class="progress-bar" style="width: ${progress}%"></div></div>
            <div class="burn-row"><span>Burn</span><span>${progress.toFixed(0)}%</span></div>
        </div>`;
    }).join('');
    container.innerHTML = `<h2>Projects</h2><div class="projects-grid-v2">${html}</div>`;
}

function renderTeam(container) {
    const rows = state.employees.sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(e => {
        const hours = state.timeEntries.filter(te => te.employee_id === e.id).reduce((sum, te) => sum + (te.total_hours || 0), 0);
        return `<tr><td><div style="display:flex; align-items:center; gap:12px;"><div style="width:36px; height:36px; border-radius:50%; background:${e.color}; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem;">${e.avatar}</div><div><div>${e.name}</div><div style="font-size:0.75rem; color:var(--text-muted);">#${e.emp_no || '---'}</div></div></div></td><td><span style="padding:4px 12px; background:rgba(255,255,255,0.05); border-radius:12px; font-size:0.8rem;">${e.designation || 'Staff'}</span></td><td>${e.reports_to || '---'}</td><td>${hours.toFixed(1)} hrs</td><td style="text-align:right;"><button class="btn-text" style="color:var(--accent-primary);" onclick="state.activeView='settings'; renderSettings(document.getElementById('mainContent')); editEmployee('${e.id}')">✎</button></td></tr>`;
    }).join('');
    container.innerHTML = `<h2>Team</h2><div class="glass-container"><div class="table-container"><table><thead><tr><th>Employee</th><th>Role</th><th>Reports To</th><th>Logged</th><th style="text-align:right;">Action</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderTimesheets(container) {
    const rows = state.timeEntries.map(e => {
        const startT = e.start_time ? new Date(e.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';
        const endT = e.end_time ? new Date(e.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '---';
        return `<tr><td>${e.start_time ? e.start_time.split('T')[0] : '---'}</td><td>${e.employee_name}</td><td>${e.project_name}</td><td>${startT}</td><td>${endT}</td><td>${(e.total_hours || 0).toFixed(2)}h</td></tr>`;
    }).join('');
    container.innerHTML = `<h2>Timesheets</h2><div class="glass-container"><div class="table-container"><table><thead><tr><th>Date</th><th>Member</th><th>Project</th><th>Start</th><th>End</th><th>Hours</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderSettings(container) {
    const isAdmin = state.userRole === 'Administrator';
    const userOptions = state.employees.sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    const projectOptions = state.projects.map(p => `<option value="${p.id}">${p.proj_no ? '['+p.proj_no+'] ' : ''}${p.name}</option>`).join('');
    container.innerHTML = `<div class="view-header"><h2>Settings</h2></div><div class="glass-container" style="margin-bottom:24px; border-left: 4px solid #8b5cf6;"><h3>SCORO Webhook Mapper</h3><div id="mappingForm" class="settings-form" style="margin-top:20px;"><div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;"><div><label style="font-size:0.7rem; opacity:0.7; font-weight:700;">PROJECT NO PATH</label><input type="text" id="mapProjNo" value="${state.scoroMapping.proj_no || 'entity.no'}" class="form-control"></div><div><label style="font-size:0.7rem; opacity:0.7; font-weight:700;">PROJECT NAME PATH</label><input type="text" id="mapName" value="${state.scoroMapping.name || 'entity.project_name'}" class="form-control"></div></div><button class="btn primary" onclick="saveMapping()">Save Mapping</button></div></div><div class="glass-container" style="margin-bottom:24px;"><h3>User Management</h3><select id="userSelect" class="form-control" style="margin:20px 0;" onchange="editEmployee(this.value)"><option value="">-- Add New Employee --</option>${userOptions}</select><div id="userForm" class="settings-form"><input type="hidden" id="userId"><div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;"><div><label style="font-size:0.7rem; opacity:0.7; font-weight:700;">EMP NO</label><input type="text" id="userEmpNo" class="form-control"></div><div><label style="font-size:0.7rem; opacity:0.7; font-weight:700;">FULL NAME</label><input type="text" id="userName" class="form-control"></div></div><div class="btn-group" style="display:flex; gap:12px; margin-top:10px;"><button class="btn primary" onclick="handleUserSubmit()">Save Employee</button>${isAdmin ? `<button id="deleteEmployeeBtn" class="btn outline" style="color:#ef4444; display:none;" onclick="deleteEmployee()">Delete</button>` : ''}</div></div></div>`;
}

// Logic...
async function saveMapping() { const data = { proj_no: document.getElementById('mapProjNo').value, name: document.getElementById('mapName').value, client: document.getElementById('mapClient').value, vessel_name: document.getElementById('mapVessel').value }; await apiRequest('/api/settings/mapping', { method: 'POST', body: JSON.stringify(data) }); showNotification('Mapping saved!', 'success'); }
async function handleUserSubmit() { const name = document.getElementById('userName').value; if(!name) return alert('Name required'); const userData = { emp_no: document.getElementById('userEmpNo').value, password: document.getElementById('userPassword').value, name, designation: document.getElementById('userDesignation').value, department: document.getElementById('userDepartment').value, sub_department: document.getElementById('userSubDepartment').value, reports_to: document.getElementById('userReportsTo').value, access_role: document.getElementById('userAccessRole').value, color: document.getElementById('userColor').value, avatar: name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }; const id = document.getElementById('userId').value; if (id) await apiRequest(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(userData) }); else await apiRequest('/api/employees', { method: 'POST', body: JSON.stringify(userData) }); await initializeState(); renderSettings(document.getElementById('mainContent')); }
function editEmployee(id) { const emp = state.employees.find(e => e.id === id); if (!emp) { resetUserForm(); return; } document.getElementById('userId').value = emp.id; document.getElementById('userEmpNo').value = emp.emp_no || ''; document.getElementById('userName').value = emp.name || ''; document.getElementById('userPassword').value = emp.password || ''; document.getElementById('userDesignation').value = emp.designation || ''; document.getElementById('userDepartment').value = emp.department || ''; document.getElementById('userSubDepartment').value = emp.sub_department || ''; document.getElementById('userReportsTo').value = emp.reports_to || ''; document.getElementById('userAccessRole').value = emp.access_role || 'Employee'; document.getElementById('userColor').value = emp.color || '#6366f1'; const delBtn = document.getElementById('deleteEmployeeBtn'); if (delBtn) delBtn.style.display = 'inline-block'; }
async function deleteEmployee() { const id = document.getElementById('userId').value; if (!id || !confirm('Delete employee?')) return; await apiRequest(`/api/employees/${id}`, { method: 'DELETE' }); await initializeState(); renderSettings(document.getElementById('mainContent')); }
function resetUserForm() { document.getElementById('userId').value = ''; const form = document.getElementById('userForm'); if (form) form.reset(); document.getElementById('userSelect').value = ''; const delBtn = document.getElementById('deleteEmployeeBtn'); if (delBtn) delBtn.style.display = 'none'; }
function handleProjectSelect(id) { const p = state.projects.find(p => p.id === id); if (!p) { resetProjectForm(); return; } document.getElementById('projectId').value = p.id; document.getElementById('projectNo').value = p.proj_no || ''; document.getElementById('projectName').value = p.name || ''; document.getElementById('projectClient').value = p.client || ''; document.getElementById('projectVessel').value = p.vessel_name || ''; document.getElementById('projectBudget').value = p.budget_hours || ''; const delBtn = document.getElementById('deleteProjectBtn'); if (delBtn) delBtn.style.display = 'inline-block'; }
async function handleProjectSubmit() { const projNo = document.getElementById('projectNo').value; const name = document.getElementById('projectName').value; if(!projNo || !name) return alert('No & Name required'); const data = { proj_no: projNo, name, client: document.getElementById('projectClient').value, vessel_name: document.getElementById('projectVessel').value, budget_hours: document.getElementById('projectBudget').value, id: 'proj_'+projNo }; const id = document.getElementById('projectId').value || data.id; if (document.getElementById('projectId').value) await apiRequest(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }); else await apiRequest('/api/projects', { method: 'POST', body: JSON.stringify(data) }); await initializeState(); renderSettings(document.getElementById('mainContent')); }
async function deleteProject() { const id = document.getElementById('projectId').value; if (!id || !confirm('Delete project?')) return; await apiRequest(`/api/projects/${id}`, { method: 'DELETE' }); await initializeState(); renderSettings(document.getElementById('mainContent')); }
function resetProjectForm() { document.getElementById('projectId').value = ''; const form = document.getElementById('projectForm'); if (form) form.reset(); document.getElementById('projectSelect').value = ''; const delBtn = document.getElementById('deleteProjectBtn'); if (delBtn) delBtn.style.display = 'none'; }
window.handleLogout = () => { state.activeProfileId = null; localStorage.removeItem('chronos_user_id'); location.reload(); };
window.handleTimerProjectChange = (pid) => { const notesContainer = document.getElementById('nptNotesContainer'); if (!notesContainer) return; const project = state.projects.find(p => p.id === pid); if (project && project.proj_no === '1000') notesContainer.classList.remove('hidden'); else notesContainer.classList.add('hidden'); };
function setupGlobalEventListeners() { document.querySelectorAll('.nav-item').forEach(item => { item.addEventListener('click', (e) => switchView(e.currentTarget.getAttribute('data-view'))); }); document.getElementById('loginForm')?.addEventListener('submit', (e) => { e.preventDefault(); const empNo = document.getElementById('loginEmpNo').value; const password = document.getElementById('loginPassword').value; const emp = state.employees.find(e => e.emp_no === empNo && e.password === password); if (emp) { state.activeProfileId = emp.id; localStorage.setItem('chronos_user_id', emp.id); checkAuth(); } else { document.getElementById('loginError').classList.remove('hidden'); } }); document.getElementById('logoutBtn')?.addEventListener('click', window.handleLogout); }
function setupNetworkMonitoring() { window.addEventListener('online', () => document.getElementById('statusDot').className = 'status-dot online'); window.addEventListener('offline', () => document.getElementById('statusDot').className = 'status-dot offline'); }
function showNotification(msg, type) { const n = document.createElement('div'); n.className = `notification ${type}`; n.textContent = msg; n.style.padding = '12px 24px'; n.style.background = type === 'success' ? '#10b981' : '#ef4444'; n.style.color = '#fff'; n.style.borderRadius = '8px'; n.style.marginTop = '10px'; document.getElementById('notificationContainer').appendChild(n); setTimeout(() => n.remove(), 3000); }

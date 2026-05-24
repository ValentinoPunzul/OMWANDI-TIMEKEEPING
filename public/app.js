/* ==========================================================================
   CHRONOS FLOW - ADVANCED STATE & CONTROLLER CLIENT
   ========================================================================== */

const state = {
  employees: [],
  projects: [],
  timeEntries: [],
  activeProfileId: 'emp_1', 
  activeView: 'dashboard',
  isOnline: navigator.onLine,
  activeTimer: { running: false, startTime: null, secondsElapsed: 0, projectId: '', task: 'Development', description: '', intervalId: null },
  offlineQueue: JSON.parse(localStorage.getItem('chronos_offline_queue')) || [],
  hrConfig: JSON.parse(localStorage.getItem('chronos_hr_config')) || { email: 'hr@company.com', webhook: '' }
};

const API_BASE = window.location.origin;

// 2. Initialize Application
window.addEventListener('DOMContentLoaded', () => {
  setupNetworkMonitoring();
  setupPWAServiceWorker();
  initializeState().then(() => {
    setupGlobalEventListeners();
    switchView(state.activeView);
    startDashboardClock();
  });
});

function setupPWAServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('SW Error:', err));
  }
}

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaultHeaders = { 'Content-Type': 'application/json' };
  options.headers = { ...defaultHeaders, ...options.headers };
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    if (!state.isOnline) toggleOnlineStatus(true);
    return await response.json();
  } catch (error) {
    toggleOnlineStatus(false);
    throw error;
  }
}

async function initializeState() {
  try {
    const [employees, projects, entries] = await Promise.all([
      apiRequest('/api/employees'),
      apiRequest('/api/projects'),
      apiRequest('/api/entries')
    ]);
    state.employees = employees;
    state.projects = projects;
    state.timeEntries = entries;
    localStorage.setItem('chronos_employees', JSON.stringify(employees));
    localStorage.setItem('chronos_projects', JSON.stringify(projects));
    localStorage.setItem('chronos_entries', JSON.stringify(entries));
  } catch (e) {
    state.employees = JSON.parse(localStorage.getItem('chronos_employees')) || getMockEmployees();
    state.projects = JSON.parse(localStorage.getItem('chronos_projects')) || getMockProjects();
    state.timeEntries = JSON.parse(localStorage.getItem('chronos_entries')) || [];
  }
}

function startDashboardClock() {
    setInterval(() => {
        const timeEl = document.getElementById('dashboardTime');
        const dateEl = document.getElementById('dashboardDate');
        if (timeEl && dateEl) {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
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
  }
}

function renderDashboard(container) {
    const activeTimers = state.timeEntries.filter(e => !e.end_time);
    const grouped = {};
    activeTimers.forEach(timer => {
        if (!grouped[timer.project_id]) grouped[timer.project_id] = [];
        grouped[timer.project_id].push(timer);
    });

    let activeTimersHtml = '';
    if (activeTimers.length === 0) {
        activeTimersHtml = `<div style="text-align:center; color:var(--text-muted); padding:40px;">No active timers currently running.</div>`;
    } else {
        activeTimersHtml = Object.entries(grouped).map(([projectId, timers]) => {
            const project = getProject(projectId);
            const timersList = timers.map(t => {
                const emp = getEmployee(t.employee_id) || { name: 'Unknown', avatar: '??', color: '#888' };
                const start = new Date(t.start_time);
                const diff = Math.floor((new Date() - start) / 1000);
                const h = Math.floor(diff / 3600).toString().padStart(2, '0');
                const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
                const s = (diff % 60).toString().padStart(2, '0');
                
                return `
                    <div class="timer-card glass-panel">
                        <div class="timer-avatar" style="background:${emp.color}">${emp.avatar}</div>
                        <div class="timer-user-info">
                            <div class="timer-user-name">${emp.name}</div>
                            <div class="timer-task-name">${t.task}</div>
                        </div>
                        <div class="timer-counter">${h}:${m}:${s}</div>
                    </div>`;
            }).join('');

            return `
                <div class="project-group">
                    <div class="project-header"><span class="project-dot" style="background:${project.color}"></span>${project.name}</div>
                    <div class="timers-grid">${timersList}</div>
                </div>`;
        }).join('');
    }

    container.innerHTML = `
        <div class="dashboard-container">
            <div class="clock-card glass-container">
                <div class="dashboard-time" id="dashboardTime">--:--:--</div>
                <div class="dashboard-date" id="dashboardDate">----, -- ---- ----</div>
            </div>
            <div class="active-timers-section">
                <div class="section-label"><span class="pulse-emerald"></span>Active Project Sessions</div>
                ${activeTimersHtml}
            </div>
        </div>`;
}

function renderTimer(container) {
    const projectOptions = state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    container.innerHTML = `
        <div class="view-header"><h2>Live Tracker</h2></div>
        <div class="timer-view-container">
            <div class="timer-face"><div class="timer-clock" id="faceClock">00:00:00</div></div>
            <div class="timer-config-card glass-container">
                <select id="timerProjectSelect" style="margin-bottom:20px;">${projectOptions}</select>
                <button class="big-timer-btn play" id="timerPlayBtn">START SESSION</button>
            </div>
        </div>`;
    const btn = document.getElementById('timerPlayBtn');
    if (btn) {
        btn.addEventListener('click', () => {
            const pid = document.getElementById('timerProjectSelect').value;
            startTimer(pid, 'Development', 'Track Log');
        });
    }
}

async function startTimer(projectId, task, description) {
    const entry = { employee_id: state.activeProfileId, project_id: projectId, task: task, description: description, start_time: new Date().toISOString(), total_hours: 0 };
    try {
        const saved = await apiRequest('/api/entries', { method: 'POST', body: JSON.stringify(entry) });
        state.timeEntries.unshift(saved);
        switchView('dashboard');
    } catch (e) {
        alert('Failed to start timer.');
    }
}

function renderProjects(container) {
    const html = state.projects.map(p => `<div class="project-card glass-container"><h3>${p.name}</h3><p>${p.client}</p></div>`).join('');
    container.innerHTML = `<div class="view-header"><h2>Projects</h2></div><div class="projects-grid">${html}</div>`;
}

function renderTeam(container) {
    const html = state.employees.map(e => `<div class="timer-card glass-panel" style="margin-bottom:10px;"><div class="timer-avatar" style="background:${e.color}">${e.avatar}</div><div>${e.name}</div></div>`).join('');
    container.innerHTML = `<div class="view-header"><h2>Team</h2></div>${html}`;
}

function renderTimesheets(container) {
    container.innerHTML = `<div class="view-header"><h2>Timesheets</h2></div><p>Database view connected to Firebase.</p>`;
}

function setupNetworkMonitoring() {
    window.addEventListener('online', () => toggleOnlineStatus(true));
    window.addEventListener('offline', () => toggleOnlineStatus(false));
}

function toggleOnlineStatus(isOnline) {
    state.isOnline = isOnline;
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (dot) dot.className = isOnline ? 'status-dot online' : 'status-dot offline';
    if (text) text.textContent = isOnline ? 'Cloud Synced' : 'Offline Mode';
}

function setupGlobalEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => switchView(e.currentTarget.getAttribute('data-view')));
    });
    
    // Defensive listeners
    const pauseBtn = document.getElementById('stripPauseBtn');
    if (pauseBtn) pauseBtn.addEventListener('click', () => {});
    
    const stopBtn = document.getElementById('stripStopBtn');
    if (stopBtn) stopBtn.addEventListener('click', () => {});
    
    const settingsBtn = document.getElementById('triggerSettings');
    if (settingsBtn) settingsBtn.addEventListener('click', () => alert('Settings coming soon.'));
}

function getProject(id) { return state.projects.find(p => p.id === id) || { name: 'Internal', color: '#888' }; }
function getEmployee(id) { return state.employees.find(e => e.id === id); }

function getMockEmployees() { return [{ id: 'emp_1', name: 'Sophia Lin', role: 'Lead Developer', color: '#6366f1', avatar: 'SL' }]; }
function getMockProjects() { return [{ id: 'proj_1', name: 'Mars Rover UI', client: 'SpaceX', budget_hours: 120, color: '#a855f7' }]; }

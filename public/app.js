/* ==========================================================================
   CHRONOS FLOW - ADVANCED STATE & CONTROLLER CLIENT
   ========================================================================== */

// 1. Core Application State
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
    setupActiveTimerPersistence();
    switchView(state.activeView);
    startDashboardClock();
  });
});

// 3. PWA Service Worker
function setupPWAServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.error('SW Error:', err));
  }
}

// 4. API Service
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
    state.employees = JSON.parse(localStorage.getItem('chronos_employees')) || [];
    state.projects = JSON.parse(localStorage.getItem('chronos_projects')) || [];
    state.timeEntries = JSON.parse(localStorage.getItem('chronos_entries')) || [];
  }
}

// 5. Dashboard Clock
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

// 6. View Controller
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
    // Filter for entries that have NO end_time (Active Timers)
    const activeTimers = state.timeEntries.filter(e => !e.end_time);

    // Group active timers by project
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
                // Calculate elapsed time from start_time to now
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
                    </div>
                `;
            }).join('');

            return `
                <div class="project-group">
                    <div class="project-header">
                        <span class="project-dot" style="background:${project.color}"></span>
                        ${project.name}
                    </div>
                    <div class="timers-grid">${timersList}</div>
                </div>
            `;
        }).join('');
    }

    container.innerHTML = `
        <div class="dashboard-container">
            <div class="clock-card glass-container">
                <div class="dashboard-time" id="dashboardTime">--:--:--</div>
                <div class="dashboard-date" id="dashboardDate">----, -- ---- ----</div>
            </div>

            <div class="active-timers-section">
                <div class="section-label">
                    <span class="pulse-emerald"></span>
                    Active Project Sessions
                </div>
                ${activeTimersHtml}
            </div>
        </div>
    `;
}

// Simplified renderers for other views (to keep file size manageable but functional)
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
        </div>
    `;
    document.getElementById('timerPlayBtn').addEventListener('click', () => {
        const pid = document.getElementById('timerProjectSelect').value;
        startTimer(pid, 'Development', 'Track Log');
    });
}

async function startTimer(projectId, task, description) {
    const entry = {
        employee_id: state.activeProfileId,
        project_id: projectId,
        task: task,
        description: description,
        start_time: new Date().toISOString(),
        total_hours: 0
    };
    try {
        const saved = await apiRequest('/api/entries', { method: 'POST', body: JSON.stringify(entry) });
        state.timeEntries.unshift(saved);
        switchView('dashboard');
    } catch (e) {
        showNotification('Failed to start timer.', 'error');
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
    container.innerHTML = `<div class="view-header"><h2>Timesheets</h2></div><p>Database view coming soon...</p>`;
}

// Utilities
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
    document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', (e) => switchView(e.currentTarget.getAttribute('data-view'))));
    document.getElementById('triggerSettings').addEventListener('click', () => showNotification('Settings menu coming soon.', 'info'));
}

function getProject(id) { return state.projects.find(p => p.id === id) || { name: 'Internal', color: '#888' }; }
function getEmployee(id) { return state.employees.find(e => e.id === id); }

function setupActiveTimerPersistence() {}
function updateClockDisplays() {}
function updateFloatingTimerStrip() {}

function showNotification(msg, type) {
    const c = document.getElementById('notificationContainer');
    if (!c) return;
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = msg;
    c.appendChild(n);
    setTimeout(() => n.remove(), 3000);
}

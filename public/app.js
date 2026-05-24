/* ==========================================================================
   CHRONOS FLOW - ADVANCED STATE & CONTROLLER CLIENT
   ========================================================================== */

// 1. Core Application State
const state = {
  employees: [],
  projects: [],
  timeEntries: [],
  activeProfileId: 'emp_1', // Default simulation profile (Sophia Lin)
  activeView: 'dashboard',
  isOnline: navigator.onLine,
  
  // Timer State
  activeTimer: {
    running: false,
    startTime: null,
    secondsElapsed: 0,
    projectId: '',
    task: 'Development',
    description: '',
    intervalId: null
  },
  
  // Offline State Queue
  offlineQueue: JSON.parse(localStorage.getItem('chronos_offline_queue')) || [],
  
  // HR Configuration settings
  hrConfig: JSON.parse(localStorage.getItem('chronos_hr_config')) || {
    email: 'hr@company.com',
    webhook: ''
  }
};

// Base API Endpoint Configuration - Use relative URL for maximum reliability
const API_BASE = window.location.origin;

// 2. Initialize Application
window.addEventListener('DOMContentLoaded', () => {
  setupNetworkMonitoring();
  setupPWAServiceWorker();
  initializeState().then(() => {
    setupGlobalEventListeners();
    setupActiveTimerPersistence();
    switchView(state.activeView);
  });
});

// 3. PWA Service Worker Registration
function setupPWAServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Chronos Service Worker registered successfully.', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  }
}

// 4. API Service Integrations
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaultHeaders = { 'Content-Type': 'application/json' };
  options.headers = { ...defaultHeaders, ...options.headers };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    // If successful, ensure we are marked as online
    if (!state.isOnline) toggleOnlineStatus(true);
    return await response.json();
  } catch (error) {
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      toggleOnlineStatus(false);
      throw new Error('NETWORK_DISCONNECTED');
    }
    throw error;
  }
}

// Hydrate state from local storage or server db
async function initializeState() {
  try {
    showNotification('Initializing Chronos Flow...', 'info', 1500);
    
    // Attempt to fetch from Server API
    const [employees, projects, entries] = await Promise.all([
      apiRequest('/api/employees'),
      apiRequest('/api/projects'),
      apiRequest('/api/entries')
    ]);
    
    state.employees = employees;
    state.projects = projects;
    state.timeEntries = entries;
    
    // Sync cache to local storage
    localStorage.setItem('chronos_employees', JSON.stringify(employees));
    localStorage.setItem('chronos_projects', JSON.stringify(projects));
    localStorage.setItem('chronos_entries', JSON.stringify(entries));
    toggleOnlineStatus(true);
  } catch (e) {
    console.warn('API connection failed. Loading local data buffers.', e.message);
    state.employees = JSON.parse(localStorage.getItem('chronos_employees')) || getMockEmployees();
    state.projects = JSON.parse(localStorage.getItem('chronos_projects')) || getMockProjects();
    state.timeEntries = JSON.parse(localStorage.getItem('chronos_entries')) || [];
    toggleOnlineStatus(false);
  }
}

// 5. Offline Reconciliation & Network Management
function setupNetworkMonitoring() {
  window.addEventListener('online', () => toggleOnlineStatus(true));
  window.addEventListener('offline', () => toggleOnlineStatus(false));
  
  // Initial check
  toggleOnlineStatus(navigator.onLine);
}

function toggleOnlineStatus(isOnline) {
  state.isOnline = isOnline;
  
  // Update Indicators in Sidebar & Header
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const mStatusDot = document.getElementById('mobileStatusDot');
  
  if (statusDot) {
    statusDot.className = isOnline ? 'status-dot online' : 'status-dot offline';
    statusText.textContent = isOnline ? 'Cloud Synced' : 'Offline Mode';
  }
  
  if (mStatusDot) {
    mStatusDot.className = isOnline ? 'status-dot online' : 'status-dot offline';
  }

  // If pending queue contains items and we just came online, run background reconciler
  if (isOnline && state.offlineQueue.length > 0) {
    reconcileOfflineQueue();
  }
}

// Reconcile and push offline time entry logs
async function reconcileOfflineQueue() {
  if (state.offlineQueue.length === 0) return;
  
  console.log(`Synchronizing ${state.offlineQueue.length} records offline queue...`);
  showNotification(`Syncing ${state.offlineQueue.length} offline records...`, 'info');
  
  try {
    const response = await apiRequest('/api/sync', {
      method: 'POST',
      body: JSON.stringify({ entries: state.offlineQueue })
    });
    
    if (response.status === 'success') {
      state.offlineQueue = [];
      localStorage.removeItem('chronos_offline_queue');
      showNotification('All records synced with main database!', 'success');
      await initializeState();
      switchView(state.activeView);
    }
  } catch (error) {
    console.error('Offline reconciliation failure:', error.message);
    showNotification('Database sync deferred. Retrying shortly.', 'warning');
  }
}

// Queues offline logs inside browser buffers
function queueOfflineOperation(entry) {
  state.offlineQueue.push(entry);
  localStorage.setItem('chronos_offline_queue', JSON.stringify(state.offlineQueue));
  
  // Merge instantly in-memory so view updates immediately
  const emp = getEmployee(entry.employee_id) || { name: 'Unknown', avatar: '??', color: '#888' };
  const proj = getProject(entry.project_id);
  
  state.timeEntries.unshift({
    ...entry,
    employee_name: emp.name,
    employee_avatar: emp.avatar,
    employee_color: emp.color,
    project_name: proj.name,
    project_color: proj.color,
    project_client: proj.client
  });
  
  localStorage.setItem('chronos_entries', JSON.stringify(state.timeEntries));
  showNotification('Saved to offline storage.', 'warning');
  switchView(state.activeView);
}

// ============================================
// TIMERS OPERATIONS & PERSISTENCE
// ============================================

function setupActiveTimerPersistence() {
  const cachedTimer = JSON.parse(localStorage.getItem('chronos_active_timer'));
  if (cachedTimer && cachedTimer.running) {
    const now = new Date();
    const elapsedSinceClose = Math.floor((now.getTime() - new Date(cachedTimer.startTime).getTime()) / 1000);
    
    state.activeTimer = {
      running: true,
      startTime: cachedTimer.startTime,
      secondsElapsed: elapsedSinceClose > 0 ? elapsedSinceClose : 0,
      projectId: cachedTimer.projectId,
      task: cachedTimer.task,
      description: cachedTimer.description,
      intervalId: null
    };
    
    startTimerInterval();
    updateFloatingTimerStrip();
  }
}

function startTimer(projectId, task, description) {
  if (state.activeTimer.running) return;

  const now = new Date();
  state.activeTimer = {
    running: true,
    startTime: now.toISOString(),
    secondsElapsed: 0,
    projectId,
    task,
    description,
    intervalId: null
  };

  saveActiveTimerToLocal();
  startTimerInterval();
  updateFloatingTimerStrip();
  showNotification('Timer started tracking!', 'success');
  if (state.activeView === 'timer') renderTimer();
}

function startTimerInterval() {
  if (state.activeTimer.intervalId) clearInterval(state.activeTimer.intervalId);
  state.activeTimer.intervalId = setInterval(() => {
    state.activeTimer.secondsElapsed++;
    saveActiveTimerToLocal();
    updateClockDisplays();
  }, 1000);
}

function pauseTimerToggle() {
  if (!state.activeTimer.running) return;
  const tickLabel = document.getElementById('timerStatusLabel');
  const stripPauseBtn = document.getElementById('stripPauseBtn');
  
  if (state.activeTimer.intervalId) {
    clearInterval(state.activeTimer.intervalId);
    state.activeTimer.intervalId = null;
    if (tickLabel) { tickLabel.textContent = 'Paused'; tickLabel.className = 'timer-status'; }
    if (stripPauseBtn) stripPauseBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    showNotification('Timer paused.', 'warning');
  } else {
    const adjustedStart = new Date();
    adjustedStart.setSeconds(adjustedStart.getSeconds() - state.activeTimer.secondsElapsed);
    state.activeTimer.startTime = adjustedStart.toISOString();
    startTimerInterval();
    if (tickLabel) { tickLabel.textContent = 'Tracking Live'; tickLabel.className = 'timer-status active'; }
    if (stripPauseBtn) stripPauseBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
    showNotification('Timer resumed tracking.', 'success');
  }
}

async function stopAndSaveTimer() {
  if (!state.activeTimer.running) return;
  if (state.activeTimer.intervalId) clearInterval(state.activeTimer.intervalId);
  
  const finalTimer = { ...state.activeTimer };
  state.activeTimer = { running: false, startTime: null, secondsElapsed: 0, projectId: '', task: 'Development', description: '', intervalId: null };
  localStorage.removeItem('chronos_active_timer');
  updateFloatingTimerStrip();

  const totalHours = parseFloat((finalTimer.secondsElapsed / 3600).toFixed(2));
  if (totalHours < 0.01) {
    showNotification('Session too short to record (< 36s).', 'warning');
    if (state.activeView === 'timer') renderTimer();
    return;
  }

  const entryPayload = {
    id: 'log_' + Date.now() + Math.random().toString(36).substr(2, 4),
    employee_id: state.activeProfileId,
    project_id: finalTimer.projectId,
    task: finalTimer.task,
    description: finalTimer.description || 'Continuous track log',
    start_time: finalTimer.startTime,
    end_time: new Date().toISOString(),
    total_hours: totalHours
  };

  try {
    if (state.isOnline) {
      const savedEntry = await apiRequest('/api/entries', { method: 'POST', body: JSON.stringify(entryPayload) });
      state.timeEntries.unshift(savedEntry);
      localStorage.setItem('chronos_entries', JSON.stringify(state.timeEntries));
      showNotification('Hours saved successfully!', 'success');
    } else {
      queueOfflineOperation(entryPayload);
    }
  } catch (err) {
    queueOfflineOperation(entryPayload);
  }
  switchView(state.activeView);
}

function saveActiveTimerToLocal() {
  localStorage.setItem('chronos_active_timer', JSON.stringify({
    running: state.activeTimer.running,
    startTime: state.activeTimer.startTime,
    projectId: state.activeTimer.projectId,
    task: state.activeTimer.task,
    description: state.activeTimer.description
  }));
}

function updateClockDisplays() {
  const hours = Math.floor(state.activeTimer.secondsElapsed / 3600);
  const minutes = Math.floor((state.activeTimer.secondsElapsed % 3600) / 60);
  const seconds = state.activeTimer.secondsElapsed % 60;
  const formatted = [hours, minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');

  const faceClock = document.getElementById('faceClock');
  if (faceClock) {
    faceClock.textContent = formatted;
    const ratio = Math.min(state.activeTimer.secondsElapsed / (8 * 3600), 1);
    const ringProgress = document.getElementById('ringProgress');
    if (ringProgress) ringProgress.style.strokeDashoffset = 785 - (ratio * 785);
  }

  const stripClock = document.getElementById('stripClock');
  if (stripClock) stripClock.textContent = formatted;
}

function updateFloatingTimerStrip() {
  const strip = document.getElementById('globalTimerStrip');
  if (!strip) return;
  if (state.activeTimer.running && state.activeView !== 'timer') {
    strip.classList.remove('hidden');
    const proj = getProject(state.activeTimer.projectId);
    document.getElementById('stripProject').textContent = proj ? proj.name : 'Unassigned';
    document.getElementById('stripTask').textContent = state.activeTimer.task;
    updateClockDisplays();
  } else {
    strip.classList.add('hidden');
  }
}

// ============================================
// ROUTING & VIEW CONTROLLERS
// ============================================

function switchView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.getAttribute('data-view') === viewName));
  document.querySelectorAll('.mobile-nav-item').forEach(item => item.classList.toggle('active', item.getAttribute('data-view') === viewName));
  updateFloatingTimerStrip();

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
  const activeEmpLogs = state.timeEntries.filter(e => e.employee_id === state.activeProfileId);
  const totalHoursLogged = activeEmpLogs.reduce((sum, entry) => sum + entry.total_hours, 0);
  const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weeklyHours = activeEmpLogs.filter(e => new Date(e.start_time) >= oneWeekAgo).reduce((sum, entry) => sum + entry.total_hours, 0);

  let budgetWarnings = 0;
  state.projects.forEach(proj => {
    const loggedHours = state.timeEntries.filter(e => e.project_id === proj.id).reduce((sum, e) => sum + e.total_hours, 0);
    if (proj.budget_hours > 0 && loggedHours >= proj.budget_hours) budgetWarnings++;
  });

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title"><h2>Chronos Command Center</h2><p>Aesthetic performance tracker for assigned enterprise assets.</p></div>
      <div class="view-actions"><button class="btn primary" id="triggerManualLog"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Log Hours</button></div>
    </div>
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-card-header"><span>Your Total Hours</span></div>
        <div class="metric-value">${totalHoursLogged.toFixed(1)} hrs</div>
      </div>
      <div class="metric-card cyan">
        <div class="metric-card-header"><span>Weekly Target (7d)</span></div>
        <div class="metric-value">${weeklyHours.toFixed(1)} hrs</div>
      </div>
      <div class="metric-card ${budgetWarnings > 0 ? 'rose' : ''}">
        <div class="metric-card-header"><span>Budget Alerts</span></div>
        <div class="metric-value">${budgetWarnings} Caps</div>
      </div>
    </div>
    <div class="dashboard-grid">
      <div class="section-panel glass-container">
        <div class="panel-header"><h3>Recent Activities</h3><button class="btn outline" onclick="switchView('timesheets')">View All</button></div>
        <div class="feed-list" id="dashboardFeedList"></div>
      </div>
      <div class="section-panel glass-container">
        <div class="panel-header"><h3>Project Allocation</h3></div>
        <div class="chart-container" id="donutChartContainer"></div>
      </div>
    </div>
  `;

  const feedContainer = document.getElementById('dashboardFeedList');
  if (activeEmpLogs.length === 0) {
    feedContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">No activities recorded yet.</div>`;
  } else {
    feedContainer.innerHTML = activeEmpLogs.slice(0, 5).map(entry => {
      const proj = getProject(entry.project_id);
      return `
        <div class="feed-item glass-panel">
          <div class="feed-info"><div class="feed-title">${entry.description}</div><div class="feed-subtitle">${proj ? proj.name : 'Internal'} &bull; ${entry.task}</div></div>
          <div class="feed-hours">+${entry.total_hours.toFixed(1)}h</div>
        </div>`;
    }).join('');
  }
  renderDonutChart(activeEmpLogs);
  document.getElementById('triggerManualLog').addEventListener('click', () => openModal('manualLogModal'));
}

function renderDonutChart(userLogs) {
  const container = document.getElementById('donutChartContainer');
  if (!container) return;
  const projMap = {};
  userLogs.forEach(log => projMap[log.project_id] = (projMap[log.project_id] || 0) + log.total_hours);
  const chartData = Object.entries(projMap).map(([pid, hours]) => ({ name: getProject(pid).name, color: getProject(pid).color, hours }));
  const total = chartData.reduce((s, i) => s + i.hours, 0);
  if (total === 0) { container.innerHTML = `<p>Log hours to see analytics.</p>`; return; }
  
  container.innerHTML = `<div class="chart-legend">` + chartData.map(i => `<div class="legend-item"><span class="legend-dot" style="background:${i.color}"></span><span>${i.name}: ${i.hours.toFixed(1)}h</span></div>`).join('') + `</div>`;
}

function renderTimer(container) {
  const projectOptions = state.projects.map(p => `<option value="${p.id}" ${state.activeTimer.projectId === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
  const isRunning = state.activeTimer.running;
  container.innerHTML = `
    <div class="view-header"><h2>Live Tracker</h2></div>
    <div class="timer-view-container">
      <div class="timer-face"><div class="timer-clock" id="faceClock">00:00:00</div><div class="timer-status" id="timerStatusLabel">${isRunning ? 'Tracking' : 'Idle'}</div></div>
      <div class="timer-config-card glass-container">
        <select id="timerProjectSelect">${projectOptions}</select>
        <div class="timer-big-controls">
          <button class="big-timer-btn play" id="timerPlayBtn">START</button>
          <button class="big-timer-btn stop" id="timerStopBtn">STOP</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('timerPlayBtn').addEventListener('click', () => startTimer(document.getElementById('timerProjectSelect').value, 'Development', 'Track Log'));
  document.getElementById('timerStopBtn').addEventListener('click', stopAndSaveTimer);
  if (isRunning) updateClockDisplays();
}

function renderProjects(container) {
  const cardsHtml = state.projects.map(proj => {
    const logged = state.timeEntries.filter(e => e.project_id === proj.id).reduce((s, e) => s + e.total_hours, 0);
    const percent = proj.budget_hours > 0 ? Math.min((logged / proj.budget_hours) * 100, 100) : 0;
    return `
      <div class="project-card glass-container">
        <h3>${proj.name}</h3><p>${proj.client}</p>
        <div class="project-metrics"><span>${logged.toFixed(1)} hrs</span><span>${proj.budget_hours}h Budget</span></div>
        <div class="project-progress-bar"><div class="project-progress-fill" style="width:${percent}%; background:${proj.color}"></div></div>
      </div>`;
  }).join('');
  container.innerHTML = `<div class="view-header"><h2>Enterprise Assets</h2><button class="btn primary" id="triggerAddProject">Add Project</button></div><div class="projects-grid">${cardsHtml}</div>`;
  document.getElementById('triggerAddProject').addEventListener('click', () => openModal('projectModal'));
}

function renderTeam(container) {
  const rowsHtml = state.employees.map(emp => {
    const logged = state.timeEntries.filter(e => e.employee_id === emp.id).reduce((s, e) => s + e.total_hours, 0);
    return `<tr><td>${emp.name}</td><td>${emp.role}</td><td>${logged.toFixed(1)} hrs</td></tr>`;
  }).join('');
  container.innerHTML = `<div class="view-header"><h2>Team Roster</h2><button class="btn primary" id="triggerAddTeam">Add Member</button></div><table><thead><tr><th>Name</th><th>Role</th><th>Hours</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
  document.getElementById('triggerAddTeam').addEventListener('click', () => openModal('teamModal'));
}

function renderTimesheets(container) {
  const rowsHtml = state.timeEntries.map(e => `<tr><td>${e.start_time.split('T')[0]}</td><td>${getEmployee(e.employee_id)?.name || 'Unknown'}</td><td>${getProject(e.project_id).name}</td><td>${e.total_hours.toFixed(1)}</td></tr>`).join('');
  container.innerHTML = `<div class="view-header"><h2>Timesheet Database</h2><button class="btn primary" id="triggerHrSendBtn">Transmit to HR</button></div><table><thead><tr><th>Date</th><th>Member</th><th>Project</th><th>Hours</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
  document.getElementById('triggerHrSendBtn').addEventListener('click', triggerHrDispatchFlow);
}

// ============================================
// CRUD SUBMIT ACTIONS
// ============================================

function setupGlobalEventListeners() {
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', (e) => switchView(e.currentTarget.getAttribute('data-view'))));
  document.querySelectorAll('.mobile-nav-item').forEach(item => item.addEventListener('click', (e) => switchView(e.currentTarget.getAttribute('data-view'))));
  
  document.getElementById('stripPauseBtn').addEventListener('click', pauseTimerToggle);
  document.getElementById('stripStopBtn').addEventListener('click', stopAndSaveTimer);
  
  document.getElementById('triggerSettings').addEventListener('click', () => openModal('settingsModal'));
  document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', (e) => closeModal(e.target.closest('.modal-overlay').id)));
}

// Helpers
function getProject(id) { return state.projects.find(p => p.id === id) || { id, name: id, color: '#888', client: 'Internal' }; }
function getEmployee(id) { return state.employees.find(e => e.id === id); }

function openModal(id) {
  const m = document.getElementById(id);
  m.style.display = 'flex';
  if (id === 'manualLogModal') {
    document.getElementById('manualProject').innerHTML = state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    document.getElementById('manualDate').value = new Date().toISOString().split('T')[0];
  }
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function showNotification(message, type = 'success', duration = 3500) {
  const container = document.getElementById('notificationContainer');
  if (!container) return;
  const notify = document.createElement('div');
  notify.className = `notification ${type}`;
  notify.textContent = message;
  container.appendChild(notify);
  setTimeout(() => notify.remove(), duration);
}

function getMockEmployees() { return [{ id: 'emp_1', name: 'Sophia Lin', role: 'Lead Developer', color: '#6366f1', avatar: 'SL' }]; }
function getMockProjects() { return [{ id: 'proj_1', name: 'Mars Rover UI', client: 'SpaceX', budget_hours: 120, color: '#a855f7' }]; }

async function triggerHrDispatchFlow() {
  showNotification('Compiling report...', 'info');
  try {
    const res = await apiRequest('/api/hr/dispatch', { method: 'POST', body: JSON.stringify({ hr_email: state.hrConfig.email }) });
    showNotification('Report sent to HR!', 'success');
  } catch (e) {
    showNotification('Dispatch failed.', 'error');
  }
}

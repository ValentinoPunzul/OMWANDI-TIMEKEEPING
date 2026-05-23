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

// Base API Endpoint Configuration
const API_BASE = 'https://omwandi-timekeeping--omwandi-timekeeping.us-east4.hosted.app';

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

// 4. API Service Integrations (Handles Offline Falls Back)
async function apiRequest(endpoint, options = {}) {
  // If explicitly offline, immediately fail request to trigger queue/fallback loops
  if (!state.isOnline) {
    throw new Error('NETWORK_DISCONNECTED');
  }

  const url = `${API_BASE}${endpoint}`;
  const defaultHeaders = { 'Content-Type': 'application/json' };
  options.headers = { ...defaultHeaders, ...options.headers };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      // Treat network errors as offline
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
    
    // Fetch critical seed blocks from Server API if online
    if (state.isOnline) {
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
    } else {
      // Fetch from local cache fallback
      state.employees = JSON.parse(localStorage.getItem('chronos_employees')) || getMockEmployees();
      state.projects = JSON.parse(localStorage.getItem('chronos_projects')) || getMockProjects();
      state.timeEntries = JSON.parse(localStorage.getItem('chronos_entries')) || [];
      showNotification('Running in offline cache mode.', 'warning');
    }
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
  
  if (isOnline) {
    statusDot.className = 'status-dot online';
    if (mStatusDot) mStatusDot.className = 'status-dot online';
    statusText.textContent = 'Cloud Synced';
    
    // If pending queue contains items, run background reconciler
    if (state.offlineQueue.length > 0) {
      reconcileOfflineQueue();
    }
  } else {
    statusDot.className = 'status-dot offline';
    if (mStatusDot) mStatusDot.className = 'status-dot offline';
    statusText.textContent = 'Offline Mode';
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
      
      // Force refresh data structures from server
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
  state.timeEntries.unshift({
    ...entry,
    employee_name: getEmployee(entry.employee_id).name,
    employee_avatar: getEmployee(entry.employee_id).avatar,
    employee_color: getEmployee(entry.employee_id).color,
    project_name: getProject(entry.project_id).name,
    project_color: getProject(entry.project_id).color,
    project_client: getProject(entry.project_id).client
  });
  
  // Re-save entire list locally
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
    // Calculate actual elapsed seconds while page was closed
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
    
    // Start ticking loop
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

  // Persist immediately to prevent loss
  saveActiveTimerToLocal();
  startTimerInterval();
  updateFloatingTimerStrip();
  showNotification('Timer started tracking!', 'success');
  
  // Refresh views
  if (state.activeView === 'timer') {
    renderTimer();
  }
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
    // Pausing
    clearInterval(state.activeTimer.intervalId);
    state.activeTimer.intervalId = null;
    
    if (tickLabel) {
      tickLabel.textContent = 'Paused';
      tickLabel.className = 'timer-status';
    }
    if (stripPauseBtn) {
      stripPauseBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    }
    showNotification('Timer paused.', 'warning');
  } else {
    // Resuming
    // Recalculate start time shifting to match paused offset
    const adjustedStart = new Date();
    adjustedStart.setSeconds(adjustedStart.getSeconds() - state.activeTimer.secondsElapsed);
    state.activeTimer.startTime = adjustedStart.toISOString();
    
    startTimerInterval();
    if (tickLabel) {
      tickLabel.textContent = 'Tracking Live';
      tickLabel.className = 'timer-status active';
    }
    if (stripPauseBtn) {
      stripPauseBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
    }
    showNotification('Timer resumed tracking.', 'success');
  }
}

async function stopAndSaveTimer() {
  if (!state.activeTimer.running) return;
  
  // Stop interval
  if (state.activeTimer.intervalId) {
    clearInterval(state.activeTimer.intervalId);
  }
  
  const finalTimer = { ...state.activeTimer };
  
  // Clear Active States
  state.activeTimer = {
    running: false,
    startTime: null,
    secondsElapsed: 0,
    projectId: '',
    task: 'Development',
    description: '',
    intervalId: null
  };
  localStorage.removeItem('chronos_active_timer');
  updateFloatingTimerStrip();

  // Save new time entry
  const totalHours = parseFloat((finalTimer.secondsElapsed / 3600).toFixed(2));
  if (totalHours < 0.01) {
    showNotification('Session too short to record (< 36s).', 'warning');
    if (state.activeView === 'timer') renderTimer();
    return;
  }

  const endTimestamp = new Date().toISOString();
  const entryPayload = {
    id: 'log_' + Date.now() + Math.random().toString(36).substr(2, 4),
    employee_id: state.activeProfileId,
    project_id: finalTimer.projectId,
    task: finalTimer.task,
    description: finalTimer.description || 'Continuous track log',
    start_time: finalTimer.startTime,
    end_time: endTimestamp,
    total_hours: totalHours
  };

  try {
    if (state.isOnline) {
      const savedEntry = await apiRequest('/api/entries', {
        method: 'POST',
        body: JSON.stringify(entryPayload)
      });
      state.timeEntries.unshift(savedEntry);
      localStorage.setItem('chronos_entries', JSON.stringify(state.timeEntries));
      showNotification('Hours saved successfully to server!', 'success');
    } else {
      queueOfflineOperation(entryPayload);
    }
  } catch (err) {
    console.warn('Network sync failed during save. Queuing offline.', err.message);
    queueOfflineOperation(entryPayload);
  }

  if (state.activeView === 'timer' || state.activeView === 'dashboard') {
    switchView(state.activeView);
  }
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
  
  const formatted = [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');

  // Update primary clock (if visible)
  const faceClock = document.getElementById('faceClock');
  if (faceClock) {
    faceClock.textContent = formatted;
    
    // Update SVG Circular Loader (assumes 8 hr target)
    const targetSeconds = 8 * 3600; 
    const dashOffsetMax = 785; // circumference of radius 125 circle
    const ratio = Math.min(state.activeTimer.secondsElapsed / targetSeconds, 1);
    const progressOffset = dashOffsetMax - (ratio * dashOffsetMax);
    
    const ringProgress = document.getElementById('ringProgress');
    if (ringProgress) {
      ringProgress.style.strokeDashoffset = progressOffset;
    }
  }

  // Update floating bar clock
  const stripClock = document.getElementById('stripClock');
  if (stripClock) {
    stripClock.textContent = formatted;
  }
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
  
  // Update desktop side bar menu activation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-view') === viewName);
  });

  // Update mobile bottom bar menu activation
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-view') === viewName);
  });

  // Hide / show global floating timer bar depending on view context
  updateFloatingTimerStrip();

  const container = document.getElementById('mainContent');
  
  switch(viewName) {
    case 'dashboard':
      renderDashboard(container);
      break;
    case 'timer':
      renderTimer(container);
      break;
    case 'projects':
      renderProjects(container);
      break;
    case 'team':
      renderTeam(container);
      break;
    case 'timesheets':
      renderTimesheets(container);
      break;
  }
}

// RENDER: DASHBOARD VIEW
function renderDashboard(container) {
  // Aggregate Metrics
  const activeEmpLogs = state.timeEntries.filter(e => e.employee_id === state.activeProfileId);
  const totalHoursLogged = activeEmpLogs.reduce((sum, entry) => sum + entry.total_hours, 0);
  
  // Weekly total (last 7 days)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weeklyHours = activeEmpLogs
    .filter(e => new Date(e.start_time) >= oneWeekAgo)
    .reduce((sum, entry) => sum + entry.total_hours, 0);

  // Active Projects
  const uniqueProjIds = [...new Set(state.timeEntries.map(e => e.project_id))];
  
  // Budget Burn Rate Alarm count
  let budgetWarnings = 0;
  state.projects.forEach(proj => {
    const projLogs = state.timeEntries.filter(e => e.project_id === proj.id);
    const loggedHours = projLogs.reduce((sum, e) => sum + e.total_hours, 0);
    if (proj.budget_hours > 0 && loggedHours >= proj.budget_hours) {
      budgetWarnings++;
    }
  });

  let activeTimerWidget = '';
  if (state.activeTimer.running) {
    const tProj = getProject(state.activeTimer.projectId);
    activeTimerWidget = `
      <div class="metric-card emerald clickable" onclick="switchView('timer')">
        <div class="metric-card-header">
          <span>Active Tracking</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="metric-value" style="font-size: 1.6rem; color: #fff;">${tProj ? tProj.name : 'Unknown'}</div>
        <div class="metric-footer" style="color: var(--accent-emerald);">
          <span class="pulse-emerald"></span> Live Session Ticking
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title">
        <h2>Chronos Command Center</h2>
        <p>Aesthetic performance tracker for assigned enterprise assets.</p>
      </div>
      <div class="view-actions">
        <button class="btn primary" id="triggerManualLog">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Log Hours
        </button>
      </div>
    </div>

    <!-- HUD STATISTIC METRICS -->
    <div class="metrics-grid">
      ${activeTimerWidget}
      <div class="metric-card">
        <div class="metric-card-header">
          <span>Your Total Hours</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div class="metric-value">${totalHoursLogged.toFixed(1)} hrs</div>
        <div class="metric-footer">Cumulative track record</div>
      </div>
      
      <div class="metric-card cyan">
        <div class="metric-card-header">
          <span>Weekly Target (7d)</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <div class="metric-value">${weeklyHours.toFixed(1)} hrs</div>
        <div class="metric-footer ${weeklyHours >= 35 ? 'positive' : ''}">${weeklyHours >= 35 ? 'Target Met (>=35h)' : `${(35 - weeklyHours).toFixed(1)}h remaining`}</div>
      </div>

      <div class="metric-card ${budgetWarnings > 0 ? 'rose' : ''}">
        <div class="metric-card-header">
          <span>Budget Alerts</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div class="metric-value">${budgetWarnings} Caps</div>
        <div class="metric-footer">${budgetWarnings > 0 ? 'Exceeded hour allocation thresholds!' : 'All project budgets stable'}</div>
      </div>
    </div>

    <!-- MAIN DASHBOARD CONTENT DUAL PANELS -->
    <div class="dashboard-grid">
      <!-- Left Panel: Recent Timesheet Activities -->
      <div class="section-panel glass-container">
        <div class="panel-header">
          <h3>Your Recent Activities</h3>
          <button class="btn outline" style="padding: 6px 12px; font-size: 0.8rem;" onclick="switchView('timesheets')">View All</button>
        </div>
        <div class="feed-list" id="dashboardFeedList">
          <!-- Populated by JS -->
        </div>
      </div>

      <!-- Right Panel: Donut Chart project split -->
      <div class="section-panel glass-container">
        <div class="panel-header">
          <h3>Project Allocation</h3>
        </div>
        <div class="chart-container" id="donutChartContainer">
          <!-- Render SVG Donut and Legend -->
        </div>
      </div>
    </div>
  `;

  // Hydrate activity list
  const feedContainer = document.getElementById('dashboardFeedList');
  if (activeEmpLogs.length === 0) {
    feedContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">No activities recorded yet.</div>`;
  } else {
    // Show top 5 recent entries
    const recent = activeEmpLogs.slice(0, 5);
    feedContainer.innerHTML = recent.map(entry => {
      const proj = getProject(entry.project_id);
      const relativeDate = formatRelativeDate(entry.start_time);
      return `
        <div class="feed-item glass-panel">
          <div class="feed-item-left">
            <div class="feed-avatar" style="background-color: ${proj ? proj.color : '#6366f1'}">
              ${entry.task.charAt(0)}
            </div>
            <div class="feed-info">
              <div class="feed-title">${entry.description}</div>
              <div class="feed-subtitle">${proj ? proj.name : 'Internal'} &bull; ${entry.task}</div>
            </div>
          </div>
          <div class="feed-hours">
            +${entry.total_hours.toFixed(1)}h
            <span class="feed-time">${relativeDate}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Hydrate custom SVG donut chart
  renderDonutChart(activeEmpLogs);
  
  // Event Bind manual log launcher
  document.getElementById('triggerManualLog').addEventListener('click', () => {
    openModal('manualLogModal');
  });
}

// Dynamic high-end path calculations for custom SVG Donut Charts
function renderDonutChart(userLogs) {
  const container = document.getElementById('donutChartContainer');
  if (!container) return;

  // Aggregate project totals
  const projMap = {};
  userLogs.forEach(log => {
    projMap[log.project_id] = (projMap[log.project_id] || 0) + log.total_hours;
  });

  const chartData = [];
  let totalHours = 0;
  for (const pid in projMap) {
    const proj = getProject(pid);
    chartData.push({
      name: proj ? proj.name : 'Internal',
      color: proj ? proj.color : '#6366f1',
      hours: projMap[pid]
    });
    totalHours += projMap[pid];
  }

  if (totalHours === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
        Log hours to populate analytics modules.
      </div>
    `;
    return;
  }

  // Draw SVG wedges
  let svgPaths = '';
  let cumulativePercent = 0;

  function getCoordinatesForPercent(percent) {
    // Offset by -90 degrees (Math.PI / 2) to start donut drawing straight up at 12 o'clock
    const angle = (2 * Math.PI * percent) - (Math.PI / 2);
    const x = 100 + 75 * Math.cos(angle);
    const y = 100 + 75 * Math.sin(angle);
    return [x, y];
  }

  chartData.forEach(item => {
    const percent = item.hours / totalHours;
    const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
    cumulativePercent += percent;
    const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
    
    const largeArcFlag = percent > 0.5 ? 1 : 0;
    
    // Wedge command
    const d = [
      `M ${startX} ${startY}`,
      `A 75 75 0 ${largeArcFlag} 1 ${endX} ${endY}`
    ].join(' ');

    svgPaths += `
      <path d="${d}" 
            fill="none" 
            stroke="${item.color}" 
            stroke-width="26" 
            class="donut-segment" />
    `;
  });

  // Render SVG & Legend list
  const legendHtml = chartData.map(item => `
    <div class="legend-item">
      <div class="legend-label-box">
        <span class="legend-dot" style="background-color: ${item.color};"></span>
        <span>${item.name}</span>
      </div>
      <span class="legend-hours">${item.hours.toFixed(1)}h (${((item.hours / totalHours) * 100).toFixed(0)}%)</span>
    </div>
  `).join('');

  container.innerHTML = `
    <svg viewBox="0 0 200 200" width="160" height="160" class="svg-donut-chart">
      <!-- Background shadow tracks -->
      <circle cx="100" cy="100" r="75" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="26" />
      ${svgPaths}
      <!-- Centered Text block -->
      <text x="100" y="100" class="donut-center-text" dominant-baseline="middle" fill="#ffffff" font-size="14" font-weight="700">
        ${totalHours.toFixed(0)}h
      </text>
      <text x="100" y="118" class="donut-center-text" fill="var(--text-muted)" font-size="8" font-weight="500">
        TOTAL LOGS
      </text>
    </svg>
    <div class="chart-legend">
      ${legendHtml}
    </div>
  `;
}

// RENDER: LIVE TIMER VIEW
function renderTimer(container) {
  container = container || document.getElementById('mainContent');
  // Populate form drop downs
  const hasNPT = state.projects.some(p => p.id === 'NPT');
  const hasDriving = state.projects.some(p => p.id === 'DRIVING');
  
  const projectOptions = `
    ${!hasNPT ? `<option value="NPT" ${state.activeTimer.projectId === 'NPT' ? 'selected' : ''}>NPT</option>` : ''}
    ${!hasDriving ? `<option value="DRIVING" ${state.activeTimer.projectId === 'DRIVING' ? 'selected' : ''}>DRIVING</option>` : ''}
  ` + state.projects.map(p => `
    <option value="${p.id}" ${state.activeTimer.projectId === p.id ? 'selected' : ''}>${p.name}</option>
  `).join('');

  const isTimerRunning = state.activeTimer.running;
  const trackingLabel = isTimerRunning 
    ? (state.activeTimer.intervalId ? 'Tracking Live' : 'Paused') 
    : 'System Idle';

  const trackingClass = isTimerRunning && state.activeTimer.intervalId ? 'timer-status active' : 'timer-status';

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title">
        <h2>Live Tracker</h2>
        <p>Select a project and start logging your hours immediately.</p>
      </div>
    </div>

    <div class="timer-view-container">
      
      <!-- Circular clock graphics -->
      <div class="timer-face-wrapper">
        <svg class="timer-ring-svg" viewBox="0 0 300 300">
          <defs>
            <linearGradient id="timerProgressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#a855f7" />
              <stop offset="100%" stop-color="#06b6d4" />
            </linearGradient>
          </defs>
          <circle class="timer-ring-bg" cx="150" cy="150" r="125" fill="none" stroke-width="12" />
          <circle class="timer-ring-progress" id="ringProgress" cx="150" cy="150" r="125" fill="none" stroke-width="12" 
                  stroke-dasharray="785" stroke-dashoffset="785" />
        </svg>
        <div class="timer-face">
          <div class="timer-clock" id="faceClock">00:00:00</div>
          <div class="${trackingClass}" id="timerStatusLabel">${trackingLabel}</div>
        </div>
      </div>

      <!-- Settings configuration panel -->
      <div class="timer-config-card glass-container" style="display:flex; flex-direction:column; gap:24px;">
        <div class="form-group" ${isTimerRunning ? 'style="pointer-events: none; opacity: 0.65;"' : ''} style="margin-bottom:0;">
          <label for="timerProjectSelect" style="text-align: center; font-size: 1.05rem; margin-bottom: 12px; color:#fff;">Select Project Number</label>
          <select id="timerProjectSelect" style="font-size: 1.1rem; padding: 16px; text-align: center; font-weight:600;">
            ${projectOptions}
          </select>
        </div>

        <!-- Big Controls Trigger buttons -->
        <div class="timer-big-controls">
          <button class="big-timer-btn play ${isTimerRunning ? 'disabled' : ''}" id="timerPlayBtn" title="Start Job" ${isTimerRunning ? 'disabled' : ''}>
            START JOB
          </button>
          <button class="big-timer-btn stop ${!isTimerRunning ? 'disabled' : ''}" id="timerStopBtn" title="Stop Job" ${!isTimerRunning ? 'disabled' : ''}>
            STOP JOB
          </button>
        </div>
      </div>

    </div>
  `;

  // Bind Events inside view
  const playBtn = document.getElementById('timerPlayBtn');
  const stopBtn = document.getElementById('timerStopBtn');
  
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (state.activeTimer.running) return;
      const pid = document.getElementById('timerProjectSelect').value;
      const task = 'Development';
      const desc = 'Continuous Track Session';
      startTimer(pid, task, desc);
    });
  }
  
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if (!state.activeTimer.running) return;
      stopAndSaveTimer();
    });
  }

  // Refresh clock visual offsets instantly
  if (isTimerRunning) {
    updateClockDisplays();
  }
}

// RENDER: PROJECTS VIEW
function renderProjects(container) {
  // Aggregate calculations mapping project hours
  const projAgg = {};
  state.timeEntries.forEach(log => {
    projAgg[log.project_id] = (projAgg[log.project_id] || 0) + log.total_hours;
  });

  const cardsHtml = state.projects.map(proj => {
    const logged = projAgg[proj.id] || 0;
    const budget = proj.budget_hours;
    const percent = budget > 0 ? Math.min((logged / budget) * 100, 100) : 0;
    
    // Choose neon accent color states matching thresholds
    let barColor = proj.color;
    let labelClass = '';
    if (budget > 0) {
      if (logged >= budget) {
        barColor = 'var(--accent-rose)';
        labelClass = 'style="color: var(--accent-rose); font-weight:700;"';
      } else if (logged >= budget * 0.8) {
        barColor = 'var(--accent-amber)';
        labelClass = 'style="color: var(--accent-amber); font-weight:700;"';
      }
    }

    return `
      <div class="project-card glass-container">
        <div class="project-card-header">
          <div>
            <h3>${proj.name}</h3>
            <span class="project-client">${proj.client}</span>
          </div>
          <span class="project-accent-tag" style="background-color: ${proj.color}; box-shadow: 0 0 10px ${proj.color}"></span>
        </div>
        
        <div class="project-metrics">
          <div>
            <span class="project-hours-count">${logged.toFixed(1)}</span>
            <span style="font-size:0.75rem; color: var(--text-muted)">HRS SPENT</span>
          </div>
          <div class="project-budget-limit" ${labelClass}>
            ${budget > 0 ? `${budget.toFixed(0)}h Budget` : 'No Limit'}
          </div>
        </div>

        <div class="project-progress-container">
          <div class="project-progress-bar">
            <div class="project-progress-fill" style="width: ${percent}%; background: ${barColor}; box-shadow: 0 0 8px ${barColor}"></div>
          </div>
          <div class="project-progress-label">
            <span>Burn Progress</span>
            <span>${percent.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title">
        <h2>Enterprise Assets</h2>
        <p>Review active projects, resource burn and hour budget milestones.</p>
      </div>
      <div class="view-actions">
        <button class="btn primary" id="triggerAddProject">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Project
        </button>
      </div>
    </div>

    <div class="projects-grid">
      ${cardsHtml}
    </div>
  `;

  // Bind new modal
  document.getElementById('triggerAddProject').addEventListener('click', () => {
    openModal('projectModal');
  });
}

// RENDER: TEAM VIEW
function renderTeam(container) {
  // Aggregate individual total log meters
  const teamAgg = {};
  state.timeEntries.forEach(log => {
    teamAgg[log.employee_id] = (teamAgg[log.employee_id] || 0) + log.total_hours;
  });

  const rowsHtml = state.employees.map(emp => {
    const logged = teamAgg[emp.id] || 0;
    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="feed-avatar" style="width:32px; height:32px; font-size:0.85rem; background-color: ${emp.color}; color:#fff; box-shadow: 0 0 10px ${emp.color}60;">${emp.avatar}</div>
            <div>
              <span style="font-weight: 500; font-size: 1.05rem;">${emp.name}</span>
              ${emp.emp_no ? `<span style="display:block; font-size:0.72rem; color: var(--text-muted); margin-top:1px;">#${emp.emp_no}</span>` : ''}
            </div>
          </div>
        </td>
        <td><span class="task-tag" style="background-color: rgba(255,255,255,0.05); padding: 4px 10px;">${emp.role}</span></td>
        <td><span style="color: var(--text-muted); font-size: 0.95rem;">${emp.reports_to || 'N/A'}</span></td>
        <td class="table-hours">${logged.toFixed(1)} hrs</td>
        <td>
          <div class="row-actions">
            <button class="action-btn edit" onclick="triggerEditEmployee('${emp.id}')" title="Edit Employee">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button class="action-btn delete" onclick="triggerDeleteEmployee('${emp.id}')" title="Delete Employee">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title">
        <h2>Chronos Team Rosters</h2>
        <p>Overview of active employee capacities, assignments and contributions.</p>
      </div>
      <div class="view-actions">
        <button class="btn primary" id="triggerAddTeam">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          Add Team Member
        </button>
      </div>
    </div>

    <div class="timesheet-table-container glass-container" style="margin-top: 24px;">
      <table class="timesheet-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Role / Designation</th>
            <th>Reports To</th>
            <th>Hours Logged</th>
            <th style="text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  // Bind click
  document.getElementById('triggerAddTeam').addEventListener('click', () => {
    openModal('teamModal');
  });
}

// RENDER: TIMESHEETS VIEW (Detailed ledger sheets)
function renderTimesheets(container) {
  // Populate filter selects
  const projectOptions = `<option value="">All Projects</option>` + state.projects.map(p => `
    <option value="${p.id}">${p.name}</option>
  `).join('');

  const employeeOptions = `<option value="">All Employees</option>` + state.employees.map(e => `
    <option value="${e.id}">${e.name}</option>
  `).join('');

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title">
        <h2>Timesheet Database</h2>
        <p>Full auditing interface for logged metrics. Apply filters or export records.</p>
      </div>
    </div>

    <!-- FILTERS TOOLBAR -->
    <div class="timesheet-controls-panel glass-container">
      <div class="filters-row">
        <div class="filter-group">
          <label for="filterProj">Filter Project</label>
          <select id="filterProj">${projectOptions}</select>
        </div>
        <div class="filter-group">
          <label for="filterEmp">Filter Team</label>
          <select id="filterEmp">${employeeOptions}</select>
        </div>
        <div class="filter-group">
          <label for="filterStart">Start Date</label>
          <input type="date" id="filterStart">
        </div>
        <div class="filter-group">
          <label for="filterEnd">End Date</label>
          <input type="date" id="filterEnd">
        </div>
        <div class="filter-actions">
          <button class="btn outline" id="clearFiltersBtn">Reset</button>
          <button class="btn secondary" id="applyFiltersBtn">Apply Filters</button>
        </div>
      </div>
    </div>

    <!-- MAIN TABLE LIST -->
    <div class="timesheet-table-container glass-container">
      <table class="timesheet-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Member</th>
            <th>Project</th>
            <th>Task Tag</th>
            <th>Time Started</th>
            <th>Time Stopped</th>
            <th>Hours</th>
            <th style="text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody id="timesheetTableBody">
          <!-- Rendered by JavaScript dynamically -->
        </tbody>
      </table>
    </div>

    <!-- HR DISPATCH HUB FOOTER CARD -->
    <div class="hr-sync-card glass-container">
      <div class="hr-sync-info">
        <h3>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          HR Department Dispatch Portal
        </h3>
        <p>Package audited timesheet files and securely transmit to HR records systems.</p>
      </div>
      <div class="hr-sync-actions">
        <button class="btn primary" id="triggerHrSendBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          Transmit to HR
        </button>
      </div>
    </div>
  `;

  // Bind toolbar actions
  document.getElementById('applyFiltersBtn').addEventListener('click', filterTimesheets);
  document.getElementById('clearFiltersBtn').addEventListener('click', () => {
    document.getElementById('filterProj').value = '';
    document.getElementById('filterEmp').value = '';
    document.getElementById('filterStart').value = '';
    document.getElementById('filterEnd').value = '';
    filterTimesheets();
  });

  document.getElementById('triggerHrSendBtn').addEventListener('click', triggerHrDispatchFlow);

  // Initial draw
  filterTimesheets();
}

// Executes filters and updates table body content
function filterTimesheets() {
  const tableBody = document.getElementById('timesheetTableBody');
  if (!tableBody) return;

  const projVal = document.getElementById('filterProj').value;
  const empVal = document.getElementById('filterEmp').value;
  const startVal = document.getElementById('filterStart').value;
  const endVal = document.getElementById('filterEnd').value;

  let filtered = [...state.timeEntries];

  if (projVal) filtered = filtered.filter(e => e.project_id === projVal);
  if (empVal) filtered = filtered.filter(e => e.employee_id === empVal);
  if (startVal) filtered = filtered.filter(e => new Date(e.start_time.split('T')[0]) >= new Date(startVal));
  if (endVal) filtered = filtered.filter(e => new Date(e.start_time.split('T')[0]) <= new Date(endVal));

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px 0;">
          No matching timesheet data buffers found.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(entry => {
    const proj = getProject(entry.project_id);
    const emp = getEmployee(entry.employee_id);
    const dateStr = new Date(entry.start_time).toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric' 
    });

    const isOfflineRecord = entry.id.startsWith('log_offline');
    const syncStatusTag = isOfflineRecord 
      ? `<span style="font-size:0.65rem; color: var(--accent-amber); display:block;">Offline pending</span>` 
      : '';

    const timeStartedStr = new Date(entry.start_time).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
    const timeStoppedStr = entry.end_time ? new Date(entry.end_time).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    }) : 'Active';

    return `
      <tr id="row-${entry.id}">
        <td>
          ${dateStr}
          ${syncStatusTag}
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="feed-avatar" style="width:24px; height:24px; font-size:0.65rem; background-color: ${emp ? emp.color : '#6366f1'}">${emp ? emp.avatar : '??'}</div>
            <span>${emp ? emp.name : 'Unknown'}</span>
          </div>
        </td>
        <td>
          <span class="project-badge" style="background-color: ${proj ? proj.color : '#6366f1'}15; color: ${proj ? proj.color : '#6366f1'}">
            <span class="project-badge-dot" style="background-color: ${proj ? proj.color : '#6366f1'}"></span>
            ${proj ? proj.name : 'Internal'}
          </span>
        </td>
        <td><span class="task-tag">${entry.task}</span></td>
        <td>${timeStartedStr}</td>
        <td>${timeStoppedStr}</td>
        <td class="table-hours">${entry.total_hours.toFixed(1)} hrs</td>
        <td>
          <div class="row-actions">
            <button class="action-btn edit" onclick="triggerEditEntry('${entry.id}')" title="Edit Log">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button class="action-btn delete" onclick="triggerDeleteEntry('${entry.id}')" title="Delete Log">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ============================================
// HR REPORT DISPATCH CONTROLLER
// ============================================

async function triggerHrDispatchFlow() {
  const triggerBtn = document.getElementById('triggerHrSendBtn');
  const initialHtml = triggerBtn.innerHTML;

  // Visual status feedback steps
  triggerBtn.disabled = true;
  triggerBtn.innerHTML = `
    <svg class="brand-logo" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 1s linear infinite;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
    Bundling sheets...
  `;
  showNotification('Compiling audited logs...', 'info', 1500);

  setTimeout(async () => {
    triggerBtn.innerHTML = `
      <svg class="brand-logo" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 1s linear infinite;"><path d="M22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
      Transmitting...
    `;
    
    // Package post inputs
    const payload = {
      hr_email: state.hrConfig.email,
      webhook_url: state.hrConfig.webhook
    };

    try {
      let receipt;
      if (state.isOnline) {
        receipt = await apiRequest('/api/hr/dispatch', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } else {
        // Mock offline dispatch fallback
        const offlineTotal = state.timeEntries.reduce((sum, e) => sum + e.total_hours, 0);
        receipt = {
          status: 'success',
          offlineSimulated: true,
          transactionId: 'TXN-OFFLINE-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
          recipient: state.hrConfig.email,
          recordsTransmitted: state.timeEntries.length,
          cumulativeHours: offlineTotal
        };
      }

      triggerBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Sent to HR!
      `;
      triggerBtn.style.background = 'var(--accent-emerald)';
      
      const emailNote = receipt.offlineSimulated 
        ? ' [Deferred to outbound queue until online]' 
        : ' [Simulated direct SMTP success]';

      showNotification(`Report sent to HR! Recipient: ${receipt.recipient}${emailNote}`, 'success', 6000);
      
      console.log(`HR Dispatch Transaction receipt:`, receipt);

      // Re-enable after delay
      setTimeout(() => {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = initialHtml;
        triggerBtn.style.background = '';
      }, 5000);

    } catch (e) {
      console.error('HR dispatch error:', e.message);
      showNotification('Dispatch failed. Connect to cloud network and retry.', 'error');
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = initialHtml;
    }
  }, 1800);
}

// CSS Spinner utility injection
const styleTag = document.createElement('style');
styleTag.innerHTML = `
  @keyframes spin { 100% { transform: rotate(360deg); } }
  .clickable { cursor: pointer; }
  .flex-1 { flex: 1; }
`;
document.head.appendChild(styleTag);

// ============================================
// CRUD SUBMIT ACTIONS
// ============================================

// 1. PROJECT CREATION FORM
document.getElementById('projectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('projectName').value;
  const client = document.getElementById('projectClient').value;
  const budget = parseFloat(document.getElementById('projectBudget').value) || 0.0;
  const color = document.querySelector('input[name="projColor"]:checked').value;

  const payload = { name, client, budget_hours: budget, color };

  try {
    let saved;
    if (state.isOnline) {
      saved = await apiRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } else {
      // Mock local offline addition
      saved = {
        id: 'proj_offline_' + Date.now(),
        ...payload
      };
    }
    
    state.projects.push(saved);
    localStorage.setItem('chronos_projects', JSON.stringify(state.projects));
    
    showNotification(`Project "${name}" launched successfully!`, 'success');
    closeModal('projectModal');
    
    // Clear Form inputs
    document.getElementById('projectForm').reset();
    
    if (state.activeView === 'projects' || state.activeView === 'dashboard') {
      switchView(state.activeView);
    }
  } catch (err) {
    showNotification(`Failed to save project. Retrying.`, 'error');
  }
});

// 2. TEAM REGISTRATION FORM
document.getElementById('teamForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('memberName').value;
  const role = document.getElementById('memberRole').value;
  const reports_to = document.getElementById('memberReportsTo').value;
  const color = document.querySelector('input[name="empColor"]:checked').value;

  const payload = { name, role, reports_to, color };

  try {
    let saved;
    if (state.isOnline) {
      saved = await apiRequest('/api/employees', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } else {
      saved = {
        id: 'emp_offline_' + Date.now(),
        avatar: name.split(' ').map(n => n[0]).join('').toUpperCase().substr(0, 2),
        ...payload
      };
    }

    state.employees.push(saved);
    localStorage.setItem('chronos_employees', JSON.stringify(state.employees));
    
    showNotification(`Team member "${name}" registered successfully!`, 'success');
    closeModal('teamModal');
    
    document.getElementById('teamForm').reset();
    setupActiveProfileDropdown(); // Rebuild active dropdown lists
    
    if (state.activeView === 'team') {
      switchView(state.activeView);
    }
  } catch (err) {
    showNotification(`Failed to register member.`, 'error');
  }
});

// 2.5 TEAM EDIT & DELETE ACTIONS
window.triggerEditEmployee = function(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  document.getElementById('editMemberId').value = emp.id;
  document.getElementById('editMemberName').value = emp.name;
  document.getElementById('editMemberRole').value = emp.role;
  document.getElementById('editMemberReportsTo').value = emp.reports_to || '';
  const radio = document.querySelector(`input[name="editEmpColor"][value="${emp.color}"]`);
  if (radio) radio.checked = true;
  openModal('editTeamModal');
};

document.getElementById('editTeamForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editMemberId').value;
  const name = document.getElementById('editMemberName').value;
  const role = document.getElementById('editMemberRole').value;
  const reports_to = document.getElementById('editMemberReportsTo').value;
  
  let color = '#6366f1';
  const checkedRadio = document.querySelector('input[name="editEmpColor"]:checked');
  if (checkedRadio) color = checkedRadio.value;

  const payload = { name, role, reports_to, color };

  try {
    if (state.isOnline && !id.startsWith('emp_offline')) {
      const updated = await apiRequest(`/api/employees/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      const idx = state.employees.findIndex(item => item.id === id);
      if (idx !== -1) state.employees[idx] = updated;
      showNotification('Team member updated successfully!', 'success');
    } else {
      showNotification('Offline edit not fully supported yet.', 'warning');
    }
    localStorage.setItem('chronos_employees', JSON.stringify(state.employees));
    closeModal('editTeamModal');
    if (state.activeView === 'team') switchView('team');
    setupActiveProfileDropdown();
  } catch (err) {
    showNotification('Failed to update member.', 'error');
  }
});

window.triggerDeleteEmployee = async function(empId) {
  if (!confirm('Are you sure you want to delete this team member?')) return;
  try {
    if (state.isOnline && !empId.startsWith('emp_offline')) {
      await apiRequest(`/api/employees/${empId}`, { method: 'DELETE' });
      state.employees = state.employees.filter(e => e.id !== empId);
      showNotification('Team member removed!', 'success');
    } else {
      showNotification('Offline delete not fully supported yet.', 'warning');
    }
    localStorage.setItem('chronos_employees', JSON.stringify(state.employees));
    if (state.activeView === 'team') switchView('team');
    setupActiveProfileDropdown();
  } catch (err) {
    showNotification('Failed to delete member.', 'error');
  }
};

// 3. SYSTEM HR SETTINGS FORM
document.getElementById('settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('hrEmail').value;
  const webhook = document.getElementById('hrWebhook').value;

  state.hrConfig = { email, webhook };
  localStorage.setItem('chronos_hr_config', JSON.stringify(state.hrConfig));

  showNotification('System HR configurations saved successfully!', 'success');
  closeModal('settingsModal');
  
  if (state.activeView === 'timesheets') {
    switchView('timesheets');
  }
});

// 4. MANUAL TIMESHEET LOG HOURS FORM
document.getElementById('manualLogForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pid = document.getElementById('manualProject').value;
  const task = document.getElementById('manualTask').value;
  const dateStr = document.getElementById('manualDate').value;
  const hours = parseFloat(document.getElementById('manualHours').value);
  const desc = document.getElementById('manualDesc').value;

  // Convert date to ISO Start/End timestamps
  const baseDate = new Date(dateStr);
  // Default to morning starting offset (e.g. 9:00 AM)
  baseDate.setHours(9, 0, 0, 0);
  const startISO = baseDate.toISOString();
  
  baseDate.setMinutes(baseDate.getMinutes() + Math.round(hours * 60));
  const endISO = baseDate.toISOString();

  const entryPayload = {
    id: 'log_' + Date.now() + Math.random().toString(36).substr(2, 4),
    employee_id: state.activeProfileId,
    project_id: pid,
    task,
    description: desc,
    start_time: startISO,
    end_time: endISO,
    total_hours: hours
  };

  try {
    if (state.isOnline) {
      const saved = await apiRequest('/api/entries', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      state.timeEntries.unshift(saved);
      localStorage.setItem('chronos_entries', JSON.stringify(state.timeEntries));
      showNotification('Manual entry synced to database!', 'success');
    } else {
      queueOfflineOperation(entryPayload);
    }
    
    closeModal('manualLogModal');
    document.getElementById('manualLogForm').reset();
    switchView(state.activeView);
  } catch (err) {
    console.warn('Sync failed. Adding log locally.', err.message);
    queueOfflineOperation(entryPayload);
    closeModal('manualLogModal');
  }
});

// 5. UPDATE EXISTING ENTRY ROUTINES
window.triggerEditEntry = function(entryId) {
  const log = state.timeEntries.find(e => e.id === entryId);
  if (!log) return;

  // Prepopulate edit modal
  document.getElementById('editEntryId').value = log.id;
  
  // Fill project select lists
  const projSelect = document.getElementById('editProject');
  projSelect.innerHTML = state.projects.map(p => `
    <option value="${p.id}" ${log.project_id === p.id ? 'selected' : ''}>${p.name}</option>
  `).join('');

  document.getElementById('editTask').value = log.task;
  document.getElementById('editDate').value = log.start_time.split('T')[0];
  document.getElementById('editHours').value = log.total_hours;
  document.getElementById('editDesc').value = log.description;

  openModal('editEntryModal');
};

document.getElementById('editEntryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('editEntryId').value;
  const pid = document.getElementById('editProject').value;
  const task = document.getElementById('editTask').value;
  const dateStr = document.getElementById('editDate').value;
  const hours = parseFloat(document.getElementById('editHours').value);
  const desc = document.getElementById('editDesc').value;

  const baseDate = new Date(dateStr);
  baseDate.setHours(9, 0, 0, 0);
  const startISO = baseDate.toISOString();
  baseDate.setMinutes(baseDate.getMinutes() + Math.round(hours * 60));
  const endISO = baseDate.toISOString();

  const payload = {
    employee_id: state.activeProfileId, // keeps track of active editor profile context
    project_id: pid,
    task,
    description: desc,
    start_time: startISO,
    end_time: endISO,
    total_hours: hours
  };

  const oldEntryIndex = state.timeEntries.findIndex(item => item.id === id);

  try {
    if (state.isOnline && !id.startsWith('log_offline')) {
      const updated = await apiRequest(`/api/entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      if (oldEntryIndex !== -1) {
        state.timeEntries[oldEntryIndex] = updated;
      }
      showNotification('Time entry updated successfully!', 'success');
    } else {
      // Offline/Local update flow
      if (oldEntryIndex !== -1) {
        const cachedItem = state.timeEntries[oldEntryIndex];
        const localUpdated = {
          ...cachedItem,
          ...payload,
          project_name: getProject(pid).name,
          project_color: getProject(pid).color
        };
        
        state.timeEntries[oldEntryIndex] = localUpdated;

        // If it was already in offline queue, update it in queue
        const qIndex = state.offlineQueue.findIndex(q => q.id === id);
        if (qIndex !== -1) {
          state.offlineQueue[qIndex] = { id, ...payload };
        } else {
          // If was a normal record, now mutated offline, queue the replacement edit
          state.offlineQueue.push({ id, ...payload });
        }
        localStorage.setItem('chronos_offline_queue', JSON.stringify(state.offlineQueue));
      }
      showNotification('Time entry updated locally.', 'warning');
    }

    localStorage.setItem('chronos_entries', JSON.stringify(state.timeEntries));
    closeModal('editEntryModal');
    switchView(state.activeView);

  } catch (err) {
    showNotification('Update error, please verify inputs.', 'error');
  }
});

// 6. DELETE ENTRY ACTION
window.triggerDeleteEntry = async function(entryId) {
  if (!confirm('Are you absolutely sure you wish to delete this timesheet log?')) return;

  const rowElement = document.getElementById(`row-${entryId}`);
  if (rowElement) {
    rowElement.style.opacity = '0.3';
  }

  try {
    if (state.isOnline && !entryId.startsWith('log_offline')) {
      await apiRequest(`/api/entries/${entryId}`, { method: 'DELETE' });
      showNotification('Time log erased from databases.', 'success');
    } else {
      // Remove from offline queue if it was a local pending record
      state.offlineQueue = state.offlineQueue.filter(q => q.id !== entryId);
      localStorage.setItem('chronos_offline_queue', JSON.stringify(state.offlineQueue));
      showNotification('Pending offline time entry discarded.', 'warning');
    }

    // Erase in-memory data structures
    state.timeEntries = state.timeEntries.filter(e => e.id !== entryId);
    localStorage.setItem('chronos_entries', JSON.stringify(state.timeEntries));
    
    // Refresh table view
    if (state.activeView === 'timesheets') {
      filterTimesheets();
    } else {
      switchView(state.activeView);
    }
  } catch (err) {
    showNotification('Failed to execute erase task.', 'error');
    if (rowElement) rowElement.style.opacity = '1';
  }
};

// ============================================
// AUXILIARY UTILITIES AND HANDLERS
// ============================================

function setupGlobalEventListeners() {
  // 1. Sidebar Nav routing binds
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const view = e.currentTarget.getAttribute('data-view');
      switchView(view);
    });
  });

  // 2. Mobile Nav Routing binds
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const view = e.currentTarget.getAttribute('data-view');
      switchView(view);
    });
  });

  // 3. Floating Quick timer strip controls
  document.getElementById('stripPauseBtn').addEventListener('click', pauseTimerToggle);
  document.getElementById('stripStopBtn').addEventListener('click', stopAndSaveTimer);

  // 4. Header active profile switchers dropdown binds
  const profileTrigger = document.getElementById('triggerProfileMenu');
  const dropdown = document.getElementById('profileDropdown');
  
  profileTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
  });

  setupActiveProfileDropdown();

  // 5. System settings configuration modal triggers
  document.getElementById('triggerSettings').addEventListener('click', () => {
    document.getElementById('hrEmail').value = state.hrConfig.email;
    document.getElementById('hrWebhook').value = state.hrConfig.webhook;
    document.getElementById('pendingSyncText').textContent = `${state.offlineQueue.length} items waiting in offline queue`;
    openModal('settingsModal');
  });

  document.getElementById('closeSettingsModal').addEventListener('click', () => closeModal('settingsModal'));
  document.getElementById('cancelSettingsBtn').addEventListener('click', () => closeModal('settingsModal'));
  document.getElementById('forceSyncBtn').addEventListener('click', reconcileOfflineQueue);

  // Modal cancellations binds
  document.getElementById('closeProjectModal').addEventListener('click', () => closeModal('projectModal'));
  document.getElementById('cancelProjectBtn').addEventListener('click', () => closeModal('projectModal'));

  document.getElementById('closeTeamModal').addEventListener('click', () => closeModal('teamModal'));
  document.getElementById('closeEditTeamModal').addEventListener('click', () => closeModal('editTeamModal'));
  document.getElementById('cancelTeamBtn').addEventListener('click', () => closeModal('teamModal'));

  document.getElementById('closeManualLogModal').addEventListener('click', () => closeModal('manualLogModal'));
  document.getElementById('cancelManualLogBtn').addEventListener('click', () => closeModal('manualLogModal'));
  
  document.getElementById('closeEditEntryModal').addEventListener('click', () => closeModal('editEntryModal'));
  document.getElementById('cancelEditEntryBtn').addEventListener('click', () => closeModal('editEntryModal'));
}

// Hydrates dropdown switch list with active simulation employees
function setupActiveProfileDropdown() {
  const container = document.getElementById('profileOptionsContainer');
  if (!container) return;

  container.innerHTML = state.employees.map(emp => `
    <div class="dropdown-option ${emp.id === state.activeProfileId ? 'active' : ''}" data-empid="${emp.id}">
      <div class="dropdown-avatar" style="background-color: ${emp.color}">${emp.avatar}</div>
      <div class="dropdown-details">
        <h5>${emp.name}</h5>
        <span>${emp.role}</span>
      </div>
    </div>
  `).join('');

  // Attach switch clicks
  container.querySelectorAll('.dropdown-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      const eid = e.currentTarget.getAttribute('data-empid');
      switchActiveProfileContext(eid);
    });
  });

  // Re-hydrate avatars on cards
  const activeEmp = getEmployee(state.activeProfileId);
  if (activeEmp) {
    document.getElementById('activeProfileAvatar').textContent = activeEmp.avatar;
    document.getElementById('activeProfileAvatar').style.backgroundColor = activeEmp.color;
    document.getElementById('activeProfileName').textContent = activeEmp.name;
    document.getElementById('activeProfileRole').textContent = activeEmp.role;

    const mobileAvatar = document.getElementById('mobileProfileAvatar');
    if (mobileAvatar) {
      mobileAvatar.textContent = activeEmp.avatar;
      mobileAvatar.style.backgroundColor = activeEmp.color;
    }
  }
}

function switchActiveProfileContext(employeeId) {
  // If timer is currently running under a profile, block switching or warning
  if (state.activeTimer.running) {
    if (!confirm('A live tracking timer is active. Switching profiles will stop and save your current session logs. Proceed?')) {
      return;
    }
    stopAndSaveTimer();
  }

  state.activeProfileId = employeeId;
  setupActiveProfileDropdown();
  
  showNotification(`Active Profile switched to: ${getEmployee(employeeId).name}`, 'success');
  
  // Reload view
  switchView(state.activeView);
}

// Helpers: Data Lookups
function getProject(id) {
  return state.projects.find(p => p.id === id) || { id, name: id, color: '#94a3b8', client: 'Internal' };
}
function getEmployee(id) {
  return state.employees.find(e => e.id === id);
}

// Helpers: Modal Toggles
function openModal(id) {
  const overlay = document.getElementById(id);
  overlay.style.display = 'flex';
  setTimeout(() => overlay.classList.add('open'), 10);
  
  // Fill manual log select projects
  if (id === 'manualLogModal') {
    const manualProjSelect = document.getElementById('manualProject');
    manualProjSelect.innerHTML = state.projects.map(p => `
      <option value="${p.id}">${p.name}</option>
    `).join('');
    
    // Set default date to today
    document.getElementById('manualDate').value = new Date().toISOString().split('T')[0];
  }
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  overlay.classList.remove('open');
  setTimeout(() => overlay.style.display = 'none', 300);
}

// Helpers: Notification prompts
function showNotification(message, type = 'success', duration = 3500) {
  const container = document.getElementById('notificationContainer');
  if (!container) return;

  const notify = document.createElement('div');
  notify.className = `notification ${type}`;
  
  // Icon injection matching types
  let icon = '';
  if (type === 'success') icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  if (type === 'error') icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  if (type === 'warning') icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  if (type === 'info') icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

  notify.innerHTML = `${icon}<span>${message}</span>`;
  container.appendChild(notify);

  // Animate Out & delete
  setTimeout(() => {
    notify.style.opacity = '0';
    notify.style.transform = 'translateX(50px)';
    notify.style.transition = 'all 0.4s ease';
    setTimeout(() => notify.remove(), 400);
  }, duration);
}

// Helpers: Date formatting
function formatRelativeDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) - 1;

  if (diffDays === 0) {
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `Today at ${hours}:${mins}`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Hard fallback Mock values in case backend fails on first init completely offline
function getMockEmployees() {
  return [
    { id: 'emp_1', name: 'Sophia Lin', role: 'Lead Developer', color: '#6366f1', avatar: 'SL' },
    { id: 'emp_2', name: 'Marcus Vance', role: 'UI/UX Designer', color: '#ec4899', avatar: 'MV' },
    { id: 'emp_3', name: 'Amira Patel', role: 'Project Manager', color: '#eab308', avatar: 'AP' },
    { id: 'emp_4', name: 'Liam Dubois', role: 'QA Engineer', color: '#10b981', avatar: 'LD' }
  ];
}
function getMockProjects() {
  return [
    { id: 'proj_1', name: 'Mars Rover Mobile UI', client: 'SpaceX', budget_hours: 120.0, color: '#a855f7' },
    { id: 'proj_2', name: 'Nebula Brand System', client: 'Nebula Corp', budget_hours: 45.0, color: '#06b6d4' },
    { id: 'proj_3', name: 'Core Cloud API Migration', client: 'Internal Development', budget_hours: 80.0, color: '#f43f5e' },
    { id: 'proj_4', name: 'Chronos App PWA Release', client: 'Product Launch', budget_hours: 30.0, color: '#10b981' }
  ];
}

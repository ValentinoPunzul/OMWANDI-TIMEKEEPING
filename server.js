const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize Firebase Admin SDK
let serviceAccount;
const saEnvVar = process.env.FIREBASE_SERVICE_ACCOUNT || 
                 process.env.firebase_service_account || 
                 process.env['firebase-service-account'];

if (saEnvVar) {
  try {
    serviceAccount = JSON.parse(saEnvVar);
    console.log('Firebase Service Account loaded from environment variable.');
  } catch (e) {
    console.error('Failed to parse Service Account environment variable.');
  }
}

if (!serviceAccount) {
  try {
    const saPath = path.join(__dirname, 'firebase-service-account.json');
    if (fs.existsSync(saPath)) {
      serviceAccount = require(saPath);
      console.log('Firebase Service Account loaded from local file.');
    }
  } catch (e) {}
}

if (serviceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://omwandi-timekeeping-default-rtdb.firebaseio.com"
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    console.error('Firebase Initialization Error:', error.message);
  }
}

const db = admin.apps.length ? admin.database() : null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to ensure DB is ready
const checkDb = (req, res, next) => {
  if (!db) return res.status(503).json({ error: 'Database connection not established.' });
  next();
};

const DATA_DIR = path.join(__dirname, 'data');
const DISPATCH_DIR = path.join(DATA_DIR, 'hr_dispatched');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DISPATCH_DIR)) fs.mkdirSync(DISPATCH_DIR, { recursive: true });

// ============================================
// API ROUTES
// ============================================

// 1. Employees
app.get('/api/employees', checkDb, async (req, res) => {
  try {
    const snapshot = await db.ref('employees').once('value');
    res.json(Object.values(snapshot.val() || {}));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees', checkDb, async (req, res) => {
  const id = req.body.id || 'emp_' + Date.now();
  const emp = { ...req.body, id };
  await db.ref('employees/' + id).set(emp);
  res.status(201).json(emp);
});

app.delete('/api/employees/:id', checkDb, async (req, res) => {
  await db.ref('employees/' + req.params.id).remove();
  res.json({ success: true });
});

// 2. Projects
app.get('/api/projects', checkDb, async (req, res) => {
  try {
    const snapshot = await db.ref('projects').once('value');
    res.json(Object.values(snapshot.val() || {}));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects', checkDb, async (req, res) => {
  const id = req.body.id || 'proj_' + Date.now();
  const proj = { ...req.body, id };
  await db.ref('projects/' + id).set(proj);
  res.status(201).json(proj);
});

// 3. Time Entries
app.get('/api/entries', checkDb, async (req, res) => {
  try {
    const snapshot = await db.ref('time_entries').once('value');
    const entries = Object.values(snapshot.val() || {});
    
    const empsSnap = await db.ref('employees').once('value');
    const projsSnap = await db.ref('projects').once('value');
    const emps = empsSnap.val() || {};
    const projs = projsSnap.val() || {};

    const hydrated = entries.map(e => ({
      ...e,
      employee_name: emps[e.employee_id]?.name || 'Unknown',
      employee_avatar: emps[e.employee_id]?.avatar || '??',
      employee_color: emps[e.employee_id]?.color || '#888',
      project_name: projs[e.project_id]?.name || 'Internal',
      project_color: projs[e.project_id]?.color || '#888'
    }));

    res.json(hydrated.sort((a, b) => new Date(b.start_time) - new Date(a.start_time)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/entries', checkDb, async (req, res) => {
  const id = req.body.id || db.ref('time_entries').push().key;
  const entry = { ...req.body, id };
  await db.ref('time_entries/' + id).set(entry);
  res.status(201).json(entry);
});

app.post('/api/sync', checkDb, async (req, res) => {
  const { entries } = req.body;
  const updates = {};
  entries.forEach(e => { updates['/time_entries/' + (e.id || db.ref().push().key)] = e; });
  await db.ref().update(updates);
  res.json({ status: 'success', syncedCount: entries.length });
});

// 4. HR Exporter and Dispatch
app.post('/api/hr/dispatch', checkDb, async (req, res) => {
  try {
    const snapshot = await db.ref('time_entries').once('value');
    const rows = Object.values(snapshot.val() || {});
    if (rows.length === 0) return res.status(404).json({ error: 'No data' });

    const csvHeaders = ['Date', 'Project', 'Task', 'Hours'];
    const csvRows = rows.map(r => [r.start_time.split('T')[0], r.project_id, r.task, r.total_hours].join(','));
    const content = [csvHeaders.join(','), ...csvRows].join('\n');
    const filename = `HR_Report_${Date.now()}.csv`;
    fs.writeFileSync(path.join(DISPATCH_DIR, filename), content);

    res.json({ status: 'success', dispatchedFile: filename });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

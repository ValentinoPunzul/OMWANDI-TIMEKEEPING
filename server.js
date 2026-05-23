const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize Firebase Admin SDK
let serviceAccount;
const saEnvVar = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.firebase_service_account;

if (saEnvVar) {
  try {
    serviceAccount = JSON.parse(saEnvVar);
    console.log('Firebase Service Account loaded from environment variable.');
  } catch (e) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable:', e.message);
  }
}

if (!serviceAccount) {
  try {
    const saPath = path.join(__dirname, 'firebase-service-account.json');
    if (fs.existsSync(saPath)) {
      serviceAccount = require(saPath);
      console.log('Firebase Service Account loaded from local file.');
    }
  } catch (e) {
    console.error('Failed to load local firebase-service-account.json:', e.message);
  }
}

if (serviceAccount) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://omwandi-timekeeping-default-rtdb.firebaseio.com`
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (e) {
    console.error('Failed to initialize Firebase Admin SDK:', e.message);
  }
} else {
  console.warn('WARNING: No Firebase Service Account credentials found. Database features will not work.');
}

const db = admin.apps.length ? admin.database() : null;

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json());

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Ensure export directory exists
const DATA_DIR = path.join(__dirname, 'data');
const DISPATCH_DIR = path.join(DATA_DIR, 'hr_dispatched');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DISPATCH_DIR)) fs.mkdirSync(DISPATCH_DIR, { recursive: true });

// ============================================
// API ROUTES
// ============================================

// Utility to check if DB is initialized
const checkDb = (req, res, next) => {
    if (!db) return res.status(500).json({ error: 'Database not initialized' });
    next();
};

// 1. Employees APIs
app.get('/api/employees', checkDb, async (req, res) => {
  try {
    const snapshot = await db.ref('employees').once('value');
    res.json(Object.values(snapshot.val() || {}));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/employees', checkDb, async (req, res) => {
  try {
    const { name, role, color, avatar, reports_to, emp_no } = req.body;
    if (!name || !role) return res.status(400).json({ error: 'Name and Role are required.' });

    const id = 'emp_' + Date.now() + Math.random().toString(36).substr(2, 4);
    const newEmployee = {
      id,
      name,
      role,
      color: color || '#' + Math.floor(Math.random() * 16777215).toString(16),
      avatar: avatar || name.split(' ').map(n => n[0]).join('').toUpperCase().substr(0, 2),
      reports_to: reports_to || null,
      emp_no: emp_no || null
    };

    await db.ref('employees/' + id).set(newEmployee);
    res.status(201).json(newEmployee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ... [Remainder of the API routes from the previous server.js, updated to use checkDb middleware] ...

// Updated remaining routes for consistency
app.get('/api/projects', checkDb, async (req, res) => {
  try {
    const snapshot = await db.ref('projects').once('value');
    res.json(Object.values(snapshot.val() || {}));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/entries', checkDb, async (req, res) => {
  try {
    const { employee_id, project_id, start_date, end_date } = req.query;
    let entriesRef = db.ref('time_entries');
    if (employee_id) entriesRef = entriesRef.orderByChild('employee_id').equalTo(employee_id);
    const snapshot = await entriesRef.once('value');
    let filteredEntries = Object.values(snapshot.val() || {});
    // Simple manual filtering for multiple params if needed
    if (project_id) filteredEntries = filteredEntries.filter(e => e.project_id === project_id);
    res.json(filteredEntries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/entries', checkDb, async (req, res) => {
    try {
        const { id, employee_id, project_id, task, description, start_time, end_time, total_hours } = req.body;
        const entryId = id || db.ref('time_entries').push().key;
        const newEntry = { id: entryId, employee_id, project_id, task, description, start_time, end_time, total_hours: parseFloat(total_hours) || 0 };
        await db.ref('time_entries/' + entryId).set(newEntry);
        res.status(201).json(newEntry);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sync', checkDb, async (req, res) => {
    const { entries } = req.body;
    try {
        const updates = {};
        entries.forEach(e => { updates['/time_entries/' + (e.id || db.ref().push().key)] = e; });
        await db.ref().update(updates);
        res.json({ status: 'success', syncedCount: entries.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Handles default page routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server - Bind to 0.0.0.0 for cloud compatibility
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n===========================================`);
  console.log(`Chronos Flow Timekeeping Server running!`);
  console.log(`Listening on: http://0.0.0.0:${PORT}`);
  console.log(`===========================================\n`);
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import path from 'path';
import cluster from 'cluster';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`Primary ${process.pid} is running. Forking ${numCPUs} workers for load balancing...`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  const app = express();
  const PORT = process.env.PORT || 5000;
  // Support persistent disk on Render/Railway
  const DATA_DIR = process.env.DATA_DIR || '.';
  const DB_PATH = path.join(DATA_DIR, 'swasth_guardian.sqlite');

  // Security headers — Helmet.js (OWASP Top 10 compliant)
  // CSP disabled: Vite inline scripts; COEP disabled: cross-origin AI service calls
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // CORS — Allow all in development for easy mobile testing, or whitelisted in production
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow all origins in development or if explicitly whitelisted
      const isDev = process.env.NODE_ENV !== 'production';
      if (!origin || isDev || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: Origin ${origin} not allowed.`));
    },
    credentials: true,
  }));
  app.use(express.json());

  // Rate limiting — max 15 auth attempts per 15 minutes per IP
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  });

  // --- DATABASE INITIALIZATION ---
  let db;
  (async () => {
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });

    // --- DATABASE INITIALIZATION ---
    await db.exec('PRAGMA journal_mode=WAL');
    
    // Table Creation
    await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE,
      email TEXT UNIQUE,
      username TEXT,
      name TEXT,
      password TEXT,
      role TEXT,
      villageId TEXT
    );
    CREATE TABLE IF NOT EXISTS otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT,
      otp TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS village_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      villageId TEXT UNIQUE,
      name TEXT,
      population INTEGER,
      pregnant_women INTEGER,
      children_under_5 INTEGER,
      malnutrition_cases INTEGER,
      asha_contact TEXT,
      outbreakAlert TEXT DEFAULT NULL,
      lastUpdated DATETIME DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS pregnancy_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      age INTEGER,
      trimester INTEGER,
      dueDate TEXT,
      riskLevel TEXT,
      villageId TEXT
    );
    CREATE TABLE IF NOT EXISTS malnutrition_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      childName TEXT,
      ageMonths INTEGER,
      weight REAL,
      height REAL,
      status TEXT,
      villageId TEXT
    );
    CREATE TABLE IF NOT EXISTS symptoms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      villageId TEXT,
      symptoms TEXT,
      prediction TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS skin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      villageId TEXT,
      condition TEXT,
      severity TEXT,
      rednessPercent INTEGER,
      irregularPercent INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ambulance_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT,
      location TEXT,
      priority TEXT,
      type TEXT DEFAULT 'emergency',
      symptoms TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ngo_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT,
      villageId TEXT,
      date TEXT
    );
  `);

    // --- AUTO-MIGRATION HELPER ---
    // Hardens the database against schema changes by automatically adding missing columns
    const migrateSchema = async () => {
      const migrations = {
        ambulance_requests: [
          { name: 'user_id', type: 'INTEGER' },
          { name: 'type', type: "TEXT DEFAULT 'emergency'" },
          { name: 'created_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP', legacy: 'createdAt' }
        ],
        village_health: [
          { name: 'outbreakAlert', type: 'TEXT DEFAULT NULL' },
          { name: 'lastUpdated', type: 'DATETIME DEFAULT NULL' }
        ]
      };

      for (const [table, columns] of Object.entries(migrations)) {
        try {
          const tableInfo = await db.all(`PRAGMA table_info(${table})`);
          const existing = tableInfo.map(c => c.name);
          for (const col of columns) {
            if (!existing.includes(col.name)) {
              if (col.legacy && existing.includes(col.legacy)) {
                await db.exec(`ALTER TABLE ${table} RENAME COLUMN ${col.legacy} TO ${col.name}`);
                console.log(`[MIGRATION] Renamed ${table}.${col.legacy} to ${col.name}`);
              } else {
                await db.exec(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`);
                console.log(`[MIGRATION] Added column ${col.name} to ${table}`);
              }
            }
          }
        } catch (err) { console.error(`Migration error on ${table}:`, err.message); }
      }
    };
    await migrateSchema();

    console.log('--- SwasthAI Guardian Core: SQLite Database Initialized & Migrated ---');

  // --- AUTH MIDDLEWARE ---
  const auth = (req, res, next) => {
    if (!db) return res.status(503).send({ error: 'Database initializing. Please try again in a few seconds.' });
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) return res.status(401).send({ error: 'Auth Required' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'swasthai_secret_2026');
      req.user = decoded;
      next();
    } catch (err) { res.status(401).send({ error: 'Invalid Token' }); }
  };

  const checkRole = (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).send({ error: 'Access Denied: Insufficient Permissions' });
    }
    next();
  };

  // --- ROUTES ---

  // 1. AUTH
  app.post('/api/auth/register', async (req, res) => {
    const { phone, email, username, name, password, role, villageId } = req.body;
    try {
      // Hash password before storing — never store plain text passwords
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await db.run(
        'INSERT INTO users (phone, email, username, name, password, role, villageId) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [phone || null, email || null, username, name, hashedPassword, role, villageId]
      );
      res.status(201).send({ id: result.lastID, username, role });
    } catch (err) {
      console.error(err);
      res.status(400).send({ error: 'User already exists with this phone/email.' });
    }
  });

  app.post('/api/auth/request-otp', async (req, res) => {
    const { phone } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await db.run('INSERT INTO otps (phone, otp) VALUES (?, ?)', [phone, otp]);
    console.log(`[MOCK OTP] Sent to ${phone}: ${otp}`);
    res.send({ message: 'OTP sent successfully (Check server logs)' });
  });

  app.post('/api/auth/login-otp', authLimiter, async (req, res) => {
    const { phone, otp, role } = req.body;

    // DEMO MODE: OTP '1234' always works for any registered user
    const isDemoOtp = (otp === '1234');

    if (!isDemoOtp) {
      // Verify real OTP exists and is not older than 5 minutes
      const record = await db.get(
        "SELECT * FROM otps WHERE phone = ? AND otp = ? AND createdAt >= datetime('now', '-5 minute') ORDER BY createdAt DESC LIMIT 1",
        [phone, otp]
      );
      if (!record) return res.status(401).send({ error: 'Invalid OTP. Use OTP: 1234 for demo.' });
    }

    const user = await db.get('SELECT * FROM users WHERE phone = ? AND role = ?', [phone, role]);
    if (!user) return res.status(404).send({ error: 'No account found with this phone number for the selected role.' });

    const token = jwt.sign({ id: user.id, role: user.role, villageId: user.villageId }, process.env.JWT_SECRET || 'swasthai_secret_2026', { expiresIn: '7d' });
    res.send({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role, villageId: user.villageId } });
  });

  app.post('/api/auth/login-password', authLimiter, async (req, res) => {
    const { identifier, password, role } = req.body;
    const user = await db.get('SELECT * FROM users WHERE (email = ? OR phone = ?) AND role = ?', [identifier, identifier, role]);

    if (!user) return res.status(401).send({ error: 'Invalid credentials.' });

    // Secure comparison using bcrypt — prevents timing attacks and plain text exposure
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(401).send({ error: 'Invalid credentials.' });

    // FIXED: use the same JWT_SECRET as the auth middleware — was using a hardcoded fallback before
    const token = jwt.sign({ id: user.id, role: user.role, villageId: user.villageId }, process.env.JWT_SECRET || 'swasthai_secret_2026', { expiresIn: '7d' });
    res.send({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role, villageId: user.villageId } });
  });

  app.put('/api/auth/profile', auth, async (req, res) => {
    // FIX: Accept both 'name' (display name) and 'username' — frontend sends 'name'
    const { name, username } = req.body;
    if (!name && !username) return res.status(400).send({ error: 'Name or username is required.' });
    try {
      // Build update dynamically — update whichever fields were sent
      const updates = [];
      const values = [];
      if (name)     { updates.push('name = ?');     values.push(name.trim()); }
      if (username) { updates.push('username = ?'); values.push(username.trim()); }
      values.push(req.user.id);
      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
      const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
      res.send({ user: { id: updatedUser.id, name: updatedUser.name, username: updatedUser.username, role: updatedUser.role, villageId: updatedUser.villageId } });
    } catch (err) {
      console.error('Profile update error:', err);
      res.status(500).send({ error: 'Failed to update profile.' });
    }
  });

  // ── VILLAGER: Emergency ASHA Alert ───────────────────────────────────────
  // Fix: replaces the fake window.alert() in MenstrualHealth.jsx with a real
  // backend record that shows up on the NGO dashboard as a priority pad/ambulance request.
  app.post('/api/villager/emergency-alert', auth, async (req, res) => {
    const { alertType = 'menstrual_emergency', message = 'Emergency help needed' } = req.body;
    try {
      // Fetch user details — name and villageId
      const userRecord = await db.get('SELECT name, villageId FROM users WHERE id = ?', [req.user.id]);
      const userName  = userRecord?.name     || `User-${req.user.id}`;
      const villageId = userRecord?.villageId || req.user.villageId || 'Unknown Village';

      // Store as a high-priority ambulance request so NGO sees it in their dashboard
      await db.run(
        'INSERT INTO ambulance_requests (user_id, name, location, priority, type, symptoms, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          req.user.id,
          userName,
          villageId,
          'Critical',
          'asha_emergency',
          `🚨 ASHA EMERGENCY ALERT — ${alertType}: ${message}`,
          'pending'
        ]
      );

      console.log(`[ASHA EMERGENCY] User: ${userName} (${villageId}) — ${alertType}`);
      res.status(201).send({
        success: true,
        message: 'Your ASHA worker has been alerted. She will contact you shortly.',
        alertId: `ALERT-${Date.now()}`
      });
    } catch (err) {
      console.error('Emergency alert error:', err);
      res.status(500).send({ error: 'Failed to send alert. Please call 108 directly.' });
    }
  });

  // 2. VILLAGER SERVICES
  app.post('/api/villager/symptoms', auth, checkRole(['villager', 'ngo', 'admin']), async (req, res) => {
    const { symptoms: text } = req.body;
    const userId = req.user.id;
    const villageId = req.user.villageId || req.body.villageId;
    let prediction;
    try {
      const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
      const aiRes = await axios.post(`${AI_URL}/predict/disease`, { symptoms: text }, { timeout: 8000 });
      prediction = aiRes.data.prediction;
    } catch (err) {
      console.warn('AI Service unavailable for symptom check — using offline rule:', err.message);
      // Offline fallback: return a safe advisory so the app still works without the Python service
      prediction = 'AI assessment unavailable. Based on your symptoms, please consult your ASHA worker or visit your nearest PHC. / AI सेवा उपलब्ध नहीं। अपने आशा कार्यकर्ता या नज़दीकी PHC से मिलें।';
    }

    await db.run('INSERT INTO symptoms (userId, villageId, symptoms, prediction) VALUES (?, ?, ?, ?)', [userId, villageId, text, prediction]);

    // Outbreak detection: check same village last 24h
    const logs = await db.all("SELECT * FROM symptoms WHERE villageId = ? AND createdAt > datetime('now', '-1 day')", [villageId]);
    const alert = logs.length > 5 ? `⚠️ CLUSTER ALERT in ${villageId}: ${logs.length} similar cases detected.` : null;

    res.send({ prediction, alert });
  });

  app.post('/api/villager/skin-log', auth, async (req, res) => {
    const { condition, severity, rednessPercent, irregularPercent } = req.body;
    const userId = req.user.id;
    const villageId = req.user.villageId || 'v101';

    try {
      await db.run(
        'INSERT INTO skin_logs (userId, villageId, condition, severity, rednessPercent, irregularPercent) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, villageId, condition, severity, rednessPercent, irregularPercent]
      );
      res.status(201).send({ status: 'Logged' });
    } catch (err) {
      console.error('Failed to log skin condition:', err);
      res.status(500).send({ error: 'Failed to log skin condition' });
    }
  });

  app.post('/api/villager/ambulance', auth, async (req, res) => {
    const { name, location, priority, symptoms: sxy } = req.body;
    const userId = req.user.id;
    try {
      // ── Deduplication: reject if same user submitted within last 60 seconds ──
      const recent = await db.get(
        "SELECT id FROM ambulance_requests WHERE user_id = ? AND created_at > datetime('now', '-60 seconds')",
        [userId]
      );
      if (recent) {
        return res.status(429).json({
          error: 'Request already sent. Please wait 60 seconds before sending another.',
          retryAfter: 60
        });
      }

      const result = await db.run(
        'INSERT INTO ambulance_requests (user_id, name, location, priority, symptoms, status) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, name, location, priority, sxy, 'pending']
      );
      console.log(`[AMBULANCE] Request #${result.lastID} from user ${userId} — ${priority} at ${location}`);
      res.status(201).send({ status: 'dispatched', eta: '14 mins', requestId: result.lastID });
    } catch (err) {
      console.error('[AMBULANCE ERROR]', err);
      res.status(500).json({ 
        error: 'Server error saving ambulance request.',
        details: err.message,
        hint: 'Please call 108 directly.' 
      });
    }
  });

  // Ambulance status polling — villager polls this after dispatch to get live status
  app.get('/api/villager/ambulance-status', auth, async (req, res) => {
    try {
      const latest = await db.get(
        'SELECT id, status, location, priority, created_at FROM ambulance_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [req.user.id]
      );
      if (!latest) return res.status(404).json({ error: 'No requests found.' });
      res.json(latest);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch status.' });
    }
  });

  // My History — used by Profile page to show last 5 symptom checks + ambulance requests
  app.get('/api/villager/my-history', auth, async (req, res) => {
    try {
      const symptoms = await db.all(
        'SELECT id, symptoms, prediction, createdAt FROM symptoms WHERE userId = ? ORDER BY id DESC LIMIT 5',
        [req.user.id]
      );
      const ambulances = await db.all(
        'SELECT id, location, priority, status, created_at FROM ambulance_requests WHERE user_id = ? ORDER BY id DESC LIMIT 5',
        [req.user.id]
      );
      res.json({ symptoms, ambulances });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch history.' });
    }
  });

  // 3. NGO / ASHA SERVICES

  // GET all maternal records (for the Maternal Health page)
  app.get('/api/ngo/maternal', auth, checkRole(['ngo', 'admin']), async (req, res) => {
    try {
      const records = await db.all('SELECT * FROM pregnancy_data ORDER BY id DESC');
      res.send(records);
    } catch (err) {
      res.status(500).send({ error: 'Failed to fetch maternal records.' });
    }
  });

  // GET all malnutrition records (for the Child Nutrition page)
  app.get('/api/ngo/malnutrition', auth, checkRole(['ngo', 'admin']), async (req, res) => {
    try {
      // Explicitly alias columns so frontend always gets consistent field names
      const records = await db.all(
        'SELECT id, childName, ageMonths, weight, height, status, villageId FROM malnutrition_data ORDER BY id DESC'
      );
      res.send(records);
    } catch (err) {
      res.status(500).send({ error: 'Failed to fetch malnutrition records.' });
    }
  });
  app.post('/api/ngo/village', auth, checkRole(['ngo', 'admin']), async (req, res) => {
    const { villageId, name, population, pregnant, children, malnutrition, contact } = req.body;
    await db.run(
      'INSERT OR REPLACE INTO village_health (villageId, name, population, pregnant_women, children_under_5, malnutrition_cases, asha_contact) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [villageId, name, population, pregnant, children, malnutrition, contact]
    );
    res.send({ status: 'Updated Node Axis.' });
  });

  app.post('/api/ngo/maternal', auth, checkRole(['ngo', 'admin']), async (req, res) => {
    const { name, age, trimester, dueDate, vitals } = req.body;

    // Input validation
    if (!name || !age || !trimester) {
      return res.status(400).send({ error: 'Name, age, and trimester are required.' });
    }
    if (age < 10 || age > 60) {
      return res.status(400).send({ error: 'Age must be between 10 and 60.' });
    }
    if (![1, 2, 3].includes(Number(trimester))) {
      return res.status(400).send({ error: 'Trimester must be 1, 2, or 3.' });
    }

    // villageId comes from JWT — cannot be spoofed via request body
    const villageId = req.user.villageId || 'unassigned';

    const patientVitals = vitals || { systolic_bp: 120, diastolic_bp: 80, bs: 5.0, body_temp: 98, heart_rate: 75 };

    let riskLevel;
    try {
      const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
      const ai = await axios.post(`${AI_URL}/predict/pregnancy_risk`, { age, ...patientVitals });
      riskLevel = ai.data.risk_level;
    } catch (err) {
      console.error('AI Service Error (Maternal Risk):', err.message);
      return res.status(503).send({ error: 'Maternal Risk AI is currently unavailable. Please consult a doctor immediately if you notice warning signs.' });
    }
    await db.run('INSERT INTO pregnancy_data (name, age, trimester, dueDate, riskLevel, villageId) VALUES (?, ?, ?, ?, ?, ?)', [name, age, trimester, dueDate, riskLevel, villageId]);
    res.send({ riskLevel, villageId });
  });

  app.post('/api/ngo/malnutrition', auth, checkRole(['ngo', 'admin']), async (req, res) => {
    const { name, age, weight, height } = req.body;

    // Input validation
    if (!name || !age || !weight || !height) {
      return res.status(400).send({ error: 'Name, age, weight, and height are all required.' });
    }
    if (age < 0 || age > 60) {
      return res.status(400).send({ error: 'Age in months must be between 0 and 60.' });
    }
    if (weight < 1 || weight > 30) {
      return res.status(400).send({ error: 'Weight must be between 1 and 30 kg for children under 5.' });
    }
    if (height < 30 || height > 130) {
      return res.status(400).send({ error: 'Height must be between 30 and 130 cm.' });
    }

    // villageId comes from JWT — cannot be spoofed via request body
    const villageId = req.user.villageId || 'unassigned';
    let status, bmi, action;
    try {
      const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
      const ai = await axios.post(`${AI_URL}/predict/malnutrition`, { age_months: age, weight_kg: weight, height_cm: height });
      status = ai.data.status;
      bmi = ai.data.bmi;
      action = ai.data.action;
    } catch (err) {
      console.error('AI Service Error (Malnutrition):', err.message);
      return res.status(503).send({ error: 'Malnutrition assessment AI is currently unavailable. Please check back later.' });
    }
    await db.run('INSERT INTO malnutrition_data (childName, ageMonths, weight, height, status, villageId) VALUES (?, ?, ?, ?, ?, ?)', [name, age, weight, height, status, villageId]);
    res.send({ status, bmi, action, villageId });
  });

  // NGO: Read ambulance requests (from the same table villagers write to)
  app.get('/api/ngo/ambulances', auth, checkRole(['ngo', 'admin']), async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM ambulance_requests WHERE priority != 'Pad Request' ORDER BY id DESC LIMIT 100");
      res.send(rows);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Failed to fetch ambulance requests.' });
    }
  });

  // NGO: Read sanitary pad requests
  app.get('/api/ngo/pads', auth, checkRole(['ngo', 'admin']), async (req, res) => {
    try {
      const rows = await db.all("SELECT * FROM ambulance_requests WHERE priority = 'Pad Request' ORDER BY id DESC LIMIT 100");
      res.send(rows);
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Failed to fetch pad requests.' });
    }
  });

  // NGO: Update ambulance request status
  app.put('/api/ngo/ambulances/:id/status', auth, checkRole(['ngo', 'admin']), async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['pending', 'assigned', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).send({ error: 'Invalid status value.' });
    }
    try {
      await db.run('UPDATE ambulance_requests SET status = ? WHERE id = ?', [status, req.params.id]);
      res.send({ success: true, status });
    } catch (err) {
      res.status(500).send({ error: 'Failed to update status.' });
    }
  });

  // Villager: Submit a pad request
  app.post('/api/villager/pad-request', auth, async (req, res) => {
    const { village } = req.body;
    if (!village) return res.status(400).send({ error: 'Village name is required.' });
    try {
      // Fetch user from DB since name is not stored in JWT token
      const userRecord = await db.get('SELECT name FROM users WHERE id = ?', [req.user.id]);
      const userName = userRecord?.name || 'Unknown Villager';

      await db.run('INSERT INTO ambulance_requests (name, location, priority, symptoms, status) VALUES (?, ?, ?, ?, ?)',
        [userName, village, 'Pad Request', 'Requires Sanitary Pads delivered to village.', 'pending']
      );
      res.send({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: 'Failed to process pad request.' });
    }
  });

  // GROQ AI Health Assistant (Maternal Health chatbot)
  app.post('/api/health-assistant', auth, async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).send({ error: 'Message is required.' });

    const groqKey = process.env.GROQ_API_KEY;
    const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

    if (!groqKey || groqKey === 'your_groq_api_key_here') {
      return res.send({
        reply: "I'm Sakhi, your Women's Health Assistant. I can answer questions about menstrual health, hygiene, pain management, and when to see a doctor."
      });
    }

    // Try RAG-powered endpoint first (grounded in WHO/ASHA guidelines)
    try {
      const ragRes = await axios.post(`${AI_URL}/ai/rag-chat`, { message }, { timeout: 12000 });
      return res.send({ reply: ragRes.data.reply, grounded: true });
    } catch (ragErr) {
      console.warn('[Sakhi] RAG service unavailable, falling back to direct Groq:', ragErr.message);
    }

    // Fallback: direct Groq call
    try {
      const groqRes = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are Sakhi, a trusted Women's Health Assistant for rural India. 
Provide safe, accurate, empathetic guidance on menstrual health, hygiene, nutrition, and when to see a doctor.
Rules: respond in user's language; never diagnose; be warm and concise (3-5 sentences); for severe symptoms urgently advise hospital.`
            },
            { role: 'user', content: message }
          ],
          temperature: 0.5,
          max_tokens: 300
        },
        { headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' } }
      );
      const reply = groqRes.data.choices?.[0]?.message?.content || 'I could not process your question. Please try again.';
      res.send({ reply, grounded: false });
    } catch (err) {
      console.error('Groq API error:', err.response?.data || err.message);
      res.status(503).send({ error: 'Health Assistant is temporarily unavailable. Please try again.' });
    }
  });

  // NOTE: Duplicate /api/villager/pad-request removed — first definition (line ~429) is the canonical one.

  // 4. REQUEST WORKFLOW — DEPRECATED ROUTES
  // The 'requests' table was dropped (see schema comment line ~157).
  // These routes now return 410 Gone instead of crashing with SQLite 'no such table' errors.
  // All request workflows have been migrated to:
  //   Ambulance → /api/villager/ambulance → ambulance_requests table
  //   Pad Requests → /api/villager/pad-request → ambulance_requests table (priority='Pad Request')
  //   ASHA Alerts → /api/villager/emergency-alert → ambulance_requests table (type='asha_emergency')
  const _removedTableHandler = (req, res) => res.status(410).json({
    error: 'This endpoint has been retired. Use /api/villager/ambulance or /api/villager/pad-request instead.',
    migration: 'See /api/health for current active endpoints.'
  });
  app.post('/api/requests',          auth, _removedTableHandler);
  app.get('/api/requests',           auth, _removedTableHandler);
  app.put('/api/requests/:id/status', auth, _removedTableHandler);

  // 5. ADMIN ANALYTICS
  app.get('/api/admin/analytics', auth, checkRole(['admin']), async (req, res) => {
    const vCount = await db.get('SELECT COUNT(*) as c FROM village_health');
    const pCount = await db.get('SELECT COUNT(*) as c FROM pregnancy_data');
    const mCount = await db.get('SELECT COUNT(*) as c FROM malnutrition_data WHERE status != "Normal"');
    const aCount = await db.get('SELECT COUNT(*) as c FROM ambulance_requests');
    const alerts = await db.all("SELECT * FROM symptoms WHERE createdAt > datetime('now', '-1 day')");

    res.send({
      villages: vCount.c,
      pregnancies: pCount.c,
      malnutrition: mCount.c,
      ambulances: aCount.c,
      today_symptoms: alerts.length
    });
  });

  // Live ambulance dispatch feed for admin
  app.get('/api/admin/ambulances', auth, checkRole(['admin']), async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM ambulance_requests ORDER BY id DESC LIMIT 50');
      res.send(rows);
    } catch (err) {
      res.status(500).send({ error: 'Failed to fetch ambulance records.' });
    }
  });

  app.get('/api/admin/village/:id', auth, checkRole(['admin', 'ngo']), async (req, res) => {
    const village = await db.get('SELECT * FROM village_health WHERE villageId = ?', [req.params.id]);
    if (!village) return res.status(404).send({ error: 'Node Not Found' });
    const pregnancies = await db.all('SELECT * FROM pregnancy_data WHERE villageId = ?', [req.params.id]);
    res.send({ village, pregnancies });
  });

  app.get('/api/admin/summary', auth, checkRole(['admin']), async (req, res) => {
    try {
      const totalUsers = await db.get('SELECT COUNT(*) as c FROM users WHERE role = "villager"');
      const totalNgos = await db.get('SELECT COUNT(*) as c FROM users WHERE role = "ngo"');
      
      // Fallback for deprecated 'requests' table
      let totalReqs = { c: 0 };
      let sanitaryReqs = { c: 0 };
      try {
        totalReqs = await db.get('SELECT COUNT(*) as c FROM requests');
        sanitaryReqs = await db.get('SELECT COUNT(*) as c FROM requests WHERE type = "sanitary_pad"');
      } catch (e) { /* ignore if table missing */ }

      const emergencyReqs = await db.get('SELECT COUNT(*) as c FROM ambulance_requests');
      const padReqs = await db.get('SELECT COUNT(*) as c FROM ambulance_requests WHERE priority = "Pad Request"');

      res.send({
        totalUsers: totalUsers?.c || 0,
        totalNgos: totalNgos?.c || 0,
        totalRequests: (totalReqs?.c || 0) + (emergencyReqs?.c || 0),
        emergencyCount: emergencyReqs?.c || 0,
        sanitaryCount: (sanitaryReqs?.c || 0) + (padReqs?.c || 0)
      });
    } catch (err) {
      console.error('Summary fetch error:', err);
      res.status(500).send({ error: 'Failed to fetch admin summary' });
    }
  });

  app.get('/api/admin/report', auth, checkRole(['admin']), async (req, res) => {
    try {
      const ambulances = await db.all('SELECT * FROM ambulance_requests ORDER BY id DESC');
      
      let csv = 'Record ID,Type,Patient Name/ID,Location/Priority,Status,Date\n';

      ambulances.forEach(a => {
        csv += `AMB-${a.id},${a.type || 'ambulance'},"${a.name || 'User ' + a.user_id}","${a.location || ''} (${a.priority || ''})",${a.status},${a.created_at}\n`;
      });

      // Optionally include legacy requests if the table exists
      try {
        const padReqs = await db.all('SELECT * FROM requests ORDER BY id DESC');
        padReqs.forEach(r => {
          csv += `REQ-${r.id},${r.type},User ${r.user_id},N/A,${r.status},${r.created_at}\n`;
        });
      } catch (e) { /* ignore if table missing */ }

      res.header('Content-Type', 'text/csv');
      res.attachment('swasthai_admin_report.csv');
      return res.send(csv);
    } catch (err) {
      console.error('Report generation error:', err);
      res.status(500).send({ error: 'Failed to generate report' });
    }
  });

  // ── AGENTIC MONITOR ENDPOINTS ─────────────────────────────────────────────
  // Internal: Called by Python outbreak_agent.py to fetch symptom clusters
  app.get('/api/admin/clusters', async (req, res) => {
    const agentSecret = req.headers['x-agent-secret'];
    if (agentSecret !== (process.env.AGENT_SECRET || 'swasthai_agent_internal_2026')) {
      return res.status(403).send({ error: 'Forbidden' });
    }
    try {
      // Group symptoms by village in last 24 hours
      const rows = await db.all(
        `SELECT villageId, COUNT(*) as count, GROUP_CONCAT(symptoms, ' | ') as symptoms
         FROM symptoms
         WHERE createdAt > datetime('now', '-1 day')
         GROUP BY villageId
         HAVING count >= 3
         ORDER BY count DESC`
      );
      res.send(rows);
    } catch (err) {
      res.status(500).send({ error: err.message });
    }
  });

  // Internal: Called by Python outbreak_agent.py to store confirmed outbreak alerts
  app.post('/api/admin/outbreak-alert', async (req, res) => {
    const agentSecret = req.headers['x-agent-secret'];
    if (agentSecret !== (process.env.AGENT_SECRET || 'swasthai_agent_internal_2026')) {
      return res.status(403).send({ error: 'Forbidden' });
    }
    const { villageId, disease, action } = req.body;
    try {
      await db.run(
        `INSERT OR IGNORE INTO village_health (villageId, outbreakAlert, lastUpdated)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(villageId) DO UPDATE SET outbreakAlert = ?, lastUpdated = datetime('now')`,
        [villageId, `${disease}: ${action}`, `${disease}: ${action}`]
      );
      console.log(`[OUTBREAK ALERT RECEIVED] Village: ${villageId}, Disease: ${disease}`);
      res.status(201).send({ status: 'Alert stored' });
    } catch (err) {
      // Fallback: just log if village_health schema doesn't have outbreakAlert column yet
      console.log(`[OUTBREAK ALERT] Village: ${villageId} | ${disease}: ${action}`);
      res.status(200).send({ status: 'Alert logged (schema update may be needed)' });
    }
  });

  // Public Admin: View active outbreak alerts from agent
  app.get('/api/admin/outbreaks', auth, checkRole(['admin', 'ngo']), async (req, res) => {
    try {
      const AI_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
      const aiRes = await axios.get(`${AI_URL}/admin/outbreaks?limit=20`, { timeout: 5000 });
      res.send(aiRes.data);
    } catch (err) {
      res.status(503).send({ outbreaks: [], message: 'Outbreak monitor service unavailable' });
    }
  });

  // Health check — used by docker-compose, load balancers, and monitoring
  // Health check — used by docker-compose, load balancers, and monitoring
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'SwasthAI Guardian Backend',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      worker: process.pid,
    });
  });

  // ── STATIC FILE SERVING (Production) ──────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    const frontendPath = path.resolve(__dirname, '../frontend/dist');
    console.log('Serving production frontend from:', frontendPath);
    
    app.use(express.static(frontendPath));

    app.get('*', (req, res) => {
      // API routes should not be caught by static file server
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(frontendPath, 'index.html'));
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SwasthAI Core active on port ${PORT} (Mode: ${process.env.NODE_ENV || 'development'})`);
  });
})();
}

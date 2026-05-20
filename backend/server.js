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
      const isRender = origin && origin.endsWith('.onrender.com');
      if (!origin || isDev || isRender || allowedOrigins.includes(origin)) return callback(null, true);
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

    -- ── PERFORMANCE INDEXES ───────────────────────────────────────────────────
    -- Added V2: Prevents full table scans on the most-queried columns.
    -- Critical for outbreak detection (village + time), symptom lookups (userId), and ambulance feeds.
    CREATE INDEX IF NOT EXISTS idx_symptoms_villageId    ON symptoms(villageId);
    CREATE INDEX IF NOT EXISTS idx_symptoms_userId       ON symptoms(userId);
    CREATE INDEX IF NOT EXISTS idx_symptoms_createdAt    ON symptoms(createdAt);
    CREATE INDEX IF NOT EXISTS idx_ambulance_userId      ON ambulance_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_ambulance_status      ON ambulance_requests(status);
    CREATE INDEX IF NOT EXISTS idx_pregnancy_villageId   ON pregnancy_data(villageId);
    CREATE INDEX IF NOT EXISTS idx_malnutrition_villageId ON malnutrition_data(villageId);
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
        if (name) { updates.push('name = ?'); values.push(name.trim()); }
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
        const userName = userRecord?.name || `User-${req.user.id}`;
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
    const LOCAL_ADVISORIES = {
      'Malaria / मलेरिया': 'Sleep under a mosquito net, drink fluids, and visit nearest PHC within 24h for blood test.',
      'Dengue / डेंगू': 'Complete bed rest, stay hydrated. Do NOT take pain relievers like Ibuprofen/Aspirin (only Paracetamol is safe).',
      'Typhoid / टाइफाइड': 'Drink only boiled/filtered water, eat soft cooked food, and complete prescribed antibiotics.',
      'Tuberculosis (TB) / टीबी (तपेदिक)': 'Wear a mask, sleep in a ventilated room, and visit PHC for free sputum/DOTS test.',
      'Diarrhea & Cholera / हैजा (डायरिया)': 'Drink ORS after every stool to prevent dehydration. Continue light diet (rice/curd) and see doctor.',
      'Dysentery / पेचिश (खूनी दस्त)': 'Drink ORS to stay hydrated, eat clean soft food, and visit doctor for antibiotic check.',
      'Jaundice / पीलिया (हेपेटाइटिस)': 'Rest completely. Avoid fatty/oily food and alcohol. Seek medical check at PHC.',
      'Urinary Tract Infection (UTI) / यूरिन इन्फेक्शन (UTI)': 'Drink 2-3 liters of water daily. Do not hold urine. Consult doctor for antibiotics.',
      'Pneumonia / न्यूमोनिया (फेफड़ों का संक्रमण)': 'Requires urgent doctor visit. Keep patient in upright position to ease breathing.',
      'Anaemia / एनीमिया (खून की कमी)': 'Eat iron-rich food daily (spinach, jaggery, dates). Consult ASHA for free Iron tablets.',
      'Viral Fever & Cold / सामान्य बुखार और सर्दी': 'Rest well, drink warm water, take paracetamol for fever. See doctor if fever lasts >3 days.',
      'Chickenpox / चेचक (छोटी माता)': 'Keep isolated, avoid scratching blisters, apply calamine lotion, and consult ASHA worker.',
      'Measles / खसरा': 'Keep isolated, keep eyes clean, consult doctor for vitamin A dosage and fever management.',
      'Heatstroke / लू लगना (हाइपरथर्मिया)': 'Move to shade, apply wet cloths, sip cool water, and seek immediate emergency care.',
      'Snakebite / सांप का काटना': 'Keep calm and still, immobilize limb, do NOT cut or suck wound, seek nearest hospital with anti-venom immediately.',
      'Acute Respiratory Infection / तीव्र श्वसन संक्रमण': 'Drink warm fluids, steam inhalation, and see doctor if breathing is difficult.'
    };

    function predictDiseaseLocal(text) {
      if (!text || !text.trim()) {
        return 'Undetermined Symptoms / अनिर्धारित लक्षण';
      }
      const clean = text.toLowerCase().trim();
      const rules = [
        {
          name: 'Malaria / मलेरिया',
          keywords: [
            'malaria', 'chill', 'shiver', 'sweat', 'high fever', 'thand', 'kampkampi', 'pasina', 'tej bukhar',
            'हिवताप', 'थंडी', 'वाजणे', 'घाम', 'मलेरीया', 'குளிர்', 'நடுக்கம்', 'காய்ச்சல்', 'చలి', 'వణుకు', 'జ్వరం',
            'শীত', 'কাঁপুনি', 'ঘাম', 'জ্বর'
          ]
        },
        {
          name: 'Dengue / डेंगू',
          keywords: [
            'dengue', 'eye pain', 'joint pain', 'muscle pain', 'bone break', 'rash', 'skin rash', 'bleeding',
            'आंकड़ों में दर्द', 'जोड़ों में दर्द', 'मांसपेशियों में दर्द', 'चकत्ते', 'खून आना', 'aankh dard', 'jodon me', 'rashes',
            'डेंग्यू', 'डोळ्यांमागे वेदना', 'सांधेदुखी', 'पुरळ', 'டெங்கு', 'கண் வலி', 'மூட்டு வலி', 'தடிப்பு',
            'డెنگ్యూ', 'కంటి నొప్పి', 'కీళ్ల నొప్పులు', 'మచ్చలు', 'ডেঙ্গু', 'চোখের পেছনে ব্যথা', 'জয়েন্টে ব্যথা', 'গায়ে ফুসকুড়ি'
          ]
        },
        {
          name: 'Typhoid / टाइफाइड',
          keywords: [
            'typhoid', 'weakness', 'stomach pain', 'belly pain', 'vomiting', 'fatigue', 'persistent fever',
            'कमजोरी', 'पेट दर्द', 'उल्टी', 'thakan', 'kamjori', 'pet dard', 'ulti',
            'टायफॉइड', 'अशक्तपणा', 'पोटदुखी', 'उलट्या', 'ashaktapana', 'potduchi', 'ulatya',
            'டைபாய்டு', 'சோர்வு', 'வயிற்று வலி', 'வாந்தி', 'sorvu', 'vayitru', 'vaandhi',
            'టైఫాయిడ్', 'బలహీనత', 'కడుపు నొప్పి', 'వాంతులు', 'balahinata', 'kadupu', 'vaantulu',
            'টাইফয়েড', 'দুর্বলতা', 'পেটে ব্যথা', 'বমি', 'durbolota', 'pet betha', 'bomi'
          ]
        },
        {
          name: 'Tuberculosis (TB) / टीबी (तपेदिक)',
          keywords: [
            'tb', 'tuberculosis', 'chronic cough', 'cough blood', 'chest pain', 'weight loss', 'night sweat',
            'टीबी', 'खांसी', 'खून वाली खांसी', 'छाती में दर्द', 'वजन कम होना', 'khansi', 'khoon khansi', 'chhati me dard',
            'क्षयरोग', 'खोकला', 'छातीत दुखणे', 'वजन कमी होणे', 'khokla', 'chhatit',
            'காசநோய்', 'இருமல்', 'சளி', 'மார்பு வலி', 'எடை குறைதல்', 'irumal', 'sali',
            'క్షయవ్యాధి', 'దగ్గు', 'గుండె నొప్పి', 'బరువు తగ్గడం', 'daggu', 'gunde',
            'যক্ষ্মা', 'টিबी', 'কাশি', 'বুকে ব্যথা', 'ওজন হ্রাস', 'kashi', 'buke'
          ]
        },
        {
          name: 'Diarrhea & Cholera / हैजा (डायरिया)',
          keywords: [
            'diarrhea', 'diarrhoea', 'loose stool', 'watery stool', 'vomit', 'stomach cramp', 'dehydration', 'thirst', 'dast',
            'दस्त', 'पेचिश', 'उल्टी', 'मरोड़', 'प्यास', 'pani dast', 'pet marod', 'pyas',
            'अतिसार', 'जुलाब', 'उलट्या', 'संडास', 'julab', 'ulatya', 'sandas',
            'வயிற்றுப்போக்கு', 'பேதி', 'வாந்தி', 'vayitru pokku', 'bedhi', 'vaandhi',
            'విరేచనాలు', 'వాంతులు', 'కడుపు తిప్పడం', 'virechanalu', 'vaantulu',
            'ডায়রিয়া', 'পাতলা পায়খানা', 'বমি', 'পেট কামড়ানো', 'patla paikana', 'bomi', 'cholera'
          ]
        },
        {
          name: 'Dysentery / पेचिश (खूनी दस्त)',
          keywords: [
            'blood stool', 'bloody stool', 'dysentery', 'khoon potty', 'khonni dast', 'amoebic', 'bacillary',
            'खून वाली लैट्रिन', 'दस्त में खून'
          ]
        },
        {
          name: 'Jaundice / पीलिया (हेपेटाइटिस)',
          keywords: [
            'jaundice', 'yellow skin', 'yellow eyes', 'dark urine', 'pale stool', 'hepatitis', 'liver', 'loss of appetite',
            'पीलिया', 'पीली त्वचा', 'पीली आंखें', 'गहरा पेशाब', 'भूख न लगना', 'piliya', 'pila peshab', 'bhookh na',
            'कावीळ', 'पिवळी त्वचा', 'पिवळे डोळे', 'गडद लघवी', 'भूक न लागणे', 'kavil', 'pivle dole',
            'மஞ்சள் காமாலை', 'மஞ்சள் கண்', 'சிறுநீர்', 'பசியின்மை', 'kamalai', 'manjal kan',
            'కామెర్లు', 'పసుపు కళ్ళు', 'మూత్రం', 'ఆకలి లేకపోవడం', 'kamerlu', 'pasupu kallu',
            'জন্ডিস', 'চোখ হলুদ', 'প্রস্রাব হলুদ', 'ক্ষুধা মন্দা', 'jondis', 'chokh holud'
          ]
        },
        {
          name: 'Urinary Tract Infection (UTI) / यूरिन इन्फेक्शन (UTI)',
          keywords: [
            'uti', 'urine', 'urination', 'burn urine', 'burning', 'frequent urine', 'urinary', 'bladder', 'lower stomach pain',
            'यूरिन इन्फेक्शन', 'पेशाब में जलन', 'बार-बार पेशाब', 'पेट के निचले हिस्से में दर्द', 'peshab jalan', 'jalan', 'baar baar',
            'मूत्रमार्गगात संसर्ग', 'लघवी करताना जळजळ', 'वारंवार लघवी', 'laghvit jaljal', 'varanvar laghvi',
            'சிறுநீர் தொற்று', 'சிறுநீர் கழிக்கும் போது எரிச்சல்', 'அடிக்கடி சிறுநீர்', 'erichal', 'siruneer',
            'మూత్రనాళ ఇన్ఫెక్షన్', 'మూత్రంలో మంట', 'మంట', 'mutramlo manta', 'manta',
            'ইউরিন ইনফেকশন', 'প্রস্রাবের সময় জ্বালাপোড়া', 'ঘন ঘন প্রস্রাব', 'mutre jala'
          ]
        },
        {
          name: 'Pneumonia / न्यूमोनिया (फेफड़ों का संक्रमण)',
          keywords: [
            'pneumonia', 'breathing difficulty', 'short breath', 'lung', 'wheezing',
            'सांस की तकलीफ', 'सांस फूलना', 'sans phulna', 'sans takleef',
            'श्वास घेण्यास त्रास', 'श्वास कोंडणे', 'shwas ghenyas tras',
            'மூச்சு திணறல்', 'moochu thinaral',
            'శ్వాస తీసుకోవడంలో ఇబ్బంది', 'శ్వాస ఆడకపోవడం', 'swasa ibbandhi',
            'নিউমোনিয়া', 'শ্বাসকষ্ট', 'shwaskosto'
          ]
        },
        {
          name: 'Anaemia / एनीमिया (खून की कमी)',
          keywords: [
            'anemia', 'anaemia', 'weakness', 'dizzy', 'dizziness', 'pale', 'pale skin', 'fatigue', 'iron deficiency', 'low blood',
            'एनीमिया', 'खून की कमी', 'कमजोरी', 'चक्कर आना', 'पीला शरीर', 'kamjori', 'chakkar', 'khoon ki kami',
            'ॲनिमिया', 'रक्ताची कमतरता', 'अशक्तपणा', 'चक्कर येणे', 'raktachi kamtarta', 'chakkar yene',
            'இரத்த சோகை', 'சோர்வு', 'தலைச்சுற்றல்', 'இரத்தம் குறைவு', 'ratha sogai', 'thalaichutral',
            'రక్తహీనత', 'బలహీనత', 'కళ్ళు తిరగడం', 'రక్తం తక్కువ', 'raktha heenatha', 'kallu thiragadam',
            'অ্যানিমিয়া', 'রক্তস্বল্পতা', 'দুর্বলতা', 'মাথা ঘোরা', 'roktolpota', 'matha ghora'
          ]
        },
        {
          name: 'Chickenpox / चेचक (छोटी माता)',
          keywords: [
            'chickenpox', 'blister', 'spots', 'vesicle', 'vesicles', 'chechak', 'chchale', 'daane'
          ]
        },
        {
          name: 'Measles / खसरा',
          keywords: [
            'measles', 'khasra', 'koplik', 'watery eyes', 'coryza', 'photophobia'
          ]
        },
        {
          name: 'Heatstroke / लू लगना (हाइपरथर्मिया)',
          keywords: [
            'heatstroke', 'sunstroke', 'garmi', 'heat exposure', 'hyperthermia', 'collapse'
          ]
        },
        {
          name: 'Snakebite / सांप का काटना',
          keywords: [
            'snake', 'bite', 'fang', 'saanp', 'pambu', 'paambu'
          ]
        },
        {
          name: 'Acute Respiratory Infection / तीव्र श्वसन संक्रमण',
          keywords: [
            'respiratory', 'breathless', 'cough', 'fever', 'runny nose', 'sore throat'
          ]
        },
        {
          name: 'Viral Fever & Cold / सामान्य बुखार और सर्दी',
          keywords: [
            'fever', 'cough', 'headache', 'body pain', 'bodyache', 'cold', 'runny nose', 'sore throat',
            'बुखार', 'खांसी', 'सिर दर्द', 'शरीर दर्द', 'सर्दी', 'जुकाम', 'गले में खराश',
            'ताप', 'खोकला', 'डोकेदुखी', 'अंगदुखी', 'सर्दी',
            'காய்ச்சல்', 'இருமல்', 'தலைவலி', 'உடல் வலி', 'சளி',
            'జ్వరం', 'దగ్గు', 'తలనొప్పి', 'ఒంటి నొప్పులు', 'జలుబు',
            'জ্বর', 'কাশি', 'মাথাব্যথা', 'গা betha', 'সর্দি'
          ]
        }
      ];

      let bestMatch = null;
      let maxScore = 0;

      for (const d of rules) {
        let score = 0;
        for (const kw of d.keywords) {
          if (clean.includes(kw)) {
            score += 1;
          }
        }
        const nameLower = d.name.toLowerCase();
        const parts = nameLower.split(' / ');
        if (clean.includes(parts[0]) || (parts[1] && clean.includes(parts[1]))) {
          score += 5;
        }
        if (score > maxScore) {
          maxScore = score;
          bestMatch = d.name;
        }
      }

      if (maxScore === 0) {
        if (clean.includes('pain') || clean.includes('dard') || clean.includes('दर्द')) {
          return 'Viral Fever & Cold / सामान्य बुखार और सर्दी';
        }
        if (clean.includes('cough') || clean.includes('khansi') || clean.includes('खांसी')) {
          return 'Acute Respiratory Infection / तीव्र श्वसन संक्रमण';
        }
        return 'Undetermined Symptoms / अनिर्धारित लक्षण';
      }

      return bestMatch;
    }

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
        const friendly = predictDiseaseLocal(text);
        const advice = LOCAL_ADVISORIES[friendly] || 'Consult your local ASHA worker or visit the nearest PHC.';
        prediction = `${friendly} - Reliable Advice: ${advice}`;
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
      try {
        await db.run(
          `INSERT INTO village_health (villageId, name, population, pregnant_women, children_under_5, malnutrition_cases, asha_contact)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(villageId) DO UPDATE SET
           name = excluded.name,
           population = excluded.population,
           pregnant_women = excluded.pregnant_women,
           children_under_5 = excluded.children_under_5,
           malnutrition_cases = excluded.malnutrition_cases,
           asha_contact = excluded.asha_contact`,
          [villageId, name, population, pregnant, children, malnutrition, contact]
        );
        res.send({ status: 'Updated Node Axis.' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Failed to update village info.' });
      }
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

        await db.run('INSERT INTO ambulance_requests (user_id, name, location, priority, symptoms, status) VALUES (?, ?, ?, ?, ?, ?)',
          [req.user.id, userName, village, 'Pad Request', 'Requires Sanitary Pads delivered to village.', 'pending']
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
          reply: "Hello! I'm Sakhi. My advanced AI brain is currently being updated to better serve you. For now, please refer to the verified health tips above or contact your local ASHA worker for any health concerns. I'll be back fully soon!",
          grounded: false,
          sources: ["Sakhi Health Assistant — General Information"],
          urgency: "P4"
        });
      }

      // Try RAG-powered endpoint first (grounded in WHO/ASHA guidelines)
      try {
        const ragRes = await axios.post(`${AI_URL}/ai/rag-chat`, { message }, { timeout: 12000 });
        return res.send({
          reply: ragRes.data.reply,
          sources: ragRes.data.sources || [],
          urgency: ragRes.data.urgency || 'P4',
          grounded: true
        });
      } catch (ragErr) {
        console.warn('[Sakhi] RAG service unavailable, falling back to direct Groq with hard guardrails:', ragErr.message);
      }

      // Node.js Level Guardrails (Direct Fallback)
      const queryClean = message.trim().toLowerCase().replace(/[?!.,]/g, '');

      // Quick Greetings or Identity/Help inquiries
      const GREETINGS = ["hi", "hello", "namaste", "helo", "hey", "hola", "kaise ho", "good morning", "good evening", "namaskar", "pranam", "kya ho", "kaun ho", "who are you", "what is this", "intro", "sakhi"];
      const isGreeting = GREETINGS.some(g => queryClean === g || queryClean.startsWith(g + " ")) && message.split(/\s+/).length <= 4;

      const HEALTH_KEYWORDS = [
        // Menstrual / Periods / Intimate health
        "period", "menses", "mahvari", "mahavari", "maahvaari", "pad", "pads", "sanitary", "hygiene", "bleed", "bleeding",
        "mowho", "mahavari", "chhati", "pain", "dard", "discharge", "cycle", "white discharge", "periods", "pelvic",
        // Pregnancy & Maternal
        "pregnant", "pregnancy", "garbh", "garbhavastha", "delivery", "birth", "bacha", "bachhe", "bacche", "child",
        "nutrition", "breastfeed", "dudh", "doodh", "feed", "mother", "anc", "pcos", "weight", "acne",
        // Symptoms & Clinical Terms
        "fever", "bukhar", "vomit", "vomiting", "ultee", "diarrhea", "loose stool", "dast", "dehydration", "snake",
        "snakebite", "saanp", "heat", "heatstroke", "loo", "ambulance", "hospital", "phc", "doctor", "illness",
        "disease", "samasya", "bimar", "bimari", "vaccine", "dawa", "medicine", "cough", "tb", "tuberculosis",
        "malaria", "dengue", "typhoid", "hypertension", "bp", "pressure", "heart", "ors", "zinc"
      ];
      const hasHealthKeyword = HEALTH_KEYWORDS.some(k => queryClean.includes(k));

      // Hard out-of-scope block: completely unrelated queries (e.g. sports, entertainment, abuse)
      if (!isGreeting && !hasHealthKeyword) {
        return res.send({
          reply: "Namaste! Main Sakhi hoon, aapki women's health assistant. Main keval mahila aur parivaar ke swasthya, pregnancy, aur periods se jude sawalon ke jawab de sakti hoon. Kripya swasthya se juda sawal poochein.",
          sources: ["Sakhi Health Assistant — General Information"],
          urgency: "P4",
          grounded: false
        });
      }

      // Fallback: direct Groq call (Hardened System Prompt)
      try {
        let systemPrompt = "";
        if (isGreeting) {
          systemPrompt = `You are Sakhi, a warm, polite, and trusted female Women's & Family Health Assistant for rural India.
The user is saying hello. Respond with a warm, culturally polite greeting in the exact SAME language or Hinglish style they used.
Introduce yourself as Sakhi, and invite them to ask you any questions about pregnancy care, menstrual hygiene, periods, maternal health, or child nutrition.
Keep your response extremely brief (2 sentences max). Do NOT mention any medical rules or diseases in this greeting.
FEMALE PERSONA RULE: You are female. Use feminine verb endings in Hindi/Hinglish (e.g. use "sakti hoon", "karungi", "bolungi" — NEVER use masculine "karunga", "saku", "bolunga", "jaunga").`;
        } else {
          systemPrompt = `You are Sakhi, a warm, polite, and highly trusted female Women's & Family Health Assistant for rural India.
Provide safe, accurate, empathetic guidance on menstrual health, pregnancy care, nutrition, hygiene, and when to see a doctor.
FEMALE PERSONA RULE: You are female. You MUST use feminine grammar and verb endings in Hindi/Hinglish (e.g. use "sakti hoon", "karungi", "bolungi" — NEVER use masculine "karunga", "saku", "bolunga", "jaunga").
CRITICAL CLINICAL & TRANSLATION SAFEGUARDS:
1. Menstruation/Periods/Mowho: Explain it strictly as a normal monthly biological process where the uterus lining (garbhashay ki lining) sheds, causing blood flow (khoon ka bahaw).
2. ABSOLUTE BAN ON HAIR TRANSLATION: Never under any circumstances translate period bleeding or flow as hair ("baal" or "balon" or "balon ka nikaas"). Doing so is medically incorrect and unsafe.
3. ABSOLUTE BAN ON MYTHS: Do NOT mention any non-scientific cultural taboos, bad blood, toxins, impurities, bad spirits, or curses.
4. Keep responses strictly concise: 2-3 sentences maximum. Never diagnose or prescribe medicines — always recommend consulting a doctor or local ASHA worker.`;
        }

        const groqRes = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ],
            temperature: 0.35,
            max_tokens: 300
          },
          { headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' } }
        );
        const reply = groqRes.data.choices?.[0]?.message?.content || 'I could not process your question. Please try again.';
        res.send({
          reply,
          sources: ["Sakhi Health Assistant — General Information"],
          urgency: "P4",
          grounded: false
        });
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
    app.post('/api/requests', auth, _removedTableHandler);
    app.get('/api/requests', auth, _removedTableHandler);
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

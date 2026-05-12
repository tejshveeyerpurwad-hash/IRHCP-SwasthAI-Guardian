# SwasthAI Guardian 🌿
### Integrated Rural Health Platform · AI-Powered · Offline-First · Built for Bharat

> **SwasthAI Guardian** is a production-grade, multi-role healthcare platform designed for India's 600,000+ villages. It connects rural citizens, ASHA health workers, NGO field teams, and district hospital administrators through custom-trained machine learning, an offline-first architecture, full voice interaction, and native support for 5 Indian languages.

---

## 🏆 Why SwasthAI is Different

Most health apps call a third-party AI API and display the result. SwasthAI **owns its intelligence** and operates without a stable internet connection.

| What others do | What SwasthAI does |
|---|---|
| Single role (patient only) | 3 roles: Villager · NGO · Admin |
| Requires internet | Offline-first with graceful AI fallback |
| English only | 5 languages: English, Hindi, Marathi, Tamil, Bengali |
| Text-only interaction | Voice **in** (speech-to-text) + Voice **out** (text-to-speech) |
| Generic LLM answers | Grounded RAG — every Sakhi answer cites WHO/ASHA/FOGSI |
| No disease model | Custom Random Forest at 91.3% accuracy |
| No privacy compliance | DISHA 2023 consent modal on first login |
| Crashes when AI is down | KB-chunk fallback — system never fails silently |

---

## 🗺️ System Architecture

```
┌─────────────────────────┐     ┌──────────────────────────┐     ┌──────────────────────────┐
│   React + Vite Frontend │────▶│  Node.js + Express API   │────▶│  FastAPI AI Microservice │
│   Port 5173 (PWA)       │     │  Port 5000               │     │  Port 8000               │
│                         │     │                          │     │                          │
│  ● Luminous Emerald UI  │     │  ● JWT Auth + bcryptjs   │     │  ● Disease RF Model      │
│  ● 5-language i18n      │     │  ● Rate Limiting         │     │  ● Pregnancy Risk AI     │
│  ● Edge AI Skin Scan    │     │  ● Cluster Load Balance  │     │  ● Malnutrition (WHO)    │
│  ● Voice In + Out       │     │  ● SQLite (offline safe) │     │  ● Sakhi RAG (38 chunks) │
│  ● PWA installable      │     │  ● CORS Whitelist        │     │  ● Skin Pixel Analysis   │
│  ● DISHA Consent Gate   │     │  ● 8s AI timeouts        │     │  ● Outbreak Agent        │
│  ● Offline fallback UI  │     │  ● Offline fallback resp │     │  ● Groq → KB fallback    │
└─────────────────────────┘     └──────────────────────────┘     └──────────────────────────┘
```

---

## ⚙️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite 5, Framer Motion 12, Lucide React, Recharts, React Router 6 |
| **PWA** | `vite-plugin-pwa`, Web App Manifest, Service Worker, offline caching |
| **Styling** | Tailwind CSS 3 — "Luminous Emerald Light" custom design system |
| **Backend** | Node.js (ESM), Express 4, SQLite3, JWT, bcryptjs, express-rate-limit, axios |
| **AI Service** | Python, FastAPI, scikit-learn, pandas, joblib, PIL, Groq (Llama-3.1-8b) |
| **RAG Engine** | Custom NumPy cosine similarity — no vector DB required |
| **Agentic AI** | Autonomous outbreak monitor (Groq + FastAPI background thread) |
| **Auth** | bcryptjs password hashing, JWT 7-day tokens, OTP login mode |
| **Privacy** | DISHA 2023 consent modal, role-based access control, CORS whitelist |

---

## 🤖 AI Model & Training Details

```
Model        : Random Forest Classifier (300 estimators, max_depth=None)
Vectorizer   : TF-IDF (unigrams + bigrams, sublinear_tf=True)
Dataset      : 228 curated rural India symptom-disease samples
               (English + transliterated Hindi symptoms)
Test Accuracy: 91.3%
CV Accuracy  : 91.7% (5-fold cross-validation)
Classes (12) : Typhoid · Malaria · Dengue · Tuberculosis · Cholera
               Viral Fever · Pneumonia · Anaemia · Jaundice
               Dysentery · Chickenpox · Measles

Skin Analyser: On-device PIL pixel analysis — no photo uploaded to cloud
Pregnancy AI : Vitals-based (BP systolic/diastolic, blood sugar, heart rate)
               Live MoHFW danger banner when BP ≥ 160/110 mmHg
Malnutrition : WHO Z-score + MUAC classification
Outbreak AI  : Groq Llama-3.1 autonomous epidemiology agent (30-min scan)
```

To retrain the disease model:
```bash
cd ai-service
python train_disease_model.py   # regenerates disease_model.pkl + model_accuracy.txt
```

---

## ✨ Feature Breakdown

### 👨‍🌾 Villager Dashboard (Rural Citizens)

| Feature | Details |
|---|---|
| **Symptom Checker** | Select symptoms → Custom RF AI → 3-tier severity (P1/P2/P3) → next steps in local language. Voice input supported. |
| **Sakhi — Women's Health AI** | Private RAG chatbot. Grounded in 38 WHO/MoHFW/FOGSI/ASHA/UNICEF citations. Voice output (press 🔊). Auto-speaks P1/P2 emergencies. Cites source with every answer. Groq falls back to KB chunk if API down. |
| **Skin Disease Checker** | On-device PIL pixel analysis. No photo leaves the device. Camera + file upload. 3-question clinical confirmation. Downloadable `.txt` health report. |
| **Emergency Ambulance** | One-tap SOS. Real GPS coordinates captured via `navigator.geolocation`. Voice-to-text for landmark description. Offline fallback shows `tel:108`. |
| **Sanitary Pad Request** | Discreet ASHA delivery request — private, no names visible to others. |
| **Health Profile** | Secure health ID, past AI predictions, village ID, name management. |
| **Offline Mode** | All features degrade gracefully. Symptom check returns advisory message. Ambulance shows 108 call link. Sakhi returns KB-chunk answer. |
| **PWA Install** | "Add to Home Screen" on any Android or iOS — no app store needed. |

### 🏥 NGO / ASHA Dashboard (Field Health Workers)

| Feature | Details |
|---|---|
| **Maternal Health Tracker** | WHO-protocol pregnancy risk AI. Form collects **real vitals**: Systolic BP, Diastolic BP, Blood Sugar (mmol/L), Heart Rate. Live-color-coded sliders with danger thresholds. Pulsing red MoHFW banner fires instantly when BP ≥ 160/110. |
| **Child Nutrition Monitor** | Weight/height/age inputs. WHO Z-score + BMI calculation. NHM protocol referral advice. SAM/MAM classification. |
| **Village Health Dashboard** | Population stats, pregnancy cases, malnutrition counts, pad request alerts per village. |
| **Outbreak Alerts** | AI-detected disease cluster notifications from the autonomous agent. |
| **Ambulance Feed** | Live emergency request log for NGO area. |

### 🏛️ Admin Dashboard (District Hospital / Government)

| Feature | Details |
|---|---|
| **District Analytics** | Real-time KPI dashboard across all registered villages with Recharts visualizations. |
| **Outbreak Radar** | AI agent auto-classifies symptom clusters every 30 minutes. Auto-alert if 5+ similar cases from one village. Groq Llama-3.1 epidemiology classification. |
| **CSV Export** | Download full district health data as a spreadsheet. |
| **Ambulance Management** | Full emergency request log with timestamps and GPS coordinates. |
| **Village Registry** | Add/manage village records, ASHA contacts, population data. |

### 🔐 Security & Privacy

| Feature | Details |
|---|---|
| **DISHA 2023 Compliance** | Consent modal on first login. Shows 4 privacy rights in bilingual Hindi/English. Cites Digital Information Security in Healthcare Act 2023 and IT Act 2008. Stored in `localStorage` — fires once per device. |
| **Auth** | bcryptjs password hashing (10 salt rounds), JWT 7-day tokens. |
| **OTP Login** | Phone-based OTP login fallback. Rate-limited to 15 attempts/15 min. |
| **CORS** | Whitelist-only via `ALLOWED_ORIGINS` environment variable. |
| **Role-Based Access** | Every sensitive route uses `checkRole()` middleware. Villagers cannot access NGO/admin data. |
| **Agentic Auth** | Outbreak agent uses `X-Agent-Secret` header for internal API calls. |

---

## 📱 Rural Mobile Optimizations

Designed to work on ₹3,000–₹7,000 Android phones on 2G/3G:

| Optimization | Implementation |
|---|---|
| **No tap delay** | `touch-action: manipulation` on all interactive elements |
| **No auto-zoom** | `text-size-adjust: 100%` — forms don't zoom on iOS |
| **Battery saving** | `@media (prefers-reduced-motion: reduce)` kills all animations |
| **WCAG tap targets** | `.tap-target` utility — minimum 44×44px for fat-finger usability |
| **2G timeout** | 8-second axios timeout — never hangs forever |
| **Offline toast** | YouTube-style banner when data cuts mid-session |
| **PWA caching** | Core assets cached on install — loads without internet |

---

## 🌐 Language Support (5 Indian Languages)

Full bilingual Hindi/English labels across all villager-facing UI. The RAG engine matches queries in:
- 🇮🇳 **Hindi** (`bahut zyada bleeding`, `bukhar`, `pet dard`)
- 🇮🇳 **Marathi** (`aajar`, `taap`)
- 🇮🇳 **Tamil** (`kaaichal`, `vayiru vali`)
- 🇮🇳 **Bengali** (`jor`, `pet byatha`)
- 🇬🇧 **English**

The language toggle is persistent and affects all UI strings, AI prompts, and voice synthesis language.

---

## 🚀 Local Development Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- pip

### 1. AI Service (start first)
```bash
cd ai-service
pip install -r requirements.txt
python train_disease_model.py        # trains & saves disease_model.pkl
uvicorn main:app --reload --port 8000
```

### 2. Backend API
```bash
cd backend
cp .env.example .env                 # set GROQ_API_KEY, JWT_SECRET, ALLOWED_ORIGINS
npm install
npm run dev                          # starts on port 5000
```

> SQLite database (`swasth_guardian.sqlite`) is created automatically on first run.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                          # opens http://localhost:5173
```

### Environment Variables (backend/.env)
```env
PORT=5000
JWT_SECRET=your_jwt_secret_here
GROQ_API_KEY=your_groq_api_key_here
AI_SERVICE_URL=http://127.0.0.1:8000
ALLOWED_ORIGINS=http://localhost:5173
AGENT_SECRET=your_agent_secret_here
```

---

## 🎭 Demo Credentials

A **Demo Credentials banner** is shown at the bottom of the login page.

| Role | Login Mode |
|---|---|
| **Villager** | OTP mode → Enter any phone → OTP: `1234` |
| **NGO Worker** | OTP mode → Enter any phone → OTP: `1234` (select NGO role) |
| **Admin** | OTP mode → Enter any phone → OTP: `1234` (select Admin role) |

> On first login, the DISHA 2023 consent modal will appear. Click "Haan, Main Samjha — I Agree" to proceed.

---

## 📁 Repository Structure

```
Swasthai-Guardian-Up/
├── frontend/                     # React + Vite PWA
│   └── src/
│       ├── App.jsx               # Router + ConsentGate (DISHA modal)
│       ├── index.css             # Design system + mobile optimizations
│       ├── Admin/                # AdminDashboard.jsx
│       ├── NGO/                  # NGODashboard.jsx
│       ├── Villager/             # VillagerDashboard.jsx
│       ├── pages/                # Feature pages (13 active routes)
│       │   ├── SymptomCheckerPage.jsx
│       │   ├── SkinDiseaseCheckerPage.jsx
│       │   ├── AmbulancePage.jsx
│       │   ├── MenstrualHealth.jsx   ← Sakhi RAG + Voice I/O
│       │   ├── MaternalHealthPage.jsx ← Real vitals sliders
│       │   ├── ChildNutritionPage.jsx
│       │   ├── LoginPage.jsx
│       │   ├── RegisterPage.jsx
│       │   ├── UserProfile.jsx
│       │   ├── LandingPage.jsx
│       │   └── IntroFlow.jsx
│       ├── components/
│       │   ├── Navbar.jsx
│       │   ├── Footer.jsx
│       │   ├── OfflineToast.jsx      ← YouTube-style offline banner
│       │   └── DiSHAConsentModal.jsx ← DISHA 2023 consent gate
│       ├── context/
│       │   ├── AuthContext.jsx       ← JWT + bcrypt auth
│       │   └── LanguageContext.jsx   ← 5-language i18n
│       └── services/
│           └── api.js                ← 8s timeout + error interceptor
│
├── backend/
│   └── server.js                 # 665 lines — all routes, auth, DB schema
│
├── ai-service/
│   ├── main.py                   # 7 FastAPI endpoints
│   ├── rag_service.py            # Sakhi RAG with Groq + KB fallback
│   ├── outbreak_agent.py         # Autonomous 30-min epidemic scanner
│   ├── skin_analyzer.py          # On-device PIL pixel analysis
│   ├── train_disease_model.py    # RF model training script
│   ├── disease_model.pkl         # Trained classifier (91.3% accuracy)
│   └── requirements.txt
│
└── README.md
```

---

## 🧠 Sakhi RAG Architecture (Women's Health AI)

Sakhi is not a generic chatbot. Every answer is grounded in clinical guidelines:

```
User query (any language)
       ↓
Multilingual keyword matching (Hindi/Marathi/Tamil/Bengali/English)
       ↓
NumPy cosine similarity against 38 knowledge chunks
       ↓
Top-3 chunks selected from:
   • WHO Reproductive Health Guidelines 2022
   • MoHFW ASHA Training Module 6 & 7
   • FOGSI Clinical Protocols 2023
   • ICMR Anaemia Guidelines
   • UNICEF Maternal Nutrition Framework
   • NHM India Menstrual Hygiene Scheme
       ↓
Groq Llama-3.1-8b-instant (10s timeout)
   ├── Success → Structured answer with citation + urgency badge
   └── Failure → Top-1 KB chunk served directly (never silent failure)
       ↓
Response includes: answer · sources[] · urgency (P1/P2/P3/P4)
Voice output via SpeechSynthesisUtterance (🔊 button per message)
```

---

## 👥 Development Team

| Name | Role |
|---|---|
| **Divyansh Gupta** | Team Leader · AI/ML · Backend Architecture · AI Service · Deployment|
| **Tejshvee Yerpurwad** | Frontend · UX Design · Language Support · RAG Engine |

---

## 📜 Compliance & Standards

| Standard | Implementation |
|---|---|
| **DISHA 2023** | Digital Information Security in Healthcare Act — consent modal |
| **IT Act 2008** | Sensitive Personal Data Rules — JWT + role-based access |
| **WHO Guidelines** | Maternal, reproductive, malnutrition — cited in RAG chunks |
| **MoHFW Protocols** | ASHA training modules — integrated into Sakhi knowledge base |
| **WCAG 2.5.5** | 44×44px minimum tap targets for accessibility |
| **NHM India** | National Health Mission protocols for menstrual hygiene and child nutrition |

---

> *SwasthAI Guardian — Built for Bharat's villages, not just its cities.*  
> *"We didn't build AI for doctors. We built it for the 600,000 villages that don't have one."*

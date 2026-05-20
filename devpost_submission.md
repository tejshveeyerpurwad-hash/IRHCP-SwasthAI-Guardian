# SwasthAI Guardian: Integrated Rural Health Platform

> **Note to Judges:** Our attached demo video showcases the V1 foundation of our platform. Below is the documentation for our **V2 Production Upgrade**, which introduces Grounded RAG, Offline Login,  Local Offline Maternal/Child Sync, and an Autonomous Outbreak Agent. check GitHub Readme.md for v1 and v2 differences

A production-grade, AI-powered healthcare platform built for rural India. Connecting remote villagers, ASHA health workers, and district hospitals through real machine learning, offline-first architecture, and regional language support.

---

## Inspiration

Over 65% of India’s population resides in rural areas, yet access to healthcare infrastructure remains severely limited. We were inspired by ASHA (Accredited Social Health Activist) workers who tirelessly serve these communities under challenging circumstances, often relying on manual paper records, facing poor cellular connectivity, and having limited clinical tools.

Our goal was to build a scalable, AI-powered digital health ecosystem that bridges this gap—providing villagers with immediate, accessible medical guidance in their native language, while equipping frontline workers and district authorities with real-time, proactive data to stop outbreaks before they become epidemics.

---

## What it does

**SwasthAI Guardian** is an offline-first, role-based healthcare platform connecting Villagers, ASHA/NGO workers, and Hospital Administrators into a single unified ecosystem.

### 🚀 Technical Differentiation (V1 to V2 Evolution)

Most health applications simply call a third-party AI API and display the result. SwasthAI owns its intelligence and operates securely, even without a stable internet connection:

*   **Custom Medical AI & Input Guardrails (Upgraded to V2):** We evolved from our V1 Random Forest model to a custom Transformer-based Deep Learning model (**SymptomNet**) achieving **96.8% diagnostic accuracy**. More importantly, we implemented **under-the-hood clinical text guardrails** that detect and block keyboard mashing, repeated character spam, and off-topic conversations in English, Hindi, and Tamil, utilizing a **Double-Uncertainty Safety Gate** to prevent hallucinated diagnoses.
*   **Deterministic Clinical Heuristic Fallback (V2 Upgrade - Trust & Safety First):** If the neural models are uncertain (< 40% confidence) due to ambiguous symptoms, the system absolutely refuses to guess or hallucinate. Instead, it routes the query to a deterministic, offline-capable rule engine built on ASHA guidelines. It safely maps known rural symptom clusters (e.g. weakness + dizziness) to highly accurate first-aid advice, and if undetermined, gracefully advises the villager to consult their local ASHA worker. This zero-hallucination approach maximizes patient trust and ensures no false information is provided.
*   **"Sakhi" Women's Health AI (Upgraded to V2 Grounded RAG):** Our private conversational AI for women's health is now powered by a **Grounded RAG (Retrieval-Augmented Generation)** system. It retrieves clinical guidelines from 38 official WHO/MoHFW sources before answering, citing its sources, supporting voice output, and failing over to local knowledge base chunks if the primary AI API is unreachable.
*   **Under-the-Hood Offline Sync (Maternal & Child Health - V2):** NGO/ASHA workers can now register maternal pregnancy vitals and child nutrition assessments in zero-signal zones. The app computes risk levels and growth status instantly client-side using **local clinical heuristic engines** (WHO blood pressure criteria and BMI Z-score indexes), queuing records locally with visual **"Sync Pending"** indicators, and silently uploading them as soon as the browser detects an internet signal.
*   **Edge Visual Guardrails & Image Compression (V2):** Before uploading skin photos, a browser-side Pillow validation layer downscales the image to a `16x16` grid in sub-milliseconds to verify skin tone presence, standard deviation (blank checks), and structural edge density (blur checks). If passed, the image is compressed from 5MB+ down to `< 200KB` on-the-fly to guarantee successful uploads over 2G/3G connections.
*   **Agentic Outbreak Radar (V2):** An autonomous background AI agent scans village clinical data every 30 minutes. If it detects a localized symptom cluster (e.g., 5+ cases of fever in one village within 24 hours), it triggers instant, targeted notifications for both District Admins and local ASHA workers to stop outbreaks before they become epidemics.
*   **Hardened Offline-First Login:** We engineered an **Offline-First Login**. Using IndexedDB and Service Workers, ASHA workers in zero-signal zones can securely log in, verify credentials, access cached data, and record patient vitals.
*   **Smart Share Peer-to-Peer:** A high-visibility Share Button generates a **Dynamic QR Code**, allowing villagers and ASHA workers to distribute the PWA instantly without needing an app store or internet connection.
*   **Full Native Localization & Voice:** The entire platform dynamically supports **6 languages natively** (English, Hindi, Marathi, Tamil, Telugu, and Bengali) with 100% translation key synchronization (366 unique keys) and Voice-to-Text integration ensuring non-literate users can interact with complex medical AI seamlessly.

---

## System Architecture — Microservices

SwasthAI Guardian is built on a **true 3-service Microservices Architecture**. Each service is independently deployable, fault-isolated, and communicates over internal HTTP JSON APIs. This means if the AI service goes down, the backend continues serving auth, records, and ambulance requests without any interruption.

```text
+-------------------------+     +--------------------------+     +------------------------+
|   React + Vite Frontend |---->|  Node.js + Express API   |---->|  FastAPI AI Service    |
|   (Offline PWA Mode)    |     |  (Secure Backend Hub)    |     |  (Neural AI Engine)    |
|                         |     |                          |     |                        |
|  * Luminous Emerald UI  |     |  * JWT Auth & Bcrypt     |     |  * SymptomNet (96.8%)  |
|  * 6-Language i18n      |     |  * Cluster Load Balance  |     |  * Grounded RAG (Sakhi)|
|  * Offline Login/Sync   |     |  * SQLite (Offline Sync) |     |  * Edge Photo Guardrail|
|  * Voice Input/Output   |     |  * Target Alert Routing  |     |  * Outbreak Agent Loop |
|  * Smart Share QR       |     |  * DISHA 2023 Compliant  |     |  * Clinical Text Guard |
+-------------------------+     +--------------------------+     +------------------------+
```

---

## Core Features

### 👨 Villager Features

*   **AI Symptom Checker** with multilingual voice input and 96.8% diagnostic accuracy (SymptomNet/RF hybrid).
*   **Clinical Input Filters** under-the-hood to reject gibberish, spam, and non-health topics.
*   **Sakhi Women's Health AI** powered by Grounded RAG using WHO/MoHFW guidelines.
*   **Skin Disease Scanner** with image-based Edge AI assessment and skin tone/blur/blank verification guardrails.
*   **Emergency Ambulance System** with GPS and offline fallback queueing support.
*   **Sanitary Pad Request System** for private, discreet NGO/ASHA assistance.
*   **Voice Input & Voice Output** seamless support.
*   **Offline PWA Support** with Install-to-Home-Screen functionality.
*   **Multilingual Support** for Hindi, Marathi, Tamil, Telugu, Bengali, and English.

---

### 🏥 NGO / ASHA Worker Features

*   **Maternal Health Tracker** with offline registration, real vital sliders, and in-browser WHO risk alerts.
*   **Child Nutrition Monitor** with Z-score, BMI, and malnutrition analysis operating entirely offline.
*   **Village Health Dashboard** for local population health statistics.
*   **AI Outbreak Alerts** for disease cluster detection in assigned villages.
*   **Emergency Ambulance Feed** for local emergency requests.
*   **Smart Share QR System** to instantly distribute the app in rural areas.
*   **Offline Login & Sync** for low-connectivity environments.

---

### 🏛️ Admin Features

*   **District Analytics Dashboard** with real-time village health insights.
*   **Agentic Outbreak Radar** for autonomous epidemic detection.
*   **Village Registry Management** for ASHA/NGO worker assignments.
*   **CSV Export System** for compliant government health reporting.
*   **Emergency Request Monitoring** with dynamic ambulance feeds.
*   **DISHA 2023 Compliant Data Management** with built-in consent modal.
*   **Role-Based Access Control & Secure Reporting**.

---

## How we built it

### Frontend
*   React 18 + Vite
*   Tailwind CSS (Luminous Emerald design system)
*   Service Workers + LocalStorage/IndexedDB
*   Progressive Web App (PWA) configuration

### Backend
*   Node.js + Express API
*   SQLite Database
*   JWT Authentication + Bcrypt

### AI Services & Guardrails
*   Python FastAPI Microservice
*   Transformer Embeddings + SymptomNet Neural Network
*   Random Forest Fallback Model (Tier 2 Safety)
*   Pillow (Skin Tone & Edge Density Segmenter)
*   FastAPI Test Suite
*   Groq-powered Llama 3.3
*   Grounded RAG Architecture
*   Autonomous Outbreak Detection Agent

---

## Challenges we ran into

*   **Failsafe AI Protection:** Handling real-world noisy inputs, spam, keyboard mashes, and non-skin image uploads securely to keep cloud costs low and clinical safety absolute.
*   **Complex Client-Side Clinical Heuristics:** Translating medical Z-score growth indicators and pregnancy risk classifications to browser-side vanilla Javascript so assessments function without an internet connection.
*   **Hardening Offline Authentication:** Creating a bulletproof local fallback login database (`offline_users` registry cache) that safely handles credentials, roles, and session states without throwing gateway errors.
*   **Robust Background Syncing:** Serializing local clinic vitals, Z-score updates, and SOS triggers while maintaining strict order of operations once cell signals recover.
*   **Edge Visual Assessment:** Optimizing visual processing for lower-end rural smartphones.
*   **Multilingual Voice I/O Integration:** Tackling local accent variations and regional speech-to-text transitions offline.
*   **DISHA 2023 Privacy Compliance:** Designing custom user-consent modals and secure local data encryption routines to respect national patient privacy guidelines.

---

## Accomplishments that we're proud of

*   Built a healthcare AI engine with **96.8% diagnostic accuracy** (SymptomNet).
*   Developed **under-the-hood text and image guardrails** that protect the model against noise.
*   Developed complete **offline Login, Registration, and maternal/child sync** registry.
*   Created an **autonomous AI outbreak detection system** running on 30-minute intervals.
*   Achieved **100% multilingual translation key synchronization (366 unique keys)** across 6 Indian languages with voice interaction.
*   Designed a highly polished, production-grade offline-first PWA.
*   Built a **V2 Clinical Heuristic Fallback** — zero-hallucination AI that always returns trusted ASHA-grounded advice even when models are uncertain.

---

## What we learned

We learned that in rural technology, accessibility is just as critical as technological sophistication. Grounding AI in verified clinical data (RAG), enabling offline access, and removing literacy barriers via voice interaction are the true keys to making healthcare inclusive. 

We also learned how proactive AI systems can shift medical response from reactive triage to active epidemic prevention.

---

## What's next for SwasthAI Guardian

*   **National ABDM Integration:** Link village health records with India’s Ayushman Bharat Digital Mission IDs.
*   **SMS Fallback Layer:** Support basic feature phones through lightweight SMS-based symptom checking.
*   **Low-Bandwidth Telemedicine:** Add real-time text/image consult pipelines optimized for ultra-poor data conditions.
*   **Government Partnerships:** Partner with local district ministries to test SwasthAI Guardian in active community clinics.

---

## The Development Team

*   **Divyansh Gupta (Team Leader):** AI/ML, Backend Architecture, Cloud Deployment.
*   **Tejshvee Yerpurwad:** Frontend, UX Design, Localization, Grounded RAG Engine.

***

**SwasthAI Guardian** - *Built for Bharat's villages, not just its cities.*

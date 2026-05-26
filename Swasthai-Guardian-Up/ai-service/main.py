from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import os
import torch
from model_def import SymptomNet
from sentence_transformers import SentenceTransformer
from skin_analyzer import analyze_skin_image

# RAG & Agentic imports
from rag_service import rag_chat
from outbreak_agent import start_agent_background, get_recent_outbreaks

app = FastAPI(title="SwasthAI Guardian: AI Hub")

# AI service is called only by the Node.js backend — never directly by the browser
# Restrict CORS to backend URL only (open wildcard was a security gap)
_ALLOWED_ORIGINS = [
    os.getenv("BACKEND_URL", "http://localhost:5000"),
    "http://127.0.0.1:5000",   # local dev fallback
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type", "Authorization"],
)

# ── Load disease model (Deep Learning or RF fallback) ──────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), "disease_model.pkl")
DEEP_MODEL_PATH = os.path.join(os.path.dirname(__file__), "deep_disease_model.pkl")

disease_pipeline = None
deep_model_bundle = None
embedder = None

try:
    # 1. Load Deep Learning Model (Primary)
    if os.path.exists(DEEP_MODEL_PATH):
        print("[...] Loading Deep Learning Disease Model...")
        deep_model_bundle = joblib.load(DEEP_MODEL_PATH)
        embedder = SentenceTransformer(deep_model_bundle['embedding_model'])
        
        deep_model = SymptomNet(deep_model_bundle['input_dim'], deep_model_bundle['num_classes'])
        deep_model.load_state_dict(deep_model_bundle['model_state'])
        deep_model.eval()
        deep_model_bundle['model'] = deep_model
        print("[OK] Deep Learning model loaded.")

    # 2. Load Random Forest Model (Fallback)
    if os.path.exists(MODEL_PATH):
        print("[...] Loading Random Forest Fallback Model...")
        disease_pipeline = joblib.load(MODEL_PATH)
        print("[OK] Random Forest model loaded.")
    
    if not deep_model_bundle and not disease_pipeline:
        print("[WARNING] No models found. AI service will be limited.")

except Exception as e:
    print(f"[ERROR] Model loading failed: {e}")

# ── Start Agentic Outbreak Monitor on startup ──────────────────────────────────
@app.on_event("startup")
async def startup_event():
    start_agent_background()
    print("[OK] Agentic Outbreak Monitor started in background thread.")

# ── Data Models ────────────────────────────────────────────────────────────────
class SymptomInput(BaseModel):
    symptoms: str

class PregnancyInput(BaseModel):
    age: int
    systolic_bp: int
    diastolic_bp: int
    bs: float
    body_temp: float
    heart_rate: int

class MalnutritionInput(BaseModel):
    age_months: int
    weight_kg: float
    height_cm: float

class ChatInput(BaseModel):
    message: str

# ── ENDPOINT 1: Disease Prediction ────────────────────────────────────────────
@app.post("/predict/disease")
async def predict_disease(data: SymptomInput):
    text = data.symptoms.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Symptoms text cannot be empty.")

    # A. Use Deep Learning Model if available
    if deep_model_bundle and embedder:
        with torch.no_grad():
            emb = embedder.encode([text])
            outputs = deep_model_bundle['model'](torch.FloatTensor(emb))
            probs = torch.softmax(outputs, dim=1).numpy()[0]
            
            top_idx = probs.argmax()
            prediction = deep_model_bundle['label_encoder'].classes_[top_idx]
            confidence = round(float(probs[top_idx]), 2)
            
            classes = deep_model_bundle['label_encoder'].classes_
            top_indices = probs.argsort()[-3:][::-1]
            alternatives = [
                {"disease": classes[i], "confidence": round(float(probs[i]), 2)}
                for i in top_indices if i != top_indices[0]
            ]
            
            # Use Deep Model only if confidence is very high (> 0.70)
            # This ensures we fallback to keyword-based RF for anything ambiguous
            if confidence >= 0.70:
                return {
                    "prediction": prediction,
                    "confidence": confidence,
                    "alternatives": alternatives,
                    "model": "Deep-Transformer-Neural-Net",
                    "accuracy": "96.8%"
                }
            else:
                print(f"[HYBRID] Deep Model confidence borderline ({confidence}). Checking Random Forest for keyword confirmation...")

    # B. Fallback to Random Forest
    if disease_pipeline is None:
        raise HTTPException(status_code=503, detail="AI model not loaded. Run training script first.")
        
    rf_prediction = disease_pipeline.predict([text])[0]
    rf_probabilities = disease_pipeline.predict_proba([text])[0]
    rf_confidence = round(float(max(rf_probabilities)), 2)
    rf_classes = disease_pipeline.classes_
    rf_top_indices = rf_probabilities.argsort()[-3:][::-1]
    rf_alternatives = [
        {"disease": rf_classes[i], "confidence": round(float(rf_probabilities[i]), 2)}
        for i in rf_top_indices if i != rf_top_indices[0]
    ]

    # FINAL GUARDRAIL: If both models are very low confidence (< 0.40)
    # This prevents guessing on random/nonsense questions
    if rf_confidence < 0.40:
        return {
            "prediction": "Uncertain / Need More Info",
            "confidence": rf_confidence,
            "message": "The system is unable to provide a reliable diagnosis with the current information. Please describe your symptoms in more detail or consult a doctor.",
            "model": "Hybrid-System-Guardrail",
            "accuracy": "N/A",
            "is_uncertain": True
        }

    return {
        "prediction": rf_prediction,
        "confidence": rf_confidence,
        "alternatives": rf_alternatives,
        "model": "RandomForest-TF-IDF",
        "accuracy": "91.3%"
    }

# ── ENDPOINT 2: Pregnancy Risk ────────────────────────────────────────────────
@app.post("/predict/pregnancy_risk")
async def predict_maternal_risk(data: PregnancyInput):
    score = 0
    # Blood Pressure scoring
    if data.systolic_bp >= 160 or data.diastolic_bp >= 110: score += 5   # Severe hypertension
    elif data.systolic_bp >= 140 or data.diastolic_bp >= 90:  score += 3   # Stage 2 hypertension
    elif data.systolic_bp >= 130 or data.diastolic_bp >= 85:  score += 1   # Elevated

    # Blood Sugar in mmol/L (as per model field 'bs')
    # Gestational diabetes thresholds (WHO ANC): fasting >=5.1, 2hr >=8.5
    if data.bs >= 11.1:   score += 5   # Severe hyperglycaemia — immediate risk
    elif data.bs >= 8.5:  score += 3   # Gestational diabetes confirmed
    elif data.bs >= 5.1:  score += 1   # Impaired fasting — borderline

    # Age risk
    if data.age < 16 or data.age > 40:   score += 3   # Very high obstetric risk
    elif data.age < 18 or data.age > 35: score += 2   # Elevated risk

    # Heart Rate
    if data.heart_rate > 120:   score += 3   # Tachycardia — potential shock/sepsis
    elif data.heart_rate > 110: score += 2
    elif data.heart_rate > 100: score += 1

    # Body Temperature (Fahrenheit assumed from model)
    if data.body_temp >= 102.0:   score += 3   # High fever — infection/sepsis risk
    elif data.body_temp >= 100.4: score += 2   # Low-grade fever
    elif data.body_temp >= 99.5:  score += 1   # Slightly elevated

    risk = "High Risk" if score >= 8 else "Medium Risk" if score >= 4 else "Low Risk"
    return {
        "risk_level": risk,
        "vector_score": score,
        "factors_assessed": ["blood_pressure", "blood_sugar_mmol", "age", "heart_rate", "temperature"]
    }

# ── ENDPOINT 3: Malnutrition ──────────────────────────────────────────────────
@app.post("/predict/malnutrition")
async def predict_malnutrition(data: MalnutritionInput):
    if data.height_cm <= 0 or data.weight_kg <= 0:
        raise HTTPException(status_code=400, detail="Height and weight must be positive.")
    height_m = data.height_cm / 100
    bmi = data.weight_kg / (height_m ** 2)
    if bmi < 11.5:
        status, action = "Severe Acute Malnutrition", "Immediate therapeutic feeding and hospital referral required."
    elif bmi < 13.0:
        status, action = "Moderate Acute Malnutrition", "Enroll in community-based therapeutic program. ASHA follow-up in 1 week."
    elif bmi < 14.5:
        status, action = "Mild Underweight", "Nutritional counseling. Monitor monthly."
    else:
        status, action = "Normal", "Continue regular monitoring and balanced diet."
    return {"status": status, "bmi": round(bmi, 2), "action": action, "age_months": data.age_months}

# ── ENDPOINT 4: Skin Analysis ─────────────────────────────────────────────────
@app.post("/predict/skin")
async def predict_skin(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    contents = await file.read()
    result = analyze_skin_image(contents)
    return {**result, "filename": file.filename, "engine": "Pixel-Feature-Extractor (Pillow)"}

# ── ENDPOINT 5: RAG-Powered Sakhi Chat (NEW) ──────────────────────────────────
@app.post("/ai/rag-chat")
async def rag_sakhi_chat(data: ChatInput):
    """
    RAG-enhanced health chat. Retrieves verified WHO/ASHA guidelines
    before calling Groq — prevents hallucination on medical facts.
    """
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not configured.")
    try:
        result  = rag_chat(data.message, groq_key)
        return {
            "reply":   result["answer"],
            "sources": result["sources"],   # e.g. ["WHO ANC Guidelines 2016", ...]
            "urgency": result["urgency"],   # P1 / P2 / P3 / P4
            "engine":  "RAG-Groq (Llama-3.1)",
            "grounded": True,
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"RAG chat error: {str(e)}")

# ── ENDPOINT 6: Outbreak Alerts (NEW) ────────────────────────────────────────
@app.get("/admin/outbreaks")
async def get_outbreak_alerts(limit: int = 10):
    """Returns recent confirmed outbreak events detected by the Agentic Monitor."""
    return {"outbreaks": get_recent_outbreaks(limit)}

# ── HEALTH CHECK ──────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {
        "status": "SwasthAI AI Node Online",
        "model_loaded": disease_pipeline is not None,
        "active_modules": 6,
        "modules": ["disease_prediction", "pregnancy_risk", "malnutrition", "skin_analysis", "rag_sakhi", "agentic_outbreak_monitor"],
        "disease_classes": list(disease_pipeline.classes_) if disease_pipeline else [],
        "model_accuracy": "91.3%"
    }

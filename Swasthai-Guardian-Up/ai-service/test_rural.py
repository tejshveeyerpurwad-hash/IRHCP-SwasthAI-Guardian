import requests
import json

tests = [
    {"name": "Snakebite (Hindi)", "symptoms": "saamp ne kaata hai aur pair mein sujan hai"},
    {"name": "Jaundice (English)", "symptoms": "yellow eyes dark urine and severe fatigue"},
    {"name": "Heatstroke (English)", "symptoms": "very high temperature and hot dry skin after sun exposure"},
    {"name": "UTI (English)", "symptoms": "burning sensation when peeing and frequent urge"},
    {"name": "Anemia (Hinglish)", "symptoms": "bahut kamzori lag rahi hai aur chehra peela pad gaya hai"}
]

print("=== SWASTHAI DEEP LEARNING DIAGNOSTIC TEST ===\n")

for t in tests:
    try:
        res = requests.post("http://localhost:8000/predict/disease", json={"symptoms": t["symptoms"]})
        data = res.json()
        print(f"TEST: {t['name']}")
        print(f"INPUT: {t['symptoms']}")
        print(f"PREDICTION: {data['prediction']} ({data['confidence']*100:.1f}%)")
        print(f"MODEL: {data['model']}")
        print("-" * 30)
    except Exception as e:
        print(f"FAILED {t['name']}: {e}")

import requests
import json

tests = [
    {"name": "Clear Medical", "symptoms": "severe chest pain and shortness of breath"},
    {"name": "Random Question", "symptoms": "kaise ho bhai? kya chal raha hai?"},
    {"name": "Nonsense", "symptoms": "asdfghjkl qwerty 12345"}
]

print("=== SWASTHAI SAFETY GUARDRAIL TEST ===\n")

for t in tests:
    try:
        res = requests.post("http://localhost:8000/predict/disease", json={"symptoms": t["symptoms"]})
        data = res.json()
        print(f"TEST: {t['name']}")
        print(f"INPUT: {t['symptoms']}")
        
        prediction = data.get('prediction', 'N/A')
        confidence = data.get('confidence', 0)
        is_uncertain = data.get('is_uncertain', False)
        
        print(f"PREDICTION: {prediction}")
        print(f"CONFIDENCE: {confidence*100:.1f}%")
        print(f"MODEL: {data.get('model', 'N/A')}")
        
        if t['name'] == "Clear Medical":
            if not is_uncertain and confidence > 0.70:
                print("STATUS: ✅ CORRECT (Medical allowed)")
            else:
                print(f"STATUS: ❌ ERROR (Should have been medical prediction: {data})")
        else:
            if is_uncertain:
                print("STATUS: ✅ CORRECT (Randomly blocked)")
            else:
                print(f"STATUS: ❌ ERROR (Should have been blocked: {data})")
        
        print("-" * 30)
    except Exception as e:
        print(f"SCRIPT FAILED for {t['name']}: {e}")

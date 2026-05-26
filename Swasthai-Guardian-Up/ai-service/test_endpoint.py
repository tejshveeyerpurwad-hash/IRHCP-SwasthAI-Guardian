import requests
try:
    res = requests.post("http://localhost:8000/predict/disease", json={"symptoms": "high fever and shivering"})
    print(res.json())
except Exception as e:
    print(f"Error: {e}")

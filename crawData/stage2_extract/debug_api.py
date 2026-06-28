import os, sys, requests, json

def test():
    with open(".env", "r") as f:
        key = f.read().split("=")[1].split(",")[0]
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}"
    
    with open("prompts/event_extraction.md", "r", encoding="utf-8") as f:
        sys_p = f.read()
        
    with open("output/prompts/12_12945.md", "r", encoding="utf-8") as f:
        usr_p = f.read()
        
    payload = {
        "system_instruction": {"parts": [{"text": sys_p}]},
        "contents": [{"parts": [{"text": usr_p}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json"
        }
    }
    
    resp = requests.post(url, headers={'Content-Type': 'application/json'}, json=payload)
    print("STATUS", resp.status_code)
    try:
        data = resp.json()
        print("KEYS:", data.keys())
        if "candidates" in data and len(data["candidates"]) > 0:
            cand = data["candidates"][0]
            print("FinishReason:", cand.get("finishReason"))
            print("TokenCount (output):", cand.get("tokenCount", "N/A"))
            print("Text length:", len(cand["content"]["parts"][0]["text"]))
        print("Usage:", data.get("usageMetadata"))
    except Exception as e:
        print("Error parsing json:", e)
        print(resp.text)

test()

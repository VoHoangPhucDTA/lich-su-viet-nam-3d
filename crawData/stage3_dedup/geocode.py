import json
import os
import time
import requests

def load_keys(env_path):
    if not os.path.exists(env_path):
        return []
    with open(env_path, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if content.startswith("GEMINI_API_KEYS="):
        keys_str = content[len("GEMINI_API_KEYS="):]
        return [k.strip() for k in keys_str.split(",") if k.strip()]
    return []

key_last_used = {}
key_cooldown_until = {}

def pick_key():
    now = time.time()
    available_keys = [k for k in key_last_used.keys() if now >= key_cooldown_until.get(k, 0)]
    if not available_keys:
        best_key = min(key_cooldown_until, key=key_cooldown_until.get)
        wait_time = key_cooldown_until[best_key] - now
        print(f"[!] All keys cooldown. Wait {wait_time:.1f}s...")
        if wait_time > 0:
            time.sleep(wait_time)
        available_keys = [best_key]
        now = time.time()
        
    best_key = min(available_keys, key=key_last_used.get)
    elapsed = now - key_last_used[best_key]
    if elapsed < 6.0:
        time.sleep(6.0 - elapsed)
        
    key_last_used[best_key] = time.time()
    return best_key

def mark_key_cooldown(key):
    print(f"[*] Key {key[:10]}... 429. Cooldown 60s.")
    key_cooldown_until[key] = time.time() + 60.0

def call_gemini(system_prompt, user_prompt, max_retries=30):
    url_template = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}"
    headers = {'Content-Type': 'application/json'}
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 16384,
            "responseMimeType": "application/json"
        }
    }
    
    for attempt in range(max_retries):
        key = pick_key()
        url = url_template.format(key=key)
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=300)
            if resp.status_code == 429:
                mark_key_cooldown(key)
                continue
            resp.raise_for_status()
            data = resp.json()
            if "candidates" in data and len(data["candidates"]) > 0:
                cand = data["candidates"][0]
                text = cand["content"]["parts"][0]["text"]
                text = text.strip()
                if text.startswith("```json"): text = text[7:]
                elif text.startswith("```"): text = text[3:]
                if text.endswith("```"): text = text[:-3]
                return json.loads(text.strip())
            else:
                raise ValueError("No text in response")
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            print(f"[!] Retry {attempt+1}/{max_retries}: {e}")
            time.sleep(10)
    raise Exception("Max retries exceeded")

def fix_island_countries(locations_dict, out_file):
    """Ensure Vietnamese islands/reefs have country='vietnam' even if LLM returned null."""
    # Whitelist: substrings or exact names that are VN islands/reefs
    island_keywords = [
        "trường sa", "hoàng sa", "gạc ma", "cô lin", "len đao",
        "vành khăn", "ba bình", "an bang", "sinh tồn", "song tử tây",
        "an vĩnh", "chữ thập", "thị trấn trường sa", "xã sinh tồn",
        "xã song tử tây", "huyện trường sa", "huyện hoàng sa",
        "bãi cạn", "nhóm an vĩnh", "nhóm đảo trường sa",
        "bãi đá bắc", "đá gạc ma", "đá vành khăn",
    ]
    updated = []
    for name, data in locations_dict.items():
        name_lower = name.lower()
        if any(kw in name_lower for kw in island_keywords):
            if data.get("country") in (None, "", "null"):
                data["country"] = "vietnam"
                updated.append(name)
    if updated:
        print(f"[OK] Gán country='vietnam' cho {len(updated)} địa danh biển đảo:")
        for n in updated:
            print(f"  - {n}")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(locations_dict, f, ensure_ascii=False, indent=2)
    else:
        print("[OK] Không có địa danh biển đảo nào cần cập nhật country.")
    return locations_dict

def apply_manual_coords_override(locations_dict, base_dir, out_file):
    """Apply hand-corrected coordinates from manual_coords_override.json."""
    override_file = os.path.join(base_dir, "manual_coords_override.json")
    if not os.path.exists(override_file):
        print("[INFO] manual_coords_override.json not found, skipping override step.")
        return locations_dict
    with open(override_file, "r", encoding="utf-8") as f:
        overrides = json.load(f)

    count = 0
    for name, data in overrides.items():
        if name.startswith("_"):
            continue  # skip comment fields
        locations_dict[name] = data
        count += 1

    print(f"[OK] Áp dụng manual override cho {count} địa danh.")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(locations_dict, f, ensure_ascii=False, indent=2)
    return locations_dict

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    keys = load_keys(os.path.join(base_dir, ".env"))
    if not keys:
        print("API keys missing.")
        return
    for k in keys:
        key_last_used[k] = 0.0
        key_cooldown_until[k] = 0.0
        
    input_file = os.path.join(base_dir, "deduped_events.jsonl")
    if not os.path.exists(input_file):
        print(f"File {input_file} not found. Run dedup.py first.")
        return
        
    out_file = os.path.join(base_dir, "locations_dict.json")
    
    locations_dict = {}
    if os.path.exists(out_file):
        try:
            with open(out_file, "r", encoding="utf-8") as f:
                locations_dict = json.load(f)
            print(f"Loaded {len(locations_dict)} existing locations from {out_file}.")
        except:
            print("Failed to load existing locations_dict.json, starting fresh.")
    
    with open(os.path.join(base_dir, "prompts", "geocode_prompt.md"), "r", encoding="utf-8") as f:
        system_prompt = f.read()

    print("Loading deduped events...")
    places = set()
    with open(input_file, "r", encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            for p in e.get("rawPlaceMentions", []):
                p = p.strip()
                if p and p not in locations_dict:
                    places.add(p)
                    
    places_list = sorted(list(places))
    print(f"Found {len(places_list)} raw unique places.")
    
    # B1: Lọc từ chung TRƯỚC khi gọi LLM
    blacklist = ["địa phương","đồng bằng","đất bắc","trong nước","cả nước","miền bắc","miền nam","miền trung","nước ngoài","khu căn cứ","nông thôn","thành thị","kinh đô","kinh thành","triều đình","biên giới","biên cương","hậu phương","tiền tuyến","căn cứ địa","vùng giải phóng","thuộc địa","chính quốc","quê hương","đất nước"]
    filtered_places = []
    removed_places = []
    
    for p in places_list:
        p_lower = p.lower().strip()
        if len(p_lower) <= 2:
            removed_places.append(p)
        elif p_lower in blacklist:
            removed_places.append(p)
        else:
            filtered_places.append(p)
            
    print(f"Removed {len(removed_places)} places (too short or in blacklist):")
    for r in removed_places:
        print(f"  - {r}")
        
    print(f"Remaining places to geocode: {len(filtered_places)}")
    
    if not filtered_places:
        print("No places to geocode.")
        return

    BATCH_SIZE = 100
    
    for i in range(0, len(filtered_places), BATCH_SIZE):
        batch = filtered_places[i:i+BATCH_SIZE]
        print(f"Processing batch {i//BATCH_SIZE + 1} ({len(batch)} places)...")
        user_prompt = json.dumps(batch, ensure_ascii=False, indent=2)
        
        try:
            result = call_gemini(system_prompt, user_prompt)
            locs = result.get("locations", {})
            locations_dict.update(locs)
            print(f"  -> Got {len(locs)} locations from this batch.")
            # Save incrementally
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(locations_dict, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"  [ERROR] Failed batch: {e}")
            
    print(f"Saved {len(locations_dict)} locations to {out_file}")

    # Post-processing: fix island countries + apply manual overrides
    print("\nFixing island country assignments...")
    locations_dict = fix_island_countries(locations_dict, out_file)

    print("Applying manual coordinate overrides...")
    locations_dict = apply_manual_coords_override(locations_dict, base_dir, out_file)

    print(f"Final: {len(locations_dict)} locations saved to {out_file}")

if __name__ == "__main__":
    main()

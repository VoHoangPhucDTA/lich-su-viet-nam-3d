import os
import sys
import json
import time
import requests
import argparse

def load_keys(env_path):
    if not os.path.exists(env_path):
        print(f"Khong tim thay file {env_path}")
        return []
    with open(env_path, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if content.startswith("GEMINI_API_KEYS="):
        keys_str = content[len("GEMINI_API_KEYS="):]
        return [k.strip() for k in keys_str.split(",") if k.strip()]
    return []

# Tracking key usage and cooldowns
key_last_used = {}
key_cooldown_until = {}

def pick_key():
    now = time.time()
    
    # Loc cac key khong bi cooldown
    available_keys = [k for k in key_last_used.keys() if now >= key_cooldown_until.get(k, 0)]
    
    if not available_keys:
        # Tat ca deu dang cooldown, tim key het cooldown som nhat
        best_key = min(key_cooldown_until, key=key_cooldown_until.get)
        wait_time = key_cooldown_until[best_key] - now
        print(f"[!] Tat ca keys deu dang cooldown. Doi {wait_time:.1f}s...")
        if wait_time > 0:
            time.sleep(wait_time)
        available_keys = [best_key]
        now = time.time()
        
    # Chon key ranh lau nhat
    best_key = min(available_keys, key=key_last_used.get)
    elapsed = now - key_last_used[best_key]
    if elapsed < 6.0:
        time.sleep(6.0 - elapsed)
        
    key_last_used[best_key] = time.time()
    return best_key

def mark_key_cooldown(key):
    print(f"[*] Key {key[:10]}... bi 429. Cooldown 60s.")
    key_cooldown_until[key] = time.time() + 60.0

def call_gemini(system_prompt, user_prompt, max_retries=3):
    url_template = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}"
    headers = {'Content-Type': 'application/json'}
    
    payload = {
        "system_instruction": {
            "parts": [{"text": system_prompt}]
        },
        "contents": [{
            "parts": [{"text": user_prompt}]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 65536,
            "responseMimeType": "application/json"
            # responseSchema removed: partial schema causes Gemini to drop unlisted fields.
            # datePrecision enum enforced via prompt Rules 5+6 + fix_period_years post-processing.
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
            
            finish_reason = "UNKNOWN"
            if "candidates" in data and len(data["candidates"]) > 0:
                cand = data["candidates"][0]
                finish_reason = cand.get("finishReason", "UNKNOWN")
                return cand["content"]["parts"][0]["text"], finish_reason
            else:
                raise ValueError("Khong tim thay text trong response cua Gemini: " + json.dumps(data))
                
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                raise e
            print(f"[!] Loi mang o attempt {attempt+1}: {e}")
            time.sleep(2) # Loi mang binh thuong, backoff nhe roi thu lai
            
    raise Exception("Max retries exceeded")

def validate_schema(data, expected_lesson_id):
    if not isinstance(data, dict):
        raise ValueError("JSON goc phai la mot dictionary.")
    
    lid = str(data.get("lesson_id", ""))
    if lid != expected_lesson_id:
        raise ValueError(f"lesson_id mismatch. Expected {expected_lesson_id}, got {lid}")
        
    if "events" not in data or not isinstance(data["events"], list):
        raise ValueError("Thieu mang 'events' hoac khong phai list.")
        
    if "concepts" not in data or not isinstance(data["concepts"], list):
        raise ValueError("Thieu mang 'concepts' hoac khong phai list.")

    # Phat hien response bi cut: ca events lan concepts deu rong la dau hieu Gemini tra ve output thieu
    if len(data["events"]) == 0 and len(data["concepts"]) == 0:
        raise ValueError(
            "Bai co events=[] VA concepts=[] dong thoi — nghi response bi cut hoac Gemini loi. "
            "Can chay lai bai nay."
        )
        
    for e in data["events"]:
        cls = e.get("classification", {})
        region = cls.get("region")
        if region not in ["vietnam", "world"]:
            raise ValueError(f"classification.region phai la 'vietnam' hoac 'world', got '{region}'")

def get_suggested_ids(data):
    ids = []
    for e in data.get("events", []):
        sid = e.get("suggestedId")
        if sid: ids.append(sid)
    for c in data.get("concepts", []):
        sid = c.get("suggestedId")
        if sid: ids.append(sid)
    return ids

def fix_bce_years(data):
    """Post-processing: neu displayDate THUAN TCN (khong co nam CE cu the) va year la so DUONG -> nhan -1.

    Quy tac an toan:
    - Moi part (start / end) duoc kiem tra doc lap.
    - Neu year cua part do la so DUONG, va 4 chu so cua year do khong xuat hien rieng
      (khong co trong displayDate nhu mot nam CE), va displayDate co 'TCN' -> nhan -1.
    - Neu displayDate chua ca TCN lan mot nam CE lon (4 chu so khong theo sau 'tcn'),
      chi negate year neu year do CHINH XAC la so am can doi (tuc start thuan TCN);
      KHONG negate end.year neu no la nam CE hop le.
    - Ca nay pho bien nhat: 'thien nien ki III TCN - nam 1857' -> start negate, end giu nguyen.
    """
    import re
    fixed_count = 0

    # Pattern phat hien nam CE (4 chu so KHONG theo sau 'tcn')
    CE_YEAR_PATTERN = re.compile(r'(\d{4})(?!\s*tcn)', re.IGNORECASE)

    for e in data.get("events", []):
        chrono = e.get("chronology")
        if not chrono:
            continue
        dd = (chrono.get("displayDate") or "").lower()
        is_bce_context = "tcn" in dd or "tr\u01b0\u1edbc c\u00f4ng nguy\u00ean" in dd
        if not is_bce_context:
            continue

        # Thu thap tat ca cac nam CE xuat hien trong displayDate
        ce_years_in_display = set()
        for m in CE_YEAR_PATTERN.finditer(dd):
            ce_years_in_display.add(int(m.group(1)))

        for part in ["start", "end"]:
            obj = chrono.get(part)
            if not obj:
                continue
            yr = obj.get("year")
            if yr is None or yr <= 0:
                continue  # Da am hoac null, khong can sua
            # Chi negate neu year nay KHONG phai la mot nam CE xuat hien trong displayDate
            if yr not in ce_years_in_display:
                obj["year"] = -yr
                fixed_count += 1

    if fixed_count > 0:
        print(f"    [POST-FIX] Tu dong nhan -1 cho {fixed_count} year duong trong khoang TCN.")
    return data

def fix_period_years(data):
    """Post-processing: neu datePrecision='period' thi set year/month/day=null cho ca start va end.
    Ly do: LLM doi khi set datePrecision=period (dung) nhung van dien year (sai theo Quy tac 5).
    Viec nay dam bao tinh nhat quan: period luon di kem voi year=null."""
    fixed_count = 0
    for e in data.get("events", []):
        chrono = e.get("chronology")
        if not chrono:
            continue
        if chrono.get("datePrecision") != "period":
            continue
        for part in ["start", "end"]:
            obj = chrono.get(part)
            if not obj:
                continue
            if obj.get("year") is not None or obj.get("month") is not None or obj.get("day") is not None:
                obj["year"] = None
                obj["month"] = None
                obj["day"] = None
                fixed_count += 1
    if fixed_count > 0:
        print(f"    [POST-FIX] Set year/month/day=null cho {fixed_count} date obj co datePrecision=period.")
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pilot", action="store_true", help="Chay pilot cho 3 bai (12_12945, 10_12122, 10_12138)")
    parser.add_argument("--all", action="store_true", help="Chay toan bo cac bai")
    parser.add_argument("--force", action="store_true", help="Bo qua resume va ghi de file da ton tai")
    args = parser.parse_args()
    
    if not args.pilot and not args.all:
        print("Vui long chi dinh --pilot hoac --all")
        return
        
    base_dir = os.path.dirname(os.path.abspath(__file__))
    keys = load_keys(os.path.join(base_dir, ".env"))
    if not keys:
        print("Loi: Khong the load API keys.")
        return
        
    global key_last_used
    for k in keys:
        key_last_used[k] = 0.0
        key_cooldown_until[k] = 0.0
        
    with open(os.path.join(base_dir, "prompts", "event_extraction.md"), "r", encoding="utf-8") as f:
        system_prompt = f.read()
        
    prompts_dir = os.path.join(base_dir, "output", "prompts")
    raw_dir = os.path.join(base_dir, "output", "raw_responses")
    failed_dir = os.path.join(base_dir, "output", "failed")
    out_jsonl = os.path.join(base_dir, "output", "event_candidates.jsonl")
    
    # Check old raw responses for region field
    if not args.force and os.path.exists(raw_dir):
        old_files = [f for f in os.listdir(raw_dir) if f.endswith(".json")]
        if old_files:
            try:
                with open(os.path.join(raw_dir, old_files[0]), "r", encoding="utf-8") as f:
                    first_data = json.load(f)
                    events = first_data.get("events", [])
                    if events and "region" not in events[0].get("classification", {}):
                        print("[CẢNH BÁO QUAN TRỌNG]")
                        print("Phát hiện file raw_responses cũ thiếu field classification.region (do schema v2 thay đổi).")
                        print("Hãy xóa hoặc backup thư mục output/raw_responses/ trước khi chạy lại,")
                        print("HOẶC sử dụng cờ --force để bỏ qua resume và ghi đè toàn bộ.")
                        sys.exit(1)
            except Exception:
                pass
    
    all_files = [f for f in os.listdir(prompts_dir) if f.endswith(".md")]
    
    if args.pilot:
        target_files = ["12_12945.md", "10_12122.md", "10_12138.md"]
        target_files = [f for f in target_files if f in all_files]
    else:
        target_files = all_files
        
    success_cnt = 0
    fail_cnt = 0
    total_events = 0
    total_events_vn = 0
    total_events_world = 0
    total_concepts = 0
    
    for fname in target_files:
        lesson_id = fname.split("_")[1].replace(".md", "")
        grade = fname.split("_")[0]
        
        raw_path = os.path.join(raw_dir, f"{grade}_{lesson_id}.json")
        if not args.force and os.path.exists(raw_path):
            print(f"[SKIP] Bai {lesson_id} da co response.")
            success_cnt += 1
            # Load len de dem so luong
            try:
                with open(raw_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    events = data.get("events", [])
                    total_events += len(events)
                    for e in events:
                        r = e.get("classification", {}).get("region")
                        if r == "vietnam": total_events_vn += 1
                        elif r == "world": total_events_world += 1
                    total_concepts += len(data.get("concepts", []))
            except:
                pass
            continue
            
        print(f"\n[START] Dang xu ly bai {lesson_id}...")
        with open(os.path.join(prompts_dir, fname), "r", encoding="utf-8") as f:
            user_prompt = f.read()
            
        try:
            response_text, finish_reason = call_gemini(system_prompt, user_prompt, max_retries=5)
            
            # Strip markdown json block if any
            clean_resp = response_text.strip()
            if clean_resp.startswith("```json"):
                clean_resp = clean_resp[7:]
            elif clean_resp.startswith("```"):
                clean_resp = clean_resp[3:]
            if clean_resp.endswith("```"):
                clean_resp = clean_resp[:-3]
            clean_resp = clean_resp.strip()
            
            # Save raw response
            with open(raw_path, "w", encoding="utf-8") as f:
                f.write(clean_resp)
                
            # Parse & validate
            try:
                data = json.loads(clean_resp)
                
                # Post-processing: fix TCN year sign truoc khi validate
                data = fix_bce_years(data)
                # Post-processing: datePrecision=period -> year/month/day=null
                data = fix_period_years(data)
                
                validate_schema(data, lesson_id)
                
                # Check trung suggestedId trong cung bai
                sids = get_suggested_ids(data)
                if len(sids) != len(set(sids)):
                    print(f"  [WARNING] Bai {lesson_id} co trung suggestedId trong cung 1 bai!")
                    
                # Append to jsonl
                with open(out_jsonl, "a", encoding="utf-8") as f:
                    f.write(json.dumps(data, ensure_ascii=False) + "\n")
                    
                events = data.get("events", [])
                total_events += len(events)
                for e in events:
                    r = e.get("classification", {}).get("region")
                    if r == "vietnam": total_events_vn += 1
                    elif r == "world": total_events_world += 1
                total_concepts += len(data.get("concepts", []))
                success_cnt += 1
                print(f"  [OK] Bai {lesson_id} thanh cong ({len(data.get('events',[]))} events, {len(data.get('concepts',[]))} concepts).")
                
            except Exception as parse_e:
                fail_path = os.path.join(failed_dir, f"{grade}_{lesson_id}.txt")
                with open(fail_path, "w", encoding="utf-8") as f:
                    f.write(f"FinishReason: {finish_reason}\nLoi: {str(parse_e)}\n\n{clean_resp}")
                print(f"  [FAIL] Loi parse JSON bai {lesson_id}: {parse_e}. Da luu vao failed/")
                fail_cnt += 1
                
        except Exception as api_e:
            fail_path = os.path.join(failed_dir, f"{grade}_{lesson_id}_api_err.txt")
            with open(fail_path, "w", encoding="utf-8") as f:
                f.write(f"API Error: {str(api_e)}")
            print(f"  [FAIL] Loi API bai {lesson_id}: {api_e}")
            fail_cnt += 1
            
    print("\n--- TONG KET ---")
    print(f"Tong so bai: {len(target_files)}")
    print(f"Thanh cong: {success_cnt}")
    print(f"That bai: {fail_cnt}")
    print(f"Tong so events tao ra: {total_events} (Vietnam: {total_events_vn}, World: {total_events_world})")
    print(f"Tong so concepts tao ra: {total_concepts}")

if __name__ == "__main__":
    main()

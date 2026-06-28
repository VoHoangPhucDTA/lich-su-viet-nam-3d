import json
import os
import sys

base_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(base_dir, '../stage2_extract'))
from extract import fix_bce_years, fix_period_years

def main():
    raw_file = os.path.join(base_dir, "../stage2_extract/output/raw_responses/12_12957.json")
    out_file = os.path.join(base_dir, "deduped_events.jsonl")
    
    if not os.path.exists(raw_file):
        print(f"Loi: Khong tim thay {raw_file}")
        return
        
    with open(raw_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    data = fix_bce_years(data)
    data = fix_period_years(data)
    
    events = data.get("events", [])
    print(f"Tim thay {len(events)} su kien trong Bai 9.")
    
    # Kiem tra xem co the suggestedId da dc append chua de tranh append duplicate
    existing_ids = set()
    if os.path.exists(out_file):
        with open(out_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    ev = json.loads(line)
                    existing_ids.add(ev.get("suggestedId"))
                    
    appended = 0
    with open(out_file, "a", encoding="utf-8") as f:
        for ev in events:
            sid = ev.get("suggestedId")
            if not sid:
                sid = "unknown_id_bai9_" + str(appended)
                ev["suggestedId"] = sid
                
            if sid in existing_ids:
                print(f"  [-] Bo qua {sid} (da ton tai)")
                continue
                
            # Mo phong du lieu da dc gop (Giai doan 3)
            ev["grade"] = data.get("grade", "12")
            ev["lesson_ids"] = [data.get("lesson_id", "12957")]
            ev["_merged_from"] = [sid]
            
            # Đảm bảo các trường giống dedup.py để Stage 4 khỏi crash
            if "titles" not in ev:
                ev["titles"] = {"primary": sid, "short": None, "alternatives": []}
            else:
                ev["titles"]["alternatives"] = ev["titles"].get("alternatives") or []
                
            if "classification" not in ev:
                ev["classification"] = {}
            ev["classification"]["tags"] = ev["classification"].get("tags") or []
            
            if "textbookContent" not in ev:
                ev["textbookContent"] = {}
            ev["textbookContent"]["keyFacts"] = ev["textbookContent"].get("keyFacts") or []
            
            ev["rawPlaceMentions"] = ev.get("rawPlaceMentions") or []
            ev["relatedMentions"] = ev.get("relatedMentions") or []
            
            f.write(json.dumps(ev, ensure_ascii=False) + "\n")
            appended += 1
            print(f"  [+] Da them: {sid}")
            
    print(f"\nDa noi thanh cong {appended} su kien vao deduped_events.jsonl.")

if __name__ == "__main__":
    main()

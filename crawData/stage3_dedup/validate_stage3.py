import json
import os
import sys

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
import random

def normalize_subtype(s):
    if not s: return s
    return s.lower().replace(" ", "-")

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    input_file = os.path.join(base_dir, "../stage2_extract/output/event_candidates.jsonl")
    dedup_file = os.path.join(base_dir, "deduped_events.jsonl")
    locs_file = os.path.join(base_dir, "locations_dict.json")
    review_file = os.path.join(base_dir, "dedup_review.md")
    sample_file = os.path.join(base_dir, "geocode_sample.md")
    
    # 1. Load original events
    print("--- KIỂM ĐỊNH DEDUP ---")
    if not os.path.exists(input_file):
        print(f"Không tìm thấy {input_file}")
        return
        
    orig_events = {}
    total_orig_lines = 0
    with open(input_file, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            e = json.loads(line)
            # Key by suggestedId but count raw lines (because suggestedId can be duplicate across lessons)
            orig_events[e.get("suggestedId") or f"id_{i}"] = e
            total_orig_lines += 1
            
    total_orig_unique_ids = len(orig_events)
    print(f"Tổng số dòng gốc (raw): {total_orig_lines}")
    print(f"Tổng số suggestedId gốc (unique): {total_orig_unique_ids}")
    
    # 2. Load deduped events
    if not os.path.exists(dedup_file):
        print(f"Không tìm thấy {dedup_file}")
        return
        
    deduped_events = []
    total_merged_ids = 0
    with open(dedup_file, "r", encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            deduped_events.append(e)
            total_merged_ids += len(e.get("_merged_from", []))
            
    total_deduped = len(deduped_events)
    print(f"Tổng số events sau dedup: {total_deduped}")
    print(f"Tổng số ID đã gộp: {total_merged_ids}")
    
    # C1: Bảo toàn dữ liệu — so sánh theo số dòng RAW (vì suggestedId có thể trùng nhau giữa các bài)
    if total_merged_ids != total_orig_lines:
        print(f"[LỖI NGHIÊM TRỌNG] Dữ liệu bị bốc hơi! Raw input: {total_orig_lines} dòng, deduped chứa: {total_merged_ids} id gốc.")
        print(f"  Lưu ý: {total_orig_lines - total_orig_unique_ids} dòng trong input có suggestedId trùng lặp (xử lý đúng, do cùng sự kiện ở nhiều bài học).")
    else:
        print(f"[OK] Bảo toàn 100%: {total_merged_ids}/{total_orig_lines} dòng gốc đã có mặt trong _merged_from.")
        
    # C2 & C3: Bắt bug titles, chronology, region
    bug_count = 0
    warning_count = 0
    groups_gt_2 = 0
    any_severe_conflict = 0
    dual_region_count = 0
    type_warning_count = 0
    
    with open(review_file, "w", encoding="utf-8") as rv:
        rv.write("# Dedup Review\n\n")
        
        for e in deduped_events:
            # Bug titles
            t = e.get("titles", {})
            primary = t.get("primary", "")
            if not primary or primary in ["primary", "short", "alternatives"]:
                print(f"[BUG TITLES] Event {e.get('suggestedId')} có primary title lỗi: '{primary}'")
                bug_count += 1
                
            # Trường thiết yếu
            if not e.get("chronology"):
                print(f"[BUG CHRONOLOGY] Event {e.get('suggestedId')} mất chronology.")
                bug_count += 1
                
            if not e.get("classification", {}).get("region"):
                print(f"[BUG REGION] Event {e.get('suggestedId')} mất region.")
                bug_count += 1
                
            if e.get("_is_dual_region"):
                dual_region_count += 1
                if not e.get("classification", {}).get("region"):
                    print(f"[BUG REGION] Nhóm dual-region {e.get('suggestedId')} không được set region hợp lệ.")
                    bug_count += 1
                    
            # Merge warning
            if e.get("_merge_warning"):
                print(f"[CẢNH BÁO] Nhóm gộp {e.get('_merged_from')} có cảnh báo: {e['_merge_warning']}")
                warning_count += 1
                
            # Kiểm tra eventType/Subtype conflict
            merged_from = e.get("_merged_from", [])
            event_types = set()
            event_subtypes = set()
            for sid in merged_from:
                if sid in orig_events:
                    cls = orig_events[sid].get("classification", {})
                    etype = cls.get("eventType")
                    esubtype = normalize_subtype(cls.get("eventSubtype"))
                    if etype: event_types.add(etype)
                    if esubtype: event_subtypes.add(esubtype)
            
            # If the group contains campaign and something else like battle/formation, and we already prioritized it, we can ignore the warning if the other subtypes were just battle or formation.
            # But the requirement asks to "in lại danh sách [CẢNH BÁO TYPE] còn sót", so we just print them.
            if len(event_types) > 1:
                any_severe_conflict += 1
                print(f"[LỖI NGHIÊM TRỌNG] Nhóm gộp {merged_from} chứa các eventType khác nhau: {event_types}")
            elif len(event_subtypes) > 1:
                # Filter out campaign > battle / formation if we want to silence them completely, but let's just print to see if they are still there
                # Actually, the user asked: "Sau khi áp 2 quy tắc trên, in lại danh sách [CẢNH BÁO TYPE] còn sót"
                # So we can filter out the ones we explicitly handled (campaign + battle/formation)
                has_campaign = "campaign" in event_subtypes
                others = [s for s in event_subtypes if s != "campaign"]
                if has_campaign and all(o in ["battle", "formation"] for o in others):
                    pass # Handled by prioritization
                else:
                    print(f"[CẢNH BÁO TYPE] Nhóm gộp {merged_from} chứa các eventSubtype khác nhau: {event_subtypes}")
                    type_warning_count += 1
                
            # Ghi vào review file
            if len(merged_from) >= 2:
                groups_gt_2 += 1
                rv.write(f"## Nhóm gộp: {len(merged_from)} events\n")
                rv.write(f"**Kết quả (Primary):** {primary}\n")
                rv.write("**Nguồn gộp:**\n")
                for sid in merged_from:
                    orig_primary = orig_events[sid].get("titles", {}).get("primary", "N/A") if sid in orig_events else "N/A"
                    rv.write(f"- {sid}: {orig_primary}\n")
                if e.get("_merge_warning"):
                    rv.write(f"> **WARNING:** {e['_merge_warning']}\n")
                rv.write("\n---\n")

    print(f"Tổng số nhóm được gộp (>= 2 events): {groups_gt_2}")
    print(f"Tổng số cảnh báo eventSubtype còn sót: {type_warning_count}")
    print(f"Tổng số event dual-region: {dual_region_count}")
    
    # Kiểm severe eventType conflict = 0 sau un-merge
    if not any_severe_conflict:
        print("[OK] Không còn nhóm nào bị gộp lầm khác eventType (severe conflict = 0).")
    else:
        print(f"[FAIL] Vẫn còn {any_severe_conflict} nhóm severe eventType conflict. Cần xử lý thêm.")
    
    reduction_pct = (total_orig_lines - total_deduped) / total_orig_lines * 100 if total_orig_lines > 0 else 0
    print(f"Tỉ lệ giảm (gộp): {reduction_pct:.2f}%")
    if reduction_pct < 2.0:
        print("[CẢNH BÁO] Tỉ lệ gộp < 2%, nghi ngờ script dedup bị lỗi API hoặc chưa chạy hết.")
    elif reduction_pct > 40.0:
        print("[CẢNH BÁO] Tỉ lệ gộp > 40%, nghi ngờ gộp ẩu. Cần review kỹ.")
        
    print(f"Đã ghi toàn bộ {groups_gt_2} nhóm gộp ra {review_file} để review thủ công.")
    
    # ----------------------------------------
    print("\n--- KIỂM ĐỊNH GEOCODE ---")
    if not os.path.exists(locs_file):
        print(f"Không tìm thấy {locs_file}")
        return
        
    with open(locs_file, "r", encoding="utf-8") as f:
        locs = json.load(f)
        
    total_locs = len(locs)
    print(f"Tổng số địa danh đã phân giải: {total_locs}")
    
    if total_locs == 0:
        return
        
    # Thống kê confidence
    conf_counts = {"high": 0, "medium": 0, "low": 0, "none": 0}
    
    for k, v in locs.items():
        conf = v.get("confidence", "none")
        conf_counts[conf] = conf_counts.get(conf, 0) + 1
        
        country = v.get("country", "")
        if country == "vietnam":
            lat = v.get("lat")
            lng = v.get("lng")
            if lat is not None and lng is not None:
                # Mở rộng bbox để bao gồm quần đảo Hoàng Sa và Trường Sa
                # Hoàng Sa: ~16-17°N, 111-113°E; Trường Sa: ~7-12°N, 111-117°E
                if not (7 <= lat <= 24) or not (102 <= lng <= 117):
                    print(f"[GEO BUG] Tọa độ '{k}' (VN) nằm ngoài giới hạn mở rộng: {lat}, {lng}")
                    
    print("Phân bố độ tin cậy:")
    for c in ["high", "medium", "low", "none"]:
        count = conf_counts[c]
        pct = count / total_locs * 100
        print(f"  - {c}: {count} ({pct:.2f}%)")
        
    bad_pct = (conf_counts["low"] + conf_counts["none"]) / total_locs * 100
    if bad_pct > 30.0:
        print(f"[CẢNH BÁO GEO] Tỉ lệ low+none ({bad_pct:.2f}%) > 30%. Cần xem xét lại chất lượng.")
        
    # Random sample 20
    keys = list(locs.keys())
    sample_size = min(20, len(keys))
    samples = random.sample(keys, sample_size)
    
    with open(sample_file, "w", encoding="utf-8") as f:
        f.write("# Geocode Sample Review\n\n")
        f.write("| Địa danh gốc | Địa danh hiện đại | Lat | Lng | Confidence | Country |\n")
        f.write("|---|---|---|---|---|---|\n")
        for k in samples:
            v = locs[k]
            f.write(f"| {k} | {v.get('modern_name')} | {v.get('lat')} | {v.get('lng')} | {v.get('confidence')} | {v.get('country')} |\n")
            
    print(f"Đã xuất {sample_size} mẫu ngẫu nhiên ra {sample_file} để đối chiếu.")

    # Kiểm tra island country null = 0
    island_keywords = [
        "trường sa", "hoàng sa", "gạc ma", "cô lin", "len đao",
        "vành khăn", "ba bình", "an bang", "sinh tồn", "song tử tây",
        "bãi cạn", "huyện trường sa", "huyện hoàng sa",
    ]
    null_country_islands = []
    for k, v in locs.items():
        if any(kw in k.lower() for kw in island_keywords):
            if v.get("country") in (None, "", "null"):
                null_country_islands.append(k)
    if null_country_islands:
        print(f"[FAIL] {len(null_country_islands)} địa danh biển đảo vẫn có country=null: {null_country_islands}")
    else:
        print("[OK] Không còn địa danh biển đảo nào có country=null.")

if __name__ == "__main__":
    main()

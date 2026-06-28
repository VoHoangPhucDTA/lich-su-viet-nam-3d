import json
import os
import sys
import time
import requests
from rapidfuzz import fuzz

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

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

def build_llm_payload(batch):
    payload = []
    for e in batch:
        titles_obj = e.get("titles", {})
        t_list = []
        if titles_obj.get("primary"): t_list.append(titles_obj["primary"])
        if titles_obj.get("short"): t_list.append(titles_obj["short"])
        t_list.extend(titles_obj.get("alternatives") or [])
        
        payload.append({
            "id": e["_internal_id"],
            "titles": t_list,
            "displayDate": (e.get("chronology") or {}).get("displayDate", ""),
            "summary": e.get("summary", {}).get("homepageSummary", "") or e.get("summary", {}).get("cardSummary", "")
        })
    return payload

def precision_score(chrono):
    if not chrono: return -1
    p = chrono.get("datePrecision")
    levels = {"day": 5, "month": 4, "year": 3, "period": 2, "approximate": 1}
    score = levels.get(p, 0) * 10
    start = chrono.get("start", {}) or {}
    if start.get("day") is not None: score += 3
    elif start.get("month") is not None: score += 2
    elif start.get("year") is not None: score += 1
    return score

def normalize_subtype(s):
    if not s: return s
    return s.lower().replace(" ", "-")

def apply_manual_unmerge(final_events, orig_events_list, base_dir):
    """Post-processing: split merged groups flagged in manual_unmerge_list.json."""
    unmerge_file = os.path.join(base_dir, "manual_unmerge_list.json")
    if not os.path.exists(unmerge_file):
        print("[INFO] manual_unmerge_list.json not found, skipping un-merge step.")
        return final_events

    with open(unmerge_file, "r", encoding="utf-8") as f:
        unmerge_data = json.load(f)

    groups_to_split = unmerge_data.get("groups_to_split", [])
    if not groups_to_split:
        print("[INFO] No groups to split in manual_unmerge_list.json.")
        return final_events

    # Build lookup: suggestedId -> list of original events (may have duplicates across lessons)
    orig_by_sid = {}
    for e in orig_events_list:
        sid = e.get("suggestedId")
        if sid:
            if sid not in orig_by_sid:
                orig_by_sid[sid] = []
            orig_by_sid[sid].append(e)

    total_before = sum(len(e.get("_merged_from", [])) for e in final_events)
    split_sets = [frozenset(g["ids"]) for g in groups_to_split]

    new_final_events = []
    split_count = 0

    for fe in final_events:
        merged_set = frozenset(fe.get("_merged_from", []))
        matched_split_set = None
        for ss in split_sets:
            if ss.issubset(merged_set):
                matched_split_set = ss
                break

        if matched_split_set is None:
            new_final_events.append(fe)
            continue

        print(f"  [UN-MERGE] Tách nhóm: {list(matched_split_set)}")
        split_count += 1

        ids_to_split = list(matched_split_set)
        remaining_ids = [sid for sid in fe.get("_merged_from", []) if sid not in matched_split_set]

        # Create standalone event for each id in the split group
        for sid in ids_to_split:
            origs = orig_by_sid.get(sid, [])
            if not origs:
                print(f"  [WARNING] Không tìm thấy event gốc cho {sid}, bỏ qua.")
                continue
            orig = origs[0]  # pick first occurrence
            standalone = {
                "suggestedId": sid,
                "titles": orig.get("titles", {}),
                "classification": orig.get("classification", {}),
                "chronology": orig.get("chronology"),
                "summary": orig.get("summary"),
                "textbookContent": orig.get("textbookContent"),
                "rawPlaceMentions": orig.get("rawPlaceMentions") or [],
                "relatedMentions": orig.get("relatedMentions") or [],
                "suggestedParent": orig.get("suggestedParent"),
                "confidence": orig.get("confidence", "high"),
                "grade": orig.get("grade"),
                "lesson_ids": [orig.get("lesson_id")] if orig.get("lesson_id") else [],
                "_merged_from": [sid],
            }
            new_final_events.append(standalone)

        # If there are remaining IDs not in the split, keep them as a residual event
        if remaining_ids:
            residual = {k: v for k, v in fe.items()}
            residual["_merged_from"] = remaining_ids
            if len(remaining_ids) == 1:
                residual.pop("_merge_warning", None)
                residual.pop("_is_dual_region", None)
            new_final_events.append(residual)

    total_after = sum(len(e.get("_merged_from", [])) for e in new_final_events)
    if total_before != total_after:
        print(f"[ERROR] Bảo toàn thất bại sau un-merge! Trước: {total_before}, Sau: {total_after}")
    else:
        print(f"[OK] Bảo toàn 100% sau un-merge: {total_after}/{total_before}")
    print(f"Un-merge: {split_count} nhóm đã tách. Events trước: {len(final_events)}, sau: {len(new_final_events)}")
    return new_final_events

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    keys = load_keys(os.path.join(base_dir, ".env"))
    if not keys:
        print("API keys missing.")
        return
    for k in keys:
        key_last_used[k] = 0.0
        key_cooldown_until[k] = 0.0
        
    input_file = os.path.join(base_dir, "../stage2_extract/output/event_candidates.jsonl")
    out_file = os.path.join(base_dir, "deduped_events.jsonl")
    
    with open(os.path.join(base_dir, "prompts", "dedup_prompt.md"), "r", encoding="utf-8") as f:
        system_prompt = f.read()

    print("Loading events...")
    events = []
    total_input_ids = 0
    with open(input_file, "r", encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            if not e.get("suggestedId"):
                e["suggestedId"] = f"unknown_id_{total_input_ids}"
            events.append(e)
            total_input_ids += 1
            
    # Assign ID and bucket
    buckets = {}
    for i, e in enumerate(events):
        e["_internal_id"] = i
        start_obj = (e.get("chronology") or {}).get("start") or {}
        start_year = start_obj.get("year")
        if start_year is None:
            bucket_key = "null"
        else:
            bucket_key = str((start_year // 100) * 100)
        
        if bucket_key not in buckets:
            buckets[bucket_key] = []
        buckets[bucket_key].append(e)

    print(f"Total events: {len(events)}. Buckets: {list(buckets.keys())}")
    
    merged_groups = []
    
    for b_key, b_events in buckets.items():
        print(f"Processing bucket {b_key} ({len(b_events)} events)...")
        if len(b_events) <= 1:
            continue
            
        BATCH_SIZE = 40
        for i in range(0, len(b_events), BATCH_SIZE):
            batch = b_events[i:i+BATCH_SIZE]
            if len(batch) <= 1: continue
            
            payload = build_llm_payload(batch)
            user_prompt = json.dumps(payload, ensure_ascii=False, indent=2)
            
            try:
                result = call_gemini(system_prompt, user_prompt)
                groups = result.get("duplicate_groups", [])
                merged_groups.extend(groups)
                print(f"  -> Found {len(groups)} duplicate groups in batch.")
            except Exception as e:
                print(f"  [ERROR] Failed bucket {b_key} batch: {e}")

    # Cross-bucket matching
    print("Starting cross-bucket matching...")
    null_events = [e for e in events if ((e.get("chronology") or {}).get("start") or {}).get("year") is None]
    other_events = [e for e in events if ((e.get("chronology") or {}).get("start") or {}).get("year") is not None]
    
    candidate_pairs = []
    
    def extract_all_titles(e):
        t_obj = e.get("titles", {})
        res = []
        if t_obj.get("primary"): res.append(t_obj["primary"])
        if t_obj.get("short"): res.append(t_obj["short"])
        res.extend(t_obj.get("alternatives") or [])
        return res

    for ne in null_events:
        ne_titles = extract_all_titles(ne)
        if not ne_titles: continue
        for oe in other_events:
            oe_titles = extract_all_titles(oe)
            if not oe_titles: continue
            
            matched = False
            for nt in ne_titles:
                for ot in oe_titles:
                    if not nt or not ot: continue
                    if fuzz.token_set_ratio(nt.lower(), ot.lower()) >= 85:
                        matched = True
                        break
                if matched: break
            if matched:
                candidate_pairs.append({ne["_internal_id"], oe["_internal_id"]})

    # Group candidate pairs
    cp_clusters = []
    for pair in candidate_pairs:
        pair_list = list(pair)
        found = -1
        for i, c in enumerate(cp_clusters):
            if pair_list[0] in c or pair_list[1] in c:
                found = i
                break
        if found != -1:
            cp_clusters[found].update(pair)
        else:
            cp_clusters.append(set(pair))

    print(f"Found {len(cp_clusters)} cross-bucket candidate clusters.")
    for cluster in cp_clusters:
        cluster_list = list(cluster)
        batch_events = [events[i] for i in cluster_list]
        BATCH_SIZE = 40
        for i in range(0, len(batch_events), BATCH_SIZE):
            batch = batch_events[i:i+BATCH_SIZE]
            if len(batch) <= 1: continue
            payload = build_llm_payload(batch)
            user_prompt = json.dumps(payload, ensure_ascii=False, indent=2)
            try:
                result = call_gemini(system_prompt, user_prompt)
                groups = result.get("duplicate_groups", [])
                merged_groups.extend(groups)
                print(f"  -> Cross-bucket: confirmed {len(groups)} groups.")
            except Exception as e:
                print(f"  [ERROR] Failed cross-bucket batch: {e}")

    print("Merging events...")
    # Find connected components
    parent = {i: i for i in range(len(events))}
    def find(i):
        if parent[i] == i: return i
        parent[i] = find(parent[i])
        return parent[i]
    def union(i, j):
        root_i = find(i)
        root_j = find(j)
        if root_i != root_j:
            parent[root_i] = root_j

    for group in merged_groups:
        if not group: continue
        first = group[0]
        for other in group[1:]:
            union(first, other)

    clusters = {}
    for i in range(len(events)):
        root = find(i)
        if root not in clusters:
            clusters[root] = []
        clusters[root].append(i)

    print(f"Final distinct events count: {len(clusters)}")
    
    final_events = []
    
    def get_len_summary(e):
        tc = e.get("textbookContent", {}) or {}
        return len(tc.get("canonicalSummary") or e.get("summary", {}).get("homepageSummary") or "")

    for root, indices in clusters.items():
        group_events = [events[i] for i in indices]
        base_event = max(group_events, key=get_len_summary).copy()
        
        final_e = {}
        final_e["suggestedId"] = base_event.get("suggestedId")
        final_e["_merged_from"] = [e["suggestedId"] for e in group_events]
        
        # Merge titles
        base_primary = base_event.get("titles", {}).get("primary")
        short = None
        for e in group_events:
            s = e.get("titles", {}).get("short")
            if s:
                short = s
                break
                
        alternatives = set()
        for e in group_events:
            t_obj = e.get("titles", {})
            if t_obj.get("primary"): alternatives.add(t_obj["primary"])
            if t_obj.get("short"): alternatives.add(t_obj["short"])
            for a in (t_obj.get("alternatives") or []):
                if a: alternatives.add(a)
                
        if base_primary in alternatives: alternatives.discard(base_primary)
        if short in alternatives: alternatives.discard(short)
        
        final_e["titles"] = {
            "primary": base_primary,
            "short": short,
            "alternatives": list(alternatives)
        }
        
        # Classification
        base_cls = base_event.get("classification", {}) or {}
        regions = set(e.get("classification", {}).get("region") for e in group_events if e.get("classification", {}).get("region"))
        if len(regions) > 1:
            if "vietnam" in regions:
                final_region = "vietnam"
                final_e["_is_dual_region"] = True
            else:
                final_region = base_cls.get("region")
                print(f"  [WARNING] Region conflict without vietnam in group: {final_e['_merged_from']} | regions={regions}")
                final_e["_merge_warning"] = "region conflict"
                final_e["_is_dual_region"] = True
        else:
            final_region = list(regions)[0] if regions else base_cls.get("region")
            
        tags = set()
        for e in group_events:
            tags.update((e.get("classification") or {}).get("tags") or [])
            
        # Mentions need to be prepared early in case we add subtype notes to relatedMentions
        rawPlaceMentions = set()
        relatedMentions = set()
        for e in group_events:
            rawPlaceMentions.update(e.get("rawPlaceMentions") or [])
            relatedMentions.update(e.get("relatedMentions") or [])

        subtypes = [normalize_subtype(e.get("classification", {}).get("eventSubtype")) for e in group_events if e.get("classification", {}).get("eventSubtype")]
        final_subtype = normalize_subtype(base_cls.get("eventSubtype"))
        
        # Prioritize campaign > battle, campaign > formation
        if "campaign" in subtypes:
            final_subtype = "campaign"
            for e in group_events:
                s = normalize_subtype(e.get("classification", {}).get("eventSubtype"))
                if s and s != "campaign":
                    relatedMentions.add(f"{s}: {e.get('titles', {}).get('primary', '')}")
                    
        final_e["classification"] = {
            "eventType": base_cls.get("eventType"),
            "eventSubtype": final_subtype,
            "region": final_region,
            "tags": list(tags)
        }
        
        # Chronology
        best_chrono = max([e.get("chronology") for e in group_events], key=precision_score)
        final_e["chronology"] = best_chrono
        
        # Summary
        final_e["summary"] = base_event.get("summary")
        
        # Textbook content
        keyFacts = set()
        for e in group_events:
            tc = e.get("textbookContent", {}) or {}
            keyFacts.update(tc.get("keyFacts") or [])
            
        final_e["textbookContent"] = {
            "canonicalSummary": max([ (e.get("textbookContent") or {}).get("canonicalSummary") or "" for e in group_events], key=len) or None,
            "detailedNarrative": max([ (e.get("textbookContent") or {}).get("detailedNarrative") or "" for e in group_events], key=len) or None,
            "significance": max([ (e.get("textbookContent") or {}).get("significance") or "" for e in group_events], key=len) or None,
            "keyFacts": list(keyFacts)
        }
        
        final_e["rawPlaceMentions"] = list(rawPlaceMentions)
        final_e["relatedMentions"] = list(relatedMentions)
        
        final_e["suggestedParent"] = base_event.get("suggestedParent")
        
        # Confidence
        conf_map = {"high": 3, "medium": 2, "low": 1}
        conf_rev = {3: "high", 2: "medium", 1: "low"}
        min_conf = 3
        for e in group_events:
            c = e.get("confidence", "high")
            min_conf = min(min_conf, conf_map.get(c, 3))
        final_e["confidence"] = conf_rev[min_conf]
        
        final_e["grade"] = base_event.get("grade")
        
        lesson_ids = set()
        for e in group_events:
            l = e.get("lesson_id")
            if l: lesson_ids.add(l)
        final_e["lesson_ids"] = list(lesson_ids)
        
        final_events.append(final_e)
            
    # Check total merged IDs
    total_merged = sum(len(e["_merged_from"]) for e in final_events)
    if total_merged != total_input_ids:
        print(f"[ERROR] Data loss! Input: {total_input_ids}, Merged: {total_merged}")
        raise ValueError("Data loss detected")

    # Post-processing: apply manual un-merge
    print("\nApplying manual un-merge...")
    final_events = apply_manual_unmerge(final_events, events, base_dir)

    with open(out_file, "w", encoding="utf-8") as f:
        for e in final_events:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

    print(f"Saved {len(final_events)} deduped events to {out_file}")

if __name__ == "__main__":
    main()

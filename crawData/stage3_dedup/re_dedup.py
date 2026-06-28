import json
import os
import dedup

base_dir = os.path.dirname(os.path.abspath(__file__))
input_file = os.path.join(base_dir, "../stage2_extract/output/event_candidates.jsonl")
out_file = os.path.join(base_dir, "deduped_events.jsonl")

events = []
with open(input_file, "r", encoding="utf-8") as f:
    for line in f:
        events.append(json.loads(line))
        
events_by_id = {e["suggestedId"]: e for e in events}

# Read current merged_from groups from deduped_events.jsonl
# Note: Since deduped_events.jsonl has ALREADY been unmerged once, the _merged_from groups in it are exactly the clusters we want!
current_final = []
with open(out_file, "r", encoding="utf-8") as f:
    for line in f:
        current_final.append(json.loads(line))
        
clusters = [fe["_merged_from"] for fe in current_final]

final_events = []
def get_len_summary(e):
    tc = e.get("textbookContent", {}) or {}
    return len(tc.get("canonicalSummary") or e.get("summary", {}).get("homepageSummary") or "")

for cluster_ids in clusters:
    # Some events might have duplicate suggestedIds across different lines, but events_by_id just gives one. 
    # That's fine because they are identical.
    group_events = [events_by_id[sid] for sid in cluster_ids if sid in events_by_id]
    if not group_events: continue
    
    base_event = max(group_events, key=get_len_summary).copy()
    
    final_e = {}
    final_e["suggestedId"] = base_event.get("suggestedId")
    final_e["_merged_from"] = cluster_ids
    
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
        for a in t_obj.get("alternatives", []):
            if a: alternatives.add(a)
            
    if base_primary in alternatives: alternatives.discard(base_primary)
    if short in alternatives: alternatives.discard(short)
    
    final_e["titles"] = {
        "primary": base_primary,
        "short": short,
        "alternatives": list(alternatives)
    }
    
    base_cls = base_event.get("classification", {}) or {}
    regions = set(e.get("classification", {}).get("region") for e in group_events if e.get("classification", {}).get("region"))
    if len(regions) > 1:
        if "vietnam" in regions:
            final_region = "vietnam"
            final_e["_is_dual_region"] = True
        else:
            final_region = base_cls.get("region")
            final_e["_merge_warning"] = "region conflict"
            final_e["_is_dual_region"] = True
    else:
        final_region = list(regions)[0] if regions else base_cls.get("region")
        
    tags = set()
    for e in group_events:
        tags.update(e.get("classification", {}).get("tags", []))
        
    rawPlaceMentions = set()
    relatedMentions = set()
    for e in group_events:
        rawPlaceMentions.update(e.get("rawPlaceMentions", []))
        relatedMentions.update(e.get("relatedMentions", []))

    subtypes = [dedup.normalize_subtype(e.get("classification", {}).get("eventSubtype")) for e in group_events if e.get("classification", {}).get("eventSubtype")]
    final_subtype = dedup.normalize_subtype(base_cls.get("eventSubtype"))
    
    if "campaign" in subtypes:
        final_subtype = "campaign"
        for e in group_events:
            s = dedup.normalize_subtype(e.get("classification", {}).get("eventSubtype"))
            if s and s != "campaign":
                relatedMentions.add(f"{s}: {e.get('titles', {}).get('primary', '')}")
                
    final_e["classification"] = {
        "eventType": base_cls.get("eventType"),
        "eventSubtype": final_subtype,
        "region": final_region,
        "tags": list(tags)
    }
    
    best_chrono = max([e.get("chronology") for e in group_events], key=dedup.precision_score)
    final_e["chronology"] = best_chrono
    
    final_e["summary"] = base_event.get("summary")
    
    keyFacts = set()
    for e in group_events:
        tc = e.get("textbookContent", {}) or {}
        keyFacts.update(tc.get("keyFacts", []))
        
    final_e["textbookContent"] = {
        "canonicalSummary": max([ (e.get("textbookContent") or {}).get("canonicalSummary") or "" for e in group_events], key=len) or None,
        "detailedNarrative": max([ (e.get("textbookContent") or {}).get("detailedNarrative") or "" for e in group_events], key=len) or None,
        "significance": max([ (e.get("textbookContent") or {}).get("significance") or "" for e in group_events], key=len) or None,
        "keyFacts": list(keyFacts)
    }
    
    final_e["rawPlaceMentions"] = list(rawPlaceMentions)
    final_e["relatedMentions"] = list(relatedMentions)
    
    final_events.append(final_e)

with open(out_file, "w", encoding="utf-8") as f:
    for e in final_events:
        f.write(json.dumps(e, ensure_ascii=False) + "\n")
        
print(f"Re-processed {len(final_events)} events successfully.")

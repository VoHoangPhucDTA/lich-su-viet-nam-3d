import json, glob
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import fix_bce_years, fix_period_years

with open('output/event_candidates.jsonl', 'w', encoding='utf-8') as f_out:
    for fn in sorted(glob.glob('output/raw_responses/*.json')):
        print(f"Processing {fn}")
        with open(fn, 'r', encoding='utf-8') as f_in:
            data = json.load(f_in)
        
        # Apply post-processing just like in extract.py
        data = fix_bce_years(data)
        data = fix_period_years(data)

        for ev in data.get('events', []):
            ev['grade'] = data.get('grade')
            ev['lesson_id'] = data.get('lesson_id')
            f_out.write(json.dumps(ev, ensure_ascii=False) + '\n')
print('Done rebuilding event_candidates.jsonl')
print('Done rebuilding event_candidates.jsonl')

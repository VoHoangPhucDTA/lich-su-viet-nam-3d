import json, glob
counts = {}
for f in sorted(glob.glob('output/raw_responses/*.json')):
    try:
        data = json.load(open(f, encoding='utf-8'))
        counts[f] = len(data.get('events', []))
    except Exception as e:
        counts[f] = f"Error: {e}"

for f, c in counts.items():
    print(f"{f}: {c} events")

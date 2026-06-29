import json
import os
from collections import defaultdict

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    locs_file = os.path.join(base_dir, "locations_dict.json")

    with open(locs_file, "r", encoding="utf-8") as f:
        locs = json.load(f)

    # Group by (lat, lng) rounded to 2 decimal places, exclude nulls
    coord_groups = defaultdict(list)
    for name, data in locs.items():
        lat = data.get("lat")
        lng = data.get("lng")
        if lat is not None and lng is not None:
            key = (round(lat, 2), round(lng, 2))
            coord_groups[key].append(name)

    duplicates = {k: v for k, v in coord_groups.items() if len(v) > 1}

    print(f"Tổng số địa danh: {len(locs)}")
    print(f"Số cụm tọa độ trùng (lat+lng giống hệt đến 2 chữ số): {len(duplicates)}\n")

    for (lat, lng), names in sorted(duplicates.items(), key=lambda x: -len(x[1])):
        modern = locs[names[0]].get('modern_name', '')
        print(f"  ({lat}, {lng}) — {len(names)} địa danh — ví dụ: [{modern}]")
        for name in names:
            conf = locs[name].get('confidence', '?')
            country = locs[name].get('country', '?')
            print(f"    [{conf}][{country}] {name}")
        print()

    # Summary of likely problematic cases
    print("--- Cụm nghi vấn (>= 4 địa danh cùng tọa độ, có thể là tọa độ tâm tỉnh/vùng) ---")
    for (lat, lng), names in sorted(duplicates.items(), key=lambda x: -len(x[1])):
        if len(names) >= 4:
            print(f"  ({lat}, {lng}): {names}")

if __name__ == "__main__":
    main()

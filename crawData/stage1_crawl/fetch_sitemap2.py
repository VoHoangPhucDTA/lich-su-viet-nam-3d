# -*- coding: utf-8 -*-
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from curl_cffi import requests

SITEMAP2 = "https://sgkvn.com/sitemap.xml?page=2"
LOP_PATHS = {
    "10": "/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/",
    "12": "/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/",
}

print("[*] Dang tai sitemap page 2 ...")
resp = requests.get(SITEMAP2, impersonate="chrome124", timeout=120)
resp.raise_for_status()
xml = resp.text
print(f"[OK] {len(xml)} bytes")

for grade in ["10", "12"]:
    path = LOP_PATHS[grade]
    all_urls = re.findall(r"<loc>(https://sgkvn\.com[^<]+)</loc>", xml)
    matched = []
    for u in all_urls:
        if path in u and ("bai-" in u or "bang-tra-cuu" in u) and u.endswith(".html"):
            slug_parts = u.replace(path, "").split("/")
            if any("lich-su" in p for p in slug_parts):
                matched.append(u)
    print(f"\n=== LOP {grade} ({len(matched)} bai) ===")
    for u in matched:
        print(f'    "{u}",')
    if not matched:
        # Show doan mau de debug
        sample = [u for u in all_urls if path in u][:5]
        print(f"  => Khong match. Mau URL: {sample}")

with open("sitemap2.txt", "w", encoding="utf-8") as f:
    f.write(xml)
print("\n[OK] Luu sitemap2.txt")

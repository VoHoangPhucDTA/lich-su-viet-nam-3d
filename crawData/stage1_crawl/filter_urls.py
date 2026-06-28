# -*- coding: utf-8 -*-
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# Doc sitemap2 da luu
with open("sitemap2.txt", "r", encoding="utf-8") as f:
    xml = f.read()

all_urls = re.findall(r"<loc>(https://sgkvn\.com[^<]+)</loc>", xml)

# ===== LOP 10 =====
# Chu de chinh: 3266, 3274, 3279 + chuyen de 3615
# Loai bo: mi-thuat, the-thao, bong-da, bong-chuyen, cau-long, bong-ro
PATH10 = "/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/"
EXCLUDE_10 = ["mi-thuat", "the-thao", "bong-da", "bong-chuyen", "bong-ro", "cau-long",
              "khoi-dong", "kham-pha", "luyen-tap", "bai-1-lich-su-truyen-thong-cua-luc-luong",
              "nha-nuoc-va-phap-luat"]
# Chi lay SGK (chu-de hoac chuyen-de-hoc-tap-lich-su)
INCLUDE_10 = ["chu-de-1-lich-su-va-su-hoc",
              "chu-de-4-cac-cuoc-cach-mang-cong-nghiep",
              "chu-de-7-cong-dong-cac-dan-toc-viet-nam",
              "chuyen-de-hoc-tap-lich-su-10"]

ls10 = []
for u in all_urls:
    if PATH10 not in u:
        continue
    if not u.endswith(".html"):
        continue
    segment = u.replace("https://sgkvn.com" + PATH10, "")
    if not any(seg in segment for seg in INCLUDE_10):
        continue
    if any(ex in u for ex in EXCLUDE_10):
        continue
    if "bai-" in u or "bang-tra-cuu" in u:
        ls10.append(u)

print(f"=== LOP 10 ({len(ls10)} bai SGK lich su) ===")
for u in ls10:
    print(f'    "{u}",')

# ===== LOP 12 =====
PATH12 = "/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/"
EXCLUDE_12 = ["mi-thuat", "the-thao", "bong-da", "bong-chuyen", "bong-ro", "cau-long",
              "du-lieu-trong-van-ban", "thuc-hanh-doc-sach"]
# Chi lay chu-de mon Lich su (3537..3542, 3815) 
INCLUDE_12 = ["chu-de-1-the-gioi-trong-va-sau-chien-tranh-lanh",
              "chu-de-2-asean-nhung-chang-duong-lich-su",
              "chu-de-3-cach-mang-thang-tam",
              "chu-de-4", "chu-de-5-lich-su-doi-ngoai",
              "chuyen-de-1", "chuyen-de-2-nhat-ban", "chuyen-de-3"]

ls12 = []
for u in all_urls:
    if PATH12 not in u:
        continue
    if not u.endswith(".html"):
        continue
    segment = u.replace("https://sgkvn.com" + PATH12, "")
    if any(ex in u for ex in EXCLUDE_12):
        continue
    # Loc: phai co chu-de hoac chuyen-de voi ID 3537-3542 hoac 3815
    m = re.search(r"-(3537|3538|3539|3540|3541|3542|3815)[-/]", u)
    if not m:
        continue
    if "bai-" in u or "bang-tra-cuu" in u or "iii-bai-hoc" in u or "khai-quat-cuoc-doi" in u:
        ls12.append(u)

print(f"\n=== LOP 12 ({len(ls12)} bai SGK lich su) ===")
for u in ls12:
    print(f'    "{u}",')

# -*- coding: utf-8 -*-
"""
lessons_urls.py — Cau hinh URL cho tung lop / cuon sach.
Duoc import boi crawler.py.

Cach dien URL:
  1. Chay fetch_sitemap2.py hoac mo trang sgkvn.com/sitemap.xml?page=2
  2. Loc URL theo pattern: /lop-XX-YY/ket-noi-tri-thuc.../bai-N-...html
  3. Them vao danh sach urls[] cua lop tuong ung, giu dung thu tu sach.

Cach chay crawler:
  python crawler.py --grade 11       # Chay 1 lop
  python crawler.py --grade all      # Chay ca 3 lop
  python crawler.py --grade 12 --resume  # Tiep tuc tu cho bi ngat
"""

BOOKS = {
    # =========================================================================
    # LOP 10 — Lich su 10, Ket Noi Tri Thuc Voi Cuoc Song
    # =========================================================================
    "10": {
        "grade": "10",
        "book": "KNTT",
        "subject": "Lich su",
        "output_file": "lich_su_10_kntt.json",
        "subject_label": "Lich Su 10 - Ket Noi Tri Thuc Voi Cuoc Song",
        "urls": [
            # -- Chu de 1: Lich su va Su hoc (3266) --
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-1-lich-su-va-su-hoc-3266/bai-1-hien-thuc-lich-su-va-nhan-thuc-lich-su-12122.html",
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-1-lich-su-va-su-hoc-3266/bai-2-tri-thuc-lich-su-va-cuoc-song-12126.html",

            # -- Chu de 2: Vai tro cua su hoc --
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-2-vai-tro-cua-su-hoc-3269/bai-3-su-hoc-voi-cac-linh-vuc-khoa-hoc-12128.html",
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-2-vai-tro-cua-su-hoc-3269/bai-4-su-hoc-voi-mot-so-linh-vuc-nghanh-nghe-hien-dai-12137.html",
            
            # -- Chu de 3: Mot so nen van minh the gioi trong thoi ki co-trung dai --
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-3-mot-so-nen-van-minh-the-gioi-thoi-ki-co-trung-dai-3273/bai-5-khai-niem-van-minh-mot-so-nen-van-minh-phuong-dong-thoi-ki-co-trung-dai-12138.html",
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-3-mot-so-nen-van-minh-the-gioi-thoi-ki-co-trung-dai-3273/bai-6-mot-so-nen-van-minh-phuong-tay-thoi-ki-co-trung-dai-12141.html",


            # -- Chu de 4: Cac cuoc cach mang cong nghiep (3274) --
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-cac-cuoc-cach-mang-cong-nghiep-trong-lich-su-the-gioi-3274/bai-7-cac-cuoc-cach-mang-cong-nghiep-thoi-ki-can-dai-12143.html",
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-cac-cuoc-cach-mang-cong-nghiep-trong-lich-su-the-gioi-3274/bai-8-cac-cuoc-cach-mang-cong-nghiep-thoi-ki-hien-dai-12145.html",

            # -- Chu de 5: Van minh dong nam a --
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-5-van-minh-dong-nam-a-3275/bai-9-co-so-hinh-thanh-van-minh-dong-nam-a-thoi-ki-co-trung-dai-12146.html",
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-5-van-minh-dong-nam-a-3275/bai-10-hanh-trinh-phat-trien-va-thanh-tuu-cua-van-minh-dong-nam-a-thoi-ki-co-trung-dai-12147.html",

            # -- Chu de 6: Mot so nen van minh tren dat nuoc Viet Nam(Truoc nam 1958) --
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-6-mot-so-nen-van-minh-tren-dat-nuoc-viet-nam-truoc-nam-1858-3276/bai-11-mot-so-nen-van-minh-co-tren-dat-nuoc-viet-nam-12148.html",
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-6-mot-so-nen-van-minh-tren-dat-nuoc-viet-nam-truoc-nam-1858-3276/bai-12-van-minh-dai-viet-12160.html",

            # -- Chu de 7: Cong dong cac dan toc Viet Nam (3279) --
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-7-cong-dong-cac-dan-toc-viet-nam-3279/bai-13-doi-song-vat-chat-va-tinh-than-cua-cong-dong-cac-dan-toc-viet-nam-12162.html",
            "https://sgkvn.com/lop-10-13/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-7-cong-dong-cac-dan-toc-viet-nam-3279/bai-14-khoi-dai-doan-ket-dan-toc-trong-lich-su-viet-nam-12169.html",
            # bang-tra-cuu chu-de-7 (12170) bi 404 tren server -> da xoa

            # -- Chuyen de Hoc tap Lich su 10 (3615) --
            # bang-tra-cuu chuyen-de (13425) bi 404 tren server -> da xoa
        ],
    },

    # =========================================================================
    # LOP 11 — Lich su 11, Ket Noi Tri Thuc Voi Cuoc Song
    # =========================================================================
    "11": {
        "grade": "11",
        "book": "KNTT",
        "subject": "Lich su",
        "output_file": "lich_su_11_kntt.json",
        "subject_label": "Lich Su 11 - Ket Noi Tri Thuc Voi Cuoc Song",
        "urls": [
            # -- Chu de 1: Cach mang tu san va su phat trien cua chu nghia tu ban (3327) --
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-1-cach-mang-tu-san-va-su-phat-trien-cua-chu-nghia-tu-ban-3327/bai-1-mot-so-van-de-chung-ve-cach-mang-tu-san-12335.html",
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-1-cach-mang-tu-san-va-su-phat-trien-cua-chu-nghia-tu-ban-3327/bai-2-su-phat-trien-cua-chu-nghia-tu-ban-12336.html",
            # -- Chu de 2: Su hinh thanh va phat trien cua chu nghia xa hoi (3330) --
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-2-su-hinh-thanh-va-phat-trien-cua-chu-nghia-xa-hoi-3330/bai-3-su-ra-doi-cua-chu-nghia-xa-hoi-khoa-hoc-va-su-hinh-thanh-nha-nuoc-xa-hoi-chu-nghia-dau-tien-tren-the-gioi-12337.html",
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-2-su-hinh-thanh-va-phat-trien-cua-chu-nghia-xa-hoi-3330/bai-4-su-phat-trien-cua-chu-nghia-xa-hoi-tu-sau-chien-tranh-the-gioi-thu-hai-den-nay-12338.html",
            # -- Chu de 3: Qua trinh gianh doc lap dan toc cua cac quoc gia Dong Nam A (3331) --
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-3-qua-trinh-gianh-doc-lap-dan-toc-cua-cac-quoc-gia-dong-nam-a-3331/bai-5-qua-trinh-xam-luoc-va-cai-tri-cua-chu-nghia-thuc-dan-o-dong-nam-a-cong-cuoc-cai-cach-o-xiem-12339.html",
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-3-qua-trinh-gianh-doc-lap-dan-toc-cua-cac-quoc-gia-dong-nam-a-3331/bai-6-hanh-trinh-di-den-doc-lap-dan-toc-o-dong-nam-a-12340.html",
            # -- Chu de 4: Chien tranh bao ve To quoc va chien tranh giai phong (3346) --
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-chien-tranh-bao-ve-to-quoc-va-chien-tranh-giai-phong-dan-toc-trong-lich-su-viet-nam-truoc-cach-mang-thang-tam-nam-1945-3346/bai-7-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-12370.html",
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-chien-tranh-bao-ve-to-quoc-va-chien-tranh-giai-phong-dan-toc-trong-lich-su-viet-nam-truoc-cach-mang-thang-tam-nam-1945-3346/bai-8-mot-so-cuoc-khoi-nghia-va-chien-tranh-giai-phong-trong-lich-su-viet-nam-tu-the-ki-iii-truoc-cong-nguyen-den-cuoi-the-ki-xix-12372.html",
            # -- Chu de 5: Lang xa Viet Nam trong lich su (3348) --
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-5-lang-xa-viet-nam-trong-lich-su-3348/bai-9-khai-quat-ve-lang-xa-viet-nam-trong-lich-su-12373.html",
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-5-lang-xa-viet-nam-trong-lich-su-3348/bai-10-kinh-te-va-to-chuc-xa-hoi-lang-xa-12380.html",
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-5-lang-xa-viet-nam-trong-lich-su-3348/bai-11-phong-tuc-tap-quan-va-mot-so-le-hoi-lang-xa-co-truyen-12382.html",
            # -- Chu de 6: Mot so cuoc cai cach lon trong lich su Viet Nam (3353) --
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-6-mot-so-cuoc-cai-cach-lon-trong-lich-su-viet-nam-truoc-nam-1858-3353/bai-12-khai-luoc-ve-cai-cach-cuoc-cai-cach-cua-ho-quy-ly-va-trieu-ho-dau-the-ki-xv-12387.html",
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-6-mot-so-cuoc-cai-cach-lon-trong-lich-su-viet-nam-truoc-nam-1858-3353/bai-13-cuoc-cai-cach-cua-le-thanh-tong-the-ki-xv-12390.html",
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-6-mot-so-cuoc-cai-cach-lon-trong-lich-su-viet-nam-truoc-nam-1858-3353/bai-14-cuoc-cai-cach-cua-minh-mang-nua-dau-the-ki-xix-12393.html",
            # -- Chu de 7: Lich su chu quyen cua Viet Nam o Bien Dong (3354) --
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-7-lich-su-chu-quyen-cua-viet-nam-o-bien-dong-3354/bai-15-vi-tri-va-tam-quan-trong-cua-bien-dong-12394.html",
            "https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-7-lich-su-chu-quyen-cua-viet-nam-o-bien-dong-3354/bai-16-viet-nam-va-bien-dong-12395.html",
            # bang-tra-cuu (12396) bi loi 404 tren server -> da xoa khoi danh sach
        ],
    },

    # =========================================================================
    # LOP 12 — Lich su 12, Ket Noi Tri Thuc Voi Cuoc Song
    # =========================================================================
    "12": {
        "grade": "12",
        "book": "KNTT",
        "subject": "Lich su",
        "output_file": "lich_su_12_kntt.json",
        "subject_label": "Lich Su 12 - Ket Noi Tri Thuc Voi Cuoc Song",
        "urls": [
            # -- Chu de 1: The gioi trong va sau Chien tranh Lanh (3537) --
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-1-the-gioi-trong-va-sau-chien-tranh-lanh-3537/bai-1-lien-hop-quoc-12945.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-1-the-gioi-trong-va-sau-chien-tranh-lanh-3537/bai-2-trat-tu-the-gioi-trong-chien-tranh-lanh-12948.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-1-the-gioi-trong-va-sau-chien-tranh-lanh-3537/bai-3-trat-tu-the-gioi-sau-chien-tranh-lanh-12949.html",
            # -- Chu de 2: ASEAN nhung chang duong lich su (3538) --
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-2-asean-nhung-chang-duong-lich-su-3538/bai-4-su-ra-doi-va-phat-trien-cua-hiep-hoi-cac-quoc-gia-dong-nam-a-asean-12950.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-2-asean-nhung-chang-duong-lich-su-3538/bai-5-cong-dong-asean-tu-y-tuong-den-hien-thuc-12951.html",
            # -- Chu de 3: Cach mang Thang Tam, khang chien giai phong, bao ve To quoc (3539) --
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-3-cach-mang-thang-tam-nam-1945-chien-tranh-giai-phong-dan-toc-va-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-tu-thang-8-nam-1945-den-nay-3539/bai-6-cach-mang-thang-tam-nam-1945-12952.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-3-cach-mang-thang-tam-nam-1945-chien-tranh-giai-phong-dan-toc-va-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-tu-thang-8-nam-1945-den-nay-3539/bai-7-cuoc-khang-chien-chong-thuc-dan-phap-1945-1954-12955.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-3-cach-mang-thang-tam-nam-1945-chien-tranh-giai-phong-dan-toc-va-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-tu-thang-8-nam-1945-den-nay-3539/bai-8-cuoc-khang-chien-chong-my-cuu-nuoc-1954-1975-12956.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-3-cach-mang-thang-tam-nam-1945-chien-tranh-giai-phong-dan-toc-va-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-tu-thang-8-nam-1945-den-nay-3539/bai-9-cuoc-dau-tranh-bao-ve-to-quoc-tu-sau-thang-4-1975-12957.html",
            # -- Chu de 4: Cong cuoc Doi moi o Viet Nam tu nam 1986 den nay (3540) --
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-cong-cuoc-doi-moi-o-viet-nam-tu-nam-1986-den-nay-3540/bai-10-khai-quat-ve-cong-cuoc-doi-moi-tu-nam-1986-den-nay-12958.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-cong-cuoc-doi-moi-o-viet-nam-tu-nam-1986-den-nay-3540/bai-11-thanh-tuu-co-ban-va-bai-hoc-cua-cong-cuoc-doi-moi-o-viet-nam-tu-nam-1986-den-nay-12960.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-cong-cuoc-doi-moi-o-viet-nam-tu-nam-1986-den-nay-3540/bai-12-hoat-dong-doi-ngoai-cua-viet-nam-trong-dau-tranh-gianh-doc-lap-dan-toc-tu-dau-the-ki-xx-den-cach-mang-thang-tam-nam-1945-12962.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-cong-cuoc-doi-moi-o-viet-nam-tu-nam-1986-den-nay-3540/bai-13-hoat-dong-doi-ngoai-cua-viet-nam-trong-khang-chien-chong-phap-1945-1954-va-khang-chien-chong-my-1954-1975-12964.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-cong-cuoc-doi-moi-o-viet-nam-tu-nam-1986-den-nay-3540/bai-14-hoat-dong-doi-ngoai-cua-viet-nam-tu-nam-1975-den-nay-12965.html",
            # -- Chu de 5: Lich su doi ngoai cua Viet Nam thoi can hien dai (3541) --
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-5-lich-su-doi-ngoai-cua-viet-nam-thoi-can-hien-dai-3541/bai-15-khai-quat-cuoc-doi-va-su-nghiep-cua-ho-chi-minh-12966.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-5-lich-su-doi-ngoai-cua-viet-nam-thoi-can-hien-dai-3541/bai-16-ho-chi-minh-anh-hung-giai-phong-dan-toc-12967.html",
            "https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-5-lich-su-doi-ngoai-cua-viet-nam-thoi-can-hien-dai-3541/bai-17-dau-an-ho-chi-minh-trong-long-nhan-dan-the-gioi-va-viet-nam-12968.html",
        ],
    },
}

# Chronology Repair Baseline

> Generated report. This report does not repair or approve chronology changes.

## Executive summary

- Stage4A events: 407
- Stage4B core events: 361
- Stage4B supporting events: 50
- Null Stage4B start years: 102
- Stage5 approved targets valid: True

## Chronology counts

| Metric | Count |
|---|---:|
| Total Stage4B core events | 361 |
| Integer start.year | 259 |
| Null start.year | 102 |
| Integer end.year | 91 |
| Null end.year | 270 |
| Canonical chronology year 0 records | 0 |
| Negative/BCE chronology records | 5 |

## Null chronology classification

Classification is reporting-only Phase D0 metadata and does not authorize repair.

| Group | Category | Count |
|---|---|---:|
| Year-signal null | safe deterministic candidate | 20 |
| Year-signal null | manual-review candidate | 21 |
| No-clear-calendar-year null | trulyUnknown | 1 |
| No-clear-calendar-year null | namedHistoricalPeriod | 14 |
| No-clear-calendar-year null | centuryBased | 29 |
| No-clear-calendar-year null | bceOrAncient | 7 |
| No-clear-calendar-year null | durationExpression | 2 |
| No-clear-calendar-year null | relativeChronology | 8 |
| No-clear-calendar-year null | otherUnclassified | 0 |
| Unclassified null | other | 0 |

### Safe deterministic candidates

- `cac-chien-thang-quan-su-1964-1965`
- `cai-cach-ruong-dat-mien-bac`
- `chu-quyen-bien-dao-viet-nam-1858-1918`
- `chu-quyen-bien-dao-viet-nam-1919-1945`
- `chu-quyen-bien-dao-viet-nam-1954-1975`
- `cuoc-tien-cong-chien-luoc-dong-xuan-1953-1954`
- `giai-doan-day-manh-cong-nghiep-hoa-hien-dai-hoa-hoi-nhap-kinh-te-quoc-te-1996-2006`
- `giai-doan-khang-chien-chong-my-1954-1960`
- `giai-doan-khang-chien-chong-my-1961-1965`
- `giai-doan-khang-chien-chong-my-1965-1968`
- `giai-doan-khang-chien-chong-my-1969-1973`
- `giai-doan-khang-chien-chong-my-1973-1975`
- `giai-doan-khoi-dau-cong-cuoc-doi-moi-1986-1995`
- `hoan-toan-giai-phong-mien-nam-viet-nam`
- `ke-hoach-nha-nuoc-5-nam-lan-thu-nhat-mien-bac`
- `lien-xo-vien-tro-cho-viet-nam`
- `mien-bac-viet-nam-giai-phong-xay-dung-cnxh`
- `phong-trao-dong-khoi`
- `thuc-hien-thong-nhat-dat-nuoc-viet-nam`
- `viet-nam-hoan-tat-muc-tieu-thien-nien-ki`

### Manual-review candidates

- `cac-chien-dich-tien-cong-quan-doi-viet-nam-1950-1953`
- `cai-cach-le-thanh-tong`
- `chien-luoc-vua-danh-vua-dam-va-van-dong-quoc-te-cong-nhan-mat-tran-dan-toc-giai-phong-mien-nam-viet-nam`
- `chien-thang-duong-14-phuoc-long`
- `chu-quyen-bien-dao-viet-nam-1975-den-nay`
- `dau-tranh-chong-phong-kien-phuong-bac`
- `giai-doan-cuoi-chien-tranh-the-gioi-thu-hai`
- `giai-doan-tiep-tuc-day-manh-cong-nghiep-hoa-hien-dai-hoa-hoi-nhap-quoc-te-sau-rong-2006-nay`
- `ho-chi-minh-keu-goi-nhuong-com-se-ao-tang-gia-san-xuat`
- `ho-chi-minh-ki-sac-lenh-thanh-lap-nha-binh-dan-hoc-vu-va-quy-doc-lap`
- `lien-hop-quoc-vien-tro-viet-nam-1977-1986`
- `su-ra-doi-nha-nuoc-van-lang`
- `viet-nam-mo-co-quan-dai-dien-ngoai-giao-va-thong-tin-o-nuoc-ngoai`
- `viet-nam-tham-gia-afta`
- `viet-nam-to-chuc-hoi-nghi-quoc-te-asean-asem-apec`
- `viet-nam-uy-vien-khong-thuong-truc-hoi-dong-bao-an-lhq`
- `vndcch-can-bang-quan-he-voi-lien-xo-trung-quoc-va-van-dong-vien-tro`
- `vndcch-dau-tranh-doi-thi-hanh-hiep-dinh-gio-ne-vo`
- `vndcch-gap-go-dang-cong-san-phap-va-cac-to-chuc-quoc-te`
- `vndcch-thiet-lap-quan-he-ngoai-giao-voi-lao-campuchia-va-ung-ho-phong-trao-giai-phong-dan-toc`
- `vu-an-le-chi-vien`

## Hierarchy risk

- Null-start fallback_root_by_year count: 81
- Null-start rooted at `viet-nam-1975-den-nay`: 83
- Year-signal pre-1975 rooted at `viet-nam-1975-den-nay`: 17

## DB zero-risk simulation

- Would become `start_year = 0`: 102
- Would become `effective_end_year = 0`: 95

## Stage5 compatibility

- Approved image count: 4
- Approved image-event relationship count: 4
- All targets exist in Stage4B: True
- All source lesson IDs match target refs: True
- All approved targets appear in current candidates: True

| Target event | Slug | Source lesson | Exists | Lesson ref match | Candidate match |
|---|---|---|---:|---:|---:|
| `ho-chi-minh-cong-bo-tuyen-ngon-doc-lap` | `ho-chi-minh-cong-bo-tuyen-ngon-doc-lap` | `12952` | True | True | True |
| `dai-hoi-quoc-dan-tan-trao` | `dai-hoi-quoc-dan-tan-trao` | `12952` | True | True | True |
| `khoi-nghia-gianh-chinh-quyen-ha-noi` | `khoi-nghia-gianh-chinh-quyen-ha-noi` | `12952` | True | True | True |
| `khoi-nghia-gianh-chinh-quyen-sai-gon` | `khoi-nghia-gianh-chinh-quyen-sai-gon` | `12952` | True | True | True |

## Fingerprints

| Fingerprint | Hash | Protects |
|---|---|---|
| Stage4B event ID set | `bea093d4bbc26429e75ea26422c05f838d18599771b57dbab675394de1421a13` | Event identity stability |
| Stage4B slug mapping | `85e370d13d2396915556f5bf513d2302be11d5ee1f96fbcd260c6fdfe749bcaf` | Event ID to slug mapping |
| Textbook references | `a7dfbfb909011450951cec4849dbe76f5f0c73825b2a20494ee3a679c16e2133` | Event to lesson refs used by Stage5 |
| Stage5 compatibility | `75cd0dbcd9439c95e2bd90a4f63f3fce616e51bd5570f8598fc646a18f19208d` | Approved target identity fields |
| Unrelated content baseline | `338b73a740cbdff756d88e81608e9c92d2c07d6ae2819026605393891cb4403f` | Non-chronology/non-hierarchy content |

Unrelated-content fingerprint includes: id, slug, entityType, eventLevel, titles, classification, coverage, summary, textbookContent, externalContent, media, associations, display, sourcePolicy.

Unrelated-content fingerprint excludes: chronology, hierarchy, _stage4bParentSource, _stage4bParentReason.

## Validation

- Fatal errors: 0
- Warnings: 0
- Suspicious Stage5 approved mapping mojibake path count: 0

## Important warning

**This report does not repair or approve chronology changes.**

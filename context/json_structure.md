# CẤU TRÚC JSON SỰ KIỆN LỊCH SỬ – v2 (đã cập nhật)

> **Nguồn**: file `Giải thích cấu trúc json.docx` (phiên bản mới do nhóm dữ liệu cung cấp).
> **Mục đích**: là **single source of truth** cho mọi nơi trong dự án – frontend, backend, AI service, ChromaDB embedding.
> **Phạm vi áp dụng**: tất cả `entityType=event` (về sau có thể mở rộng sang nhân vật, triều đại, hiệp định, tổ chức).

---

## 0. Sơ đồ tổng quan

Một bản ghi sự kiện gồm **15 khối** xếp theo thứ tự sau:

```
event {
  id, slug, entityType, eventLevel,
  titles {…},
  classification {…},
  coverage {…},
  chronology {…},
  mapData { displayGeometry, focusGeometry },
  summary {…},
  textbookContent {…},
  externalContent {…},
  media {…},
  hierarchy {…},
  associations {…},
  display {…},
  sourcePolicy {…}
}
```

---

## 1. Định danh – `id`, `slug`, `entityType`, `eventLevel`

```json
{
  "id": "bach-dang-938",
  "slug": "bach-dang-938",
  "entityType": "event",
  "eventLevel": "atomic"
}
```

| Trường | Kiểu | Mô tả | Ghi chú |
|---|---|---|---|
| `id` | string | ID nội bộ duy nhất | Dùng để liên kết cha/con, sự kiện liên quan, truy xuất trong code. **Không thay đổi** sau khi đã publish |
| `slug` | string | Chuỗi cho URL (`/event/{slug}`) | Thường giống `id`. Dùng kebab-case không dấu |
| `entityType` | enum | `event` (hiện tại). Dự phòng `figure` / `dynasty` / `treaty` / `organization` | Schema vẫn dùng được khi mở rộng |
| `eventLevel` | enum | `atomic` \| `collection` | `atomic` = sự kiện cụ thể (Trận Bạch Đằng 938). `collection` = chủ đề/giai đoạn lớn (Ngô Quyền giành quyền tự chủ). Quan trọng cho sidebar & drill-down |

---

## 2. Khối `titles`

```json
"titles": {
  "primary": "Trận Bạch Đằng năm 938",
  "short": "Bạch Đằng 938",
  "alternatives": ["Chiến thắng Bạch Đằng 938"]
}
```

| Trường | Bắt buộc | Dùng cho |
|---|---|---|
| `primary` | ✅ | Tên chính thức – tiêu đề trang chi tiết, hero, breadcrumb |
| `short` | ⚪ | Card, marker popup, timeline label, kết quả tìm kiếm |
| `alternatives` | ⚪ | Search index, tránh trùng khi nhập liệu, map dữ liệu wiki/SGK gọi khác nhau |

---

## 3. Khối `classification`

```json
"classification": {
  "eventType": "military",
  "eventSubtype": "battle",
  "tags": ["Ngô Quyền", "938", "Bạch Đằng", "chống Nam Hán"]
}
```

### `eventType` (loại lớn)

| Giá trị | Tiếng Việt | Màu (theo design system) |
|---|---|---|
| `military` | Quân sự | `#9f1d2d` đỏ huyết dụ |
| `political` | Chính trị | `#4f6f95` xanh thép |
| `diplomatic` | Ngoại giao | (đề xuất `#7a4f95` tím nhạt) |
| `economic` | Kinh tế | `#c29b4b` vàng đồng |
| `cultural` | Văn hoá | `#2f7a57` xanh rêu |

### `eventSubtype` (loại cụ thể)
`battle`, `campaign`, `conference`, `treaty`, `uprising`, `reform`, … (mở rộng tự do)

### `tags`
Từ khóa hỗ trợ tìm kiếm và lọc: tên nhân vật, năm, địa danh, từ khoá chủ đề.

---

## 4. Khối `coverage`

```json
"coverage": {
  "grades": [10, 11, 12]
}
```

`grades` = danh sách lớp SGK xuất hiện sự kiện (10/11/12). Dùng để **lọc theo lớp** mà không cần quét `textbookRefs`, hữu ích cho sidebar phân lớp và thống kê coverage.

---

## 5. Khối `chronology`

```json
"chronology": {
  "start":  { "year": 1954, "month": 3,  "day": 13 },
  "end":    { "year": 1954, "month": 5,  "day": 7 },
  "datePrecision": "day",
  "displayDate": "13/3/1954 - 7/5/1954",
  "isApproximate": false
}
```

| Trường | Mô tả |
|---|---|
| `start` / `end` | Mốc thời gian. Khi không biết tháng/ngày để `null`. Sự kiện 1 mốc → có thể bỏ `end` |
| `datePrecision` | `day` \| `month` \| `year` \| `period` \| `approximate` |
| `displayDate` | Chuỗi hiển thị cho người dùng. VD `"Năm 938"`, `"13/3/1954 - 7/5/1954"`, `"Cuối thế kỉ XIX"` |
| `isApproximate` | `true` cho sự kiện cổ đại / xấp xỉ |

---

## 6. Khối `mapData` ⭐ (quan trọng nhất)

`mapData` **bắt buộc tách 2 phần**:

- `displayGeometry` – sự kiện được **vẽ** thế nào trên bản đồ.
- `focusGeometry` – camera **bay tới đâu** khi user chọn sự kiện.

Hai thứ này khác nhau (ví dụ: kháng chiến chống Pháp `displayGeometry=multi_polygon` toàn miền Bắc, nhưng `focusGeometry` chỉ zoom về Hà Nội).

### 6.1 `displayGeometry`

```json
"displayGeometry": {
  "geoType": "point",
  "marker": { "lat": 20.95, "lng": 106.82, "label": "Sông Bạch Đằng" },
  "markers": [],
  "provinceNames": ["Quảng Ninh", "Hải Phòng"],
  "gadmRefs": [],
  "historicalLocations": ["Sông Bạch Đằng"]
}
```

#### `geoType` – enum 7 giá trị

| Giá trị | Mô tả | Render |
|---|---|---|
| `point` | 1 điểm cụ thể | 1 marker |
| `multi_point` | Nhiều điểm rời nhau | Nhiều marker (phong trào nổ ra nhiều nơi) |
| `polygon` | 1 vùng | 1 polygon GADM |
| `multi_polygon` | Nhiều vùng | Nhiều polygon GADM |
| `nationwide` | Toàn quốc | Highlight toàn bộ VN |
| `no_location` | Không gắn với vị trí | Không hiển thị marker/polygon |
| `mixed` | Kết hợp marker + polygon | Cả hai |

#### Các trường con

| Trường | Mô tả |
|---|---|
| `marker` | `{ lat, lng, label }` – điểm đại diện chính khi `geoType=point` |
| `markers` | Array khi `geoType=multi_point` |
| `provinceNames` | Tên tỉnh/thành **hiện đại**, dùng map với polygon GADM |
| `gadmRefs` | Mã GADM tương ứng (có thể để trống lúc nhập tay; script sẽ map sau) |
| `historicalLocations` | Tên địa danh **lịch sử** theo SGK (ví dụ "Sông Bạch Đằng", "Tập đoàn cứ điểm Điện Biên Phủ"). Quan trọng vì địa danh lịch sử không luôn trùng tỉnh hiện đại |

### 6.2 `focusGeometry`

```json
"focusGeometry": {
  "mode": "auto",
  "center": { "lat": 20.95, "lng": 106.82 },
  "zoom": 10,
  "provinceNames": ["Quảng Ninh"],
  "gadmRefs": []
}
```

| Trường | Mô tả |
|---|---|
| `mode` | `auto` \| `marker` \| `polygon` \| `bounds` |
| `center` | Tâm camera |
| `zoom` | Mức zoom đề xuất |
| `provinceNames` / `gadmRefs` | Khi muốn camera fit theo polygon tỉnh thay vì chỉ bay vào 1 marker |

---

## 7. Khối `summary`

```json
"summary": {
  "homepageTitle": "Bạch Đằng 938 – Mở đầu thời kỳ tự chủ",
  "homepageSummary": "Chiến thắng then chốt chấm dứt hơn 1.000 năm Bắc thuộc.",
  "cardSummary": "Ngô Quyền đánh bại quân Nam Hán trên sông Bạch Đằng năm 938."
}
```

| Trường | Độ dài gợi ý | Vị trí dùng |
|---|---|---|
| `homepageTitle` | ≤ 60 ký tự | Tiêu đề trang chủ, slider |
| `homepageSummary` | 1–2 câu (≤ 160 ký tự) | Mô tả ngắn ở trang chủ |
| `cardSummary` | 1 câu (≤ 100 ký tự) | Card / list / popup marker |

> Tách riêng để **không phải cắt bớt từ đoạn SGK dài** mỗi lần render trang chủ.

---

## 8. Khối `textbookContent` ⭐ (nguồn cho RAG)

```json
"textbookContent": {
  "canonicalSummary": "…",
  "detailedNarrative": "…",
  "significance": "…",
  "keyFacts": ["Diễn ra năm 938", "Ngô Quyền chỉ huy", "Đánh bại quân Nam Hán"],
  "textbookRefs": [
    {
      "grade": 10,
      "book": "Lịch sử 10 - Cánh Diều",
      "theme": "",
      "lesson": "",
      "pageStart": 40,
      "pageEnd": 41,
      "excerpt": ""
    }
  ]
}
```

| Trường | Mô tả |
|---|---|
| `canonicalSummary` | Tóm tắt chuẩn nhất theo SGK |
| `detailedNarrative` | Mô tả chi tiết, vẫn bám SGK |
| `significance` | Ý nghĩa lịch sử |
| `keyFacts` | Danh sách dữ kiện chính cần nhớ |
| `textbookRefs[]` | Danh sách nơi sự kiện này xuất hiện trong SGK – dùng để truy nguồn, mở đúng bài/trang, làm căn cứ chính thống, **chunking ChromaDB cho RAG** |

> ⚠️ **Chỉ nội dung khối này** mới được đưa vào ChromaDB và bám trực tiếp vào câu trả lời quiz. `externalContent` không được dùng cho RAG.

---

## 9. Khối `externalContent` (chỉ để hiển thị)

```json
"externalContent": {
  "wikipedia": {
    "title": "Trận Bạch Đằng (938)",
    "url": "https://vi.wikipedia.org/...",
    "summary": "…",
    "content": "…"
  },
  "wikidata": {
    "id": "Q1234567",
    "url": "https://www.wikidata.org/..."
  },
  "otherSources": [
    { "name": "Britannica", "url": "https://...", "summary": "…" }
  ]
}
```

Tách riêng để **không lẫn với nội dung SGK**, dễ kiểm soát đâu là chính – đâu là enrich.

---

## 10. Khối `media`

```json
"media": {
  "thumbnail": "https://…/bach-dang-938.jpg",
  "items": [
    {
      "id": "img-001",
      "type": "image",
      "category": "battle_diagram",
      "role": "hero",
      "url": "https://…",
      "caption": "Sơ đồ trận Bạch Đằng",
      "alt": "Sơ đồ chiến thuật cọc gỗ trên sông",
      "source": "SGK Lịch sử 10 – Cánh Diều, tr.41",
      "license": "CC-BY",
      "credit": "Bộ GD&ĐT",
      "isPrimary": true
    }
  ]
}
```

### `type` và `category`

| `type` | `category` gợi ý |
|---|---|
| `image` | `portrait`, `map`, `battle_diagram`, `artifact`, `document_scan`, `monument`, `textbook_figure`, `other` |
| `video` | (mở rộng) |
| `audio` | (mở rộng) |
| `document` | (mở rộng) |

### `role`
`thumbnail` \| `hero` \| `gallery` \| `inline` – quyết định vị trí render.

### Các trường khác
- `caption` – chú thích hiển thị
- `alt` – text thay thế (a11y)
- `source` – nguồn media
- `license` – bản quyền
- `credit` – ghi công tác giả/nguồn
- `isPrimary` – đánh dấu media chính (1 trong items)

---

## 11. Khối `hierarchy`

```json
"hierarchy": {
  "rootId": "khang-chien-chong-phap-1945-1954",
  "parentId": "chien-cuoc-dong-xuan-1953-1954",
  "childIds": ["dien-bien-phu-dot-1", "dien-bien-phu-dot-2", "dien-bien-phu-dot-3"],
  "level": 2,
  "orderInParent": 0
}
```

| Trường | Mô tả |
|---|---|
| `rootId` | ID gốc cao nhất sự kiện này thuộc về |
| `parentId` | ID cha trực tiếp. Root → `null` |
| `childIds[]` | Danh sách con trực tiếp |
| `level` | `0` = root, `1` = con root, `2` = cháu, … |
| `orderInParent` | Thứ tự hiển thị trong sidebar (vì SGK không phải lúc nào cũng sort theo tên) |

---

## 12. Khối `associations` (quan hệ ngữ nghĩa, KHÔNG phải cha-con)

```json
"associations": {
  "relatedEventIds": ["hiep-dinh-geneve-1954"],
  "relatedFigureIds": ["vo-nguyen-giap"],
  "predecessorEventIds": ["chien-dich-thu-dong-1947"],
  "successorEventIds": ["hiep-dinh-geneve-1954"]
}
```

| Trường | Dùng cho |
|---|---|
| `relatedEventIds` | "Sự kiện liên quan" – ví dụ Điện Biên Phủ ↔ Hiệp định Genève |
| `relatedFigureIds` | Nhân vật liên quan |
| `predecessorEventIds` | Sự kiện trước trong chuỗi diễn biến |
| `successorEventIds` | Sự kiện sau |

> Dùng để tạo phần "Xem thêm", chuỗi sự kiện liên quan, điều hướng ngang ở trang chi tiết.

---

## 13. Khối `display`

```json
"display": {
  "showOnHomepage": true,
  "showOnTimeline": true,
  "featured": false
}
```

| Trường | Mô tả |
|---|---|
| `showOnHomepage` | Có hiện ở trang chủ hay không |
| `showOnTimeline` | Có hiện ở timeline hay không |
| `featured` | Sự kiện nổi bật (hiện ở slider/spotlight) |

---

## 14. Khối `sourcePolicy`

```json
"sourcePolicy": {
  "canonicalSource": "textbook",
  "supplementalSources": ["wikipedia", "wikidata"]
}
```

| Trường | Mô tả |
|---|---|
| `canonicalSource` | Nguồn chuẩn chính thống. **Cố định = `"textbook"`** cho dự án |
| `supplementalSources[]` | Nguồn bổ sung (`wikipedia`, `wikidata`, `britannica`, …) |

> Khối này thể hiện **triết lý dữ liệu** của đề tài: SGK là nguồn pháp lý duy nhất cho RAG; mọi thứ còn lại chỉ enrich UI.

---

## 15. Ví dụ đầy đủ – Trận Bạch Đằng 938

```json
{
  "id": "bach-dang-938",
  "slug": "bach-dang-938",
  "entityType": "event",
  "eventLevel": "atomic",

  "titles": {
    "primary": "Trận Bạch Đằng năm 938",
    "short": "Bạch Đằng 938",
    "alternatives": ["Chiến thắng Bạch Đằng 938"]
  },

  "classification": {
    "eventType": "military",
    "eventSubtype": "battle",
    "tags": ["Ngô Quyền", "938", "Bạch Đằng", "chống Nam Hán"]
  },

  "coverage": { "grades": [10] },

  "chronology": {
    "start": { "year": 938, "month": null, "day": null },
    "end":   { "year": 938, "month": null, "day": null },
    "datePrecision": "year",
    "displayDate": "Năm 938",
    "isApproximate": false
  },

  "mapData": {
    "displayGeometry": {
      "geoType": "point",
      "marker": { "lat": 20.95, "lng": 106.82, "label": "Sông Bạch Đằng" },
      "markers": [],
      "provinceNames": ["Quảng Ninh", "Hải Phòng"],
      "gadmRefs": [],
      "historicalLocations": ["Sông Bạch Đằng"]
    },
    "focusGeometry": {
      "mode": "marker",
      "center": { "lat": 20.95, "lng": 106.82 },
      "zoom": 10,
      "provinceNames": ["Quảng Ninh"],
      "gadmRefs": []
    }
  },

  "summary": {
    "homepageTitle": "Bạch Đằng 938 – Mở đầu thời kỳ tự chủ",
    "homepageSummary": "Chiến thắng then chốt chấm dứt hơn 1.000 năm Bắc thuộc.",
    "cardSummary": "Ngô Quyền đánh bại quân Nam Hán trên sông Bạch Đằng năm 938."
  },

  "textbookContent": {
    "canonicalSummary": "Năm 938, Ngô Quyền chỉ huy quân dân ta đánh bại quân xâm lược Nam Hán trên sông Bạch Đằng…",
    "detailedNarrative": "…",
    "significance": "Chấm dứt hơn 1.000 năm Bắc thuộc, mở ra kỷ nguyên độc lập tự chủ.",
    "keyFacts": [
      "Diễn ra năm 938",
      "Ngô Quyền chỉ huy",
      "Đánh bại quân Nam Hán",
      "Sử dụng cọc gỗ đóng dưới lòng sông"
    ],
    "textbookRefs": [
      { "grade": 10, "book": "Lịch sử 10 - Cánh Diều", "theme": "Việt Nam thời nguyên thủy đến thế kỷ X", "lesson": "Bài 14", "pageStart": 40, "pageEnd": 41, "excerpt": "" }
    ]
  },

  "externalContent": {
    "wikipedia": { "title": "Trận Bạch Đằng (938)", "url": "https://vi.wikipedia.org/wiki/Tr%E1%BA%ADn_B%E1%BA%A1ch_%C4%90%E1%BA%B1ng_(938)", "summary": "", "content": "" },
    "wikidata":  { "id": "Q865542", "url": "https://www.wikidata.org/wiki/Q865542" },
    "otherSources": []
  },

  "media": {
    "thumbnail": "/media/bach-dang-938/hero.jpg",
    "items": [
      { "id": "bd-1", "type": "image", "category": "battle_diagram", "role": "hero", "url": "/media/bach-dang-938/diagram.png", "caption": "Sơ đồ trận Bạch Đằng", "alt": "Sơ đồ chiến thuật cọc gỗ", "source": "SGK Lịch sử 10 – Cánh Diều, tr.41", "license": "CC-BY", "credit": "Bộ GD&ĐT", "isPrimary": true }
    ]
  },

  "hierarchy": {
    "rootId": "ngo-quyen-tu-chu",
    "parentId": "ngo-quyen-tu-chu",
    "childIds": [],
    "level": 1,
    "orderInParent": 0
  },

  "associations": {
    "relatedEventIds": [],
    "relatedFigureIds": ["ngo-quyen"],
    "predecessorEventIds": [],
    "successorEventIds": ["ngo-quyen-xung-vuong-939"]
  },

  "display": {
    "showOnHomepage": true,
    "showOnTimeline": true,
    "featured": true
  },

  "sourcePolicy": {
    "canonicalSource": "textbook",
    "supplementalSources": ["wikipedia", "wikidata"]
  }
}
```

---

## 16. Ánh xạ với code hiện tại (`MVP_KLTN`)

| Khối spec | File hiện có | Trạng thái |
|---|---|---|
| Toàn bộ schema | `src/data/mockEventDetails.ts` (`MockEventDetail` interface) | ⚠️ Gần đủ, **thiếu**: `eventLevel`, `chronology.{year,month,day}` (đang là string), `geoType` chỉ 4/7 giá trị, `displayGeometry.markers/gadmRefs`, `focusGeometry.mode`, `media.items.{category,role,license,credit,isPrimary}`, `externalContent.wikipedia.{summary,content}`, `display`, đầy đủ `hierarchy.{rootId,level,orderInParent}` |
| Schema flat (legacy) | `src/types/event.ts` (`HistoricalEvent`) | 🔴 Cần migrate hoàn toàn sang schema mới này |
| Mock data | `src/data/events.ts` (12 sự kiện) | 🔴 Đang flat – cần convert |
| Service | `src/services/eventDetailService.ts` | 🟡 Đang fallback từ flat → 16 khối; sau khi migrate có thể bỏ fallback |

---

## 17. Tác vụ cần làm sau khi áp dụng v2

1. **Cập nhật `MockEventDetail`** trong `src/data/mockEventDetails.ts` thêm các trường còn thiếu (xem bảng mục 16).
2. **Đổi `chronology.start/end`** từ `string` → `{ year, month, day }`; thêm helper `formatChronology()` sinh `displayDate`.
3. **Mở rộng `geoType`** lên 7 giá trị, cập nhật cả `src/types/event.ts` và `CesiumMap.tsx`.
4. **Migrate `src/data/events.ts`** sang schema 16 khối; loại bỏ `HistoricalEvent` flat hoặc giữ làm view-model rút gọn.
5. **Validate JSON** bằng schema (đề xuất Zod) trước khi commit dữ liệu mới.
6. **Đồng bộ ChromaDB chunking**: chỉ chunk `textbookContent.{canonicalSummary, detailedNarrative, significance, keyFacts}` + metadata `{event_id, slug, grades, textbookRefs}`.

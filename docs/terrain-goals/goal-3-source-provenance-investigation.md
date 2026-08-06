# Goal 3 source provenance investigation

## Trạng thái và phạm vi

- Goal 3: `BLOCKED`
- Blocker: `PENDING_MANUAL_SOURCE_VERIFICATION`
- Source-gate implementation: `CORRECTLY_BLOCKED`
- Provenance investigation: `COMPLETED`
- Production insights remediation: `2 CONTEXTUAL`
- Preferred target: `PENDING`
- Camera behavior: `KEEP_OVERVIEW`

Đây là điều tra chỉ đọc pipeline hiện có. Không sửa canonical JSON/JSONL, backend, database, importer, 251 static event JSON, exam dataset hoặc SGK PDF. Không chạy importer hay regeneration.

Phân loại thống nhất cho hồ sơ Goal 3-R:

- `textbookContent.detailedNarrative`: `CURATED_OR_UNVERIFIED_ENRICHMENT`.
- Cơ chế tạo chính xác: `UNVERIFIED`, do raw Stage 2 response không còn trong workspace.
- `observePoints` production: **Human-reviewed pedagogical observation prompts**, không phải source excerpts hoặc claim lịch sử mới.

## Kết luận chính

1. `pageRange: 54–61` không được model hoặc curation gõ trực tiếp vào event. Stage 1 crawler đọc các marker `(Trang 54)` đến `(Trang 61)` từ HTML SGKVN và gắn `page` vào block. Stage 4A `prepare_indexes.py` mới là nơi đầu tiên tạo field `pageRange`, bằng `min(page)`/`max(page)` trên toàn bộ block của lesson `11:12370`.
2. So với PDF cục bộ đã dùng ở source gate, dải trang này là `METADATA_MISMATCH`. Tuy nhiên repository không có edition/version manifest đủ để chứng minh SGKVN sai, PDF sai hay hai nguồn thuộc hai bản dàn trang khác nhau. Nguyên nhân cuối cùng là `UNKNOWN`.
3. Cụm claim “núi đèo hiểm trở – sông ngòi chằng chịt – không phát huy sở trường kị binh” đã có nguyên văn trong Stage 1 SGKVN snapshot, trang marker 59. Field `textbookContent.detailedNarrative` đầu tiên còn được version-control lưu tại Stage 3; raw response Stage 2 đã bị `.gitignore` và không còn trong workspace nên không thể khôi phục chính xác response model đầu tiên.
4. DBP target-to-wave mapping đã có nguyên văn trong Stage 1 SGKVN snapshot, trang marker 42; field canonical chứa mapping xuất hiện trong artifact còn lưu từ Stage 3.
5. `textbookRefs[*].excerpt` không phải excerpt nguồn độc lập. Stage 4A gán thẳng `canonicalSummary` vào `excerpt`; trong dataset Stage 4A hiện tại, 445/445 textbook ref objects có `excerpt === canonicalSummary`. Vì vậy field này không thể tự chứng minh canonical summary.
6. Source gate vẫn phải đóng: provenance mới cho thấy bất nhất giữa SGKVN snapshot và PDF cục bộ, không giải quyết việc nguồn/edition nào được phê duyệt cho production. Các status `NOT_SUPPORTED` không thay đổi.

## Bản đồ pipeline đã chứng minh

```text
SGKVN HTML snapshot
  -> Stage 1 crawler: blocks + page markers + content_text
  -> Stage 2 prompt/Gemini extraction (raw output bị gitignore, không còn)
  -> Stage 3 deduped_events.jsonl: canonicalSummary/detailedNarrative/rawPlaceMentions
  -> Stage 4A lesson index: pageRange từ min/max lesson block pages
  -> Stage 4A final event: textbookRefs + canonical event JSON
  -> Stage 4B curated tree: giữ nguyên content, chỉ thêm hierarchy/curation metadata
```

## Evidence ledger

| Kết luận | File path | Field/đoạn | Stage | Dòng/đoạn liên quan | SHA-256 | Classification |
|---|---|---|---|---|---|---|
| SGKVN snapshot của Bài 7 lớp 11 mang marker 54–61 | `crawData/stage1_crawl/raw_html/grade_11/12370_BÀI_7__CHIẾN_TRANH_BẢO_VỆ_TỔ_QUỐC_TRONG_.html` | `<em>(Trang N)</em>` | Stage 1 raw source | Một dòng HTML; marker lần lượt `[54,55,56,57,58,59,60,61]` | `AFE8D7A571BC6D55DAE1D7F53938C7DB6625C956E734B3A084DC1C0FE0B250DE` | `DIRECT_SOURCE` |
| Crawler nhận marker và truyền page hiện tại vào block | `crawData/stage1_crawl/crawler.py` | `_tag_to_block`, `parse_content_blocks` | Stage 1 code | 199–205; 283–302 | `073EEEDFF1AB5742F43F5E6263A95367D3DBF71B87E0FCB0B1B08C6E4E9CD65A` | `DIRECT_SOURCE` |
| Lesson JSON giữ page values 54–61 | `crawData/stage1_crawl/lich_su_11_kntt.json` | `lessons[lesson_id=12370].blocks[*].page` | Stage 1 normalized crawl | Lesson 12370; claim blocks tại 3698 và 3741 | `A28764FB509ACDB87E1BB49DB51E40FFC2076FF54191570C989173B96DA7FFDB` | `DIRECT_SOURCE` |
| Stage 4A tính dải trang từ toàn lesson | `crawData/stage4_assemble/prepare_indexes.py` | `page_range(blocks)`; `lessons[key].pageRange` | Stage 4A index build | 123–125; 267–288 | `FC602DF5EEAB30AEE16DA66B1A67ACFF84E334C6E26DC795C17F6F28EE4BA615` | `METADATA_MISMATCH` |
| Field `pageRange: 54–61` đầu tiên trong artifact còn lưu | `crawData/stage4_assemble/output/indexes/lesson_index.json` | `11:12370.pageRange` | Stage 4A output index | 9311–9313 | `1F7963B4E01C4E6D0EF2A09670C55D240EBEE475E0E70FE0BB00DD5A3E6851EB` | `METADATA_MISMATCH` |
| Stage 4A copy pageRange và tự tạo excerpt từ canonical summary | `crawData/stage4_assemble/build_final_events.py` | `make_textbook_refs()` | Stage 4A assembly | 110–145, đặc biệt 131 và 133 | `3B849D1C8B9DA4BD6811E0AE5408B8731F2A595ECF61C9D48E957962DC5DFA4C` | `CURATED_OR_UNVERIFIED_ENRICHMENT` |
| Claim địa hình–kị binh có trong source snapshot | `crawData/stage1_crawl/lich_su_11_kntt.json` | lesson `12370`, block text/page 59 | Stage 1 normalized crawl | 3741 và block `page: 59` liền sau | `A28764FB509ACDB87E1BB49DB51E40FFC2076FF54191570C989173B96DA7FFDB` | `DIRECT_SOURCE` |
| Claim “thanh dã” tổng quát có trong source snapshot | `crawData/stage1_crawl/lich_su_11_kntt.json` | lesson `12370`, block text/page 58 | Stage 1 normalized crawl | 3698 và block `page: 58` liền sau | `A28764FB509ACDB87E1BB49DB51E40FFC2076FF54191570C989173B96DA7FFDB` | `DIRECT_SOURCE` |
| Stage 2 được thiết kế dùng model để tạo narrative bám SGK | `crawData/stage2_extract/prompts/event_extraction.md` | `textbookContent.canonicalSummary`, `detailedNarrative` | Stage 2 prompt | 38–67 | `D17641D8F799EDED97CF9E8D139A781B9C253357F922F14241A37285319A6AE3` | `CURATED_OR_UNVERIFIED_ENRICHMENT` |
| Stage 2 gọi Gemini; raw response không được version-control | `crawData/stage2_extract/extract.py`; `crawData/stage2_extract/.gitignore` | `call_gemini`; `output/` ignored | Stage 2 extraction | `extract.py` 24–76 và 245 trở đi; `.gitignore` dòng 2 | `DA7E0025901A7267567B538505EF53E34CD363F25D5062CD9F2F0021B01AE0EC` | `CURATED_OR_UNVERIFIED_ENRICHMENT` |
| `detailedNarrative` 1287 đầu tiên trong artifact còn lưu | `crawData/stage3_dedup/deduped_events.jsonl` | record `suggestedId=khang-chien-chong-quan-nguyen-1287-1288`, `textbookContent.detailedNarrative` | Stage 3 | 304 | `4944789B47DA09734C52448A945D3712A6B95AB54DBCD6B0D841F4CBC505A82A` | `CURATED_OR_UNVERIFIED_ENRICHMENT` |
| Stage 3 chọn narrative dài nhất khi merge | `crawData/stage3_dedup/dedup.py` | merge `textbookContent` | Stage 3 code | 367–469 | Không cần hash riêng; code được dẫn trực tiếp | `CURATED_PARAPHRASE` |
| DBP target-to-wave mapping có trong source snapshot | `crawData/stage1_crawl/lich_su_12_kntt.json` | lesson `12955`, block text/page 42 | Stage 1 normalized crawl | 2690 và 2700 | `5E0CABACEDD87A1DB765FE1D6823F5BFBF9AA9CB85C1BCDF5A8679C93AD1132A` | `DIRECT_SOURCE` |
| DBP mapping đầu tiên trong artifact event còn lưu | `crawData/stage3_dedup/deduped_events.jsonl` | record `suggestedId=chien-dich-dien-bien-phu-1954`, canonical summary/narrative | Stage 3 | 514 | `4944789B47DA09734C52448A945D3712A6B95AB54DBCD6B0D841F4CBC505A82A` | `CURATED_OR_UNVERIFIED_ENRICHMENT` |
| Hai record được copy sang Stage 4A | `crawData/stage4_assemble/output/final_events.jsonl` | record 1287 dòng 31; DBP dòng 229 | Stage 4A | 31 và 229 | `E3864FD0EAC1E56B874F2CDF83E170B0B9FF3745EF7EAED6DFD3DC8B7D2D3571` | `CURATED_PARAPHRASE` |
| Stage 4B không phải nơi sinh các claim | `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl` | record 1287 dòng 38; DBP dòng 212 | Stage 4B curated output | 38 và 212 | `4674284BED8BE87E01045DF88DB90B8C4898FE0CC8A1C63BAAAAE5D1A3C1F1F9` | `CURATED_PARAPHRASE` |

## Trả lời bảy câu hỏi điều tra

### 1. `pageRange: 54–61` được đưa vào ở stage nào?

Field `pageRange` đầu tiên được tạo ở **Stage 4A index build**, trong `prepare_indexes.py:123–125,288`, rồi xuất hiện tại `lesson_index.json:9311–9313`. Dữ liệu đầu vào của phép tính là các `blocks[*].page` đã tồn tại từ Stage 1.

Git history hỗ trợ chuỗi thời gian:

- Commit `f7fd81c0f8ca25e4199849d7144d233e28412ab7` thêm Stage 1 lesson JSON cùng source claims.
- Commit `68ce172bc6dd4a01c741ac1a2e1210ac34e96897` thêm Stage 3/4 artifacts, bao gồm lesson index và canonical event.

### 2. Giá trị đến từ model, scraper hay metadata thủ công?

- Page marker gốc: **source scraper**, đọc trực tiếp `(Trang N)` từ SGKVN HTML.
- `pageRange`: **deterministic Stage 4A calculation**, không qua model và không thấy manual override.
- Lý do nó lệch với PDF cục bộ: **UNKNOWN**. Bằng chứng chỉ đủ kết luận hai nguồn page metadata không cùng nhau; chưa có edition identifier để phân xử.

### 3. `detailedNarrative` núi đèo–sông ngòi–kị binh xuất hiện đầu tiên ở đâu?

- Nội dung claim xuất hiện sớm nhất trong source artifact: Stage 1 `lich_su_11_kntt.json:3741`, page marker 59.
- Field chính xác `textbookContent.detailedNarrative` xuất hiện sớm nhất trong artifact còn lưu: Stage 3 `deduped_events.jsonl:304`.
- Pipeline cho thấy Stage 2 model được yêu cầu tạo field này, nhưng `stage2_extract/output/` bị ignore và không còn. Vì vậy cơ chế tạo chính xác là `UNVERIFIED`; field giữ classification `CURATED_OR_UNVERIFIED_ENRICHMENT`.

### 4. Có source excerpt gốc hỗ trợ claim hay chỉ nội dung sinh/biên tập?

Có source text trong SGKVN snapshot cho:

- claim địa hình–kị binh tại marker trang 59;
- “thanh dã” nói chung cho “các cuộc kháng chiến chống quân Mông–Nguyên” tại marker trang 58.

Nhưng `textbookRefs[0].excerpt` trong canonical event không phải source excerpt: nó là bản sao của `canonicalSummary`. Ngoài ra PDF cục bộ dùng ở source gate không khớp snapshot này. Do đó source provenance tồn tại nhưng approval/edition alignment chưa đạt; Goal 3 vẫn bị chặn.

### 5. DBP target-to-wave mapping xuất hiện đầu tiên ở stage nào?

- Source text sớm nhất: Stage 1 lesson JSON, trang marker 42 (`lich_su_12_kntt.json:2690,2700`) và raw HTML cùng lesson.
- Event field sớm nhất còn lưu: Stage 3 `deduped_events.jsonl:514`.
- Stage 4A/4B chỉ truyền tiếp mapping và geocode các `rawPlaceMentions`; không phải nơi tạo lịch sử ba đợt.

### 6. Pipeline có dùng nguồn ngoài SGK PDF không?

Có. Pipeline hiện tại dùng **SGKVN HTML snapshot/lesson JSON** làm textbook input cho Stage 1–4; không đọc `data/sgk/*.pdf` trong các script được lần theo. Hai canonical event có `externalContent.wikipedia`, `wikidata` và `otherSources` rỗng. Không có bằng chứng một nguồn học thuật khác được dùng để tạo hai claim này.

### 7. Có record khác mang page range 54–61 hoặc lỗi tương tự?

Có 22 Stage 4A records tham chiếu lesson `11:12370`, tất cả nhận cùng `54–61` vì page range được tính cho toàn lesson. Mẫu: `chien-thang-bach-dang-938`, `khang-chien-chong-quan-mong-co-1258`, `hoi-nghi-binh-than`, `hoi-nghi-dien-hong`, `khang-chien-chong-quan-nguyen-1285`, `tran-quoc-tuan-viet-hich-tuong-si`, `khang-chien-chong-quan-nguyen-1287-1288`.

Không có lesson-title group nào mang nhiều page range khác nhau trong Stage 4A (`count=0`). Điều này chỉ chứng minh pipeline nhất quán nội bộ, không chứng minh page range đúng với PDF.

## Controlled impact scan

Query được chạy bằng Node inline, chỉ đọc `crawData/stage4_assemble/output/final_events.jsonl`; không tạo script hay output data.

### Kết quả

| Heuristic | Số record | Mẫu đại diện |
|---|---:|---|
| Lesson `11:12370` và range `54–61` | 22 | Bạch Đằng 938; Mông Cổ 1258; Bình Than; Diên Hồng; Nguyên 1285; Nguyên 1287–1288 |
| `detailedNarrative` có unique-token coverage với excerpt `< 0.55` | 85 | `khang-chien-chong-quan-nguyen-1287-1288`, `cai-cach-ho-quy-ly-trieu-ho`, `cach-mang-thang-tam-nam-1945` |
| Phase/đợt + từ hai markers trở lên nhưng excerpt không có phase token | 1 | `cac-chien-dich-tien-cong-quan-doi-viet-nam-1950-1953` |
| Cùng lesson title nhưng nhiều page ranges | 0 | Không có mẫu |
| Unique union của ba nhóm nghi vấn đầu | 97 | Các nhóm có overlap; không cộng thẳng 22+85+1 |

### Phát hiện cấu trúc provenance

- Dataset có 407 events và 445 textbook ref objects.
- 445/445 `textbookRefs[*].excerpt` giống hệt `textbookContent.canonicalSummary`.
- 258 events có `detailedNarrative`; 196 ref associations có narrative khác excerpt.
- Vì excerpt là canonical summary được copy, heuristic “textbookRefs không hỗ trợ canonicalSummary” trả 0 và là false negative theo thiết kế hiện tại.

### Known false positives/limits

- Narrative dài hơn excerpt không tự động có nghĩa là sai; đây chỉ là danh sách review ưu tiên.
- Token coverage không hiểu đồng nghĩa, niên đại, phủ định hoặc quan hệ nhân quả.
- 22 records cùng lesson range có thể đúng đối với SGKVN snapshot nhưng lệch với PDF cục bộ; chưa được phép gọi toàn bộ là data lỗi.
- Phase heuristic bỏ sót DBP vì canonical excerpt tự sao chép mapping; nó không kiểm chứng nguồn độc lập.
- Không audit thủ công toàn bộ 407 records và không tuyên bố toàn corpus sai.

## Vị trí sửa source-of-truth được đề xuất

### Fix 1 — provenance/edition binding ở Stage 1

- Recommended source-of-truth fix location: `crawData/stage1_crawl/crawler.py` và schema lesson JSON.
- Bổ sung `sourceEdition`, `sourceKind`, URL, crawl timestamp, raw HTML SHA-256 và nếu dùng PDF thì PDF SHA-256/page-offset policy.
- Khi SGKVN HTML và PDF không cùng page mapping, fail validation hoặc ghi trạng thái unresolved thay vì coi page marker là canonical tuyệt đối.
- Affected downstream artifacts: lesson JSON, lesson index, toàn bộ `textbookRefs.pageRange` của events thuộc lesson.
- Required regeneration scope: chỉ các lesson bị xác minh mismatch và downstream Stage 4A/4B artifacts phụ thuộc; không regeneration trong tác vụ này.
- Regression tests: parse marker; edition mismatch detection; stable hash/provenance manifest; không chấp nhận page range khi edition chưa xác định.

### Fix 2 — event-specific citations thay cho whole-lesson range

- Recommended location: Stage 2 extraction schema và Stage 4A `make_textbook_refs()`.
- Stage 2 phải trả claim spans/block IDs/page numbers; Stage 4A tính range từ các cited blocks của event, không từ min/max toàn lesson.
- Affected artifacts: Stage 2 raw responses/index, Stage 3 event schema, Stage 4 textbook refs, reports/UI citation consumers.
- Required regeneration scope: affected lessons/events sau khi schema và validation được duyệt.
- Regression tests: mỗi claim span tồn tại nguyên văn hoặc có approved paraphrase; cited page nằm trong lesson; event không tự nhận whole-lesson range nếu chỉ trích một phần.

### Fix 3 — không gắn canonical summary vào `excerpt`

- Recommended location: `crawData/stage4_assemble/build_final_events.py:133`.
- `excerpt` phải lấy từ Stage 1 direct block span hoặc để rỗng/pending khi không có alignment; không tự sao chép nội dung model/curated.
- Affected artifacts: 445 textbook ref objects hiện tại và mọi consumer coi excerpt là provenance.
- Required regeneration scope: Stage 4A final events, event JSON và Stage 4B tree sau khi có citation spans hợp lệ.
- Regression tests: `excerpt !== canonicalSummary` không phải quy tắc tuyệt đối, nhưng excerpt phải có `sourceBlockId/page/hash`; test chống self-citation; test fail-closed khi thiếu source span.

### Fix 4 — lưu manifest của Stage 2 raw output

- Recommended location: `crawData/stage2_extract/` build policy.
- Không cần commit dữ liệu lớn/secret, nhưng cần manifest bất biến gồm model, prompt hash, source lesson hash, response hash và timestamp.
- Affected artifacts: khả năng audit Stage 3/4.
- Regression tests: mỗi Stage 3 record truy được ít nhất một Stage 2 response hash và source lesson hash.

## Quyết định sau điều tra

- Không mở lại source gate trong tác vụ này.
- Không thay status `NOT_SUPPORTED`.
- Claim 1287-E là `VERIFIED_DIRECT_TEXT` nhưng `Applicability: GENERAL_CONTEXT_ONLY`; không được dùng để suy ra 1287-A/B hoặc tạo quan hệ nhân quả riêng cho 1287–1288.
- Không có production code, production insight, CTA, decisive entry hoặc preferred target.
- Goal 4 chưa bắt đầu.

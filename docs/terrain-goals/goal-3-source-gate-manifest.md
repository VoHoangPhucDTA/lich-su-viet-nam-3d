# Goal 3 source-gate manifest

Không sao chép toàn bộ sách giáo khoa vào review bundle. Danh sách dưới đây ghi chính xác nguồn cục bộ và canonical data đã kiểm tra.

| Loại | Đường dẫn | Phạm vi kiểm tra | SHA-256 | Kết quả |
|---|---|---|---|---|
| SGK trực tiếp | `data/sgk/sgk11.pdf` | KNTT 11, trang in 41–61 (trang PDF 43–63) | `47A3375DBF7E75B41E27FA8B672553668D50BABF760DDFBFD15E5848F09CAE3D` | Không hỗ trợ các claim bắt buộc 1287-A/B/C; hỗ trợ timeline trang 46 và nhận định chung trang 49. |
| SGK trực tiếp | `data/sgk/sgk12.pdf` | KNTT 12, trang in 37–44 (trang PDF 39–46) | `4BF628ED5844AC3CA82DC4685FB808A2905869F162A688ED5D97482BF1F0051D` | Hỗ trợ DBP có ba đợt ở trang 38; không hỗ trợ ánh xạ mục tiêu theo từng đợt. |
| SGKVN HTML snapshot | `crawData/stage1_crawl/raw_html/grade_11/12370_BÀI_7__CHIẾN_TRANH_BẢO_VỆ_TỔ_QUỐC_TRONG_.html` | Marker 54–61; claim “thanh dã” và địa hình–kị binh | `AFE8D7A571BC6D55DAE1D7F53938C7DB6625C956E734B3A084DC1C0FE0B250DE` | Có direct source text ở marker 58–59 nhưng page mapping không khớp PDF cục bộ; edition alignment chưa xác minh. |
| SGKVN HTML snapshot | `crawData/stage1_crawl/raw_html/grade_12/12955_BÀI_7__CUỘC_KHÁNG_CHIẾN_CHỐNG_THỰC_DÂN_P.html` | Marker 37–44; DBP target-to-wave mapping | `6F66DCE202B44A873896D9F065E069F7F434F24796153133C70B66216B8AF00A` | Có mapping tại marker 42; bất nhất với kết quả đọc PDF trước đó nên chưa đủ để mở source gate. |
| Stage 1 lesson JSON | `crawData/stage1_crawl/lich_su_11_kntt.json` | Lesson `12370`, block text/page metadata | `A28764FB509ACDB87E1BB49DB51E40FFC2076FF54191570C989173B96DA7FFDB` | Nguồn upstream của page values và claim 1287 trong pipeline. |
| Stage 1 lesson JSON | `crawData/stage1_crawl/lich_su_12_kntt.json` | Lesson `12955`, block text/page metadata | `5E0CABACEDD87A1DB765FE1D6823F5BFBF9AA9CB85C1BCDF5A8679C93AD1132A` | Nguồn upstream của DBP mapping trong pipeline. |
| Canonical event | `crawData/stage4_assemble/output/events_json/khang-chien-chong-quan-nguyen-1287-1288.json` | Nội dung, map targets, textbook ref | `4FBE70296156024D8824B8CC5B29495F17ACA03171DF3ADD74AE7D496F2DB79E` | Có claim đã biên tập nhưng page range 54–61 không khớp vị trí bài trong PDF. |
| Canonical event | `crawData/stage4_assemble/output/events_json/chien-dich-dien-bien-phu-1954.json` | Nội dung, map targets, textbook ref | `8E4A4687A89DFF82F33BC6E0AA6AD5F4BF316EC6BA99C553CE1548AAF04DACE4` | Có ánh xạ mục tiêu chi tiết; chưa xác minh được từ PDF trang 37–44. |

## Phương pháp

- Hai PDF là bản scan, không có text layer sử dụng được. Các trang liên quan được render thành ảnh và kiểm tra trực quan.
- Provenance investigation lần ngược thêm SGKVN raw HTML, Stage 1 lesson JSON, Stage 2 prompt, Stage 3 dedup và Stage 4 assembly. HTML/lesson JSON được ghi đường dẫn và hash, không sao chép vào bundle.
- File ảnh render chỉ là artifact tạm để đọc PDF, không được đưa vào bundle và sẽ được xoá sau kiểm tra.
- Không gọi importer, không tái sinh dataset, không chỉnh canonical JSON, backend hoặc database.

## Dataset guard

- File: `frontend/public/data/exams/exam-dataset-build.json`
- SHA-256 quan sát trong tác vụ: `F3911DF7E10A042E0986C56E76C5E04549C71B13A71D09287C846BE83B596403`
- Trạng thái file đã dirty từ trước tác vụ; Goal 3 không đọc-ghi hoặc tái sinh file này.

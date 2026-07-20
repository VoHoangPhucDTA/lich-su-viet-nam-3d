# Phương pháp đánh giá

## 1. Functional evaluation

Dùng acceptance matrix cho sáu type và các nhóm: target normalization, provider lifecycle, camera overview/point/region, region interaction, restore, cleanup, error, deep-link ID/slug, parent-child, timeline/year/grade, popup/sidebar. Mỗi case ghi fixture, Given/When/Then, expected, actual, browser và screenshot/log tối thiểu.

## 2. Technical evaluation

| Chỉ số | Cách đo | Tự động/manual |
|---|---|---|
| Provider load time | `performance.mark` từ CTA đến ready/error | Tự động |
| GeoJSON ready | resource/performance mark | Tự động |
| Target response | mark click target → camera complete | Tự động |
| Resource count | Cesium collections/handler trước-sau session | Tự động/manual assertion |
| Memory tương đối | Chrome DevTools heap snapshot qua ≥10 session | DevTools |
| FPS/mượt | Performance panel/WebGL trong event nhiều vùng | DevTools/manual |
| Bundle/build impact | build artifact size trước-sau khi kiểm soát generated data | Tự động có kiểm soát |
| Error rate | injected provider/GeoJSON/API fixtures | Tự động |

Không so sánh với con số benchmark bên ngoài nếu khác thiết bị/mạng; báo median/P95, môi trường và sample size.

## 3. User evaluation khả thi

**Đối tượng:** 8–15 học sinh THPT hoặc người dùng đại diện trong điều kiện khóa luận; nếu không tuyển đủ, dùng 5–8 người cho usability formative và ghi rõ giới hạn. Không thu thập tên, điểm số hay dữ liệu nhạy cảm không cần thiết; dùng mã participant.

**Kịch bản:** hướng dẫn tối thiểu, 3–5 task từ `09_PEDAGOGICAL_UX_PLAN.md`, counterbalance thứ tự event nếu có thể. Người điều phối ghi thời gian, hoàn thành, lỗi thao tác, trợ giúp và nhận xét; không dẫn đáp án.

**Metrics:**

- task completion rate;
- time-on-task;
- number/type of errors;
- retry/Back-camera usage;
- Likert 1–5: dễ dùng, rõ CTA/chú thích, hỗ trợ hình dung không gian, tin tưởng cách biểu diễn;
- open feedback về confusion giữa địa hình hiện đại và lịch sử.

**Questionnaire mẫu (1–5, hoàn toàn không đồng ý → hoàn toàn đồng ý):**

1. Tôi dễ tìm được nút xem địa hình.
2. Tôi hiểu sự khác nhau giữa điểm và vùng.
3. Tôi biết target đang được chọn.
4. Tôi hiểu chú thích về ranh giới hành chính hiện đại.
5. Tôi có thể quay lại góc nhìn tổng thể.
6. Terrain giúp tôi hình dung không gian của sự kiện.
7. Chuyển động/camera không gây khó chịu.

## Nếu muốn đo learning gain

Chỉ thực hiện khi có phê duyệt đạo đức/phạm vi: pre-test và post-test nội dung không trùng nguyên văn, cùng learning objective, nhóm đủ lớn và ghi biến nền cần thiết. Phân tích effect size/CI phù hợp, không chỉ p-value. Nếu không đủ điều kiện, chỉ báo cáo usability và perceived usefulness; không nói “cải thiện kết quả học tập”.

## Phân tích và trình bày

Báo cáo completion/time/error theo task; median và IQR cho mẫu nhỏ; Likert trung vị/phân bố; trích dẫn feedback đã ẩn danh. Tách kết quả functional, technical và user. Bảng coverage/audit dùng snapshot riêng, không trộn với user sample. Hình đề xuất: task flow, screenshot point/multi-region/error, boxplot time, stacked completion/error, bảng quote ẩn danh.

## Giới hạn và privacy

Mẫu thuận tiện nhỏ không đại diện toàn bộ học sinh; thiết bị/mạng và novelty terrain gây bias; không có control group thì không suy ra learning gain; GADM/terrain hiện đại giới hạn tính lịch sử. Xin consent phù hợp, cho phép rút lui, lưu mã thay vì danh tính, xóa raw notes sau khi tổng hợp và không ghi màn hình khuôn mặt nếu không cần.

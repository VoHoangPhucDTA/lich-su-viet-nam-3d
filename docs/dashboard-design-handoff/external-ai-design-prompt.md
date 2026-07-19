# Prompt cho v0 / Lovable / Google AI Studio

```text
Bạn là AI thiết kế sản phẩm. Hãy dựng prototype PERSONAL LEARNING DASHBOARD — DESIGN HANDOFF V1 cho module luyện thi Lịch sử Việt Nam.

Trước khi thiết kế, đọc đầy đủ: README.md, product-spec.md, data-contract.md, dashboard-view-model.schema.json, reference-analysis.md, design-brief.md, interaction-spec.md, responsive-spec.md, accessibility-spec.md. Dùng các file mock-data/*.json làm source of truth duy nhất. Xem ba ảnh references/tak12-dashboard-*.png để lấy cảm hứng bố cục/information architecture, không sao chép logo, thương hiệu, màu đặc trưng, nội dung hay nhân vật.

Tạo ba concept riêng:
A — Progress-first: recommendation và score trend dẫn dắt.
B — Strength/weakness-first: insight đủ mẫu và hành động ôn tập dẫn dắt.
C — Balanced dashboard: cân bằng recommendation, overview, analytics và history.

Trình bày ba concept trước; sau đó cho phép refine một concept. Prototype dùng đúng 10 mock JSON, tiếng Việt, hỗ trợ light/dark và đủ states: `loading.json`, `error.json`, `empty.json`, `one-attempt.json`, `default.json`, `many-attempts.json`, `anonymous.json`, `backend-fallback.json`, `partial-details.json`, `long-content.json`. Responsive bắt buộc ở 1440, 768, 390 và 320px; kiểm tra thêm các yêu cầu trong responsive-spec.

Giữ đúng semantics: score 0–10; percentage 0–100; duration seconds; timezone Asia/Ho_Chi_Minh; `fromDate`/`toDateExclusive` là ngày lịch `YYYY-MM-DD` với cận trên exclusive; `submittedAt` là ISO UTC; active days không gọi là streak; strength ≥80%, weakness <60%, developing 60–79% chỉ khi ≥8 ý trả lời và ≥2 bài thi. Mọi insight kèm sample size, attempt count, confidence. T/F accuracy dùng từng mệnh đề làm đơn vị, không chỉ whole-question correctness. `scoreTrend.points` không nhất thiết là toàn bộ lịch sử: đọc `sourceAttemptCount`, `granularity`, `isComplete` và ghi rõ khi chuỗi chưa đầy đủ. Mọi chart có textual summary.

Không tạo backend, API, Supabase, database, auth mới hoặc thay auth. Không tự tạo metric/dữ liệu ngoài contract, không bịa KPI cho loading/error và không tự thêm goal/progress. Không tạo leaderboard/public rank/social comparison, verified achievement, certificate, difficulty chart, period chart, fake streak, admin settings, excessive pie/donut, radar hay 3D chart. Không giả vờ luyện tập/ôn câu sai đã được ghi nhận. Không che notice về source/coverage/backend fallback.

Ưu tiên component code React/Vite hoặc framework-neutral. Nếu công cụ tạo Next.js thì ghi rõ source chỉ là design reference. Route /exams/thong-ke chỉ là route dự kiến; không triển khai integration production.

Đầu ra bắt buộc:
1) screenshots cho ba concept và các viewport chính;
2) component hierarchy;
3) responsive notes;
4) interaction notes;
5) prototype source;
6) bảng đối chiếu mock state nào đã được render;
7) các giả định hoặc decision pending không được tự chốt.

Prototype là design reference, không phải production source. Tối ưu information hierarchy, độ đúng dữ liệu, mobile, accessibility và khả năng tích hợp; không chọn phương án chỉ vì đẹp.
```

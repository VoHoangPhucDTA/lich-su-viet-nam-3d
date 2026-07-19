# Personal Learning Dashboard — Design Handoff V1

## Mục đích

Đây là gói **product spec + data contract + reference analysis + design brief + mock data** cho prototype dashboard học tập cá nhân của module luyện thi. Gói chưa phải implementation: route dự kiến `/exams/thong-ke` chưa được tạo, không có React/CSS/API/backend/database mới.

Trạng thái package: **design handoff V1**. Các quyết định được ghi là “proposed” vẫn cần product/engineering duyệt trước implementation; prototype do AI tạo ra phải được bàn giao lại như tài liệu tham khảo thiết kế.

## Bản đồ tài liệu

| File | Người dùng chính | Mục đích |
| --- | --- | --- |
| `product-spec.md` | Product, engineering | Mục tiêu, phạm vi, metric và quyết định còn chờ |
| `data-contract.md` | Product, design, engineering | Presentation contract và quy tắc learning unit |
| `dashboard-view-model.schema.json` | AI thiết kế, engineering | JSON Schema Draft 2020-12 để kiểm tra mock |
| `reference-analysis.md` | Product, UI/UX | Phân tích ba ảnh TAK12 và giới hạn áp dụng |
| `design-brief.md` | AI thiết kế, UI/UX | Brief chính để dựng concept |
| `interaction-spec.md` | UI/UX, frontend | Hành vi filter, chart, insight, history, notice |
| `responsive-spec.md` | UI/UX, frontend | Yêu cầu theo sáu viewport |
| `accessibility-spec.md` | UI/UX, frontend | Yêu cầu tiếp cận và QA |
| `external-ai-design-prompt.md` | Người vận hành v0/Lovable/AI Studio | Prompt copy-paste hoàn chỉnh |

Ảnh tham khảo nằm trong `references/`. Chỉ dùng để hiểu bố cục và information architecture; không sao chép logo, thương hiệu, nội dung hay màu đặc trưng.

## Mock data

| File | Trạng thái kiểm thử |
| --- | --- |
| `default.json` | Ready, 12 attempts, dữ liệu điển hình |
| `empty.json` | Chưa có attempt |
| `loading.json` | Đang tải, skeleton đúng layout, chưa có KPI hoặc bài thi giả |
| `error.json` | Máy chủ lỗi, không có dữ liệu local, có retry interaction và CTA browse |
| `one-attempt.json` | Một attempt, không tuyên bố trend/mạnh-yếu |
| `anonymous.json` | Dữ liệu local trên thiết bị, CTA đăng nhập |
| `backend-fallback.json` | Backend lỗi nhưng local vẫn dùng được |
| `partial-details.json` | Summary đủ, detail coverage thiếu |
| `long-content.json` | Tiếng Việt dài, kiểm tra wrap/truncation |
| `many-attempts.json` | 108 bài đã biết, 100 summary do fetch cap, trend dày, history 10 item |

Tất cả 10 mock là dữ liệu hư cấu về lịch sử Việt Nam, không chứa thông tin người dùng thật. Loading/error chỉ mô tả trạng thái và không bịa dữ liệu học tập.

## Quy trình sử dụng

```text
Đọc product-spec
→ đọc data-contract
→ đọc reference-analysis
→ đọc design-brief
→ dùng mock data
→ dựng prototype
→ xuất screenshot và source
→ bàn giao lại cho Codex
```

Với v0, Lovable hoặc Google AI Studio: đính kèm toàn bộ tài liệu, schema, mock cần test và ba ảnh reference; sau đó dùng `external-ai-design-prompt.md`. AI phải dùng mock JSON làm source of truth, không tự tạo backend, auth, Supabase, database, API hay metric ngoài contract. Prototype là tài liệu tham khảo thiết kế, không phải production source.

## Checklist chấm prototype

Chấm từng tiêu chí 1–5: **1** không đáp ứng; **2** thiếu đáng kể; **3** đạt mức dùng để thảo luận; **4** tốt, ít chỉnh sửa; **5** xuất sắc và có bằng chứng ở mọi state/viewport. Điểm quy đổi = `điểm / 5 × trọng số`.

| Tiêu chí | Trọng số |
| --- | ---: |
| Information hierarchy | 20 |
| Phù hợp dữ liệu thật | 20 |
| Mobile/responsive | 15 |
| Đồng bộ module exam | 15 |
| Strength/weakness clarity | 10 |
| History usability | 10 |
| Accessibility | 5 |
| Integration feasibility | 5 |

Không chọn concept chỉ vì đẹp. Concept phải đúng contract, minh bạch coverage, dùng được trên mobile và khả thi để tích hợp vào React/Vite hiện tại.

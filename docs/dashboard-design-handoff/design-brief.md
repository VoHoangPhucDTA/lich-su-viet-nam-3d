# Design Brief — Personal Learning Dashboard V1

## 1. Design direction

Thiết kế hiện đại, giáo dục, đáng tin và dành cho học sinh; không giống admin/finance dashboard. Dùng tiếng Việt, hỗ trợ light/dark, hierarchy rõ, chart vừa đủ và gamification tiết chế. Đồng bộ module exam hiện tại: card, pill, focus ring, border radius vừa phải, semantic feedback và CTA rõ.

## 2. Layout direction

Desktop lấy cảm hứng bố cục hai cột nhưng không sao chép tỷ lệ:

```text
Main column:
- recommendations
- summary
- score trend
- strength/weakness
- performance
- recent history

Side column:
- active days
- total duration
- data scope / coverage
- data coverage
- quick actions
```

Gợi ý grid 12 cột: main 8–9, side 3–4; gap 20–24px. Tablet/mobile chuyển một cột, side widgets nhập vào flow chính theo ngữ cảnh.

## 3. Required sections

1. Page header + mô tả learning-only.
2. Time-range filter 7/30/90/all.
3. Scope/source notice.
4. Recommendation hôm nay.
5. KPI summary.
6. Score trend + textual summary.
7. Strength/weakness panels có sample/confidence.
8. Question type performance.
9. Cognitive performance.
10. Recent history + “Xem tất cả lịch sử”.
11. Coverage notice.
12. Next actions tới browse/create/topic.

## 4. Required states

Loading; error; empty; one attempt; default/many attempts; anonymous; backend fallback; partial details; long Vietnamese content; light; dark. State không được thay đổi chiều cao trang đột ngột; loading dùng skeleton bám đúng layout thật và không hiển thị KPI giả. Error không có dữ liệu local phải giữ khung trang, nêu lỗi, có nút “Thử lại” và CTA về `/exams/browse`. Với một attempt, không vẽ đường trend mang hàm ý xu hướng và không gọi topic mạnh/yếu.

## 5. Visual guidance

- Score thang 10 luôn có đơn vị hoặc context; percentages luôn kèm numerator/denominator khi là insight.
- Strength và weakness dùng label + icon + status text, không chỉ xanh/đỏ.
- Ưu tiên line chart cho score trend, horizontal bars cho topic/cognitive/type. Chỉ mô tả toàn bộ lịch sử khi `scoreTrend.isComplete = true`; nếu false phải ghi rõ chuỗi đã được lấy mẫu/tổng hợp từ `sourceAttemptCount` bài.
- Không quá 2 chart đậm thị giác trong cùng viewport desktop.
- Topic dài wrap 2–3 dòng; chart label dài có danh sách chữ tương đương.
- Active days là metric trung tính, không dùng flame/streak language.

## 6. Forbidden design

Không leaderboard/public rank, verified achievement, certificate, difficulty/period chart, fake streak, social competition, backend settings, account management, Supabase/database screen, admin table, excessive pie/donut, radar, 3D chart hoặc chart chỉ đọc bằng màu. Không bịa metric, API, auth behavior hay dữ liệu ngoài mock contract.

## 7. Prototype deliverables

- Ba concept: Progress-first, Strength/weakness-first, Balanced.
- Screenshots ở 1440, 768, 390, 320; ít nhất light/dark ở concept được refine.
- Component hierarchy, responsive notes, interaction notes và prototype source.
- Source ưu tiên React/Vite hoặc framework-neutral. Nếu dùng Next.js, chỉ xem là reference.

## 8. Quality gate

Dùng rubric trong `README.md`. Loại concept nếu sai data semantics, che coverage, không dùng được ở 320px hoặc yêu cầu backend/auth mới. Thẩm mỹ không bù được claim sai.

# Responsive Spec

## Breakpoint matrix

| Viewport | Cột và thứ tự | KPI | Chart/filter/history |
| --- | --- | --- | --- |
| 1440×900 | 12-col, main 8–9 + side 3–4; recommendation → KPI → trend → insights → performance → history | 4 card hàng đầu, side chứa duration/active days và data scope/coverage hoặc quick learning actions | Trend 280–320px; filter inline header; history rows |
| 1366×768 | Hai cột hẹp hơn; giảm padding, không giảm text dưới mức đọc | 4 card hoặc 2×2 nếu thiếu chỗ | Chart 250–280px; side không sticky quá viewport |
| 768×1024 | Một cột; side widgets sau KPI/trước trend | 2×2/2×3 | Chart 260px; filter wrap; history compact list |
| 390×844 | Một cột: header, filter, notice, recommendation, KPI, active/duration, trend, insight, performance, coverage, history | 2 cột, card min-width 0 | Chart 220–240px; history cards; filter 2×2 hoặc scroll có affordance |
| 360×800 | Như 390, gap/padding 12–16px | 2 cột; metric dài wrap | Chart 210–230px; không sticky section |
| 320×568 | Một cột tuyệt đối; actions full width; coverage trước history nếu cần | 2 cột chỉ khi mỗi card ≥136px, nếu không 1 cột | Chart 200–220px; filter 2×2; title wrap; history card |

## Quy tắc chung

- Không horizontal overflow ở sáu viewport; `min-width: 0` cho grid/flex child.
- Desktop side column có thể sticky theo section nhưng không cao hơn viewport; tablet/mobile nhập vào main flow.
- Không ép chart rộng bằng horizontal scroll. Dùng fewer tick labels, textual list và tooltip focusable.
- Recent attempts chuyển từ row/table sang cards dưới 768px.
- Long Vietnamese title dùng wrap/overflow-wrap; không ellipsis nếu title không có bản đầy đủ gần đó.
- Touch target tối thiểu 44×44px; gap đủ tránh chạm nhầm.
- Không sticky nhiều lớp; header/filter/action không được che nội dung cuối trang hoặc safe area.
- Zoom 200% vẫn giữ reading order và không đòi cuộn ngang cho nội dung chính.

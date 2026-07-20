# Accessibility và responsive

## Static/source verification

| Tiêu chí | Trạng thái | Mức chứng cứ |
|---|---|---|
| CTA/target/overview/exit là native button | PASS | OBSERVED |
| Loading dùng `aria-live="polite"` | PASS | OBSERVED |
| Error dùng `role="alert"` | PASS | OBSERVED |
| Target list có list/listitem semantics | PASS | OBSERVED |
| Target có `aria-pressed` | PASS | OBSERVED |
| Overview có `aria-pressed` | PASS | OBSERVED |
| Selection có icon/text ngoài màu sắc | PASS | OBSERVED |
| Popup có `role="dialog"` và accessible name | PASS | OBSERVED |
| Escape đi qua callback close | PASS | OBSERVED |
| Mở popup focus nút đóng; unmount restore focus | PASS | OBSERVED |
| `prefers-reduced-motion` được dùng cho flight | PASS | OBSERVED |
| Nhãn “Quay lại góc nhìn” và disclaimer | PASS | OBSERVED |

## Browser shell

| Viewport | Horizontal overflow | Kết quả |
|---|---:|---|
| Desktop 1280×720 | Không | PASS — MEASURED |
| 375×800 | Không | PASS — MEASURED |
| 320×700 | Không | PASS — MEASURED |

Backend fetch bị chặn nên popup terrain không xuất hiện trong browser session. Tab/Enter/Space/Escape/focus restore trên popup thật và mobile target picker là `UNVERIFIED`, dù cấu trúc source hỗ trợ các hành vi này.

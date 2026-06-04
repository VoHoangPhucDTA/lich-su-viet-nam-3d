# DESIGN SYSTEM – Lịch sử Việt Nam 3D (MVP_KLTN)

> **Mục đích**: là **single source of truth** về giao diện cho dự án. Mọi trang/ component mới — và mọi prompt code AI — đều phải bám file này để giữ ngôn ngữ thiết kế đồng nhất.
>
> **Cảm hứng chủ đạo**: bảo tàng / trang sử / archive – ấm áp, cổ điển, dễ đọc, có chiều sâu chứ không phẳng theo phong cách SaaS.
>
> **Áp dụng cho**: React 19 + TypeScript + Tailwind CSS 4 + biến CSS custom (`var(--…)`).

---

## 1. Triết lý thiết kế

| Giá trị cốt lõi | Diễn giải | Tác động vào UI |
|---|---|---|
| **Trang trọng – sử thi** | Đối tượng là học sinh + giáo viên; chủ đề là Lịch sử dân tộc | Typography đậm, màu nóng (vàng đồng) làm điểm nhấn, không dùng emoji rườm rà |
| **Đọc dài – đọc kỹ** | Nội dung SGK là chính | Cỡ chữ ≥ 15 px, line-height 1.75–2, max-width đoạn văn ≤ 720 px |
| **Có chiều sâu** | 3D map là điểm nhấn của sản phẩm | Dùng glass-morphism (`.glass-map`), shadow lớp lớp, gradient nhẹ |
| **Tương phản 2 chế độ** | Dark = đêm trầm cổ; Light = giấy cổ vàng kem | **Tuyệt đối không** hardcode màu hex cho text/bg – dùng biến CSS |
| **Không nhiễu** | Tránh nhiều nút / icon trên 1 màn | 1 hành động chính + 1–2 phụ |

---

## 2. Tokens màu (CSS Variables)

Toàn bộ token đặt trong `src/index.css`. **Quy tắc bất biến**: **không bao giờ** dùng hex trực tiếp trong component – luôn qua `var(--…)`.

### 2.1 Màu nền & văn bản (theme-aware)

| Token | Dark (mặc định) | Light | Khi nào dùng |
|---|---|---|---|
| `--bg-app` | `#0b1220` xanh navy đậm | `#f4ebdd` kem ấm | Nền trang chính |
| `--bg-surface` | `#14243d` | `#efe2cf` | Nền vùng nổi (input, button phụ) |
| `--bg-card` | `#1a2f4d` | `#fff9ef` | Nền card chính |
| `--text-primary` | `#e7ecf3` | `#1f2937` | Tiêu đề, văn bản chính |
| `--text-secondary` | `#c4ceda` | `#334960` | Đoạn văn |
| `--text-muted` | `#90a1b6` | `#5f7288` | Caption, label phụ, helper |
| `--border` | `rgba(194, 155, 75, .22)` | `#dbc8a9` | Viền card / divider (đậm tinh tế kiểu giấy cổ) |

### 2.2 Màu thương hiệu

| Token | Dark | Light | Vai trò |
|---|---|---|---|
| `--accent` | `#4f6f95` xanh thép | `#2a4b72` xanh navy đậm | **Màu chính** – button, link, focus, highlight |
| `--accent-soft` | `rgba(79,111,149,.24)` | `rgba(42,75,114,.10)` | Nền nhẹ của vùng accent (hover, badge) |
| `--admin-accent` | `#c29b4b` vàng đồng | `#9c7333` đồng đậm | Màu phụ riêng cho Admin – gợi cảm giác "officer/serif" |
| `--admin-accent-soft` | tương ứng | tương ứng | Nền nhẹ admin |

### 2.3 Màu trạng thái

| Token | Dark | Light | Dùng khi |
|---|---|---|---|
| `--success` | `#2f7a57` | `#2f7a57` | Đúng / hoàn thành / chấp thuận |
| `--success-soft` | `rgba(47,122,87,.14)` | `rgba(47,122,87,.12)` | Nền badge "đúng" |
| `--warning` | `#c29b4b` | `#9c7333` | Cảnh báo / chờ duyệt / xấp xỉ |
| `--warning-soft` | `rgba(194,155,75,.16)` | `rgba(156,115,51,.12)` | Nền badge cảnh báo |
| `--danger` | `#9f1d2d` | `#8f1c2a` | Sai / xóa / từ chối |
| `--danger-soft` | `rgba(159,29,45,.14)` | `rgba(143,28,42,.10)` | Nền badge sai |

### 2.4 Màu loại sự kiện (theo `eventType`)

| `eventType` | Token Tailwind 4 | Hex | Ý nghĩa |
|---|---|---|---|
| `military` | `--color-military` | `#9f1d2d` đỏ huyết dụ | Trận đánh, chiến dịch |
| `political` | `--color-political` | `#4f6f95` xanh thép | Chính trị, hội nghị |
| `diplomatic` | (đề xuất) | `#7a4f95` tím nhạt | Ngoại giao, hiệp định |
| `economic` | `--color-economic` | `#c29b4b` vàng đồng | Kinh tế, cải cách |
| `cultural` | `--color-cultural` | `#2f7a57` xanh rêu | Văn hoá, tư tưởng |

> Dùng helper trong `src/types/event.ts`: `EVENT_TYPE_COLORS[type]`. **Không tự ghi hex** vào component.

### 2.5 Tokens input (auth form)

| Token | Vai trò |
|---|---|
| `--input-bg` / `--input-border` / `--input-text` / `--input-placeholder` / `--input-icon` / `--input-focus` | Toàn bộ field auth (Login/Register/Forgot/Reset) bám tokens này. Đừng tạo input riêng – dùng class `.themed-input` |

### 2.6 Shadow

| Token | Giá trị | Khi nào dùng |
|---|---|---|
| `--shadow` (var) | Dark: 2 lớp tối sâu; Light: 2 lớp ấm dịu | Card chính, popup |
| `0 4px 6px -1px rgba(0,0,0,0.3)` | Tự định nghĩa | Map label, badge nổi |
| `0 20px 40px -18px rgba(...)` | Trong `.glass-map` light | Sidebar/popup map |

> Class tiện ích: `.shadow-theme` đã có sẵn. Tránh shadow Tailwind mặc định (`shadow-md`, `shadow-lg`) vì không theme-aware.

---

## 3. Typography

| Vai trò | Cỡ | Trọng lượng | Ghi chú |
|---|---|---|---|
| Display (Hero) | `clamp(2.25rem, 4vw, 3rem)` (36–48 px) | 800 | Tracking `-0.02em`, line-height 1.1 |
| H1 trang | 30–36 px | 700–800 | Tracking `-0.01em` |
| H2 section | 24 px | 700 | Border-bottom mỏng (1 px `--border`) hoặc số thứ tự |
| H3 sub | 18–20 px | 600 | |
| Body L | 16 px | 400 | Đoạn văn nội dung |
| Body M (mặc định) | 15 px | 400 | Body chính, line-height 1.75–2 |
| Body S | 14 px | 400 | Card, list compact |
| Caption | 12–13 px | 500 | Footnote, meta |
| Label/Eyebrow | 11 px | 700 | UPPERCASE, tracking `0.12em`, màu `--text-muted` |

**Font chính**: `Inter` 300/400/500/600/700/800 (đã import từ Google Fonts trong `index.css`).
**Font phụ (đề xuất)**: dùng serif cổ điển cho `<h1>` của EventDetailPage để tăng tính sử thi – ví dụ `'Source Serif 4', 'Lora'` (bổ sung sau).

```ts
font-family: var(--font-sans);
```

---

## 4. Spacing scale

Bám sát Tailwind mặc định, ưu tiên các bước sau (chia hết cho 4):

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96`

| Vị trí | Khoảng cách |
|---|---|
| Card padding | 20–24 px (`p-5` → `p-6`) |
| Section gap | 32–40 px (`gap-8` → `gap-10`) |
| Element trong row | 8–12 px (`gap-2` → `gap-3`) |
| Page gutter | 24 px mobile, 48 px desktop |
| Page max-width | 1280 px (`max-w-7xl`) cho admin/profile, 960 px (`max-w-5xl`) cho EventDetail |

---

## 5. Border radius

| Cấp | Giá trị | Dùng cho |
|---|---|---|
| Small | 6–8 px | Badge, label, map-label |
| Medium | 10–12 px | Button, input |
| Large | 16 px | Card phụ |
| XL | 20 px (`rounded-2xl`) | Card chính, popup, modal, hero |
| Pill | `rounded-full` / `9999px` | Filter chip, badge, avatar |

---

## 6. Glass-morphism

Class có sẵn: `.glass`, `.glass-map`.

```css
backdrop-filter: blur(12px);
background: rgba(11, 18, 32, 0.84); /* dark */
background: rgba(255, 249, 239, 0.86); /* light */
border: 1px solid var(--border);
```

**Khi nào dùng**: chỉ cho overlay nổi trên Cesium map, popup, sticky header trang chi tiết. **Không** dùng tràn lan để tránh layer "mờ trên mờ".

---

## 7. Animation tokens

| Class | Thời gian | Easing | Mục đích |
|---|---|---|---|
| `.animate-slide-in-right` | 0.3 s | `ease-out` | Sidebar phải, popup map |
| `.animate-slide-in-left` | 0.3 s | `ease-out` | Sidebar trái |
| `.animate-fade-in` | 0.3 s | `ease-out` | Section, card mới load |
| `.animate-pulse-glow` | 2 s | `infinite` | Marker đang chọn |

**Hover transition chuẩn**: `transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`.

**Quy tắc**: không animation > 0.4 s cho phần tử lớn. Tránh bounce/elastic gây cảm giác trẻ con.

---

## 8. Component patterns (chuẩn dùng lại)

### 8.1 Button

```tsx
// Primary
<button
  style={{ background: 'var(--accent)', color: '#fff' }}
  className="px-6 py-2.5 rounded-xl font-semibold shadow-theme transition hover:brightness-110 hover:-translate-y-px"
>
  Xem trên bản đồ 3D
</button>

// Secondary (outline)
<button
  className="px-5 py-2.5 rounded-xl font-medium border bg-surface text-secondary hover:text-[var(--accent)] transition"
  style={{ borderColor: 'var(--border)' }}
>
  Quay lại
</button>

// Ghost
<button className="px-3 py-2 text-sm text-secondary hover:text-[var(--accent)] transition">
  Xem thêm
</button>
```

| Variant | Background | Border | Text |
|---|---|---|---|
| Primary | `--accent` | none | `#fff` |
| Secondary | `--bg-surface` | `--border` | `--text-secondary` |
| Ghost | transparent | none | `--text-secondary` |
| Danger | `--danger` | none | `#fff` |

### 8.2 Card

```tsx
<div
  className="rounded-2xl p-6 shadow-theme"
  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
>
  …
</div>
```

**Biến thể**:
- **Card flat**: bỏ `shadow-theme`, dùng cho list compact.
- **Card highlight**: thêm `border-left: 3px solid var(--accent)` cho dấu nhấn.
- **Card warm**: nền `var(--accent-soft)`, dùng cho callout/ý nghĩa.

### 8.3 Badge / Chip

Đã có sẵn class `.badge`, `.badge-{eventType}` trong `index.css` – luôn ưu tiên dùng. Khi cần custom:

```tsx
<span
  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border"
  style={{
    background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
    color: 'var(--accent)',
    borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)',
  }}
>
  Lịch sử Việt Nam
</span>
```

### 8.4 Section header

Mỗi section trong trang dài (EventDetail, Profile, Admin) phải có cùng hình thức:

**Pattern A – museum exhibit (đề nghị mới cho EventDetail)**:

```tsx
<header className="flex items-baseline gap-4 mb-5">
  <span
    className="font-mono text-sm tracking-widest"
    style={{ color: 'var(--admin-accent)' }}
  >
    01
  </span>
  <h2 className="text-2xl font-bold text-primary">
    Tổng quan
  </h2>
  <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
</header>
```

**Pattern B – đơn giản (đang dùng nhiều nơi)**:

```tsx
<h2 className="text-2xl font-bold text-primary mb-4 border-b pb-2"
    style={{ borderColor: 'var(--border)' }}>
  Tổng quan
</h2>
```

→ Pattern A ưu tiên cho **trang chi tiết & landing**; Pattern B cho admin/profile.

### 8.5 Input

```tsx
<input
  className="themed-input w-full rounded-xl px-4 py-3 text-sm outline-none transition"
  style={{
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    color: 'var(--input-text)',
  }}
  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
  onBlur={e => e.currentTarget.style.borderColor = 'var(--input-border)'}
/>
```

### 8.6 Pull-quote / callout

Dành cho `summary.homepageSummary` hoặc câu trích dẫn:

```tsx
<blockquote
  className="relative pl-6 py-2 italic text-lg leading-relaxed"
  style={{
    color: 'var(--text-primary)',
    borderLeft: '3px solid var(--admin-accent)',
  }}
>
  "Chấm dứt hơn 1.000 năm Bắc thuộc, mở ra kỷ nguyên độc lập tự chủ."
</blockquote>
```

### 8.7 KPI Stat / Number block

```tsx
<div className="rounded-2xl p-5"
     style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
  <div className="text-xs uppercase tracking-widest font-bold mb-2"
       style={{ color: 'var(--text-muted)' }}>Tổng số sự kiện</div>
  <div className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>
    1.234
  </div>
  <div className="text-xs mt-1" style={{ color: 'var(--success)' }}>
    +12% so với tuần trước
  </div>
</div>
```

---

## 9. Iconography

- **Bộ icon chính (đề xuất)**: `lucide-react` (chưa cài) – **stroke 1.5 px**, kích thước 16/18/20/24.
- **Hiện tại**: emoji rải rác. Lộ trình: thay dần bằng Lucide để giữ tone trang trọng.
- **Quy tắc khi vẫn dùng emoji**:
  - Chỉ 1 emoji/section, không spam.
  - Tránh emoji có màu nóng (🔥) trên nền sử thi.
  - Ưu tiên emoji trung tính: 📍 📅 🗺️ 📚 🌍 ✓.

---

## 10. Layout patterns

### 10.1 Trang nội dung dài (EventDetail, Article)

```
┌──────────────────────────────────────────┐
│  Sticky breadcrumb (.glass-map)          │ ← top: 0
├──────────────────────────────────────────┤
│  HERO (tràn cạnh, 280–360 px)            │
├──────────────┬───────────────────────────┤
│              │  Section 01 — Tổng quan   │
│   TOC        │                           │
│ scroll-spy   │  Section 02 — Nội dung    │
│ sticky       │                           │
│ (lg trở lên) │  Section 03 — Ý nghĩa     │
│              │                           │
└──────────────┴───────────────────────────┘
```

- Container: `max-w-5xl mx-auto px-6` (≤ 960 px) cho content; TOC nằm ngoài (right rail).
- Spacing dọc giữa các section: 48 px.
- Anchor scroll: `scroll-mt-24` để khỏi bị navbar che.

### 10.2 Trang dashboard / app (Admin, Profile)

- Sidebar trái cố định (240 px), content `flex-1`.
- KPI grid: 4 cột desktop / 2 cột tablet / 1 cột mobile.
- Container `max-w-7xl`.

### 10.3 Trang map (3D)

- Full-screen, không scroll trang.
- Sidebar trái 320 px (sự kiện list), Right popup 400 px khi chọn sự kiện.
- Timeline 84 px ở đáy.
- **Mọi overlay** dùng `.glass-map`.

---

## 11. Accessibility

- Tỉ lệ tương phản WCAG AA: text trên `--bg-app` đã đạt; đừng đặt `--text-muted` trên `--bg-card` cho text quan trọng.
- Focus ring: dùng `outline: 2px solid var(--accent); outline-offset: 2px;` thay vì bỏ outline.
- Mọi `<button>` không text phải có `aria-label`.
- `<img>` luôn có `alt` (lấy từ `media.items[].alt`).

---

## 12. Do's & Don'ts

✅ **Nên**
- Luôn dùng `var(--…)`.
- Chia layout bằng grid/flex, không tab/space cứng.
- Ưu tiên class Tailwind utility cho spacing/flex; biến CSS cho màu/border.
- Tách logic ra hook khi component > 250 dòng.

❌ **Không nên**
- Hardcode `#fff`, `#000`, `slate-900`, `bg-slate-950` – break theme.
- Dùng nhiều shadow Tailwind mặc định – không theme-aware.
- Trộn `bg-slate-*` với `var(--bg-card)` trong cùng 1 component (đã thấy ở `ProfilePlaceholderPage.tsx`).
- Nest > 4 cấp `<div>` chỉ vì style.
- Inline style dài hơn 4 dòng – tách thành biến constant trong file.
- Dùng `style.background = '#xxx'` trong `onMouseEnter` – chuyển sang `data-` attribute + CSS hover.

---

## 13. Naming convention

- File: `PascalCase.tsx` cho component, `camelCase.ts` cho service/util.
- Biến CSS: `--kebab-case`.
- Class: ưu tiên Tailwind; class custom dùng `kebab-case` (`glass-map`, `themed-input`).
- ID anchor (scroll-spy): kebab-case không dấu (`tong-quan`, `noi-dung-sgk`, `dia-diem`).

---

## 14. Cheat-sheet copy nhanh cho prompt AI

> Khi yêu cầu AI code 1 component mới, paste đoạn dưới đây vào prompt:

```
Bám design system tại `context/design_system.md`:
- Màu: dùng var(--bg-app), var(--bg-card), var(--text-primary), var(--text-secondary),
  var(--text-muted), var(--border), var(--accent), var(--admin-accent),
  var(--success), var(--warning), var(--danger).
- Font: Inter (đã import). Tiêu đề bold 700–800, body 15px line-height 1.75–2.
- Card: rounded-2xl, p-6, shadow-theme, border 1px var(--border), bg var(--bg-card).
- Button primary: bg var(--accent), text #fff, rounded-xl, hover brightness-110.
- Section header: số "01"/"02" mono màu var(--admin-accent), title 24px bold,
  divider line.
- Trạng thái: success/warning/danger dùng var(--…) + var(--…-soft).
- Tránh hardcode hex, tránh bg-slate-*, tránh shadow-md/lg mặc định.
- Tiếng Việt cho mọi text UI.
```

---

## 15. Roadmap nâng cấp design system

1. Thêm font serif cổ điển cho hero EventDetail (Source Serif 4 / Lora).
2. Cài `lucide-react`, thay dần emoji.
3. Thêm token `--color-diplomatic` (tím nhạt) cho `eventType=diplomatic`.
4. Tạo file `tokens.ts` xuất TS object cho biến CSS để dùng trong logic JS (vd Cesium marker).
5. Storybook hoá các component pattern (Button, Card, Badge, SectionHeader, KPI).
6. Document responsive breakpoint chuẩn (sm 640 / md 768 / lg 1024 / xl 1280) – hiện đang dùng mặc định Tailwind.

# TIẾN ĐỘ FRONTEND – MVP_KLTN (Lịch sử Việt Nam 3D)

> **Cập nhật**: 26/04/2026 · **Phạm vi rà soát**: thư mục `MVP_KLTN/` (React 19 + TS + Tailwind 4 + CesiumJS 1.139 + Resium 1.19 + react-router 7).
> **Đối chiếu**: Mục 4.1 (Yêu cầu chức năng/phi chức năng), 4.1.3 (Use Case), 5.x (Module triển khai) trong KLTN_lichsuvn_lan2.

> 📌 **Tài liệu liên quan trong `context/`**
> - [`json_structure.md`](./json_structure.md) – đặc tả JSON sự kiện v2 (15 khối) – nguồn chuẩn cho dữ liệu.
> - [`design_system.md`](./design_system.md) – hệ thiết kế (màu, typo, component pattern) – để giữ giao diện đồng nhất khi code AI.
> - [`project_context.md`](./project_context.md) – bối cảnh & kiến trúc tổng dự án.

---

## 1. Kiến trúc & nền tảng kỹ thuật hiện có

| Thành phần | Trạng thái | Ghi chú |
|---|---|---|
| Vite 7 + React 19 + TypeScript 5.9 | ✅ Đã cấu hình | `package.json`, `vite.config.ts`, `tsconfig.*` ổn định |
| Tailwind CSS 4 (via `@tailwindcss/vite`) | ✅ Đã tích hợp | dùng utility-first + biến CSS (`var(--accent)`, `var(--bg-card)`…) |
| CesiumJS 1.139 + Resium 1.19 | ⚠️ Tích hợp nhưng đang ở **SAFE MODE** | `src/components/CesiumMap.tsx` đặt `CESIUM_SAFE_MODE = false` nhưng terrain hiện vẫn dùng `EllipsoidTerrainProvider` (chưa bật `createWorldTerrainAsync`). Cesium Ion token đã có sẵn trong `src/lib/cesium.ts`. |
| React Router v7 | ✅ Đã cấu hình | toàn bộ route khai báo trong `src/App.tsx` (29 route) |
| Theme Light/Dark | ✅ Đã có | `src/theme/ThemeContext.tsx` + `ThemeToggle` |
| Layout chung | ✅ Đã có | `AppHeader`, `HeaderContext`, `ProfileLayout`, `AdminLayout` |
| Auth context + ProtectedRoute + RoleGuard | ✅ Đã có | `src/auth/*` – mock-only, lưu localStorage |
| GeoJSON 63 tỉnh (GADM v4.1) | ✅ Có file | `public/geojson/vietnam-provinces.json` ~0.78 MB |

---

## 2. Đối chiếu Use Case (Bảng 4.1) – Tình trạng frontend

| UC | Tên | Trạng thái | File chính | Khoảng cách so với spec |
|---|---|---|---|---|
| **UC-01** | Xem bản đồ 3D | 🟡 **Một phần** | `pages/MapPage.tsx`, `components/CesiumMap.tsx`, `components/Timeline.tsx` | Marker `point` chạy được; **chưa render polygon/multi_polygon** từ `mapData`; **chưa bật World Terrain**; timeline chỉ mới 1945–1975 |
| **UC-02** | Tương tác sự kiện (drill-down) | ✅ **Đã có** | `MapPage.tsx` (state stack), `Sidebar.tsx`, `EventPopup.tsx` | Drill-down 2–3 cấp đã hoạt động; breadcrumb dạng pill đã có ở header |
| **UC-03** | Xem chi tiết sự kiện | ✅ **Đã có (UI)** | `pages/EventDetailPage.tsx` + 9 component `event-detail/*` | Đầy đủ Hero, KeyFacts, Textbook, Children, Media, Sources, Sidebar nav. Dữ liệu từ `mockEventDetails.ts` (3 sự kiện đầy đủ + fallback từ `events.ts`) |
| **UC-04** | Nghe TTS | 🟡 **Một phần** | `components/event-detail/EventTTSPlayer.tsx` | Dùng **Web Speech API** của trình duyệt (chunking theo câu, tốc độ, đổi giọng). **Chưa tích hợp FPT.AI TTS** như spec mục 3.6.2 |
| **UC-05** | Tạo quiz RAG | 🔴 **UI mock-only** | `pages/quiz/QuizGeneratePage.tsx`, `services/quizService.ts`, `data/mockQuizQuestions.ts` | Form chọn lớp/chủ đề/độ khó/số câu đầy đủ. Dữ liệu hoàn toàn từ mock. **Chưa gọi FastAPI/RAG**. Đã có API contract `services/ragQuizApiContract.ts` |
| **UC-06** | Làm bài & xem kết quả | ✅ **Đã có (UI)** | `pages/quiz/QuizSessionPage.tsx`, `QuizResultPage.tsx`, `QuizHistoryPage.tsx` | Đầy đủ: timer, đánh dấu, navigation, sidebar progress, modal nộp bài, kết quả + lịch sử lưu localStorage |
| **UC-07** | Tạo & làm đề thi THPT | ✅ **Đã có (UI)** | `pages/exams/*` (5 trang), 19 component `components/exams/*` | Preset Mock/Custom/Weakness, Hero, Form, Loading, Session, Result + Analysis Panel + Answer Review, History. Mock 40 câu/50 phút. **Chưa gọi backend**, đã có `examApiContract.ts` |
| **UC-08** | Quản lý tài khoản | ✅ **Đã có** | `pages/auth/*` (4 trang), `pages/profile/*` (4 trang) | Login/Register/Forgot/Reset + OAuth Google/Facebook (mock). Dashboard học tập, Lịch sử, Điểm số, Cài đặt. Lưu localStorage |
| **UC-09** | Quản trị dữ liệu (Admin) | 🟡 **Một phần** | `pages/admin/*` (4 trang), 3 component `components/admin/*` | Dashboard thống kê + bảng + biểu đồ mock; bảng Users/Events/Questions có filter, search, badge. **Chưa có thao tác CRUD thực sự** (form thêm/sửa/xóa, upload media, duyệt câu hỏi) |

---

## 3. Module 5.x – mức độ hoàn thiện chi tiết

### 5.2 Bản đồ 3D & Timeline tương tác – 🟡 60%
**Đã làm**
- Khởi tạo Viewer với guard chống StrictMode double-init (module-level singleton).
- Hiển thị marker `point` với label, màu theo `eventType`, highlight khi hover.
- Tô polygon 63 tỉnh theo `primaryRegions` / `secondaryRegions` (alpha 0.35 / 0.15).
- `flyTo` camera khi chọn sự kiện (altitude khác nhau cho cha/lá).
- Click handler dùng `ScreenSpaceEventHandler` + `pick`.
- Suppress render error overlay của Cesium, có UI fallback bằng tiếng Việt.
- Timeline slider có 7 mốc nổi bật (1945–1975).

**Còn thiếu**
- ❌ Bật **Cesium World Terrain** (`createWorldTerrainAsync`) – đang dùng `EllipsoidTerrainProvider` (phẳng).
- ❌ Render **polygon thuần** cho sự kiện `geoType=polygon`/`multi_polygon` (đang chỉ tô màu polygon hành chính theo tên).
- ❌ **Lazy loading** GeoJSON theo `provinceNames` của sự kiện được chọn (hiện tải tất 63 tỉnh ngay từ đầu).
- ❌ **Cache IndexedDB** cho GeoJSON đã load (mục 4.7.2).
- ❌ Tách **`displayGeometry`** vs **`focusGeometry`** trên CesiumMap (đã có trong type `MockEventDetail` nhưng chưa khai thác).
- ❌ Mở rộng timeline ra **toàn bộ chương trình lớp 10–11–12** (cần >2000 năm: cổ đại, phong kiến, cận đại, hiện đại, lịch sử thế giới).
- ❌ Hỗ trợ `geoType=mixed` (kết hợp marker + polygon).

### 5.3 Tương tác sự kiện & Drill-down – ✅ 85%
**Đã làm**
- Stack điều hướng cha–con với button "Quay lại" + breadcrumb header.
- Sidebar dạng tree, tự expand đến tổ tiên của sự kiện được chọn.
- Search/filter theo tên + theo `eventType` (4 loại: military/political/economic/cultural).
- Click marker → hiện popup → "Xem địa hình" / "Xem chi tiết" / chọn sự kiện con.

**Còn thiếu**
- ❌ Filter nâng cao theo lớp (10/11/12), `geoType`, khoảng năm, level.
- ❌ Hiển thị associations (`predecessor` / `successor` / related figures) trên popup.

### 5.4 Chi tiết sự kiện & TTS – 🟡 70%
**Đã làm**
- 9 component event-detail tương ứng đủ 16 khối JSON: `EventHero`, `EventTTSPlayer`, `EventTextbookContent`, `EventKeyFacts`, `EventLocationCard`, `EventChildrenList`, `EventMediaGallery`, `EventSources`, `EventDetailSidebar`.
- `mockEventDetails.ts` đã có 3 sự kiện chuẩn 16 khối (Điện Biên Phủ, Kháng chiến chống Pháp, Hội nghị I-an-ta).
- Service `getEventDetailBySlug` có alias map + fallback builder từ `events.ts`.
- Sidebar điều hướng nội bộ (anchor link) theo các khối có dữ liệu.

**Còn thiếu**
- ❌ Tích hợp **FPT.AI TTS API** (mục 3.6.2 trong KLTN) – hiện vẫn dùng `window.speechSynthesis`.
- ❌ Cache audio đã sinh để tiết kiệm chi phí.
- ❌ Kết nối **fetch live Wikipedia** (hiện chỉ link tĩnh trong `externalContent`).
- ❌ **Chuyển toàn bộ `events.ts` (12 sự kiện flat schema)** sang schema 16 khối như `mockEventDetails.ts`. Hiện hai schema đang song song và không đồng bộ.
- ❌ Mở rộng dữ liệu chi tiết sang đầy đủ chương trình SGK lớp 10/11/12 (kế hoạch ChromaDB chứa 1.500–2.000 chunk).
- ❌ Timeline mini trong trang chi tiết.

### 5.5 Sinh câu hỏi RAG – 🔴 30%
**Đã làm**
- UI form `QuizGeneratePage`: chọn lớp, chủ đề, độ khó, số câu, thời gian.
- `QuizSessionPage`: timer, đánh dấu xem lại, jump-to-question, sidebar progress, modal nộp bài.
- `QuizResultPage`: chấm điểm, hiển thị đáp án + giải thích + sourceRefs.
- `QuizHistoryPage`: danh sách phiên đã làm, lưu localStorage theo userId/guest.
- `services/quizService.ts` đầy đủ contract: `generateQuiz`, `submitQuiz`, `getQuizSession`, `getQuizHistory`, `saveQuizProgress`.
- `services/ragQuizApiContract.ts`: định nghĩa request/response chuẩn cho FastAPI.

**Còn thiếu**
- ❌ Câu hỏi 100% từ **`MOCK_QUIZ_QUESTIONS`** tĩnh (8–15 câu mẫu) – **chưa có RAG thật**.
- ❌ Pipeline FastAPI (`/ai/quiz/generate`) chưa tồn tại – cần tạo dịch vụ AI Python riêng.
- ❌ ChromaDB chưa có – chưa chunk SGK lớp 10–11–12, chưa sinh embedding.
- ❌ Trường `sourceRefs` (trang SGK) trong câu hỏi mock chưa đảm bảo bám 100% nội dung textbook.
- ❌ Mode "Câu hỏi chọn vị trí trên bản đồ 3D" (đề tài có nêu trong nội dung nghiên cứu) – chưa có UI.

### 5.6 Luyện thi THPT – 🟡 75% (UI), 0% logic AI sinh đề
**Đã làm**
- 5 trang: Home, Create, Session, Result, History; 19 component nhỏ chuyên cho exam.
- 3 preset: Mock (chuẩn THPT 40 câu/50 phút), Custom (tự cấu hình), Weakness (theo điểm yếu).
- Trang Session có Header riêng, Timer, ProgressSidebar, Navigation, FlagButton.
- Trang Result có ResultSummary, AnalysisPanel (phổ điểm, thời gian/câu, phân bố độ khó), AnswerReview.
- `examService.ts` mock đầy đủ: tạo đề, lưu progress, nộp bài, lịch sử, retake.
- `examApiContract.ts` định nghĩa 7 endpoint (bao gồm export PDF/Excel).

**Còn thiếu**
- ❌ Sinh đề thật bằng AI (`/ai/exam/generate`) – đang lọc/xáo từ `MOCK_EXAM_QUESTIONS`.
- ❌ Logic phân phối độ khó theo cấu trúc Bộ GDĐT (3 phần: nhận biết / thông hiểu / vận dụng).
- ❌ Export đề ra PDF/Excel.
- ❌ Phân tích "ôn theo điểm yếu" thực sự (đang dùng mockRecommendations tĩnh).

### 5.7 Tài khoản & Tiến độ học tập – ✅ 80%
**Đã làm**
- 4 trang auth + OAuth mock (Google/Facebook).
- Profile Dashboard: 5 thẻ stats, 3 biểu đồ (WeeklyScore, Category, Grade), strengths/weaknesses chips, Continue learning, Recommendations.
- Profile/History: lịch sử học tập.
- Profile/Scores: bảng điểm.
- Profile/Settings: chỉnh sửa hồ sơ qua `updateProfile`.
- Tất cả dữ liệu từ `mockLearningStats.ts`, `mockUsers.ts`.

**Còn thiếu**
- ❌ Toàn bộ dữ liệu **mock localStorage**, chưa nối Spring Boot `/api/auth/*`, `/api/progress/*`.
- ❌ Token JWT thật, refresh token, logout server-side.
- ❌ Tracking thời gian học thực (`weeklyMinutes`, `streakDays`) hiện hardcode.
- ❌ Avatar upload (chỉ `avatarUrl` string).

### 5.8 Admin – 🟡 50%
**Đã làm**
- Dashboard tổng: 4 thẻ KPI (`AdminStatsCard`), MiniBarChart 7 ngày, Activity Log, bảng "Người dùng mới nhất".
- 3 trang quản lý: `AdminUsersPage`, `AdminEventsPage`, `AdminQuestionsPage` – đều có search, filter (lớp / loại / status / VN/nước ngoài), `AdminTable`, badge trạng thái.
- Layout admin với sidebar riêng (`AdminLayout`).

**Còn thiếu**
- ❌ Form **Tạo / Sửa / Xóa** sự kiện (theo schema 16 khối JSON) – mục 4.1.3 UC-09.
- ❌ Trình soạn thảo nội dung SGK + upload media.
- ❌ Trình duyệt câu hỏi RAG (approve / reject / edit).
- ❌ Quản lý phân quyền user (đang chỉ hiển thị bảng).
- ❌ Bulk import JSON sự kiện.

---

## 4. Yêu cầu phi chức năng (mục 4.1.2) – Đánh giá

| Yêu cầu | Mục tiêu | Trạng thái |
|---|---|---|
| Khởi tạo bản đồ < 5s | Phụ thuộc terrain + GeoJSON | ⚠️ Cần đo (đang dùng terrain phẳng) |
| RAG response < 3s | Backend chưa có | 🔴 Chưa đo được |
| Faithfulness ≥ 0.8 | RAG bám SGK | 🔴 Chưa đánh giá |
| Responsive PC + tablet | Tailwind utility | 🟡 Layout chính ổn; trang Session/Detail cần test mobile |
| WebGL hiện đại | Cesium yêu cầu | ✅ |
| Khả năng mở rộng dữ liệu JSON | Schema 16 khối | 🟡 Đã có schema; chưa unify với `events.ts` |

---

## 5. Cấu trúc dữ liệu sự kiện – Đối chiếu spec

| Khối JSON (theo mục 3.3) | Có trong code? | File |
|---|---|---|
| `titles` (primary, short, alternatives) | ✅ | `mockEventDetails.ts` |
| `classification` (eventType, eventSubtype, tags) | ✅ | nt |
| `coverage` (grades) | ✅ | nt |
| `chronology` (start, end, datePrecision, displayDate) | ✅ | nt |
| `mapData.displayGeometry` + `focusGeometry` | ✅ schema | nt |
| `summary` | ✅ | nt |
| `textbookContent` (canonicalSummary, keyFacts, textbookRefs) | ✅ | nt |
| `externalContent` (wikipedia, wikidata) | ✅ | nt |
| `media` (thumbnail, items) | ✅ | nt |
| `hierarchy` (rootId, parentId, childIds, level) | ✅ | nt |
| `associations` (related/predecessor/successor) | ✅ schema (chưa hiển thị) | nt |
| `display` (showOnHomepage, showOnTimeline, featured) | ✅ | nt |
| `sourcePolicy` (canonicalSource, supplementalSources) | ✅ | nt |
| `geoType` 7 giá trị: `point` / `multi_point` / `polygon` / `multi_polygon` / `nationwide` / `no_location` / `mixed` | ⚠️ **Chỉ có 4 giá trị**: `single_point` / `multi_region` / `nationwide` / `no_location` | `types/event.ts` + `mockEventDetails.ts` |

> **Cảnh báo nhất quán**: hai schema đang song song trong codebase:
> - `src/types/event.ts` + `src/data/events.ts` → schema **flat (legacy)** dùng cho MapPage/Sidebar/Popup.
> - `src/data/mockEventDetails.ts` → schema **16 khối** dùng cho EventDetailPage.
> Khi nối backend, cần thống nhất về một schema duy nhất theo spec mục 3.3.

---

## 6. Khoảng cách lớn cần lấp (Top priorities)

### A. Đồng bộ schema dữ liệu (🔴 Cao)
1. Mở rộng `geoType` lên đủ 7 giá trị (`point`, `multi_point`, `polygon`, `multi_polygon`, `nationwide`, `no_location`, `mixed`).
2. Migrate `events.ts` sang schema 16 khối, loại `HistoricalEvent` (flat) thành adapter view-model.
3. Bổ sung dữ liệu cho ≥ 50 sự kiện tiêu biểu lớp 10–11–12 (gồm cổ đại, phong kiến, cận đại, hiện đại, lịch sử thế giới).

### B. Bản đồ thực sự "3D" và đa dạng (🔴 Cao)
1. Bật `createWorldTerrainAsync` (thoát SAFE MODE).
2. Render polygon `multi_polygon` cho các sự kiện đa vùng.
3. Lazy-load GeoJSON theo `provinceNames`; cache IndexedDB.
4. Tách logic `displayGeometry` (vẽ) vs `focusGeometry` (camera flyTo).
5. Mở rộng timeline xa hơn 1945–1975.

### C. Kết nối Backend & AI Service (🔴 Cao – chờ team backend)
1. Spring Boot REST: `/api/events`, `/api/auth`, `/api/progress`, `/api/quiz/generate` (proxy), `/api/exam/*`, `/api/tts` (proxy FPT.AI).
2. FastAPI AI Service: `/ai/quiz/generate`, `/ai/exam/generate`, `/ai/health`.
3. ChromaDB: chunking SGK theo bài/mục với metadata `{event_id, grade, lesson, page_*}`, collection theo lớp.
4. Hoán đổi mock service → API thật trong `quizService.ts`, `examService.ts`, `authService.ts`.

### D. TTS thật (🟠 Trung)
1. Tạo endpoint `/api/tts` ở Spring Boot proxy gọi FPT.AI.
2. Sửa `EventTTSPlayer` để fetch audio URL hoặc blob; thêm fallback Web Speech khi mạng lỗi.
3. Cache audio (IndexedDB hoặc Cache API).

### E. Admin CRUD thật (🟠 Trung)
1. Form thêm/sửa sự kiện theo schema 16 khối, có validate.
2. Trình soạn thảo `textbookContent.detailedNarrative` (richtext).
3. Workflow duyệt câu hỏi RAG: pending → approved/rejected.
4. Bulk import JSON.

### F. Polish & Phi chức năng (🟢 Thấp – làm song song)
1. Đo & tối ưu tải bản đồ (< 5s).
2. Test responsive trên tablet ≥ 768px.
3. ESLint + type-check sạch (hiện một số `as any` ở `CesiumMap.tsx`).
4. Bỏ `console.log` debug trong production.
5. Hợp nhất CSS inline → CSS module / class Tailwind (giảm trùng lặp ở các trang Quiz/Exam).

---

## 7. Tóm tắt theo trạng thái

```
✅ Hoàn thiện UI                  : Auth, Profile, Quiz UX, Exam UX, Event Detail layout, Drill-down
🟡 Có khung – cần backend         : Map 3D (terrain + polygon), TTS, Quiz RAG, Exam AI, Admin CRUD
🔴 Chưa bắt đầu                    : Spring Boot, FastAPI, ChromaDB, FPT.AI, JWT thật, đánh giá hiệu năng
```

**Tổng quan tiến độ frontend ước tính**: **~65% UI/UX**, **~25% logic ngắn nối backend**, **0% AI/data thật**.

---

## 8. Gợi ý lộ trình tiếp theo (Sprint 1–2 tuần)

| Tuần | Trọng tâm | Đầu ra |
|---|---|---|
| Tuần 1 | Đồng bộ schema 16 khối; bật Cesium World Terrain; mở rộng `geoType` | `events.ts` mới, MapPage render đa hình học |
| Tuần 2 | Lazy GeoJSON + cache; tách `displayGeometry`/`focusGeometry` | Hiệu năng < 5s, polygon/multi_polygon render |
| Tuần 3 | Spring Boot khởi động + endpoint events / auth thật | Đăng nhập/đăng ký thực, lấy events từ MySQL |
| Tuần 4 | FastAPI + Chroma cho RAG quiz | UC-05 chạy thật trên 1 bài SGK |
| Tuần 5 | FPT.AI TTS proxy + cache | UC-04 thật, đo độ trễ |
| Tuần 6 | Exam AI + Admin CRUD + đánh giá Faithfulness | Đủ điều kiện chạy thử nghiệm với học sinh |

---

> File này chỉ ghi nhận tiến độ **frontend MVP_KLTN**. Backend (Spring Boot) và AI Service (FastAPI) sẽ được theo dõi ở các file riêng trong thư mục `context/` khi bắt đầu triển khai.

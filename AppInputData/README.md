# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  # Event JSON Editor (Local-first)

  Ứng dụng nội bộ để nhập liệu sự kiện lịch sử cho khóa luận, theo cấu trúc JSON lồng nhau và ưu tiên nguồn SGK.

  ## 1) Mục tiêu

  - Nhập/sửa dữ liệu sự kiện nhanh, hạn chế điền sai cấu trúc JSON.
  - Import file JSON có sẵn, tiếp tục bổ sung dữ liệu còn thiếu.
  - Validate theo schema trước khi export.
  - Export JSON đúng UTF-8, indent 2 spaces.

  ## 2) Công nghệ

  - React + TypeScript + Vite
  - React Hook Form cho nested form
  - Zod cho validation
  - Ant Design cho UI nhập liệu
  - localStorage cho autosave draft

  ## 3) Chạy dự án

  ```bash
  npm install
  npm run dev
  ```

  Mặc định app chạy tại địa chỉ hiển thị trong terminal (thường là http://localhost:5173).

  Build production:

  ```bash
  npm run build
  ```

  ## 4) Cấu trúc dữ liệu mẫu

  - Canonical template: docs/event-template.json
  - Public template dùng khi app chạy: public/docs/event-template.json
  - Sample record thực tế: docs/sample-event.json
  - Public sample: public/docs/sample-event.json

  ## 5) Các tính năng đã có

  - Tạo mới record từ template.
  - Import JSON local và merge với template để không vỡ shape.
  - Form chia section có collapse.
  - Label kiểu song ngữ theo field:
    - key gốc JSON
    - tên tiếng Việt
    - mô tả ngắn field dùng làm gì
  - Đánh dấu bắt buộc/tùy chọn.
  - Quản lý mảng động: thêm, xóa, nhân bản, đổi thứ tự.
  - Tự sinh slug từ titles.primary (cho sửa tay).
  - Hiển thị preview JSON realtime.
  - Toggle pretty/minified preview.
  - Summary lỗi validate + lỗi inline.
  - Copy JSON và Download JSON.
  - Cảnh báo đóng tab khi có thay đổi chưa lưu.
  - Autosave bản nháp local.

  ## 6) Nhóm field bắt buộc v1

  - id
  - slug
  - entityType
  - eventLevel
  - titles.primary
  - classification.eventType
  - classification.eventSubtype
  - chronology.start.year
  - chronology.datePrecision
  - chronology.displayDate
  - mapData.displayGeometry.geoType
  - summary.homepageSummary
  - textbookContent.canonicalSummary
  - textbookContent.significance
  - textbookContent.textbookRefs (>= 1)
  - hierarchy.rootId
  - hierarchy.level
  - display.showOnHomepage
  - display.showOnTimeline

  ## 7) Ghi chú mở rộng

  - Nếu cần hỗ trợ sinh form tự động từ schema sâu hơn, có thể tách renderer theo metadata cho từng kiểu field.
  - Nếu sau này có backend, có thể giữ nguyên form layer và bổ sung API save/load.

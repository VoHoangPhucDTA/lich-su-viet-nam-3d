## Cấu trúc thư mục dự án

Dự án được tổ chức theo mô hình full-stack rõ ràng, tách biệt frontend, backend và các phần hỗ trợ. Mỗi thư mục chính được thiết kế để dễ mở rộng và bảo trì.

Nếu dự án sau này rộng ra sẽ tách mỗi service thành 1 repo riêng 

```text
lich-su-viet-nam-3d/                  # Thư mục gốc repo
├── frontend/                         # Phần giao diện người dùng (React + CesiumJS) 
│   ├── public/                       # File tĩnh (favicon, index.html, manifest...)
│   ├── src/
│   │   ├── apis/                     # Các hàm gọi API (axios instance, endpoints)
│   │   ├── assets/                   # Hình ảnh, icon, font, logo...
│   │   ├── components/               # Các component tái sử dụng (Button, Card, MapMarker...)
│   │   ├── constants/                # Hằng số (API_URL, EVENT_TYPES, COLORS...)
│   │   ├── types/                    # Định nghĩa TypeScript interfaces/types
│   │   ├── hooks/                    # Custom hooks (useEvents, useTimeline...)
│   │   ├── layouts/                  # Layout chung (Header, Sidebar, Footer...)
│   │   ├── pages/                    # Các trang chính (Home, MapView, Quiz, Profile...)
│   │   ├── lib/                      # Config thư viện bên ngoài (Cesium init, i18n...)
│   │   ├── providers/                # Context providers (AuthProvider, ThemeProvider...)
│   │   ├── schemas/                  # Schema validate form (Zod/Yup)
│   │   ├── stores/                   # Quản lý state global (Zustand/Redux nếu dùng)
│   │   ├── styles/                   # CSS global, Tailwind config, SCSS nếu có
│   │   ├── utils/                    # Hàm tiện ích (formatDate, geoUtils...)
│   │   ├── App.tsx                   # Root component
│   │   └── routes.tsx                # Định nghĩa router (React Router)
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                   # Backend REST API (Spring Boot) 
│   ├── src/main/java/lichsuvn/backend/
│   │   ├── config/                   # Cấu hình (WebConfig CORS, Security, Swagger...)
│   │   ├── controller/               # REST controllers (EventController, AuthController...)
│   │   ├── dto/                      # DTO request/response
│   │   ├── entity/                   # JPA entities (Event, User...)
│   │   ├── repository/               # JPA repositories
│   │   ├── service/                  # Business logic + impl
│   │   └── BackendApplication.java   # Class main chạy Spring Boot
│   ├── src/main/resources/
│   │   ├── application.properties    # Config database, server, JWT...
│   │   └── static/                   # File tĩnh nếu cần serve (export PDF...)
│   └── pom.xml                       # Maven dependencies
│
├── data/                             # Tất cả dữ liệu thô và đã xử lý
│   ├── sgk/                          # PDF SGK Lịch sử 10-11-12 bộ Cánh Diều
│   ├── gadm/                         # GeoJSON ranh giới tỉnh/thành Việt Nam
│   ├── raw/                          # JSON text extract từ PDF, Wikidata dump...
│   └── processed/                    # JSON events chuẩn hóa (hierarchy, geo_type...)
│
├── scripts/                          # Script Python hỗ trợ xử lý dữ liệu

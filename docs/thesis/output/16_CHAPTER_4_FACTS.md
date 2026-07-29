# 16 — Chương 4 fact sheet (Phân tích và thiết kế)

The current design is a browser React/Vite client, Spring Boot REST backend, FastAPI AI service, MySQL/Flyway schema and optional Chroma/Cloudinary/Viettel integrations. Static extraction found 47 frontend routes, 68 Spring routes, 5 AI routes, 37 migrations and 54 tables. The persistence layer is hybrid JPA/JDBC, not a single ORM-only layer.

Use the supplied UML as a repository-grounded replacement for conceptual diagrams. Mark external services and runtime-dependent arrows as conditional. The ERD is migration-derived and must not be presented as a live-schema dump until a read-only database snapshot is available.

# 05 — Backend architecture

Spring Boot 4.0.3 targets Java 21 in `backend/pom.xml` and exposes REST controllers under `backend/src/main/java`. The backend is not pure JPA: 7 entity classes/repositories cover auth/progress/exam-attempt concerns, while 19 Java files use `JdbcTemplate` or `NamedParameterJdbcTemplate` for event imports, exam catalog/session, AI candidate, TTS and read models.

Layers observed:

- API/controllers: Auth, Event, Admin, AI quiz/candidate, Exam catalog/attempt/session/submission recovery, Progress and Narration.
- Application/domain: event hierarchy, canonical import, exam snapshots/receipts, RAG/AI candidate provenance and TTS orchestration.
- Infrastructure: MySQL/Flyway, JDBC read repositories, JPA repositories, Cloudinary adapter, Viettel TTS adapter, mail/security configuration.

The service has 68 statically extracted Spring routes. Security expressions and configuration are evidence of intended access control, but no live authenticated request was performed in this audit. `raw_json`/`sourceJson` retention is a key traceability boundary for canonical event records.

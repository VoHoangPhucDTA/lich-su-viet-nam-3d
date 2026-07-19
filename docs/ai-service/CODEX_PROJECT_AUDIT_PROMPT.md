# Prompt cho Codex — Goal 0: Audit project trước khi xây AI Service

Dán prompt bên dưới khi Codex đang mở tại repository root.

---

Bạn đang làm Goal 0 cho module AI Service RAG của khóa luận Lịch sử Việt Nam.

## Mục tiêu

Audit repository hiện tại và tạo bộ tài liệu đủ chính xác để một AI khác có thể tiếp tục module mà không phải đọc toàn bộ code để lấy bối cảnh. Trong Goal này **không sửa production code, không cài dependency, không gọi API bên ngoài và không commit secret**.

## Bối cảnh đã biết nhưng phải xác minh

- Repository dự kiến: `D:/KLTN/lich-su-viet-nam-3d`.
- Nhánh từng được nhắc: `be_exams`; không được giả định vẫn đúng.
- Ứng dụng có React frontend, Spring Boot backend, MySQL và module luyện thi.
- AI Service dự kiến dùng FastAPI, Gemini API và ChromaDB.
- Dữ liệu SGK đã xử lý bên ngoài:
  - 47 bài HTML lớp 10–12.
  - 459 chunk canonical.
  - File chính: `sgk_chunks.jsonl`.
  - 45 chunk có `containsPendingReview=true`.
  - Có local embedding baseline 256 chiều, chỉ dùng kiểm tra pipeline.
  - Gemini production embedding chưa chạy.
- SGK là nguồn sự thật.
- Câu hỏi module luyện thi chỉ dùng làm Style Examples.
- Không tự động đưa câu AI sinh vào ngân hàng đề chính thức.

## Artifact người dùng sẽ đặt cạnh project hoặc cung cấp path

- `sgk_rag_steps_1_4_output.zip`
- `sgk_rag_steps_5_6_output.zip`
- Tài liệu trong `docs/ai-service/` nếu đã có.

Không giải nén hoặc di chuyển artifact nếu chưa cần cho audit. Chỉ ghi nhận path, nội dung manifest/README và đề xuất vị trí canonical trong project.

## Việc phải làm

### 1. Xác minh repository

Chạy các lệnh đọc an toàn:

- xác định repository root;
- `git status --short --branch`;
- commit hiện tại;
- liệt kê cấu trúc top-level;
- xác định monorepo hay multi-module.

Không reset, checkout, clean, stash hoặc sửa working tree.

### 2. Audit backend Spring Boot

Tìm và ghi lại:

- path module backend;
- Java/Spring Boot version;
- Maven/Gradle và lệnh build/test;
- package naming;
- auth/JWT/security flow;
- global error response format;
- controller/service/repository conventions;
- HTTP client đang dùng hoặc cách gọi service ngoài;
- config/env/profile conventions;
- CORS, logging, request ID, timeout, retry, rate limit nếu có;
- database migrations và naming conventions.

Chỉ đọc file liên quan. Không đọc mọi file Java nếu không cần.

### 3. Audit module luyện thi

Xác định chính xác:

- entities/tables cho question, MCQ options, true-false statements, topics, difficulty;
- field thể hiện verified/public/active;
- service/repository/API có thể lấy 2–3 câu verified cùng topic/difficulty;
- source references và explanation có sẵn không;
- duplicate detection hoặc embedding câu hỏi đã có không;
- ranh giới giữa official question bank và AI-generated temporary quiz.

### 4. Audit frontend

Tìm và ghi lại:

- framework/version, package manager, lệnh build/test/typecheck;
- API client và auth handling;
- component/route của module quiz có thể tái sử dụng;
- pattern loading/error/toast;
- type/schema convention;
- vị trí phù hợp để thêm UI tạo quiz AI.

### 5. Audit infrastructure

Tìm:

- Dockerfile/docker-compose;
- deployment config;
- database config;
- secret management;
- port đang dùng;
- reverse proxy/service URL;
- CI workflow.

### 6. Audit dữ liệu AI hiện có

Tìm xem repository đã có:

- `ai-service`, Python, FastAPI, LangChain, Chroma hoặc Gemini code;
- file dữ liệu SGK, event JSON hoặc script RAG cũ;
- tài liệu AI/RAG hiện có;
- naming conflict với module hiện tại.

### 7. Tạo/cập nhật tài liệu

Tạo thư mục `docs/ai-service/` nếu chưa có. Không ghi đè mù quáng; merge thông tin chính xác.

Phải tạo hoặc cập nhật:

1. `README.md`
2. `AI_SERVICE_OVERVIEW.md`
3. `AI_SERVICE_STATUS.md`
4. `AI_SERVICE_IMPLEMENTATION_PLAN.md`
5. `AI_SERVICE_ARCHITECTURE.md`
6. `AI_SERVICE_DATA_CONTRACT.md`
7. `AI_SERVICE_API_CONTRACT.md`
8. `AI_SERVICE_DECISIONS.md`
9. `AI_SERVICE_RUNBOOK.md`
10. `AI_SERVICE_PROJECT_AUDIT.md`

`AI_SERVICE_PROJECT_AUDIT.md` phải chứa:

- branch/commit/working tree;
- module map và exact paths;
- build/test commands;
- backend/frontend integration findings;
- module luyện thi findings;
- infrastructure findings;
- đề xuất vị trí `ai-service`;
- đề xuất nơi đặt `sgk_chunks.jsonl`;
- danh sách exact files dự kiến sửa ở Goal tiếp theo;
- rủi ro/mâu thuẫn;
- câu hỏi cần người dùng quyết định;
- một exact next action.

### 8. Chỉnh lại kế hoạch theo project thực tế

Kế hoạch cuối phải theo thứ tự:

- Goal 0: audit và contracts.
- Goal 1: onboard/validate artifact canonical.
- Goal 2: Gemini embedding + Chroma index.
- Goal 3: retrieval + evaluation.
- Goal 4: generation + validation + Style Examples.
- Goal 5: Spring Boot integration.
- Goal 6: frontend integration.
- Goal 7: evaluation, thesis, handoff.

Không bắt đầu Goal 1 trong cùng phiên này.

## Ràng buộc

- Không hard-code hoặc in API key.
- Không sửa code production.
- Không thêm dependency.
- Không tạo database migration.
- Không thay đổi branch.
- Không chạy destructive command.
- Không đưa ra claim không có bằng chứng.
- Không chọn tên Gemini model từ trí nhớ; chỉ ghi `TBD` nếu chưa xác minh tài liệu chính thức.
- Không xem local TF-IDF embedding là production semantic embedding.

## Cách kết thúc

Trả về báo cáo ngắn gồm:

1. Repository/branch/commit đã audit.
2. Các module và path chính.
3. Các file tài liệu đã tạo/cập nhật.
4. Các mâu thuẫn hoặc rủi ro lớn nhất.
5. Những thông tin bắt buộc người dùng phải quyết định.
6. Exact next action cho Goal 1.
7. `git diff --stat` và danh sách file thay đổi.

Không triển khai code cho tới khi người dùng duyệt audit và quyết định các mục còn thiếu.

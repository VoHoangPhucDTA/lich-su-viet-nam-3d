# AI Service RAG — Overview

## 1. Mục tiêu module

Xây dựng AI Service phục vụ ứng dụng học Lịch sử Việt Nam cho học sinh THPT. Phiên bản đầu tập trung vào việc sinh câu hỏi trắc nghiệm bốn lựa chọn từ nội dung SGK Lịch sử bộ **Kết nối tri thức với cuộc sống**.

Delivery hiện tại tách hai use case:

- Học sinh tự luyện qua `/quiz/generate` → `POST /api/quiz/generate`; không tạo
  receipt/candidate và lưu session/result/history theo user trong localStorage.
- Compatibility/admin generation qua `POST /api/exams/ai/generate`; receipt và
  candidate workflow tiếp tục tách biệt, không tự động publish.

Luồng chính:

```text
SGK đã làm sạch
→ chunk
→ embedding
→ ChromaDB
→ retrieval
→ Fact Context
→ Gemini sinh câu hỏi
→ validator
→ Spring Boot
→ React
```

## 2. Chức năng trong phạm vi phiên bản đầu

- Lập chỉ mục nội dung SGK lớp 10, 11, 12.
- Tìm các chunk liên quan theo query và metadata.
- Tạo `Fact Context` từ các chunk truy xuất được.
- Lấy một số câu hỏi đã xác minh trong module luyện thi làm `Style Examples`.
- Gọi Gemini để sinh câu hỏi MCQ bốn lựa chọn.
- Trả đáp án đúng, lời giải và nguồn chunk.
- Kiểm tra JSON schema và các quy tắc cơ bản trước khi trả kết quả.
- Tích hợp qua Spring Boot, không để React gọi Gemini trực tiếp.
- Canary self-practice được gán bằng pseudonymous authenticated user; current và
  candidate dùng provider pool độc lập, không fallback chéo model.

## 3. Ngoài phạm vi phiên bản đầu

- Chatbot hỏi đáp mở.
- Fine-tuning hoặc huấn luyện model riêng.
- Câu hỏi chọn vị trí trên bản đồ Cesium.
- Tự động đưa câu AI vào ngân hàng đề thi chính thức.
- Hybrid search, reranker nâng cao hoặc multi-agent.
- Cam kết chính xác 100% hoặc không hallucination.

## 4. Vai trò của từng nguồn dữ liệu

### SGK

Là nguồn sự thật dùng để xác định:

- Nội dung câu hỏi.
- Đáp án đúng.
- Lời giải.
- Trích dẫn nguồn.

### Ngân hàng câu hỏi luyện thi

Chỉ dùng làm mẫu phong cách:

- Cách diễn đạt câu hỏi.
- Cách tạo phương án nhiễu.
- Độ dài phương án.
- Mức độ khó và mức độ nhận thức.

Không dùng câu hỏi đề thi làm nguồn sự thật thay cho SGK.

## 5. Thuật ngữ

- **Chunk**: đoạn kiến thức có ý nghĩa hoàn chỉnh, được chia từ SGK.
- **Embedding**: vector số biểu diễn ý nghĩa của một chunk hoặc query.
- **Vector database**: nơi lưu vector và tìm kiếm theo độ tương đồng.
- **Fact Context**: các chunk SGK được đưa vào prompt làm căn cứ kiến thức.
- **Style Examples**: câu hỏi mẫu từ module luyện thi để Gemini tham khảo cách viết.
- **Retriever**: thành phần lấy top-k chunk phù hợp.
- **Grounding**: mức độ câu hỏi, đáp án và lời giải được chứng minh bởi Fact Context.

## 6. Ranh giới module

```text
React
  ↓ chỉ gọi API ứng dụng
Spring Boot
  ↓ xác thực, giới hạn, timeout, chuẩn hóa lỗi
FastAPI AI Service
  ↓ retrieval, prompt, Gemini, validation
ChromaDB + Gemini API
```

AI Service không chịu trách nhiệm cho:

- JWT nghiệp vụ chính của ứng dụng.
- Quản lý người dùng.
- Lưu điểm và phiên làm bài.

Với luồng tự luyện, browser sở hữu local session/scoring; với candidate/publish,
Spring/MySQL sở hữu receipt, lifecycle, provenance và official-bank transaction.
- Quản lý đề thi chính thức.

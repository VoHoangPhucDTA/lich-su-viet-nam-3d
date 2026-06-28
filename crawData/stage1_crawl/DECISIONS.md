# Lịch sử Quyết định Kỹ thuật (Architecture & Decisions Log)

Tài liệu này ghi lại các quyết định kỹ thuật quan trọng trong quá trình xây dựng hệ thống crawl và parse dữ liệu từ `sachgiaokhoa.online`, nhằm đảm bảo tính nhất quán và dễ bảo trì sau này.

---

## 1. Mục tiêu kiến trúc

1.  **Chính xác tuyệt đối**: Giữ nguyên toàn bộ nội dung text của SGK (không được drop từ, sai thứ tự).
2.  **Định dạng chuẩn Markdown**: Giữ được các đánh dấu như `**in đậm**`, `*in nghiêng*`, Table, List.
3.  **Hỗ trợ resume**: Tải HTML một lần, lưu lại `raw/` để chạy lại script parse nhiều lần mà không bị rate limit bởi server đích.
4.  **Cấu trúc JSON phẳng**: Dễ dàng đưa vào Elasticsearch hoặc LLM ở giai đoạn sau (RAG).

---

## 2. Giai đoạn 1: Crawl & Parse HTML thành JSON

### 2.1. Quyết định: Cấu trúc thư mục Output
*   **Context**: Cần phân loại theo lớp (10, 11, 12) và giữ file gốc.
*   **Decision**:
    *   `output/grade_X/raw/`: Lưu file `<lesson_id>_<title>.html` thô vừa kéo về.
    *   `output/grade_X/json/`: Lưu file `<lesson_id>_<title>.json` chứa kết quả parse (mảng các blocks).
    *   `output/grade_X/markdown/`: (Tuỳ chọn) file `.md` preview toàn bộ bài.

### 2.2. Quyết định: Parse DOM thành mảng các Block (thay vì 1 cục string)
*   **Context**: Nếu xuất ra 1 string Markdown khổng lồ, việc băm (chunking) cho RAG sẽ rất khó, làm đứt đoạn ngữ nghĩa (VD: nửa bảng nằm chunk này, nửa kia nằm chunk kia).
*   **Decision**: Parse DOM thành cấu trúc mảng tuần tự.
    ```json
    {
      "type": "paragraph | heading | list | table | image | source_text | question | citation",
      "content_text": "text thuần",
      "content_html": "<b>text</b>",
      "metadata": {
         "page": 10,
         "title_hint": "..."
      }
    }
    ```
*   **Lý do**: LLM hoặc vector DB có thể chunking theo index mảng (ví dụ: gộp N block liên tiếp) hoặc theo type (ưu tiên heading).

### 2.3. Quyết định: Nhận diện nội dung đặc thù (Sách Lịch sử)
*   **Tư liệu (Source Text)**: Các đoạn trích dẫn thư từ, văn kiện thường bắt đầu bằng chữ `TƯ LIỆU`.
    *   *Xử lý*: Dùng regex bắt chữ TƯ LIỆU ở đầu câu -> gắn `type="source_text"`.
*   **Câu hỏi (Question)**: Thường có icon `?` đầu dòng.
    *   *Xử lý*: Bắt dấu `?` -> gắn `type="question"`.
*   **Chú thích hình ảnh**: Các đoạn bắt đầu bằng "Hình", "Sơ đồ", "Lược đồ", "Bản đồ".
    *   *Xử lý*: Gộp đoạn caption này vào thuộc tính `caption` của block `image` liền trước nó. Xoá block caption đi để JSON gọn.
*   **Số trang**: Dòng có dạng `Trang N`.
    *   *Xử lý*: Không tạo block riêng. Lưu `N` vào biến `current_page`, rồi gán `page: N` cho tất cả các block bên dưới cho đến khi gặp số trang mới.
*   **Bảng (Table)**:
    *   *Xử lý*: Render bằng cú pháp Markdown Table (có `|---|---|`), đảm bảo LLM hiểu được cấu trúc cột/dòng.

### 2.4. Quyết định: Lưu lại các thẻ định dạng (`**`, `*`)
*   **Context**: SGK thường in đậm các từ khoá (năm tháng, nhân vật). Mất in đậm là mất feature quan trọng cho NLP.
*   **Decision**:
    *   Dùng BeautifulSoup duyệt DOM để tìm `<strong>`, `<b>`. Thay thế content bên trong bằng `**content**`.
    *   Tương tự với `<em>`, `<i>` -> `*content*`.
    *   *Lưu ý*: Phải thực hiện thay thế (mutation) này **sau khi** lưu HTML gốc (raw), và **trước khi** trích xuất text (`get_text`).

### 2.5. Quyết định: Bypass Rate Limit (Cloudflare 520)
*   **Context**: Khi vào trang danh sách lớp 11 (`lich-su-1171.html`), server trả lỗi 520 (Web server is returning an unknown error) rất thường xuyên.
*   **Decision**: Không crawl trang danh sách chuyên đề. Vào thẳng sitemap.xml của domain để lấy toàn bộ URL, hardcode vào mảng `LESSONS` rồi duyệt trực tiếp.

---

## 3. Giai đoạn 2: LLM Information Extraction

### 3.1. Quyết định: Chuyển đổi từ `events=[]` thành Flat JSONL
*   **Context**: Ở bản v1, data xuất ra là 1 JSON file trên mỗi bài (VD: `events: [...]`). Nhưng khi import vào Elasticsearch, cần dữ liệu phẳng (flat) mỗi dòng là 1 Document độc lập.
*   **Decision**: Script `extract.py` vẫn tạo file `10_123.json` tạm thời. Nhưng sẽ có bước gom (build) lại thành `event_candidates.jsonl`.
    ```json
    {"suggestedId": "...", "lesson_id": "...", "grade": 10, "classification": {...}}
    {"suggestedId": "...", "lesson_id": "...", "grade": 10, "classification": {...}}
    ```

### 3.2. Quyết định: Cấu trúc Field phân loại (Classification)
*   **Context**: Sự kiện lịch sử cần được query theo loại hình (Chính trị, Kinh tế, Quân sự...) và theo vùng miền (Việt Nam, Thế giới). Việc tách riêng `region` là cực kỳ quan trọng cho hiển thị trên bản đồ 3D của Việt Nam.
*   **Decision**: Bổ sung `region` vào cấp cao nhất của `classification` (HƯỚNG 3).
    ```json
    "classification": {
        "region": "vietnam | world",
        "eventSubtype": ["chính trị", "quân sự"],
        "tags": ["đảng cộng sản", "khởi nghĩa"]
    }
    ```
*   **Lý do**: "Việt Nam" và "Thế giới" là tính phân mảnh địa lý cốt lõi, không nên gộp chung với tags chủ đề (chính trị, văn hóa). Map 3D của Việt Nam chỉ cần filter `region="vietnam"`.

### 3.3. Quyết định: Giải quyết bài toán Chronology (Thời gian)
*   **Context**: Các sự kiện lịch sử SGK có rất nhiều cách ghi: Ngày tháng cụ thể (2/9/1945), Năm (1945), Khoảng (1945-1954), Khoảng TCN (2000 TCN), Thế kỉ (Thế kỉ XX), Thiên niên kỉ. LLM thường mắc lỗi: tự động "suy luận" khoảng năm cho các thế kỉ (VD: thế kỉ XX thành 1901-2000) và viết số TCN dương.
*   **Decision**:
    *   Ép cấu trúc `chronology` chặt chẽ với enum `datePrecision`: `["day", "month", "year", "period", "approximate"]`.
    *   **Loại bỏ `century` và `millennium`** khỏi schema: Nếu SGK ghi "Thế kỉ XX", LLM phải dùng `datePrecision="period"` và để trống (`null`) `start.year` và `end.year`.
    *   **Post-processing (TCN)**: Khai báo rõ năm TCN phải mang số ÂM (ví dụ `-2000`). Nếu Gemini trả số dương + text "TCN", dùng hàm `fix_bce_years()` tự động nhân `-1`.
    *   **Post-processing (Period)**: Chạy hàm `fix_period_years()` để ép `year=month=day=null` đối với tất cả events có `datePrecision="period"`, tránh việc LLM vẫn cố tình "suy diễn" ra năm cụ thể.

### 3.4. Quyết định: API Reliability (Gemini 503 / 429)
*   **Context**: Rate limit của Gemini Free là 15 RPM. Với input lớn (5-10k tokens) và output dài (2-5k tokens), tỷ lệ lỗi 429 (Too Many Requests) hoặc 503 (Service Unavailable) rất cao, đặc biệt làm đứt đoạn JSON dẫn đến `json.loads` thất bại.
*   **Decision**:
    *   **Round-Robin API Keys**: Sử dụng 12 keys xoay vòng. Theo dõi timestamp riêng biệt cho từng key (`key_last_used`) để đảm bảo khoảng cách >4s mỗi lần sử dụng cùng 1 key.
    *   **Backoff/Retry 5 lần**: Sleep 60s trên key bị 429.
    *   **Validation & Fallback**: Kiểm tra mảng `events=[] & concepts=[]` đồng thời để phát hiện Output bị cụt (do Gemini quá tải tự ngắt). Ném file lỗi vào thư mục `output/failed/` để lát chạy resume.
    *   **Tháo bỏ `responseSchema`**: Cấu trúc lồng (nested) quá sâu khiến Gemini kích hoạt strict mode, dẫn đến việc bỏ ngang (chỉ trả về header). Giải pháp là gỡ schema, dựa hoàn toàn vào Prompt Rules + Post Processing.

---

## 4. Các lựa chọn thay thế (Alternatives Considered)

*   **HTML Parsing**: Dùng RegExp thay vì BeautifulSoup.
    *   *Result*: Đã bị loại bỏ vì DOM structure lồng nhau không ổn định (VD: bảng lồng bảng, p lồng div).
*   **LLM Extraction (LangChain/LlamaIndex)**: Dùng framework RAG có sẵn.
    *   *Result*: Bị loại bỏ vì mục tiêu là trích xuất JSON schema siêu chặt. Dùng request trực tiếp tới Gemini API (`generativelanguage`) với JSON mode cho tốc độ cao nhất và tiết kiệm RAM.
*   **Chronology parsing bằng RegExp**: Tự viết script Python Regex để tách ngày tháng.
    *   *Result*: Quá phức tạp và tỷ lệ sai sót cao do văn phong tiếng Việt ("giữa tháng 3", "vào mùa xuân năm", "nửa cuối thế kỉ"). Giao việc này cho LLM kèm schema chặt tỏ ra chính xác hơn. 

---

*(Sẽ tiếp tục cập nhật khi triển khai Giai đoạn 3)*

## 5. Giai đoạn 3: Làm sạch và chuẩn hóa (Deduplication & Linking)

### 5.1. Quyết định: Phân giải thủ công nhóm gộp lỗi (Manual Unmerge)
*   **Context**: LLM gộp nhầm một số sự kiện có cùng thời điểm và chủ đề nhưng khác bản chất (eventType), VD: chính trị vs quân sự, chính trị vs ngoại giao.
*   **Decision**: Thay vì cố nhồi nhét rule vào LLM, duy trì 1 file `manual_unmerge_list.json` để tách thủ công các ID bị gộp lỗi. Script tự động bảo toàn dữ liệu bằng cách tách group thành các event đơn lẻ hoặc residual event.

### 5.2. Quyết định: Chuẩn hóa eventSubtype (Normalize Subtype)
*   **Context**: Cùng 1 subtype nhưng sách viết khác nhau (vd: "organization founding" và "organization-founding").
*   **Decision**: Dùng hàm `normalize_subtype` (lowercase, thay space bằng hyphen) và chọn ưu tiên `campaign` > `battle`, `campaign` > `formation` để hợp nhất subtype.

### 5.3. Quyết định: Giải quyết xung đột Region
*   **Context**: Một số sự kiện mang tính chất world nhưng do liên quan mật thiết tới VN (vd: VN gia nhập ASEAN).
*   **Decision**: Nếu nhóm gộp có bất kỳ thành phần nào thuộc region `vietnam`, ép buộc set `region = vietnam` và đánh dấu `_is_dual_region = True` để Database/Map 3D hiển thị hợp lý.

### 5.4. Quyết định: Tọa độ Override Thủ công (Manual Coords Override)
*   **Context**: LLM thường lấy tọa độ tâm của tỉnh/vùng (ví dụ Điện Biên Phủ) thay vì tọa độ cứ điểm cụ thể (Him Lam, Đồi Độc Lập) vì dữ liệu trên Geocoding API (Google Maps) mặc định trả về tâm thành phố.
*   **Decision**: Duy trì `manual_coords_override.json` điền tay tọa độ cho các cứ điểm lịch sử để tách biệt vị trí trên map.

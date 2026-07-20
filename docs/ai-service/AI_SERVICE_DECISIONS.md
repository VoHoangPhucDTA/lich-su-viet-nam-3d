# AI Service RAG — Decision Log

## ADR-001 — SGK là nguồn sự thật

- Status: Accepted
- Decision: Nội dung SGK chunk quyết định câu hỏi, đáp án và lời giải.
- Consequence: Câu hỏi module luyện thi không được dùng thay Fact Context.

## ADR-002 — Câu hỏi luyện thi chỉ là Style Examples

- Status: Accepted
- Decision: Chỉ lấy một số câu verified cùng chủ đề/độ khó để hướng dẫn phong cách.
- Consequence: Prompt phải tách rõ `FACT_CONTEXT` và `STYLE_EXAMPLES`.

## ADR-003 — Không trộn SGK và câu hỏi vào cùng collection

- Status: Accepted
- Decision: Collection SGK chỉ chứa SGK. Embedding câu hỏi nếu cần duplicate detection phải ở collection/index riêng.

## ADR-004 — React không gọi AI provider trực tiếp

- Status: Accepted
- Decision: React → Spring Boot → FastAPI → Gemini/Chroma.
- Reason: Bảo vệ secret, reuse auth, rate limit và error handling.

## ADR-005 — Không tự động publish câu AI vào ngân hàng đề

- Status: Accepted
- Decision: Câu AI sinh dùng trong quiz tạm thời hoặc review workflow, không tự động trở thành câu chính thức.

## ADR-006 — `sgk_chunks.jsonl` là nguồn canonical cho index

- Status: Accepted
- Decision: ChromaDB là index có thể rebuild, không phải nguồn dữ liệu duy nhất.

## ADR-007 — Local embedding hiện tại chỉ là baseline

- Status: Accepted
- Decision: TF-IDF + Random Projection 256 chiều chỉ dùng kiểm tra pipeline, không gọi là semantic production embedding.

## ADR-008 — Đổi embedding model phải tạo collection mới

- Status: Accepted
- Decision: Không trộn model/dimension trong một collection.

## ADR-009 — Audit project trước khi code

- Status: Accepted
- Decision: Goal 0 chỉ audit và tài liệu, không sửa production code hoặc cài dependency.

## ADR-010 — Không tuyên bố chính xác 100%

- Status: Accepted
- Decision: Chất lượng phải được báo cáo bằng retrieval/generation metrics và review thủ công.

## ADR-011 — Package FastAPI tách theo trách nhiệm

- Date: 2026-07-19
- Status: Accepted
- Context: `ai-service` chỉ có một module mẫu chứa cả app và endpoint ngoài phạm vi.
- Decision: Dùng `app/api`, `app/schemas`, `app/corpus`, `app/core`; giữ `main.py` ở root làm compatibility entry point.
- Alternatives: Giữ toàn bộ code trong một file.
- Consequences: Có ranh giới rõ để Goal 7C mở rộng mà không tạo client external ở import time.
- Verification: import app và Uvicorn health smoke test pass.

## ADR-012 — Config typed từ environment

- Date: 2026-07-19
- Status: Accepted
- Context: Service phải chạy khi chưa có secret.
- Decision: Dùng `pydantic-settings`, default an toàn và `.env` tùy chọn; `.env.example` không chứa secret thật.
- Alternatives: hard-code hoặc đọc environment rải rác.
- Consequences: `GEMINI_API_KEY` rỗng chỉ làm `geminiConfigured=false`, không cản startup.
- Verification: config test và health test pass khi không có API key.

## ADR-013 — Giữ nguyên pending review và mặc định loại khỏi eligible

- Date: 2026-07-19
- Status: Accepted cho Goal 7A/7B
- Context: Corpus thật có 45 chunk `containsPendingReview=true`.
- Decision: Validator không sửa/xóa chunk; false được tính eligible, true được báo riêng. Cấu hình runtime tương lai mặc định `RAG_INCLUDE_PENDING_REVIEW=false`.
- Alternatives: tự sửa, xóa vĩnh viễn hoặc gộp pending vào eligible.
- Consequences: Artifact canonical không đổi và report minh bạch; policy có index pending cho debug hay không vẫn phải chốt trước Goal 7C.
- Verification: corpus report cho 414 eligible và 45 pending.

## ADR-014 — Model corpus bám artifact thật

- Date: 2026-07-19
- Status: Accepted
- Context: Contract draft dùng `contentType`, nhưng artifact dùng `contentTypes`; 12 record có page range là `null`.
- Decision: Khai báo đầy đủ schema thực tế, giữ `contentTypes` dạng list và `pageStart/pageEnd` nullable.
- Alternatives: ép record vào schema draft hoặc sửa corpus.
- Consequences: Không biến đổi canonical content; schema drift vẫn được báo theo line.
- Verification: 459/459 record hợp lệ.

## Quyết định còn TBD cho Goal 7C+

- Chế độ chạy ChromaDB và lifecycle collection.
- Error/auth contract tích hợp với Spring Boot.

## ADR-015 — Gemini Embedding 2, dimension 768 và SDK chính thức

- Date: 2026-07-19
- Status: Accepted
- Context: Cần model production được xác minh tại thời điểm triển khai.
- Decision: Dùng `gemini-embedding-2`, `output_dimensionality=768`, `google-genai==2.12.1`.
- Alternatives: `gemini-embedding-001` hoặc local TF-IDF baseline.
- Consequences: Không được trộn vector từ model/dimension khác; đổi cấu hình tạo artifact directory mới.
- Verification: [Gemini Embeddings documentation](https://ai.google.dev/gemini-api/docs/embeddings), [Gemini Embedding 2 model card](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2), [official Python SDK](https://googleapis.github.io/python-genai/).

## ADR-016 — Asymmetric formatter và separate Content batching

- Date: 2026-07-19
- Status: Accepted
- Context: Embedding 2 có thể aggregate nhiều parts trong một Content.
- Decision: Formatter version `gemini-retrieval-document-v1`; document `title: ... | text: ...`, query `task: search result | query: ...`; mỗi chunk là một `types.Content` riêng.
- Alternatives: list text không định kiểu hoặc một request cho từng chunk.
- Consequences: API response phải có đúng một vector trên mỗi chunk và giữ thứ tự batch.
- Verification: mock SDK tests xác nhận Content count, order, response count và dimension.

## ADR-017 — Resume key và atomic checkpoint

- Date: 2026-07-19
- Status: Accepted
- Context: Build dài phải resume an toàn sau khi process bị ngắt.
- Decision: Resume key gồm `chunkId + chunkHash + embeddingModel + dimension + formatterVersion`; records/manifest/failures được atomic replace sau mỗi batch và fsync trước replace.
- Alternatives: chỉ dùng `chunkId`, hoặc append không kiểm tra.
- Consequences: mọi thay đổi semantic phải re-embed; truncated final JSONL line được phát hiện, bỏ qua và rewrite từ records hợp lệ.
- Verification: tests cho từng thành phần key, batch failure và truncated tail đều pass.

## ADR-018 — Retry chỉ cho lỗi tạm thời

- Date: 2026-07-19
- Status: Accepted
- Context: Quota tạm thời và network interruption cần retry nhưng lỗi request/auth không được lặp mù quáng.
- Decision: Tenacity exponential random backoff; retry 429, 5xx, timeout và transport errors; không retry 400/401/403/404/model/dimension/schema errors.
- Alternatives: retry mọi exception hoặc không retry.
- Consequences: permanent provider error dừng các batch tiếp theo sau khi ghi failure; thiếu key chỉ xuất hiện khi provider được gọi.
- Verification: retry/non-retry unit tests pass.

## ADR-019 — ChromaDB 1.5.9 persistent local index

- Date: 2026-07-19
- Status: Accepted
- Context: Goal 7D cần index local tái mở được trên Python 3.10.11.
- Decision: Pin `chromadb==1.5.9`; dùng `PersistentClient` tại `storage/chroma`, collection `sgk_kntt_history_gemini_v1`, HNSW cosine và `embedding_function=None` khi tạo collection.
- Alternatives: in-memory client, server mode hoặc default ONNX embedding function.
- Consequences: documents luôn đi cùng vector Gemini có sẵn; collection distance metric không thay đổi sau khi tạo.
- Verification: [Chroma package](https://pypi.org/project/chromadb/), [official collection docs](https://docs.trychroma.com/docs/collections/manage-collections), [upsert docs](https://docs.trychroma.com/docs/collections/update-data).

## ADR-020 — Artifact gate trước mọi production Chroma mutation

- Date: 2026-07-19
- Status: Accepted
- Context: Artifact hiện có thể partial hoặc chứa unresolved failures.
- Decision: Trước client creation phải xác minh manifest completed, model/dimension/formatter/hash, full eligible count, unique IDs, finite vectors, chunk hashes, zero failures và no pending-review chunks.
- Alternatives: index partial records hoặc tin manifest mà không đối chiếu corpus.
- Consequences: dry-run hiện trả exit 2 và production Chroma không bị ghi vì Goal 7C artifact thất bại.
- Verification: artifact validator tests và production dry-run gate.

## ADR-021 — Collection và record metadata contract

- Date: 2026-07-19
- Status: Accepted
- Context: Chroma collection phải từ chối vector/corpus contract không tương thích và metadata record phải portable.
- Decision: Collection metadata chứa corpus SHA, model, dimension, formatter, chunking version, cosine metric và source type. Record lists được flatten thành deterministic strings; nullable page fields bị bỏ.
- Alternatives: nested/list metadata hoặc sentinel page number.
- Consequences: existing incompatible collection không được upsert trừ khi đổi tên hoặc dùng explicit `--recreate`.
- Verification: metadata determinism, nullable page và compatibility tests pass.

## ADR-022 — Explicit Developer API request shape và safe diagnostics

- Date: 2026-07-20
- Status: Accepted
- Context: Failure wrapper cũ biến mọi 400 thành `Gemini request rejected with status 400`, nên không phân biệt credential với schema/content.
- Decision: Tạo client bằng `genai.Client(api_key=..., vertexai=False)`, không custom base URL, không `task_type`; dùng `EmbedContentConfig(output_dimensionality=768)`. Plain diagnostic gửi string trực tiếp. Production batch gửi danh sách trong đó mỗi document là một `types.Content(parts=[types.Part.from_text(...)])` riêng và Part phải không rỗng. Formatter giữ dạng `title: ... | text: ...`; không title dùng `title: none`.
- Before/after: request production trước repair đã có separate Content và dimension đúng nhưng backend được chọn ngầm, input chưa có guard và error chỉ còn code. Sau repair request shape được validate/khóa backend rõ, response count/dimension được kiểm tra, full SDK `code/status/message/details` được sanitize và lưu cùng batch context.
- Consequences: 400 content/schema và 404 vẫn permanent; 401/403 chỉ được thử key kế tiếp trong configured pool rồi permanent nếu pool cạn; 429/5xx/timeout/transport vẫn retry. Không ghi key, Authorization header hoặc document text vào report. Guard 32.000 ký tự là giới hạn vận hành có thể kiểm soát dưới token limit chính thức 8.192, không phải bộ đếm token.
- Verification: tài liệu chính thức Gemini Embeddings/Embedding 2 và Python SDK; offline tests pass. Sau key-pool repair, bốn diagnostic và smoke 1/3 đều pass, đúng response count và dimension 768.

## ADR-023 — Comma-separated Gemini API key pool

- Date: 2026-07-20
- Status: Accepted
- Context: Environment thực tế chứa 12 key trong biến `GEMINI_API_KEY`, phân cách bằng dấu phẩy. Code cũ truyền toàn bộ chuỗi vào SDK nên nhận `API_KEY_INVALID`.
- Decision: Parse/trim/deduplicate key pool; không log key. Chỉ chuyển key khi provider xác nhận `API_KEY_INVALID` hoặc HTTP 401/403 gắn với credential/project. Lỗi 400 content/schema không chuyển key; 429/5xx/network vẫn theo retry policy ADR-018. Sau khi một key pass, provider giữ client/key đó cho các batch tiếp theo trong cùng process.
- Alternatives: buộc chỉ một key; luôn round-robin; chuyển key cho mọi lỗi.
- Consequences: tương thích cả một key và danh sách comma; tránh che lỗi request thật và tránh thử lại key bị project denial ở từng batch.
- Verification: unit tests key parsing/failover/no-secret; thực tế key position 1 trả 403 project denied, position 2 pass cả bốn diagnostic và smoke 1/3.

## ADR-024 — Batch isolation, unresolved failure và manifest progress semantics

- Date: 2026-07-20
- Status: Accepted
- Context: Một batch 8 chunk cạn retry vì 429 đã dừng 307 chunk chưa thử do service coi mọi `PermanentEmbeddingError` là run-fatal; manifest gọi sai trạng thái hoàn tất.
- Decision: Provider-level retry exhausted không tự động là run-fatal. Credential pool cạn, missing model/dimension/config/corpus/filesystem mới dừng run. Batch lỗi cuối được checkpoint rồi batch sau tiếp tục. Lỗi request 400/413/422 hoặc formatter/response validation được bisect đôi tối đa depth 16 tới từng chunk. Failure map keyed bằng chunk ID và bị xóa khi valid embedding record thay thế.
- Alternatives: abort mọi permanent wrapper; đánh lỗi cả batch; retry vô hạn; giữ failure history unresolved lẫn resolved.
- Consequences: resume không gọi lại valid identity; failure file chỉ chứa unresolved current failures; quota batch có thể hoàn thành ở pass sau. Manifest tính successful/attempted/unattempted/remaining/unresolved và dùng status rõ nghĩa.
- Verification: unit tests continuation/bisection/failure resolution/bounds/counts/no-secret; production pass 1 đi từ 99 tới 390 dù ba batch cạn 429, pass 2 resolve 24/24 và hoàn tất 414.

## Quy tắc thêm quyết định mới

## ADR-025 — Raw distance, không gán confidence

- Status: Accepted cho Goal 8.
- Decision: Giữ raw Chroma distance tăng dần; không có similarity threshold mặc định và không đổi thành phần trăm confidence.

## ADR-026 — Typed exact metadata filters

- Status: Accepted cho Goal 8.
- Decision: Chỉ nhận `grade`, `lessonNumber`, `documentId`; exact `$eq`/`$and`, hậu kiểm compliance và không nhận raw `where`.

## ADR-027 — Stable diversity với fallback

- Status: Accepted cho Goal 8.
- Decision: Loại ID trùng, ưu tiên tối đa 2 chunk/document, rồi bổ sung deferred candidate theo relevance nếu cần đủ topK; không MMR/generation reranker.

## ADR-028 — Fact Context deterministic có budget

- Status: Accepted cho Goal 8.
- Decision: Tối đa 12.000 ký tự/5 chunk, marker truy nguồn; ưu tiên chunk trọn vẹn và cắt ở ranh giới câu khi cần.

## ADR-029 — Source-evidenced engineering benchmark

- Status: Accepted cho Goal 8.
- Decision: 36 query cân bằng lớp, ground truth từ eligible corpus, không chỉnh chọn lọc sau metric; chưa phải expert validation.

## ADR-030 — Evaluation query cache identity

- Status: Accepted cho Goal 8.
- Decision: Key gồm SHA-256 query, model, dimension và query formatter; cache ngoài Git, atomic, không dùng trong production API và không lưu secret/header.

Mỗi quyết định phải có:

```text
## ADR-XXX — Tên quyết định
- Date:
- Status: Proposed | Accepted | Superseded | Rejected
- Context:
- Decision:
- Alternatives:
- Consequences:
- Verification:
```

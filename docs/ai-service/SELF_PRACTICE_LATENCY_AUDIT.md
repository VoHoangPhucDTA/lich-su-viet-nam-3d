# Self-practice generation latency audit

Ngày audit: 2026-07-31.

## Kết luận

Thời gian 30–40 giây khi tạo năm câu phù hợp với behavior đã đo của current
model, nhưng chưa phải trải nghiệm mục tiêu tốt. Nút thắt chính là generation
provider và lượt repair tùy điều kiện; retrieval/Chroma không phải nguyên nhân
chính. Candidate `gemini-3.5-flash-lite` nhanh hơn rõ rệt trong bounded sample
Goal 17B nhưng không đạt quality/reliability gate bắt buộc, vì vậy **không được
promote**. Trạng thái cuối là `CANDIDATE_PROMOTION_REJECTED`; current vẫn là
`gemini-2.5-flash`.

## Runtime hiện tại

- AI Service, Spring và frontend đang listen ở port 8001, 8080 và 5173.
- `/ai/health`: `chromaReady=true`, `retrievalReady=true`,
  `generationReady=true`, `geminiConfigured=true`.
- `.env` đặt current model `gemini-2.5-flash`.
- Runtime candidate provider pool đọc `AI_SELF_PRACTICE_MODEL`; đây là biến
  cấu hình candidate runtime thật.
- `GEMINI_GENERATION_MODEL_SELF_PRACTICE_CANDIDATE` là input của benchmark WP12
  cũ, không phải alias của runtime candidate pool và tự nó không kích hoạt
  production routing.
- Candidate production config mặc định disabled, rollout 0%, không
  cross-model fallback.
- Mỗi logical request được phép tối đa một repair
  (`gemini_generation_repair_attempts=1` mặc định).

## Evidence đã đo

Goal 15J, sáu live requests:

| Stage | Mean | Range |
| --- | ---: | ---: |
| Retrieval | 0,617 giây | 0,511–0,985 giây |
| Initial provider | 15,214 giây | 8,134–21,056 giây |
| Repair provider khi xảy ra | 6,942 giây | một sample |
| FastAPI total | 16,997 giây | 9,132–23,832 giây |

Goal 15L, sáu logical requests qua Spring:

- Total mean 24,635 giây, median 21,556 giây, max 34,733 giây.
- Initial provider mean 19,748 giây.
- Hai trong sáu request repair; repair mean 12,414 giây khi được gọi.
- Tất cả request cuối cùng thành công.

Goal 15 baseline model comparison, bounded sample bốn request × năm câu:

- Current `gemini-2.5-flash`: mean 23,904 giây.
- Candidate `gemini-3.5-flash-lite`: mean 5,275 giây, final-valid 4/4,
  repair 0/4.

Các sample này có kích thước nhỏ, chạy local và không phải production SLO.

## Goal 17B — bounded live routing/promotion audit

### Current route proof

Cấu hình mặc định được xác minh với candidate disabled, rollout `0` và fallback
`false`. Một request self-practice có diagnostics đầy đủ đã tạo đúng current
provider pool, không tạo candidate pool và trả:

| Trường | Giá trị |
|---|---:|
| Selected pool/model | `CURRENT` / `gemini-2.5-flash` |
| Retrieval | 1.015 giây |
| Initial provider | 7.579 giây |
| Repair provider | 5.343 giây |
| Total | 13.937 giây |
| Repair | 1 |
| Final-valid / provider error | 100% / 0% |

Kết luận routing: `CURRENT_MODEL_CONFIRMED`. Có hai current control live request
đã được dùng trong Goal 17B; request đầu chỉ dùng để phát hiện mức logger chưa
thu đủ routing diagnostics, request thứ hai là evidence được báo cáo ở trên.

### Candidate override và matrix

Candidate được cấu hình chỉ trong process benchmark:

```text
AI_SELF_PRACTICE_MODEL=gemini-3.5-flash-lite
AI_SELF_PRACTICE_MODEL_ENABLED=true
AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT=100
AI_SELF_PRACTICE_MODEL_FALLBACK_ENABLED=false
```

Runtime tạo một candidate provider pool, không tạo current provider pool. Trong
23 request thành công, selected pool/model là
`CANDIDATE` / `gemini-3.5-flash-lite`. Matrix gồm `1, 3, 5, 10` câu ×
`EASY, MEDIUM, HARD` × hai pseudonymous topic group, tổng 24 candidate request.
Không lưu prompt, query, Fact Context, raw SGK, user identity, canary subject,
credential hoặc raw provider output.

### Candidate metrics

Latency chỉ tổng hợp trên request provider thành công; quality/error rate dùng
đủ 24 request.

| Số câu | Requests | Mean | Median | P95 | Min–max | Final-valid | Provider error |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 6 | 2.406 giây | 2.141 giây | 3.734 giây | 1.953–3.734 giây | 6/6 | 0/6 |
| 3 | 6 | 3.604 giây | 3.492 giây | 4.265 giây | 3.375–4.265 giây | 6/6 | 0/6 |
| 5 | 6 | 4.975 giây | 4.703 giây | 5.657 giây | 4.687–5.657 giây | 5/6 | 1/6 |
| 10 | 6 | 8.677 giây | 8.750 giây | 9.234 giây | 7.985–9.234 giây | 6/6 | 0/6 |
| Chung | 24 | 4.913 giây | 4.265 giây | 9.172 giây | 1.953–9.234 giây | 23/24 | 1/24 |

Repair rate là `0/24`; citation contract và answer-key contract đều đạt `23/24`.
Case `C5_HARD_TOPIC_A` gặp `GenerationTransientError`, nên không có final
response để xác nhận model/citation/answer. Năm request 5 câu thành công đạt
mean 4.975 giây và P95 5.657 giây, thấp hơn ngưỡng 10/20 giây.

### Promotion decision

Candidate đạt latency và repair gates nhưng không đạt các gate tuyệt đối:

- final-valid phải 100%, thực tế `23/24` (`95,8333%`);
- provider error phải 0, thực tế `1/24` (`4,1667%`);
- citation và answer-key phải không regression, thực tế chỉ xác nhận `23/24`.

Không hạ validator, bỏ quality check, retry thêm ngoài ngân sách hay thay candidate
bằng model khác. Quyết định là `CANDIDATE_PROMOTION_REJECTED`; current
self-practice giữ `gemini-2.5-flash`, candidate mặc định vẫn disabled, rollout
`0`, fallback `false`.

Đây là bounded local sample tại một thời điểm/provider load cụ thể, không phải
production SLO và không so sánh trực tiếp tuyệt đối với baseline cũ khác thời
điểm, tải mạng, quota và sample.

## Goal 17C — candidate same-model retry/resilience

### Root cause và retry trước Goal 17C

Artifact Goal 17B chỉ lưu exception class `GenerationTransientError`; nó không
lưu HTTP status, sanitized cause chain, attempt count hay `Retry-After`. Vì vậy
root cause của đúng case Goal 17B phải giữ là `UNKNOWN_TRANSIENT`, không được
hồi tố thành 429/5xx/timeout.

Trước Goal 17C, Google GenAI SDK 2.12.1 không tự retry khi `retry_options` không
được đặt. `GeminiGenerationProvider` có một lớp Tenacity retry riêng với
`GEMINI_GENERATION_MAX_RETRIES=3`, nghĩa là tối đa bốn provider attempt cho cả
current và candidate; classifier nhận 429, mọi 5xx và HTTP transport/timeout,
backoff random exponential 1–30 giây. Policy này không honor `Retry-After`,
không có candidate-specific 20-second provider budget và không lưu
attempt-level diagnostics. Schema repair là một provider call khác sau
parse/validation; nó không phải provider retry và không phải cross-model
fallback.

### Candidate retry policy

Goal 17C giữ current pool behavior và đặt policy riêng trên candidate pool:

```text
max retries: 1 (tối đa 2 provider attempts)
retryable HTTP: 429, 500, 502, 503, 504
retryable transport: connect/read timeout, temporary network/reset
base/max delay: 0,25/0,5 giây; honor Retry-After nếu hợp lệ
shared provider budget: 20 giây cho initial generation và schema repair
SDK retry: disabled để không tạo retry chồng tầng
cross-model fallback: disabled
```

Không retry 400/401/403/404, model unavailable, invalid request/key, safety
rejection, malformed structured output, schema/prompt validation hoặc permanent
provider error. Retry chỉ bắt đầu nếu remaining budget còn đủ cho delay và một
provider attempt tối thiểu. Internal diagnostics tách
`providerAttemptCount/providerRetryCount/providerRetryReason/providerRetryDelayMs`
với `repairAttempts`; không đưa các field này ra frontend.

### Bounded resilience benchmark

Artifact: `artifacts/ai-service/goal17c/candidate-48/report.json`. Matrix 24 case
Goal 17B × hai repetition = 48 candidate request; không cần current control mới.
Tracked prompt/validator/corpus không đổi giữa hai repetition.

| Số câu | Requests | Mean | Median | P95 | P99 | Final-valid | Terminal error |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 12 | 2.275 giây | 2.079 giây | 3.688 giây | 3.688 giây | 12/12 | 0/12 |
| 3 | 12 | 3.604 giây | 3.539 giây | 4.141 giây | 4.141 giây | 12/12 | 0/12 |
| 5 | 12 | 4.967 giây | 4.891 giây | 5.547 giây | 5.547 giây | 11/12 | 1/12 |
| 10 | 12 | 9.323 giây | 8.688 giây | 16.406 giây | 16.406 giây | 11/12 | 0/12 |
| Chung | 48 | 5.044 giây | 4.141 giây | 9.125 giây | 16.406 giây | 46/48 | 1/48 |

P99 nearest-rank trên sample 48 có giá trị tham khảo hạn chế và gần max; không
phải production tail-latency estimate.

Raw transient là 2/48 (`4,1667%`), đều HTTP 429:

- `C5_HARD_TOPIC_B_R1`: attempt đầu 429, retry cùng candidate model sau 250 ms
  thành công;
- `C5_HARD_TOPIC_A_R1`: attempt đầu và retry đều 429, terminal
  `GenerationTransientError`; sanitized chain là
  `GenerationTransientError -> ClientError`, không có `Retry-After`.

Retry request/count là 2/2, retry rate `4,1667%`, retry success `1/2` (50%).
Terminal provider error là 1/48 (`2,0833%`). Repair là 1/48 (`2,0833%`):
`C10_EASY_TOPIC_A_R2` gọi schema repair vì `DUPLICATE_WITHIN_BATCH`, nhưng vẫn
không đủ 10 câu final-valid. Citation và answer-key contract đạt 47/48; public
Spring contract regression suite pass 24/24.

### Goal 17C promotion decision

Latency, P95 tổng, P95 năm câu, repair rate và retry rate đều trong ngưỡng.
Candidate vẫn không đạt các gate tuyệt đối:

- terminal provider errors phải 0, thực tế 1/48;
- final-valid phải 100%, thực tế 46/48 (`95,8333%`);
- citation/answer regression phải 0, evidence đạt 47/48.

Quyết định là `CANDIDATE_PROMOTION_REJECTED`. Current self-practice tiếp tục
`gemini-2.5-flash`; candidate disabled, rollout `0`, fallback `false`. Same-model
retry không được dùng để che raw transient rate và không kích hoạt production
rollout.

## Diễn giải 30–40 giây

Một request năm câu thường gồm:

1. embedding + retrieval khoảng 0,5–1 giây;
2. initial Gemini generation khoảng 17–22 giây;
3. parse/validation cục bộ;
4. nếu output thiếu/sai schema hoặc không đủ câu hợp lệ, một provider repair
   khoảng 7–12 giây;
5. network và Spring/FastAPI serialization overhead.

Do đó request không repair thường nằm quanh 20–25 giây; request có repair có thể
đạt 30–35 giây hoặc cao hơn khi provider/network chậm. Frontend không retry và
Spring/FastAPI không cross-model fallback, nên 30–40 giây không đến từ
double-submit.

## Khuyến nghị

1. Giữ diagnostic log content-free và theo dõi `retrievalMs`,
   `providerInitialMs`, `repairProviderMs`, `repairAttempts`, trigger code và
   `totalMs` cho từng request; không log prompt, Fact Context, user ID hoặc model
   ID public.
2. Không giảm validator/grounding hoặc tắt repair chỉ để đạt latency thấp hơn.
3. Không kích hoạt rollout candidate sau Goal 17C. Muốn đề xuất lại phải chạy
   một bounded audit mới và đạt đủ mọi gate, đặc biệt final-valid 100% và zero
   provider error.
4. Runtime candidate pool chỉ được cấu hình bằng `AI_SELF_PRACTICE_MODEL` cùng
   feature flag/rollout; không dùng biến benchmark WP12
   `GEMINI_GENERATION_MODEL_SELF_PRACTICE_CANDIDATE` làm production config.
5. Nếu một proposal tương lai được phê duyệt, rollout vẫn phải theo
   0% → 5% → 25% → 50% → 100%, với hai provider pool độc lập và không fallback.

## Rollback/safe state sau Goal 17C

```powershell
$env:GEMINI_GENERATION_MODEL='gemini-2.5-flash'
$env:AI_SELF_PRACTICE_MODEL='gemini-3.5-flash-lite'
$env:AI_SELF_PRACTICE_MODEL_ENABLED='false'
$env:AI_SELF_PRACTICE_MODEL_ROLLOUT_PERCENT='0'
$env:AI_SELF_PRACTICE_MODEL_FALLBACK_ENABLED='false'
$env:AI_SELF_PRACTICE_PROVIDER_MAX_RETRIES='1'
$env:AI_SELF_PRACTICE_PROVIDER_RETRY_BASE_DELAY_SECONDS='0.25'
$env:AI_SELF_PRACTICE_PROVIDER_RETRY_MAX_DELAY_SECONDS='0.5'
$env:AI_SELF_PRACTICE_PROVIDER_TOTAL_BUDGET_SECONDS='20'
# Restart AI Service, rồi chạy shallow/deep health và deterministic generation check.
```

Chỉ restart Spring nếu `AI_SELF_PRACTICE_CANARY_SECRET` đã thay đổi. Frontend
không có model selector và không cần thay đổi khi rollback.

Audit này không kích hoạt candidate cho người dùng thật. Goal 17C chỉ harden
candidate provider retry/diagnostics; không thay current provider policy,
validator, prompt, retrieval, frontend contract hoặc cross-model fallback.

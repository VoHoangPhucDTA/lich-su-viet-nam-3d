# Self-practice generation latency audit

Ngày audit: 2026-07-30.

## Kết luận

Thời gian 30–40 giây khi tạo năm câu phù hợp với behavior đã đo của current
model, nhưng chưa phải trải nghiệm mục tiêu tốt. Nút thắt chính là generation
provider và lượt repair tùy điều kiện; retrieval/Chroma không phải nguyên nhân
chính.

## Runtime hiện tại

- AI Service, Spring và frontend đang listen ở port 8001, 8080 và 5173.
- `/ai/health`: `chromaReady=true`, `retrievalReady=true`,
  `generationReady=true`, `geminiConfigured=true`.
- `.env` đặt current model `gemini-2.5-flash`.
- Biến `GEMINI_GENERATION_MODEL_SELF_PRACTICE_CANDIDATE` chỉ phục vụ benchmark;
  nó không kích hoạt production routing.
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
3. Nếu phê duyệt candidate rollout, dùng production variables
   `AI_SELF_PRACTICE_MODEL_ENABLED`,
   `AI_SELF_PRACTICE_MODEL=gemini-3.5-flash-lite` và rollout tuần tự
   0% → 5% → 25% → 50% → 100%, với hai provider pool độc lập và không fallback.
4. Chỉ tăng rollout sau khi staging canary xác nhận final-valid, repair rate,
   error rate và latency; rollback bằng rollout 0% rồi restart.
5. Không dùng biến benchmark
   `GEMINI_GENERATION_MODEL_SELF_PRACTICE_CANDIDATE` làm production config.

Audit này không kích hoạt candidate cho người dùng thật và không thay đổi
provider, validator, prompt, retrieval hoặc timeout.

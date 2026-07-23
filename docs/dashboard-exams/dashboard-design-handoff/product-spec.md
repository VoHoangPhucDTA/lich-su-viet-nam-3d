# Product Spec — Personal Learning Dashboard V1

## 1. Product goal

Dashboard giúp học sinh hiểu tiến độ, nhận biết điểm mạnh/yếu khi đủ bằng chứng, biết nên ôn gì tiếp theo và mở lại lịch sử. Mỗi số liệu phải dẫn tới hiểu biết hoặc hành động, không chỉ là trang trí.

Route `/exams/thong-ke` đã được implement ở presentation layer. Goal 1 đã khóa wire contract,
validator, threshold/authority policy và mapper; backend API/data source thật vẫn chưa được implement.

### Current system truth

- Kho dữ liệu hiện có 38 đề, trong đó 23 đề publish, 32 canonical topics và 1.064 câu duy nhất.
- Chỉ timed original (`thi_thu`) và custom mock (`custom_mock`) hiện tạo result/history.
- Free practice, topic practice, retry và custom practice chưa tạo attempt lịch sử; dashboard không được diễn giải sự vắng mặt này thành “không học”.
- History đã đăng nhập hiện backend-first, không merge local; backend list tối đa 100 attempt.
  Dashboard V1 đã khóa policy authenticated backend-only, không merge local.
- Policy `dashboard-v1` đã khóa rule mạnh/yếu/confidence nhiều attempt bằng pure functions và boundary
  tests. Backend analytics chưa implement rule này.
- Period chưa có metadata chuẩn; difficulty bị phụ thuộc mạnh vào question type. V1 không thiết kế insight/chart cho hai chiều này.
- Backend chưa re-score. Mọi điểm số trong dashboard chỉ dùng cho learning analytics, không phải thành tích xác minh chính thức.

## 2. Users và data scope

- **Anonymous:** xem attempt trong localStorage của thiết bị hiện tại; luôn có notice “Dữ liệu chỉ lưu trên thiết bị này” và CTA đăng nhập.
- **Authenticated V1:** backend-only, không merge local.
- **Backend fallback/local aggregation:** deferred; production Goal 1 hiển thị unavailable state thay
  vì fake fixture hoặc silent local merge.

Score chỉ phục vụ learning analytics. Backend chưa re-score, vì vậy không mô tả là điểm xác minh, thành tích chính thức hay chứng chỉ.

## 3. Information hierarchy

1. Gợi ý ôn tập hôm nay.
2. Tổng quan kết quả.
3. Xu hướng điểm.
4. Điểm mạnh/yếu.
5. Hiệu suất dạng câu.
6. Mức nhận thức.
7. Lịch sử gần đây.
8. Coverage và data notices.

## 4. Time range

- Mặc định: 30 ngày.
- Tùy chọn: 7 ngày, 30 ngày, 90 ngày, tất cả.
- Quy đổi ngày: `Asia/Ho_Chi_Minh`.
- Đổi range giữ nguyên khung trang và hiện loading cục bộ.

## 5. Scope

| In scope | Deferred | Unsupported by current data |
| --- | --- | --- |
| Tổng attempt, điểm TB/cao nhất/gần nhất | Export, delete backend history | Practice activity tracking |
| Tổng thời gian, active days | Chart library chính thức | Retry improvement |
| Score trend | Backend aggregation/pagination | Abandonment/completion rate |
| MCQ accuracy | Sync/backfill local attempts | Reliable period insight |
| T/F statement accuracy, partial rate | Verified scoring | Independent difficulty insight |
| Blank rate | Official streak | Certificate/verified achievement |
| Strength/weakness đủ mẫu | Capture practice/retry | Social comparison/leaderboard |
| Cognitive performance |  |  |
| Recommendation, recent history, notices |  |  |

Hiện chỉ timed original và custom mock tạo result/history. Free practice, topic practice, retry và custom practice chưa tạo attempt lịch sử. Backend list tối đa 100 attempt; deep analytics cần details; weakness hiện tại chỉ phân tích một attempt.

## 6. Metric definitions

| Metric | Định nghĩa thiết kế |
| --- | --- |
| Total attempts | Số attempt đã submit trong range và scope hiện tại |
| Average score | Trung bình `score` thang 10 của attempt trong range |
| Highest score | `max(score)` trong range |
| Latest score | Điểm attempt có `submittedAt` mới nhất trong range |
| Total duration | Tổng `durationSeconds` của attempt được capture |
| Active days | Số ngày lịch khác nhau có attempt, theo Asia/Ho_Chi_Minh; không gọi là streak |
| Score trend | `ScoreTrendSeries` theo `submittedAt`; `sourceAttemptCount` là số bài nguồn, `points` có thể đã lấy mẫu/tổng hợp và `isComplete` cho biết chuỗi có bao phủ đủ nguồn; một điểm không tạo tuyên bố xu hướng |
| MCQ accuracy | `correctUnits / totalUnits` của MCQ, mỗi câu là một unit |
| T/F statement accuracy | `correctUnits / totalUnits`, mỗi statement là một unit |
| Blank rate | `blankUnits / totalUnits` trên learning units hỗ trợ |
| Partial T/F rate | Số câu T/F có `0 < answeredUnits < totalUnits` / tổng câu T/F |
| Strength | Topic đủ ≥8 units và ≥2 attempts, accuracy ≥80% |
| Weakness | Topic đủ ≥8 units và ≥2 attempts, accuracy <60% |
| Developing | Topic đủ mẫu, accuracy 60–79% |
| Data coverage | Attempt summary/detail đã dùng, giới hạn fetch và phần dữ liệu không capture |

Không định nghĩa chart difficulty hoặc period trong V1. Insight phải kèm accuracy, sample size, attempt count, confidence và route luyện tập nếu tồn tại. Không gắn nhãn mạnh/yếu khi thiếu mẫu.

Scope thời gian dùng ngày lịch `fromDate` và `toDateExclusive` theo `Asia/Ho_Chi_Minh`, định dạng `YYYY-MM-DD`; cận trên là exclusive và range `all` có `fromDate = null`. Thời điểm nộp bài vẫn dùng `submittedAt` ISO UTC. V1 không có goal model, vì vậy side column chỉ dùng data scope/coverage hoặc quick learning actions.

## 7. Recommendation rules

Ưu tiên topic yếu đủ mẫu và có route `/exams/on-chu-de/:topicSlug`; kế đến topic đang phát triển hoặc CTA làm đề. Recommendation giải thích “vì sao”, nêu sample và không hứa cải thiện. Khi detail thiếu, đề xuất hành động chung thay vì suy đoán topic.

## 8. Product decisions sau Goal 1

| Decision | Proposed default | Needs confirmation before implementation |
| --- | --- | --- |
| Merge local/backend | Không merge ở V1; authenticated backend-only | Đã khóa |
| Range mặc định | 30 ngày | Đã khóa |
| Minimum sample | 8 units và 2 attempts | Đã khóa trong `dashboard-v1` |
| Route | `/exams/thong-ke` | Đã implement |
| Active days vs streak | Chỉ active days | Đã khóa; streak deferred |
| Chart library | Recharts | Đã implement |
| Sync local attempts | Không tự backfill/aggregate trong Goal 1 | Deferred |
| History pagination size | 20 item/page, recent preview 5 | Có; backend chưa có pagination |

Các mục “Đã khóa” phải đồng bộ với wire contract, pure policy tests và mapper. Mọi thay đổi semantic
cần review contract mới.

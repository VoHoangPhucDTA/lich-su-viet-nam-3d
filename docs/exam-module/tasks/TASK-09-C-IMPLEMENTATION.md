# TASK-09-C — Kế hoạch và hiện thực dữ liệu thật cho hồ sơ

Ngày thực hiện: 27/07/2026

Phương án được chọn: **C — nối dữ liệu thật**

## 1. Mục tiêu

Loại bỏ toàn bộ số liệu minh họa khỏi luồng chính `/profile/dashboard`. Trang hồ sơ chỉ hiển thị dữ liệu có thể truy vết đến hoạt động của chính người dùng đang đăng nhập.

## 2. Phạm vi đã chốt

| KPI | Định nghĩa | Nguồn |
|---|---|---|
| `eventsViewed` | Số `event_id` khác nhau người dùng đã mở | `event_view_logs` |
| `quizzesCompleted` | Số quiz có trạng thái `submitted` | `quiz_attempts` |
| `totalMinutes` | Tổng `duration_seconds` của attempt thi hợp lệ, lấy phần nguyên theo phút | `exam_v2_attempts`, cùng nhóm mode/authority với Dashboard Analytics V1 |
| `streakDays` | Chuỗi ngày hoạt động liên tiếp hiện tại; được phép bắt đầu từ hôm nay hoặc hôm qua | Hợp nhất ngày xem sự kiện, hoàn thành quiz và nộp bài thi |

Múi giờ chuẩn cho chuỗi ngày: `Asia/Ho_Chi_Minh`.

## 3. Dữ liệu chủ động không hiển thị

- `rankPercentile`: không có nguồn xếp hạng đáng tin cậy và không cần thiết cho mục tiêu học tập.
- `progressByGrade`: ngân hàng đề hiện chưa có mapping lớp đủ tin cậy.
- `recentEvents` và phần trăm tiến độ giả: thay bằng các bài thi gần đây từ Dashboard Analytics V1.
- Điểm quiz do client tự chấm: không gửi lên backend và không dùng làm KPI. Backend chỉ nhận biên nhận hoàn thành tối thiểu.

## 4. Contract API

### `GET /api/progress/me/learning-summary`

Yêu cầu đăng nhập. Response data có exact contract:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-27T03:00:00Z",
  "timezone": "Asia/Ho_Chi_Minh",
  "eventsViewed": 12,
  "quizzesCompleted": 4,
  "totalMinutes": 61,
  "streakDays": 3
}
```

### `POST /api/quiz/attempts`

Yêu cầu đăng nhập. Ghi một biên nhận hoàn thành quiz tối thiểu:

```json
{
  "clientSessionId": "session-123",
  "topic": "Cách mạng tháng Tám",
  "difficulty": "medium",
  "totalQuestions": 5,
  "durationMs": 90000
}
```

ID attempt được sinh xác định từ user và `clientSessionId`, vì vậy request lặp không tạo thêm lượt hoàn thành. Backend không nhận đáp án, đáp án đúng, điểm hoặc lời giải.

## 5. Luồng giao diện

1. `/profile/dashboard` tải song song summary V1 và Dashboard Analytics V1.
2. Bốn KPI lấy từ summary V1.
3. Danh sách bài thi gần đây lấy từ Dashboard Analytics V1.
4. Hai nguồn lỗi độc lập: lỗi lịch sử bài thi không che KPI; lỗi KPI có nút thử lại.
5. `/profile/history` và `/profile/scores` được giữ tương thích bằng redirect sang `/exams/lich-su` và `/exams/thong-ke`.
6. Điều hướng hồ sơ trỏ trực tiếp đến hai trang dữ liệu thật.

## 6. Tiêu chí chấp nhận

- Không còn import `mockLearningStats` trong `ProfileDashboardPage`.
- Không render xếp hạng, tiến độ theo lớp, sự kiện gần đây hoặc gợi ý học tập giả.
- API summary chỉ trả dữ liệu của principal hiện tại.
- Event được đếm không trùng; quiz completion idempotent.
- Streak xử lý đúng hôm nay, hôm qua và khoảng trống ngày.
- Client kiểm tra exact keys, version, timezone và số nguyên không âm.
- URL cũ không bị hỏng.
- Test frontend, backend, typecheck, build và encoding đều đạt.

## 7. Ghi chú vận hành

Không cần migration mới: `quiz_attempts` đã có từ V6. Cách sinh UUID xác định tận dụng khóa chính hiện có để chống ghi trùng mà không chiếm số migration đã được dự kiến cho các task exam-core sau.

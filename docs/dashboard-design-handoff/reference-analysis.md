# Reference Analysis — TAK12 Dashboard

## Phạm vi quan sát

Ba ảnh `tak12-dashboard-top.png`, `tak12-dashboard-analytics.png`, `tak12-dashboard-history.png` đã được mở và phân tích. Chúng thể hiện một dark dashboard desktop-first, layout hai cột, cột chính chứa nhiệm vụ/analytics/history và cột phụ chứa streak, chỉ số hoạt động, leaderboard. Phân tích chỉ lấy cảm hứng bố cục và information architecture.

## Quan sát theo ảnh

- `tak12-dashboard-top.png`: action “Bài cần làm hôm nay” chiếm ưu tiên cao nhất; recommendation và bài được giao nằm ở main column, còn streak/chỉ số ngắn nằm trong utility rail. “Chương trình quan tâm” tạo lối tắt nội dung nhưng chiếm nhiều diện tích ngang.
- `tak12-dashboard-analytics.png`: donut nhiều nhóm, chart hai trục và leaderboard cùng xuất hiện tạo mật độ rất cao. Nhóm “Tiến độ học tập” có giá trị về vị trí, nhưng V1 cần line chart điểm đơn giản và bản tóm tắt chữ.
- `tak12-dashboard-history.png`: topic progress đặt ngay trước “Chi tiết bài làm”, tạo flow từ phân tích tới mở lại activity. Row lịch sử rộng, nhiều badge và action sẽ phải chuyển thành card ở tablet/mobile.

| TAK12 area | Mục đích | Áp dụng vào dự án | Quyết định |
| --- | --- | --- | --- |
| Bài cần làm hôm nay | Đưa hành động lên đầu | Gợi ý ôn tập hôm nay dựa trên weakness đủ mẫu | Nên áp dụng |
| Gợi ý ôn luyện | Giải thích bước tiếp theo | Recommendation card có lý do, sample, CTA | Nên áp dụng |
| Streak | Tạo nhịp quay lại | Chỉ hiển thị active days hoặc mục tiêu; không gọi streak | Nên biến đổi |
| Chỉ số hoạt động | Tóm tắt nhanh | Attempts, điểm, duration, active days | Nên áp dụng |
| Chương trình quan tâm | Điều hướng nội dung | Thay bằng quick actions tới browse/custom/topic | Nên biến đổi |
| Câu hỏi đã ôn | Phân bố hoạt động | MCQ/T-F/blank bằng bar và số liệu | Nên biến đổi; tránh donut nhiều topic |
| Tiến độ học tập | Xu hướng theo thời gian | Score trend; duration là KPI phụ | Nên áp dụng |
| Chủ điểm tiến bộ | So sánh topic | Strength/weakness hiện tại, không tuyên bố improvement khi thiếu baseline | Nên biến đổi |
| Chi tiết bài làm | Quay lại activity | Recent attempts, score, mode, date, duration | Nên áp dụng |
| Bảng xếp hạng | Social comparison | Không dùng trong V1 | Không phù hợp |
| Layout hai cột | Main + utility rail | Main linh hoạt và side 280–340px trên desktop | Nên áp dụng |
| Dark dashboard | Giảm chói, nhấn dữ liệu | Hỗ trợ light/dark bằng token của dự án | Nên biến đổi |
| Mật độ thông tin | Hiển thị nhiều module | Giảm số chart, tăng whitespace và progressive disclosure | Nên biến đổi |
| Difficulty/period | Không thấy bằng chứng phù hợp | Không thiết kế chart V1 | Không có dữ liệu hỗ trợ |

## Đánh giá chi tiết

### Điểm mạnh

- Hành động hôm nay đứng trước analytics, giúp trang có mục đích rõ.
- Cột phụ gom chỉ số ngắn và giữ cột chính cho nội dung cần đọc.
- History đặt sau phân tích tạo flow “hiểu → hành động → xem lại”.
- Card boundaries và heading rõ trong dark mode.

### Rủi ro

- Mật độ cao, chữ nhỏ, nhiều màu và chart cạnh nhau gây mệt; legend/trục trong ảnh analytics có contrast thấp.
- Donut với nhiều topic khó so sánh và phụ thuộc màu; dự án nên dùng ranked bars/list.
- Hai trục trong chart tiến độ tăng tải nhận thức; V1 chỉ dùng score trend đơn giản và ghi rõ coverage khi `scoreTrend.isComplete = false`.
- Sidebar leaderboard chiếm diện tích nhưng không hỗ trợ mục tiêu học cá nhân.
- Nội dung được tối ưu cho desktop rộng; xuống 768/390 dễ tạo overflow, chart nhãn dài và lịch sử dạng hàng khó đọc.
- Icon/màu dùng như tín hiệu chính có thể gây vấn đề accessibility.

## Mobile adaptation

Chuyển thành một cột; recommendation trước KPI; side widgets đưa vào main flow; KPI 2 cột; chart có tóm tắt chữ; insight dùng ranked cards; history đổi từ row/table sang card. Filter không che heading và không sticky quá mức. Topic dài được wrap, không truncate thông tin duy nhất.

## Design direction riêng

Dashboard dự án là giao diện học tập hiện đại, tin cậy và điềm tĩnh: nền/card theo token module exam, một accent chính, semantic status có text/icon, ít chart nhưng chart nào cũng có câu trả lời rõ. Cảm hứng TAK12 nằm ở thứ tự hành động, bố cục main/side và grouping; không sao chép thương hiệu, màu neon, nội dung, gamification hay social rank.

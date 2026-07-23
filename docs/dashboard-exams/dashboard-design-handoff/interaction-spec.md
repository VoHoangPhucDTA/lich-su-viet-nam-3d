# Interaction Spec

## Time filter

- Segmented control/radio group: 7 ngày, 30 ngày, 90 ngày, Tất cả; tên accessible đầy đủ.
- Current range rõ bằng text, `aria-checked/pressed` và style không chỉ màu.
- Khi đổi range: giữ layout, disable lặp, hiện loading cục bộ/skeleton, announce “Đang cập nhật dữ liệu 30 ngày”.
- Keyboard: Tab tới group, arrow đổi option nếu dùng radio pattern, Enter/Space kích hoạt.
- Không mô tả fake API call; prototype chỉ đổi mock/view state.

## Recommendation

- Topic yếu: CTA tới `/exams/on-chu-de/:topicSlug` khi `practiceRoute` có giá trị.
- Bài gần nhất: tới `/exams/ket-qua/:attemptId` qua `resultRoute` trong contract.
- Làm đề: `/exams/browse`; tạo đề: `/exams/tao-de`.
- Card có title, reason, evidence và action; toàn card không bắt buộc clickable nếu có nhiều action.

## Strength/weakness

- Luôn hiển thị accuracy, `correctUnits/totalUnits`, attempt count và confidence.
- Low confidence có label “Mẫu còn ít”, không ẩn trong tooltip.
- `insufficient-data` không được xếp vào strength/weakness; hiển thị trong notice/empty subsection.
- Topic dài wrap; action route có thể null. Không tạo tooltip chứa metadata contract không có.

## Charts

- Point/bar hỗ trợ hover và keyboard focus; tooltip responsive không vượt viewport.
- Mỗi chart có accessible name, date label và textual summary/list tương đương.
- Empty: minh họa nhẹ + CTA; one point: marker + text “Chưa đủ dữ liệu để nhận xét xu hướng”.
- Nhiều điểm: giảm nhãn trục theo mật độ nhưng không bỏ access tới giá trị.
- Không dùng animation bắt buộc; tôn trọng reduced motion.

## Recent history

- Item mở `resultRoute`; action có label “Xem lại bài làm”.
- Hiển thị title, mode label, score/10, duration, submitted date và total questions.
- `summary-only` có notice ngắn nếu detail không sẵn có.
- CTA cuối “Xem tất cả lịch sử” tới `/exams/lich-su`.

## Notices

- Anonymous: info, dữ liệu chỉ trên thiết bị, CTA đăng nhập.
- Backend fallback: warning, nêu đang dùng local; không làm trắng dashboard.
- Partial detail: warning cụ thể về số attempt có detail.
- Insufficient sample: info, giải thích minimum 8 units/2 attempts.
- Error không có local: hiển thị nút “Thử lại” như interaction cục bộ để nạp lại state hiện tại và CTA theo `actionRoute` về `/exams/browse`. Notice JSON chỉ mô tả CTA điều hướng; không thêm callback vào contract. Loading/error được announce bằng live region phù hợp.

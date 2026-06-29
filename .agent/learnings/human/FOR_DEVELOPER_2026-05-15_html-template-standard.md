# Human Learning: Chuẩn hóa Template HTML Đặc tả Use Case

Xin chào lại là mình đây! Cà phê vẫn còn ấm chứ? Vừa rồi chúng ta vừa hoàn thành một task tuy nhỏ xíu nhưng lại cực kỳ quan trọng về mặt "thẩm mỹ học thuật": Đồng bộ format HTML của Use Case Xem chi tiết sự kiện cho giống y hệt với Use Case Auth.

---

### Phần 1: Approach & Reasoning
Tại sao chúng ta phải làm lại khi file HTML cũ đã rất đẹp?
Rất đơn giản: File HTML cũ đẹp kiểu "Web hiện đại" (phong cách Admin Dashboard), nhưng thứ bạn cần là **báo cáo Khóa luận tốt nghiệp**. KLTN đòi hỏi sự đồng nhất tuyệt đối về font chữ (Times New Roman), cỡ chữ (13pt), khoảng cách dòng (1.5) và định dạng bảng đen trắng cơ bản. Do đó, cách tiếp cận của mình là mượn ngay file `usecase_auth_copy.html` làm khuôn mẫu (template) và bứng toàn bộ nội dung của UC-02 vào cái khuôn đó.

### Phần 2: Roads Not Taken
Mình đã có thể dùng CSS nội tuyến (inline CSS) để sửa vài chỗ ở file cũ.
**Tại sao bỏ?** Vì làm vậy sẽ tạo ra "Frankenstein code" (râu ông nọ cắm cằm bà kia), file HTML sẽ vừa chứa CSS hiện đại lại vừa lòi ra CSS cổ điển. Dễ sinh lỗi và cực kỳ khó maintain nếu sau này thầy cô bắt đổi sang font 14pt.
**Cách đã chọn:** Vứt hẳn cụm `<style>` cũ, copy nguyên xi cụm `<style>` từ file Auth sang.

### Phần 3: How Things Connect
Công việc này giống như đổ khuôn:
1. Đọc "khuôn" (file Auth) để lấy thông số: màu nền xám của header bảng `#f2f2f2`, chữ in đậm `.bold`, căn chỉnh bảng `border-collapse`.
2. Đọc "vật liệu" (file Event Detail) để trích xuất text: Usecase Name, Actor, Luồng 2.1, Luồng 2.2.
3. Đúc lại. Bùm, bạn có một file HTML mới tinh chuẩn đồ án đại học.

### Phần 4: Tools & Methods
Sử dụng AI Editor đọc file trực tiếp. Rất nhanh và an toàn. Mình chỉ đọc, trích xuất cấu trúc và thực hiện thao tác overwrite nội dung lên file cũ.

### Phần 5: Tradeoffs
- **Được:** Bạn có bộ hồ sơ Khóa luận siêu cấp đồng nhất, khi in ra Word hay PDF sẽ không bị lệch tông.
- **Mất:** Nó mất đi giao diện lấp lánh, màu sắc bắt mắt (các nhãn xanh đỏ, tag highlight) của bản HTML trước đó. Trông nó có vẻ "nhàm chán" hơn, nhưng đó là sự nhàm chán bắt buộc của học thuật.

### Phần 6: Mistakes & Dead Ends
Cạm bẫy lớn nhất trong việc copy template HTML là làm mất đi hệ thống phân cấp (Heading Hierarchy). File Auth dùng `<h3>` để ghi tên Use Case và `<p>` chứa `<span>` để ghi mô tả luồng (kiểu `3.5. Normal Flow`). Nếu không chú ý, mình có thể sẽ dùng `<h2>` như file cũ, làm sai lệch đánh số mục lục. Mình đã phải mapping cẩn thận từ `<h2>` của file cũ sang `<p><span class="bold">` của file Auth.

### Phần 7: Future Pitfalls
Nếu bạn tạo thêm Use Case số 3 (UC-03 Xem địa hình) trong tương lai, đừng yêu cầu AI "viết một file HTML đặc tả". Hãy bảo AI: *"Viết file HTML đặc tả UC-03 bằng cách clone cấu trúc CSS và layout của file UC-02"*. Như thế bạn sẽ không bao giờ mất thời gian đi format lại nữa.

### Phần 8: Expert vs Beginner
Beginner nhìn vào 2 file HTML sẽ nói: "File mới xấu hơn file cũ".
Expert nhìn vào sẽ nói: "File mới có thể copy thẳng vào MS Word mà không làm hỏng cấu trúc đoạn văn". Expert làm việc vì kết quả cuối cùng (đóng bìa đồ án), chứ không phải vì cái đẹp trên trình duyệt.

### Phần 9: Transferable Lessons
- **Luôn có "Source of Truth" về Design System:** Dù là code Web, làm slide PPT hay viết tài liệu báo cáo, hãy luôn định nghĩa 1 file chuẩn mực (như `usecase_auth_copy.html`) và ép mọi thứ khác phải tuân theo nó. Sự lộn xộn trong format thường gây mất điểm nhiều hơn là sự đơn điệu.

Chúc bạn có một bộ tài liệu KLTN thật hoàn hảo!

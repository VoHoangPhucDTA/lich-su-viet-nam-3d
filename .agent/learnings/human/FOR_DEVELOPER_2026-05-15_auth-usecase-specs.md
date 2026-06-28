# Trò chuyện Cà phê: Viết Đặc tả Usecase Auth & Tracing Code

Chào bạn, ngồi xuống uống miếng nước nhé. Bữa nay mình vừa xử lý xong một cái task tưởng không cực mà cực không tưởng: **Viết đặc tả Usecase (UC) và vẽ UML cho hệ thống Authentication**. Nhìn lại quá trình, có khá nhiều thứ hay ho mình đã rút ra được, cùng điểm qua nhé.

---

### Phần 1: Approach & Reasoning
Khi bạn ném cho mình cục "UC-6: Xác thực tài khoản", điều đầu tiên mình nghĩ là: "Wow, cục này bự chà bá". Auth không chỉ là login, nó có cả register, forgot password, và OAuth (Google/Facebook). Nếu nhét hết vào một cái quy trình thì cái UML nó dài tới tận sao Hỏa mất.
Vì thế, mình quyết định **chặt nó ra làm 3 phần**: 6A (Đăng ký), 6B (Đăng nhập), 6C (Quên mật khẩu). Sau đó, mình "thả" những đoạn comment như `// Bước 6A.1.4: ...` vào đúng các dòng code bên React và Spring Boot. Mục đích là để sau này bạn hoặc thầy cô chấm Đồ án KLTN nhìn vào code là biết dòng đó sinh ra để giải quyết bước nào trong cuốn tài liệu.

### Phần 2: Roads Not Taken
Một con đường mình đã **KHÔNG đi**: Cố đấm ăn xôi viết một luồng Normal Flow siêu to khổng lồ cho UC-6. Nếu làm vậy, file đặc tả sẽ như một bát cháo thập cẩm, còn lúc trace code thì mình sẽ lạc trôi không biết đường ra. 
Một ngõ cụt thứ hai mình đã tránh: Export thẳng ra file `.docx`. Code sinh ra file docx trực tiếp rất dễ bị lỗi định dạng, hoặc bị Word báo là file chứa mã độc. Thế nên mình chọn xuất ra file `.html` nhưng dùng CSS nội tuyến (inline CSS) bọc cái format Times New Roman lại. Bạn mở bằng Chrome copy rồi dán sang Word là chuẩn bài.

### Phần 3: How Things Connect
Tưởng tượng thế này: Yêu cầu của giảng viên là "Tài liệu", còn thực tế hệ thống là "Code". Cái cầu nối giữa hai thế giới này chính là **Sequence Diagram (UML)** và **Trace Comments**. 
Người dùng nhấn nút (React) -> Bắn API (AuthService.ts) -> Backend nhận (AuthController) -> Xử lý DB (AuthService.java). Mình đặt các bước 1, 2, 3, 4 dọc theo đúng luồng chảy của dữ liệu này. Nó giống như rắc vụn bánh mì để mình biết đường về vậy.

### Phần 4: Tools & Methods
Mình xài **PlantUML** để sinh ra biểu đồ sequence. Tại sao không xài draw.io? Vì PlantUML là dạng text, dễ dàng bảo trì và sửa chữa bằng code. Đổi một luồng logic? Chỉ cần sửa dòng text là cái hình cập nhật liền, khỏi phải kéo thả mỏi tay. 
Phương pháp thứ hai là **Code-level Traceability** (Đánh dấu mã nguồn). Đây là chuẩn của kỹ nghệ phần mềm hiện đại đấy.

### Phần 5: Tradeoffs
Để đổi lấy sự "minh bạch tuyệt đối" giữa tài liệu và code, mình đã phải hy sinh **sự gọn gàng của mã nguồn**. Việc thêm một đống comment `// Bước 6x...` vào các file như `AuthController` hay `AuthService` làm code trông hơi dài dòng và "lộn xộn" hơn bình thường. Nhưng với một đồ án tốt nghiệp, điểm "tài liệu hóa rõ ràng" luôn đáng giá hơn sự "clean code" kiểu tối giản.

### Phần 6: Mistakes & Dead Ends
Haha, không giấu gì bạn, lúc sửa lại cái quy trình 6C (Quên mật khẩu) nhập lại thành 1 luồng duy nhất (từ 1 đến 21), mình đã "sửa hụt" mấy cái comment trong file `AuthService.java` vì mình dùng công cụ thay thế chữ mà không load lại bản mới nhất của file đó. Nó báo lỗi không tìm thấy đoạn text cần thay thế. Kết quả là mình phải mở file đó ra đọc lại từng dòng xem cái logic cũ nó đang nằm ở line nào để sửa lại cho đúng. 

### Phần 7: Future Pitfalls
Nếu làm tương tự cho 6 Usecase còn lại (UC-3, 4, 5, 7, 8, 9), cạm bẫy lớn nhất là **code bị drift (lệch) so với tài liệu**. Bạn viết tài liệu xong, ngày mai bạn sửa lại cái luồng API nhưng quên không update số thứ tự trong comment hay trong file Word. Lúc bảo vệ đồ án, thầy cô hỏi "ủa sao bước này nói gọi API X mà trong code lại là Y?" thì... quê lắm.

### Phần 8: Expert vs Beginner
Một beginner sẽ code xong hết ứng dụng rồi cuối cùng mới è cổ ra viết báo cáo, vừa viết vừa chém gió hoặc tự bịa ra flow cho khớp. 
Một expert sẽ thiết kế Usecase từ đầu, rồi lúc code sẽ chèn luôn trace-id (mã vết) vào. Khi hệ thống to lên hàng trăm file, họ chỉ cần search text `6C.1` là ra ngay toàn bộ luồng quên mật khẩu chạy qua những file nào, ở cả frontend lẫn backend.

### Phần 9: Transferable Lessons
- **Chia để trị**: Đừng viết docs cho một cục quá to, hãy băm nó ra thành các luồng độc lập.
- **Hack HTML to Word**: Bất cứ khi nào cần gen báo cáo có bảng biểu rắc rối cho các sếp hoặc giáo viên, cứ gen ra HTML chuẩn layout rồi copy dán vào Word, nhàn hơn việc ngồi loay hoay với thư viện tạo docx rất nhiều!

Hy vọng ly cà phê này giúp bạn clear hơn về những gì tụi mình vừa làm. Chúc bạn bảo vệ đồ án KLTN thành công rực rỡ nhé!

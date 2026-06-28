# Human Learning: Đặc tả Use Case Xem chi tiết sự kiện (UC-02)

Chào bạn, ngồi xuống làm ly cà phê nhé. Mình vừa hoàn thành việc vẽ UML và viết Document cho tính năng "Xem chi tiết sự kiện lịch sử". Nhìn thì tưởng đơn giản chỉ là đổi vài dòng text, nhưng đằng sau đó là một vài quyết định khá thú vị về UX và kiến trúc đấy. Mình sẽ kể lại cho bạn nghe.

---

### Phần 1: Approach & Reasoning
Mục tiêu của chúng ta là làm document cho UC-02, khi user bấm xem một sự kiện. Vấn đề đầu tiên bạn đưa ra là: *“Chưa có data, chưa chọn Cloudinary hay AWS thì có viết UML được không?”*. 
Mình chọn cách tiếp cận **Design-first (Thiết kế trước)**. Trong thực tế đi làm, việc thiết kế architecture luôn đi trước code. Mình chốt giả định hệ thống dùng Cloudinary (vì nó xịn, free tier ngon và rất hợp cho sinh viên làm KLTN) để vẽ luồng. Điều này giúp document của bạn trông rất "Pro" vì nó phản ánh một hệ thống đã được tính toán kỹ.

### Phần 2: Roads Not Taken
Ban đầu, khi nói về Text-to-Speech (TTS), mình có thể vẽ luồng là Frontend gọi thẳng sang FPT.AI hoặc ElevenLabs luôn cho lẹ.
**Tại sao mình bỏ?** Vì làm vậy lộ API Key của dịch vụ TTS ở Frontend. Hơn nữa, mỗi lần user bấm nghe lại là một lần gọi API -> Tốn tiền.
**Con đường đã chọn:** Mình bắt Backend làm trung gian. Backend gọi FPT.AI -> Ra file Audio -> Quăng lên Cloudinary -> Lưu cái link vào DB. Lần sau ai bấm nghe thì lấy link trong DB ra. Vừa bảo mật, vừa cache được audio. Đây là tư duy của hệ thống Production thực thụ.

### Phần 3: How Things Connect
Luồng đi cực kỳ mượt mà: User click -> Chuyển hướng sang `EventDetailPage` -> Page tự gọi API -> Backend móc DB -> Backend trả JSON -> Frontend nhận JSON và **tự động vẽ** ra giao diện với hàng tá section (Tổng quan, Dữ kiện, SGK, Media...). Mọi thứ kết nối với nhau bằng Data Flow. Nơi nào có dữ liệu động (như Audio, Image) thì Cloudinary lo phần lưu trữ, Backend chỉ giữ link.

### Phần 4: Tools & Methods
Chúng ta tiếp tục dùng **PlantUML** để vẽ Sequence Diagram và **HTML** để viết đặc tả. Tại sao không dùng Word? Vì PlantUML cho phép bạn update luồng chỉ bằng vài dòng text, rất phù hợp khi review code phát hiện sai sót (như cái vụ EDP tự render bên dưới). HTML thì dễ dàng nhúng vào bất cứ đâu.

### Phần 5: Tradeoffs
Khi bàn về UI của phần "Tư liệu", nếu nhét hết ảnh, video, tài liệu vào một cột dọc thì user scroll mỏi tay. Bạn đã đưa ra một ý tưởng rất hay: Chia Tab.
- **Được:** UI cực kỳ sạch, focus tốt, performance mượt.
- **Mất:** Trải nghiệm người dùng hơi gián đoạn một nhịp (phải click sang tab Video mới xem được). Nhưng với một trang cung cấp lượng lớn kiến thức như lịch sử thì sự gọn gàng (Clean UI) phải được ưu tiên hàng đầu.

### Phần 6: Mistakes & Dead Ends
Chúng ta vấp một lỗi kinh điển khi vẽ Sequence Diagram: **Actor (User) gọi hàm render giao diện.** 
Lúc đầu mình vẽ: `User -> EDP: Render các Section`. 
Nhưng trong React, User đâu có can thiệp vào hàm `render()`! User chỉ kích hoạt trạng thái (bấm nút) hoặc load page, sau đó State thay đổi và **Component tự nó render nó**. 
Mình đã phải sửa ngay thành mũi tên tự trỏ (Self-message): `EDP -> EDP: Tự động Render` ở cả flow 2.1 và 2.2. Một bài học nhớ đời về việc kết hợp giữa kiến thức UI Framework (React) và chuẩn mực UML.

### Phần 7: Future Pitfalls
Cẩn thận với **"Tính năng chưa có Data"**. Rất nhiều người đợi có data mới vẽ luồng, dẫn đến khi code xong mới nhận ra kiến trúc sai bét. Bài học ở đây là: Cứ vẽ kiến trúc gọi API của Cloudinary/TTS ra trước. Đến khi bạn code, bạn cứ theo cái hợp đồng (contract) UML đó mà làm, đảm bảo không bao giờ bị loạn logic.

### Phần 8: Expert vs Beginner
Một người mới học sẽ nghĩ: "UML chỉ là thủ tục, vẽ cho có".
Nhưng một Expert nhìn vào UML sẽ thấy **chi phí hệ thống** và **trải nghiệm người dùng**. Chẳng hạn, cái luồng Backend cache Audio là tư duy của Expert để tối ưu chi phí server. Hoặc việc nhận diện chính xác luồng chuyển hướng từ Popup sang một Trang chuyên biệt (`EventDetailPage`) để tận dụng không gian hiển thị rộng rãi — đó là tư duy sản phẩm tinh tế.

### Phần 9: Transferable Lessons
- **Luôn có Cache cho External API:** Bất cứ khi nào bạn gọi dịch vụ tốn tiền (SMS, AI, TTS), hãy tính đến chuyện lưu kết quả lại (Cache) để tái sử dụng.
- **Self-Message trong UML:** Khi một đối tượng tự làm việc nội bộ (như Component tự render, Backend tự tính toán), luôn dùng mũi tên vòng lại (Self-call) chứ không kéo từ User hay từ bên thứ 3 vào. Nó thể hiện tính đóng gói (Encapsulation) cực tốt.

Hy vọng ly cà phê này ngon, và document này giúp bạn bảo vệ KLTN cực kỳ tự tự tin!

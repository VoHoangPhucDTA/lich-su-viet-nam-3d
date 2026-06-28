# Hardening Auth: Hành trình gỡ rối Cookie, Logout và những "mũi tên đập vào mặt" ☕

Chào bạn, lại là mình đây. Hôm nay anh em mình đã trải qua một buổi dọn dẹp và chốt sổ phân hệ Authentication khá dài hơi. Từ việc fix bug nhỏ lặt vặt cho đến vẽ lại toàn bộ tài liệu đặc tả (Usecase, UML). Giờ pha ly cà phê, ngồi xuống mình sẽ review lại tại sao hôm nay tụi mình lại quyết định làm những thứ "có vẻ nhỏ bé" này, nhưng thực chất lại quyết định sự sống còn của app khi đưa lên production nhé.

### Phần 1: Approach & Reasoning
> Tại sao lại cần phải rạch ròi đến mức comment từng ID của Usecase vào Code?

Ban đầu tụi mình thấy tính năng Auth cơ bản đã "chạy được": đăng ký, đăng nhập email, đăng nhập Google, rồi quên mật khẩu. Nhưng khi ghép nối vào tài liệu để báo cáo (và cho sau này bảo trì), nó là một mớ hỗn độn. Usecase 6 quá bự!
Mình đã quyết định tách nó ra làm 4 phần nhỏ: 6A, 6B, 6C và 6D (Đăng xuất). Đồng thời, đưa các trace comments (như `// Trace: 6D.1.4`) thẳng vào trong source code (`authService.ts`, `AuthController.java`). Tại sao? Vì một hệ thống tốt không chỉ chạy đúng, mà còn phải *chứng minh được là nó đang chạy đúng như bản vẽ thiết kế*. Khi có bug, bạn cứ nhìn đúng dòng comment là biết nó thuộc step nào trong Flow để debug.

### Phần 2: Roads Not Taken
> Tại sao không tiếp tục gửi Refresh Token trong Request Body?

Lúc debug `/refresh`, tụi mình dính quả error HTTP 400 Bad Request. Ban đầu, tư duy thông thường là "chắc frontend gửi payload rỗng, vậy thì sửa frontend cho nó gửi cái body đi".
Nhưng mình đã dừng lại. Nếu làm thế, vô tình chúng ta lại để JavaScript đọc cái Refresh Token và gắn vào body! Cách đó vứt bỏ hoàn toàn ý nghĩa của việc cấu hình HttpOnly Cookie. Thế là tụi mình quyết định vứt luôn class `RefreshRequest` đi, buộc Spring Boot phải tự thọc tay vào Header `Cookie` để lấy token ra. Việc này tuy sửa sâu ở Backend, nhưng lại khoá chặt cửa sổ bảo mật chống XSS hoàn toàn ở Frontend.

### Phần 3: How Things Connect
> Từng mảnh ghép Auth liên kết ra sao?

Hãy nghĩ Auth như một ngôi nhà có cửa vân tay:
1. **Login (6B)** là lúc quẹt vân tay (lấy JWT và cất kỹ vào HttpOnly). Thêm localStorage để nhớ "Ai đang ở trong nhà" nhằm đổi giao diện (đổi Header).
2. **Refresh** là thẻ gia hạn, tự động trượt qua kẽ cửa (Cookie) mà không ai nhìn thấy.
3. **Logout (6D)** là vứt thẻ đi. Và khúc này rất quan trọng, nếu "hệ thống huỷ thẻ" (Backend) bị sập, mình vẫn phải đẩy khách ra khỏi nhà (xoá UI state). Nếu không, họ sẽ kẹt lại ở giao diện "Đã đăng nhập" mãi mãi.

### Phần 4: Tools & Methods
> Try/Finally cho API calls

Trong thao tác Đăng xuất (`authService.ts` và `AuthContext.tsx`), mình đã dùng phương pháp **Defensive UI** với khối lệnh `try / finally`. 
Tại sao lại là `finally` mà không phải để ngoài cùng? Vì trong JS, hàm `async` ném Exception sẽ khiến các dòng lệnh phía dưới dừng lại. Bọc vào `try` và bắt lỗi ngầm ở `catch`, xong dọn dẹp state (localStorage, React context) trong `finally` đảm bảo UI luôn sạch sẽ, mượt mà chuyển về trang Login dù mạng có rớt hay server có sụp.

### Phần 5: Tradeoffs
> Giao diện tự xử, khỏi báo cáo User?

Khi vẽ PlantUML, tụi mình gặp một tình huống buồn cười: Mũi tên từ `UI` vẽ ngược về phía Actor `User` với ghi chú: "Hiển thị thông báo đăng ký thành công". Bạn bảo "không có thông báo nào đập vào mặt user cả". 
Và bạn hoàn toàn đúng! Sự đánh đổi ở đây là về độ chân thực của mô hình. Thay vì biểu diễn hệ thống như một hộp đen đối thoại với User, mình thay đổi bằng self-message `UI -> UI` (tự render, tự redirect, hiển thị toast inline). Việc này làm sequence diagram trông có vẻ "thiếu tương tác 2 chiều" ở bước cuối, nhưng nó phản ánh chính xác 100% cách React Component vòng lặp State-Rendering hoạt động.

### Phần 6: Mistakes & Dead Ends
> Cái "xác sống" mang tên `getAccessToken`

Lúc trước, trong `authService.ts` vẫn còn sót lại cái hàm `getAccessToken()` từ thời xa xưa (lúc mình tính lưu JWT trong localStorage). Lỗi này thường gặp khi code tiến hoá mà không dọn dẹp. Mình đã thẳng tay xoá đi vì bây giờ tất cả Auth Token đã được uỷ quyền hoàn toàn cho Cookie lo liệu, JS không cần và không được phép biết Access Token là cái gì. Cứ để rác lại, sau này đồng nghiệp vào maintain sẽ gọi nhầm hàm này và nhận ra nó return `null` suốt ngày.

### Phần 7: Future Pitfalls
> Đưa lên Render và Vercel: Cẩn thận cái "SameSite"!

Mình đã lưu ý bạn ở cuối phiên: Khi đẩy lên Render (Backend) và Vercel (Frontend), 2 thằng này nằm ở 2 domain hoàn toàn khác nhau. Cái hố sâu nhất mà 99% sinh viên/junior lọt xuống là **CORS và Cookie Cross-Domain**.
Hãy nhớ 2 chân ngôn này:
- Phải set `APP_COOKIE_SECURE=true`
- Phải set `APP_COOKIE_SAME_SITE=None`
Nếu thiếu, trình duyệt sẽ ngầm chặn toàn bộ Cookie, và chức năng Login sẽ "chạy ngon trên localhost nhưng phế hoàn toàn trên production".

### Phần 8: Expert vs Beginner
> Cách nhìn vào chức năng Đăng xuất

- **Beginner**: Viết API `/logout`. Bấm nút -> gọi API. Chuyển trang. Xong. 
- **Expert**: "Nếu API logout bị 500 thì sao? Nếu mạng rớt thì sao?". Beginner để UI bị đơ, không nhảy trang, nút bấm bấm hoài không ăn. Expert nghĩ ra luồng "Defensive Logout" (cứ clear state ở Client đi đã, Server clear cookie được thì tốt, không thì cookie hết hạn cũng tự rụng). 

### Phần 9: Transferable Lessons
> Bài học mang đi

1. **"Tài liệu phải là bản đồ của Code"**: Đừng viết tài liệu một đường, code một nẻo. Việc đánh comment `// Trace: 6B.1.1` là cách dễ nhất để sau này khỏi cãi nhau xem tài liệu có bị out-date chưa.
2. **UI độc lập với Network**: Đừng bắt UI chờ Network cho những thao tác phá huỷ (như Logout). Cứ dọn dẹp state trước để tạo cảm giác "Fast & Responsive".
3. **PlantUML Component**: Mọi sự thay đổi trên giao diện (như Toast, Redirect) bản chất là thao tác internal update (`UI -> UI`), không phải là một mũi tên Request-Response quăng thẳng vào mặt user.

---
Okay, buổi dọn dẹp cực kì hiệu quả. Auth Module giờ đã cứng như đá, sẵn sàng vác ra production thực chiến. Hẹn gặp lại bạn ở những feature phức tạp hơn nhé!

# Human Learning: Event Interaction Documentation & UML

> Tóm tắt quá trình tài liệu hóa Usecase 01: Tương tác bản đồ 3D
> Viết ngày: 15/05/2026

Chào bạn, ngồi xuống uống miếng nước đã nhé. Task vừa rồi chúng ta đã làm một việc rất "kỹ nghệ phần mềm" là đồng bộ hóa giữa **Tài liệu đặc tả (Docs)**, **Sơ đồ luồng (UML)** và **Mã nguồn (Code)** cho tính năng tương tác bản đồ. Nhìn thì tưởng chỉ là gõ vài dòng chữ, nhưng thực ra có rất nhiều quyết định thú vị bên trong. Cùng điểm lại nhé!

---

### Phần 1: Approach & Reasoning

Thay vì viết tài liệu suông rồi để đó, mình chọn cách "đóng đinh" tài liệu vào code bằng các trace comments dạng `1.1.x`. Tại sao? Vì tài liệu kỹ thuật có một lời nguyền: **Nó sẽ outdate ngay sau khi được viết ra**. Bằng cách map 1-1 giữa con số trong PlantUML và dòng comment trong `Timeline.tsx`, `Sidebar.tsx`... chúng ta tạo ra một sợi dây liên kết vô hình. Bất cứ ai đọc code cũng hình dung ra luồng UML, và ai nhìn UML cũng biết chính xác đoạn code nào đang chịu trách nhiệm.

### Phần 2: Roads Not Taken

Ban đầu, mình đã định giữ nguyên tiền tố `UC-01.` ở mọi dòng comment (kiểu `UC-01.1.10`). Nhưng sau đó mình bỏ nó đi. Tại sao? Vì code trông sẽ rất "nhiễu" và nặng nề, lại không đồng nhất với cách chúng ta đã làm ở Use case Xác thực tài khoản (UC-06). Sự nhất quán trong một codebase quan trọng hơn sự rõ ràng một cách cực đoan.

Một ngã rẽ khác là cách vẽ mũi tên trong PlantUML. Lúc đầu, mình để UI "chĩa thẳng" kết quả vào mặt người dùng (`SB --> U`). Nghe thì có lý (hệ thống phản hồi user), nhưng thực tế nó vi phạm nguyên lý. UI không bay ra ngoài màn hình đập vào mặt user được. User chỉ tương tác, và giao diện (Component) sẽ chịu trách nhiệm render thay đổi trên chính nó.

### Phần 3: How Things Connect

Tính năng này giống như một chuỗi domino. User đẩy mảnh đầu tiên (kéo Timeline) -> Timeline gọi API -> API đập vào Controller -> Service -> Repository (MySQL). Sau khi lấy data lên, mảnh domino chạy ngược lại: API -> MapPage (thay đổi state) -> Đẩy state mới xuống Sidebar và CesiumMap. Sidebar thì vẽ lại cây, Map thì cho camera bay vèo vèo tới tọa độ. Nó là một vòng khép kín. Các thao tác "lọc theo lớp" hay "click filter" chỉ là những thao tác rẽ nhánh (Optional) để tinh chỉnh bộ lọc trước khi đẩy domino thôi.

### Phần 4: Tools & Methods

Mình dùng PlantUML vì nó xịn, text-based, và quan trọng là dễ lưu trữ trong Git. Để xử lý các hành động "không bắt buộc", mình dùng thẻ `opt ... end` của PlantUML. Bằng cách này, luồng chính không bị gián đoạn, mà người đọc vẫn hiểu là user có quyền làm hoặc bỏ qua bước đó. 
Về mặt Database, trong doc mình cố tình nhấn mạnh việc dùng `NamedParameterJdbcTemplate` thay vì `JPA Entity`. Đây là "vũ khí bí mật" để hệ thống load nhanh.

### Phần 5: Tradeoffs

Chúng ta đã đánh đổi cái gì? Sự "sạch sẽ" tuyệt đối của mã nguồn lấy tính dễ truy vết (traceability). Thêm mười mấy dòng comment vào UI components làm code dài thêm một tẹo, nhưng đối với một dự án Đồ án Tốt nghiệp, việc giám khảo hoặc người review có thể nhìn vào code và nói "À, luồng này ứng với bước số 10 trong báo cáo" là một điểm cộng khổng lồ, đáng giá hơn vài chục byte dư thừa.

### Phần 6: Mistakes & Dead Ends

Sai lầm ngớ ngẩn nhất chắc chắn là cái mũi tên trỏ vào mặt User. Bạn đã chỉ ra rất chuẩn: *"làm gì có chuyện giao diện hiện trên mặt user"*. Cú quay xe này khiến mình phải cẩn thận rà soát lại mọi thứ. Giao diện nhận data và tự hiển thị (`Component -> Component: Render giao diện`), chấm hết. Một bài học nhớ đời về tư duy mô hình hóa!

### Phần 7: Future Pitfalls

Nếu bạn làm tiếp các usecase khác, hãy cẩn thận với "hiệu ứng cánh bướm" của các trace comments. Giả sử tuần sau bạn muốn chèn thêm một popup confirm vào giữa bước `1.1.12` và `1.1.13`, bạn sẽ phải đánh số lại toàn bộ từ `1.1.13` đến `1.1.20` ở CẢ BA NƠI (UML, HTML, Code). Đó là cái giá của traceability cứng. Lời khuyên là: Chỉ chốt đánh số trace comment khi luồng nghiệp vụ đã thực sự "đóng băng" (hoàn thiện).

### Phần 8: Expert vs Beginner

Một beginner sẽ viết tài liệu một đường và code một nẻo, coi chúng là hai thực thể tách biệt. Beginner dùng JPA cho mọi query kể cả lúc cần load hàng ngàn marker lên bản đồ, dẫn đến tràn RAM.
Ngược lại, tư duy Expert thể hiện ở việc biết chia khối `opt` để xử lý logic optional trong UML, và biết lôi Native SQL ra xài đúng lúc cần hiệu năng đọc tối đa.

### Phần 9: Transferable Lessons

Bài học đắt giá nhất có thể mang đi dự án khác: **"UI tự xử lý hiển thị, User chỉ gửi Action"**. Trong bất kỳ mô hình hóa hệ thống nào (từ React, Vue đến Mobile App), hãy luôn nhớ User chỉ tác động vật lý (click, drag), phần còn lại là việc nội bộ của các layer kiến trúc. Hãy dùng PlantUML `opt` khi mô phỏng giỏ hàng, bộ lọc (filter), phân quyền... bất kỳ thứ gì không nằm trên đường tiệm cận duy nhất.

Hy vọng ly cà phê này ngon, và đồ án của bạn sẽ đạt điểm tuyệt đối nhé! 🚀

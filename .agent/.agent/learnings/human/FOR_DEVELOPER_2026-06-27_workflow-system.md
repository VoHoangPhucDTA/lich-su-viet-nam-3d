# 🧠 Hệ Thống Workflow Của AI Agent — Giải Thích Bằng "Coffee Talk"

> File này giải thích toàn bộ hệ thống workflow trong `.agent/.agent/workflows/` — cách AI agent được hướng dẫn để suy nghĩ trước khi code, lưu lại bài học, và giải thích lại cho developer.

---

## Phần 1: Approach & Reasoning — Sao lại nghĩ ra mấy cái workflow này?

Hệ thống workflow sinh ra từ một vấn đề rất thực tế: **AI chạy trước khi nghĩ**.

Bạn biết cảm giác khi bảo AI "thêm tính năng X" và nó lập tức code ra 500 dòng, xài đủ thư viện hoành tráng, nhưng hỏi lại thì mới biết là nó hiểu sai yêu cầu? Workflow `plan.md` ra đời để giải quyết chính xác vấn đề đó.

Cách tiếp cận là chia nhỏ mọi thứ thành 3 pha có gate kiểm soát:
- **Pha 1 (Brainstorm)**: Chỉ được nói, không được code. Giống như kiểu "đo giày trước khi mua" — đứng suy nghĩ kỹ xem món này có thực sự cần không.
- **Pha 2 (Execute)**: Code theo đúng thiết kế đã được approve. Có checklist để không bỏ sót bước nào.
- **Pha 3 (Save Learnings)**: Ghi lại những gì vừa học được, để lần sau không phải google lại từ đầu.

Và hai workflow còn lại (`ai-learning.md` và `human-learning.md`) là "đứa con tinh thần" của pha 3 — một cái lưu kiến thức cho AI, một cái giải thích lại cho developer.

---

## Phần 2: Roads Not Taken — Những con đường không đi

### Con đường 1: Một file learning khổng lồ

Thay vì chia theo feature, có thể gom hết vào một file "tất tần tật về dự án". Nhưng vấn đề là: file đó sẽ dài như quyển sách, và khi cần tìm thông tin về notification phải scroll cả nửa tiếng.

**Tại sao loại bỏ**: AI agent chỉ cần đọc vài dòng là nhớ lại context. Một file quá to vừa tốn token vừa loãng thông tin.

### Con đường 2: Flowchart bằng diagram

Thay vì markdown, có thể dùng flowchart trực quan. Nhưng vấn đề là: agent đọc markdown nhanh hơn nhìn ảnh rất nhiều.

**Tại sao loại bỏ**: Markdown là native language của LLM. Diagram chỉ đẹp với mắt người, không giúp ích gì cho agent.

### Con đường 3: Tự động detect feature name

Workflow `ai-learning.md` yêu cầu agent tự xác định feature name từ conversation. Có thể chọn cách hỏi user "bạn muốn lưu với tên gì?" — nhưng đó là UX không tốt, vì người dùng không muốn bị làm phiền vì chuyện hành chính.

**Tại sao loại bỏ**: Tự động hóa hoàn toàn, không hỏi — trừ khi có conflict (giống như git merge conflict thì mới cần người).

---

## Phần 3: How Things Connect — Các mảnh ghép kết nối ra sao

Hãy tưởng tượng hệ thống này như một **nhà máy sản xuất kiến thức**:

```
User yêu cầu task
       ↓
[Pha 1: Brainstorm] ← Đọc learnings cũ, brainstorm với user
       ↓ (Gate: design confirmed)
[Pha 2: Execute] ← Code + Verify
       ↓ (Gate: build/lint OK)
[Pha 3: Save Learnings]
       ↓
       ├── → ai-learning.md lưu vào learnings/ (cho AI sau này)
       └── → human-learning.md lưu vào learnings/human/ (cho developer đọc)
```

Mỗi workflow không hoạt động độc lập:
- `plan.md` gọi `brainstorming` skill trong Pha 1
- `plan.md` gọi `ai-learning.md` và `human-learning.md` trong Pha 3
- `load-learnings.md` rule đảm bảo đầu mỗi session, agent tự động đọc learnings cũ

Giống như dây chuyền lắp ráp: mỗi bước có đầu vào và đầu ra rõ ràng.

---

## Phần 4: Tools & Methods — Tại sao chọn markdown?

Markdown được chọn vì 3 lý do:
1. **LLM-native**: Agent đọc và hiểu markdown cực nhanh
2. **Version control friendly**: Diff trong git rất clear
3. **Không lock-in**: Developer có thể mở bằng bất kỳ editor nào

Các alternatives:
- **JSON/YAML**: Cấu trúc tốt nhưng khó đọc với người, mất tính "coffee talk" của human-learning
- **Database**: Overkill cho mấy cái file nhỏ vài KB
- **Notion/Confluence**: Phụ thuộc vào third-party, không thể git

Kết luận: **Plain-text markdown là sweet spot** giữa machine-readable và human-readable.

---

## Phần 5: Tradeoffs — Được cái nào, mất cái nào?

| Được | Mất |
|------|-----|
| AI hiểu đúng yêu cầu trước khi code | Mất thời gian brainstorm (có thể 5-10 phút) |
| Kiến thức được lưu lại có hệ thống | Tốn chi phí lưu trữ file (không đáng kể) |
| Developer hiểu được tại sao AI làm thế | Mất thời gian viết human-learning (vài phút) |
| Giảm bug nhờ code review | Workflow hơi nặng cho task nhỏ (đổi 1 dòng) |

Tradeoff lớn nhất: **Tốc độ vs Chất lượng**. Workflow này thiên về chất lượng, phù hợp với tính năng quan trọng. Cho task "sửa màu button" thì không cần chạy cả 3 phase.

---

## Phần 6: Mistakes & Dead Ends — Những gì đã sai

### Mistake 1: Path sai `.agents/` vs `.agent/.agent/`

Khi đọc các workflow file, phát hiện tất cả đều tham chiếu đến `.agents/learnings/` — nhưng thư mục đó không tồn tại! Thực tế là `.agent/.agent/learnings/`.

**Root cause**: Ai đó đã gõ nhầm `.agents` (có 's') thay vì `.agent/.agent`. Có thể là do copy từ project khác hoặc gõ nhanh.

**Fix**: Sửa 5 file, 8 occurrences.

**Bài học**: Luôn verify path references trong documentation — đừng tin vào paths trong markdown.

### Mistake 2: Broken reference `resources/implementation-playbook.md`

`code-reviewer/SKILL.md` có dòng "mở file `resources/implementation-playbook.md`" — nhưng file đó không tồn tại.

**Root cause**: Ai đó đã viết kỳ vọng sẽ tạo file đó sau, nhưng quên mất.

**Fix**: Xóa dòng tham chiếu.

**Bài học**: Nếu reference đến file chưa tồn tại, ít nhất hãy tạo placeholder hoặc TODO comment.

---

## Phần 7: Future Pitfalls — Cạm bẫy cần tránh

1. **Path drift**: Nếu ai đó move thư mục `.agent/.agent/` đi nơi khác, tất cả paths trong workflow files sẽ sai. Hãy kiểm tra paths sau bất kỳ restructuring nào.

2. **Workflow rot**: Workflow không được维护, trở nên lỗi thời so với thực tế. Giống như documentation rot — cần定期 review.

3. **Gate fatigue**: Nếu phải brainstorm cho mọi task, developer sẽ bỏ qua workflow. Nên cho phép task siêu nhỏ (fix typo) skip gate.

4. **Learning bloat**: Nếu mỗi session đều lưu learning, thư mục learnings/ sẽ phình to. Cần strategy để cleanup học cũ, merge entries trùng.

5. **và cuối cùng**: Quên verify paths reference. Luôn double-check links và file paths trong markdown.

---

## Phần 8: Expert vs Beginner — Sự khác biệt

**Beginner** sẽ:
- Mở `plan.md` ra và làm theo y hệt từng bước, không phân biệt task lớn hay nhỏ
- Lưu learning mỗi lần, kể cả khi chỉ đổi 1 dòng code
- Viết human-learning dài 10 trang cho task 5 phút

**Expert** sẽ:
- Biết task nào cần full workflow, task nào chỉ cần execute
- Quyết định learning nào đáng lưu, learning nào chỉ là noise
- Viết human-learning ngắn gọn, chỉ tập trung vào cái khó hiểu
- Thỉnh thoảng refactor learnings/, merge entries cũ, xóa cái obsolete

Sự khác biệt lớn nhất: **Expert biết khi nào nên bỏ qua workflow** và khi nào cần tuân thủ nghiêm ngặt.

---

## Phần 9: Transferable Lessons — Bài học áp dụng cho dự án khác

1. **Gate pattern**: Bất kỳ quy trình nào có nhiều bước cũng nên có gate. Giống như CI/CD — mỗi stage phải pass mới được lên stage tiếp theo.

2. **Self-documenting system**: Thay vì doc riêng, hãy để code/workflow tự giải thích. `SKILL.md` và workflow files vừa là instruction cho AI vừa là documentation cho developer.

3. **Structured learning**: Hệ thống lưu learnings có thể áp dụng cho bất kỳ domain nào — DevOps runbooks, customer support scripts, data pipeline documentation.

4. **Coffee talk > textbook**: Khi giải thích technical concept, dùng giọng văn tự nhiên + analogies hiệu quả hơn viết như sách giáo khoa. Con người (và cả AI) nhớ stories tốt hơn nhớ facts.

5. **Path validation**: Luôn luôn kiểm tra paths trong documentation. Đây là bug phổ biến nhất trong config files và docs.

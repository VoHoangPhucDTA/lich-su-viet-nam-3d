# ☕ Homepage Release — Câu chuyện về Git, Workflow, và những file .md biết nói

> **Ngày**: 2026-06-26
> **Task**: Add toàn bộ file frontend, commit theo PR template, chạy 2 workflow AI-learning & Human-learning

---

## Phần 1: Approach & Reasoning

Chuyện bắt đầu từ một câu lệnh rất đơn giản: "add all file in frontend folder and commit". Nghe tưởng dễ — `git add frontend/ && git commit` là xong. Nhưng có 3 cái tricky:

**Thứ nhất**, commit message phải "properly" — mà "properly" là gì? Không được guess bừa. Trong project có file `PR-homepage-release.txt` đóng vai trò như một changelog/release note chính thức. Cái PR này document tất cả những gì đã thay đổi: route mới, trang Cội Nguồn, thư viện Sử liệu, Thời kỳ Lịch sử, v.v. Nên "properly" ở đây là lấy title của PR làm commit message.

**Thứ hai**, path trên Windows. Môi trường chạy Git Bash, nhưng path `F:\Desktop\...` không work — phải convert sang `/f/Desktop/...`. Cái này dễ quên nếu ai quen Linux.

**Thứ ba**, sau khi commit xong còn phải "execute" 2 file `.md` trong `.agent/workflows/`. "Execute" ở đây không phải run như script — mà là **đọc và làm theo** những gì file đó hướng dẫn. File `ai-learning.md` bảo tôi phải trích xuất kiến thức từ conversation thành file markdown có cấu trúc. File `human-learning.md` bảo viết một bài giải thích kiểu "coffee talk" cho developer hiểu.

---

## Phần 2: Roads Not Taken

### Cách tiếp cận đã xem xét nhưng từ bỏ:

1. **Dùng `git add .` thay vì `git add frontend/`**
   - Lý do từ bỏ: `git add .` sẽ stage cả file không liên quan ở root project (`.agent/`, `PR-*.txt`, `README.md`, etc.). User chỉ muốn frontend files thôi — clean và focused.

2. **Tự guess commit message kiểu "Update frontend files"**
   - Lý do từ bỏ: Quá vague. Có PR template ngay trong repo — không đọc là thiếu chuyên nghiệp. PR title đã được viết sẵn, chỉ việc lấy dùng.

3. **Chạy cả 2 workflow song song mà không check directory tồn tại**
   - Lý do từ bỏ: Cần kiểm tra `.agent/learnings/` trước — nếu đã có file cùng feature thì phải update, không tạo mới. Đây là instruction cứng trong `ai-learning.md`.

---

## Phần 3: How Things Connect

Có 3 mảnh ghép trong task này:

```
PR-homepage-release.txt (commit message template)
         │
         ▼
    git add frontend/ ───► git commit ───► 37 files committed
                                                   │
                                                   ▼
                              ┌────────────────────┴────────────────────┐
                              │                                         │
                 ai-learning.md                            human-learning.md
                              │                                         │
                              ▼                                         ▼
              .agent/learnings/                        .agent/learnings/human/
              homepage-release.md                      FOR_DEVELOPER_2026-06-26_.md
```

Dòng chảy: **Đọc tài liệu → Stage files → Commit → Học từ quá trình → Giải thích cho con người**.

Mỗi bước đều phụ thuộc vào bước trước. Không thể viết learnings trước khi biết commit có thành công không. Không thể commit trước khi biết message phải là gì.

---

## Phần 4: Tools & Methods

### Công cụ chính:

| Tool | Dùng để | Tại sao |
|---|---|---|
| **Git Bash (trên Windows)** | Chạy git commands | Môi trường mặc định, có `git` sẵn |
| **basher agent** | Execute terminal commands | Cho phép chạy command và summarize output |
| **write_file tool** | Tạo file learnings | Workflow yêu cầu ghi file markdown |

### Path quirk trên Windows:
- ❌ `F:\Desktop\CLASS\KLTN\lich-su-viet-nam-3d` — không work trong bash
- ✅ `/f/Desktop/CLASS/KLTN/lich-su-viet-nam-3d` — work trong Git Bash

Nếu không biết cái này, bạn sẽ mất 5-10 phút debug "No such file or directory" vô ích.

---

## Phần 5: Tradeoffs

### Commit message ngắn vs dài
- **Chọn**: Message ngắn gọn, chỉ lấy PR title
- **Hy sinh**: Không include detail list changes trong commit body
- **Lý do**: Git commit messages nên concise. Detail đã có trong PR description và file learnings.

### Một file AI learning duy nhất vs nhiều file nhỏ
- **Chọn**: 1 file `homepage-release.md` chứa tất cả (architecture, bugs, how-to, patterns)
- **Hy sinh**: Không tách riêng từng khía cạnh
- **Lý do**: Workflow `ai-learning.md` quy định lưu **1 file duy nhất theo tên feature** — dễ maintain

---

## Phần 6: Mistakes & Dead Ends

### Mistake 1: Path sai ngay lần đầu
```
cd F:\Desktop\CLASS\KLTN\lich-su-viet-nam-3d → No such file or directory
```
- **Fix**: Dùng `/f/Desktop/CLASS/KLTN/lich-su-viet-nam-3d`
- **Lesson**: Windows paths trong bash cần convert forward-slash style

### Mistake 2: Commit message quá dài bị truncate
- Lần đầu attempt commit với message multi-line (có body) → bị lỗi JSON parse
- **Fix**: Rút gọn commit message thành 1 dòng, không xuống dòng
- **Lesson**: Tool spawn_agents bị giới hạn độ dài string — giữ message ngắn

---

## Phần 7: Future Pitfalls

⚠️ **Ước gì ai đó nói cho tôi sớm hơn:**

1. **CRLF warnings là vô hại** — Git trên Windows luôn complain về LF/CRLF. Ignore nó.

2. **Workflow .md files không phải để execute** — Đừng tìm cách `bash ai-learning.md` hay gì đó. "Execute" ở đây là đọc instructions và làm theo.

3. **Kiểm tra directory learnings TRƯỚC khi tạo file** — Nếu đã có file cùng feature, phải update, không tạo mới. Nếu không, bạn sẽ duplicate effort.

4. **Commit message không cần phải hoàn hảo** — Chỉ cần reflect đúng nội dung release. Detail có thể để trong PR description hoặc changelog.

---

## Phần 8: Expert vs Beginner

**Beginner sẽ**: Chạy `git add .`, commit với message "update", rồi quên mất chuyện gì đã xảy ra.

**Expert sẽ**:
1. Đọc file PR/documentation để biết context — không bao giờ làm mà không hiểu
2. Chỉ stage đúng folder cần thiết (`frontend/`) — không lôi theo file rác
3. Dùng PR title làm commit message — maintain consistency với release notes
4. Tận dụng cơ hội để extract learnings — mỗi lần commit là một lần học

Sự khác biệt: **Expert nghĩ về hệ thống, beginner chỉ nghĩ về command cần gõ.**

---

## Phần 9: Transferable Lessons

Những bài học áp dụng được cho projects hoàn toàn khác:

1. **"Read the docs first" không phải cliché** — File PR-homepage-release.txt tồn tại vì một lý do. Trong bất kỳ project nào, luôn kiểm tra xem có documentation/convention guide trước khi làm.

2. **Git commit messages nên có pattern** — Dùng category prefix như `[Homepage Release]` giúp người khác (và future you) hiểu ngay scope của commit.

3. **Workflow dạng .md rất mạnh** — Thay vì script cứng nhắc, dùng markdown làm "executable documentation" cho AI. Vừa con người đọc được, vừa AI hiểu được.

4. **Clean up trước khi move on** — Stage đúng files, commit clean, ghi lại learnings. Đừng để technical debt accumulate trong git history.

5. **Paths are not portable** — Windows vs Linux path format luôn là cái bẫy. Kiểm tra environment trước khi hardcode path.

---

*"A commit message is not just a label — it's a letter to your future self (and your teammates). Write it like you mean it."*

# Workflow Specs

> Tổng hợp kiến thức về hệ thống workflow cho AI agent trong dự án.
> Cập nhật lần cuối: 2026-06-27

---

## Architecture

### Task Execute Workflow (3-Phase)
- **Ngày**: 2026-06-27
- **Chi tiết**: Hệ thống gồm 3 pha: Brainstorm (thiết kế + xác nhận) → Execute (code theo checklist + verify) → Save Learnings (tự động lưu). Mỗi pha có gate kiểm soát: không được execute nếu chưa có design confirmed; không được save learnings nếu build/lint còn lỗi.
- **Files liên quan**: `.agent/.agent/workflows/plan.md`

### AI Learning Workflow
- **Ngày**: 2026-06-27
- **Chi tiết**: Trích xuất kiến thức từ conversation thành 4 nhóm (Architecture, Bugs & Solutions, How-To, Patterns) và lưu vào 1 file duy nhất theo tên feature. File được merge thông minh: entries cùng topic → cập nhật, entries mới → thêm, entries cũ lỗi thời → sửa.
- **Files liên quan**: `.agent/.agent/workflows/ai-learning.md`

### Human Learning Workflow
- **Ngày**: 2026-06-27
- **Chi tiết**: Viết file markdown kiểu "coffee talk" gồm 9 phần (Approach, Roads Not Taken, How Things Connect, Tools, Tradeoffs, Mistakes, Future Pitfalls, Expert vs Beginner, Transferable Lessons) để developer hiểu sâu quá trình thực hiện task. Viết bằng tiếng Việt, giọng tự nhiên, dùng analogies.
- **Files liên quan**: `.agent/.agent/workflows/human-learning.md`

---

## Bugs & Solutions

### Path References Sai (.agents/ vs .agent/.agent/)
- **Ngày**: 2026-06-27
- **Vấn đề**: 5 file workflow/rules tham chiếu đến `.agents/learnings/` (với 's') nhưng thư mục thực tế là `.agent/.agent/learnings/`.
- **Root cause**: Copy-paste error khi tạo cấu trúc thư mục.
- **Fix**: Thay `.agents/learnings/` thành `.agent/.agent/learnings/` ở ai-learning.md, human-learning.md, plan.md, load-learnings.md.
- **Files liên quan**: `workflows/ai-learning.md`, `workflows/human-learning.md`, `workflows/plan.md`, `rules/load-learnings.md`

### Broken Reference trong code-reviewer SKILL.md
- **Ngày**: 2026-06-27
- **Vấn đề**: Tham chiếu đến `resources/implementation-playbook.md` nhưng thư mục resources/ không tồn tại.
- **Fix**: Xóa dòng tham chiếu.
- **Files liên quan**: `skills/code-reviewer/SKILL.md`

---

## How-To

### Cách thêm workflow mới
- **Ngày**: 2026-06-27
- **Bước thực hiện**:
  1. Tạo file `.md` trong `.agent/.agent/workflows/`
  2. Thêm YAML frontmatter với `description`
  3. Viết quy trình step-by-step, dùng markdown headings
- **Files liên quan**: `.agent/.agent/workflows/`

### Cách thêm skill mới
- **Ngày**: 2026-06-27
- **Bước thực hiện**:
  1. Tạo thư mục `tên-skill/` trong `.agent/.agent/skills/`
  2. Tạo `SKILL.md` với YAML frontmatter (name, description, risk, source, date_added)
  3. Viết sections: "Khi nào sử dụng", "Giới hạn", và nội dung chính
- **Files liên quan**: `.agent/.agent/skills/`

---

## Patterns

### Cấu trúc thư mục .agent/.agent/
- **Ngày**: 2026-06-27
- **Chi tiết**: Dùng cấu trúc nested `.agent/.agent/` để phân tách rõ ràng: `learnings/` (kiến thức đã lưu), `rules/` (rules tự động), `skills/` (kỹ năng AI), `workflows/` (quy trình thực thi). Mỗi skill là một thư mục con chứa `SKILL.md`.

### YAML Frontmatter Pattern cho Skills
- **Ngày**: 2026-06-27
- **Chi tiết**: Mỗi SKILL.md cần frontmatter: `name`, `description`, `risk: unknown`, `source: community`, `date_added`. Các sections bắt buộc: "Khi nào sử dụng", "Giới hạn", và nội dung chuyên môn.
- **Files liên quan**: `.agent/.agent/skills/*/SKILL.md`

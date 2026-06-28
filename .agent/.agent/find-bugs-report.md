# Find Bugs Report — `.agent/.agent/skills/` SKILL.md Files

**Date**: 2026-06-27
**Method**: find-bugs skill (5-phase process)

---

## Phase 1: Files Reviewed

| # | File | Size | Language |
|---|------|------|----------|
| 1 | `skills/brainstorming/SKILL.md` | 7,525 | Vietnamese |
| 2 | `skills/code-reviewer/SKILL.md` | 10,942 | Vietnamese |
| 3 | `skills/find-bugs/SKILL.md` | 4,601 | Vietnamese |
| 4 | `skills/karpathy-guidelines/SKILL.md` | 2,585 | English |

## Phase 2: Attack Surface (for markdown docs)

- External file references (broken links)
- Path references (wrong directories)
- YAML frontmatter consistency
- Required section completeness

## Phase 3: Checklist — Issues Found

### [BUG-01] Broken Reference — `code-reviewer/SKILL.md:24`
- **File:Dòng**: `skills/code-reviewer/SKILL.md:24`
- **Mức độ**: Trung bình
- **Vấn đề**: Dòng 24 tham chiếu tới `resources/implementation-playbook.md` nhưng thư mục `resources/` không tồn tại trong dự án.
- **Bằng chứng**: `ls -la .agent/.agent/resources/` trả về lỗi "No such file or directory".
- **Cách sửa**: Xóa dòng tham chiếu hoặc thay bằng link thực tế.
- **Tham khảo**: File SKILL.md, dòng "Nếu cần ví dụ chi tiết, mở file `resources/implementation-playbook.md`."

### [BUG-02] Wrong Path — `.agents/` (với 's') không tồn tại
- **File:Dòng**: 5 files affected
  - `workflows/ai-learning.md:2,15,50`
  - `workflows/human-learning.md:21`
  - `workflows/plan.md:17`
  - `rules/load-learnings.md:2,16`
- **Mức độ**: Cao
- **Vấn đề**: Các file tham chiếu đến `.agents/learnings/` (với chữ 's') nhưng thư mục này KHÔNG tồn tại. Thư mục thực tế là `.agent/.agent/learnings/`.
- **Bằng chứng**: `ls -la .agents/` trả về lỗi; thư mục thực tế là `.agent/.agent/learnings/`.
- **Cách sửa**: Thay `.agents/learnings/` bằng `.agent/.agent/learnings/` ở tất cả 5 file.
- **Tham khảo**: Kiểm tra thư mục thực tế trong dự án.

### [BUG-03] Missing Metadata — `find-bugs/SKILL.md` thiếu `date_added`
- **File:Dòng**: `skills/find-bugs/SKILL.md:1-6`
- **Mức độ**: Thấp
- **Vấn đề**: Thiếu trường `date_added` trong YAML frontmatter. Các skill khác (`brainstorming`, `code-reviewer`) đều có `date_added: "2026-02-27"`.
- **Bằng chứng**: So sánh frontmatter giữa các file.
- **Cách sửa**: Thêm `date_added: "2026-02-27"` vào frontmatter.

### [BUG-04] Inconsistent Frontmatter — `karpathy-guidelines/SKILL.md`
- **File:Dòng**: `skills/karpathy-guidelines/SKILL.md:1-6`
- **Mức độ**: Thấp
- **Vấn đề**: Dùng `license: MIT` thay vì `risk: unknown`, `source: community`. Thiếu `date_added`.
- **Bằng chứng**: Các SKILL.md khác đều có risk, source, date_added.
- **Ghi chú**: Đây là imported community skill nên format khác có thể chấp nhận được. Không fix trừ khi có chỉ định.

### [BUG-05] Missing Sections — `karpathy-guidelines/SKILL.md`
- **File:Dòng**: `skills/karpathy-guidelines/SKILL.md` (toàn bộ)
- **Mức độ**: Thấp
- **Vấn đề**: Thiếu "Khi nào sử dụng" và "Giới hạn" sections (có trong tất cả skill khác).
- **Ghi chú**: Tương tự BUG-04, imported skill nên format khác có thể chấp nhận.

## Phase 4: Verification

All issues above verified as real by checking actual file system paths.

## Phase 5: Pre-conclusion Check

| File reviewed | Read completely |
|---|---|
| brainstorming/SKILL.md | ✅ |
| code-reviewer/SKILL.md | ✅ |
| find-bugs/SKILL.md | ✅ |
| karpathy-guidelines/SKILL.md | ✅ |

**Checklist items verified**: Broken references ✅, Paths ✅, Metadata ✅, Sections ✅

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| Cao | 1 | BUG-02: Wrong paths in 5 files |
| Trung bình | 1 | BUG-01: Broken file reference |
| Thấp | 2 | BUG-03: Missing date_added; BUG-04/05: Karpathy format |

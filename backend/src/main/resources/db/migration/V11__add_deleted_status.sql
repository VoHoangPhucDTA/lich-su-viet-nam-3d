-- ═══════════════════════════════════════════════════════════════════════════════
-- V11: Thêm trạng thái 'deleted' vào ENUM của users.status
--
-- Lý do: Tính năng "Xoá tài khoản vĩnh viễn" (soft delete) cần set status='deleted'
-- khi người dùng xoá tài khoản. ENUM cũ chỉ cho phép 'active', 'disabled', 'pending'.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE users
    MODIFY COLUMN status ENUM('active', 'disabled', 'pending', 'deleted')
        NOT NULL DEFAULT 'active';

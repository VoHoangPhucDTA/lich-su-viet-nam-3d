ALTER TABLE admin_mutation_guards
    ADD COLUMN active_admin_count BIGINT NOT NULL DEFAULT 0;

UPDATE admin_mutation_guards
SET active_admin_count = (
    SELECT COUNT(DISTINCT u.id)
    FROM users u
    JOIN user_roles ur ON ur.user_id=u.id
    JOIN roles r ON r.id=ur.role_id
    WHERE u.status='active' AND r.code='admin'
)
WHERE guard_key='last_active_admin';

ALTER TABLE users
    DROP CHECK chk_users_grade;

ALTER TABLE users
    MODIFY grade VARCHAR(20) NULL,
    ADD COLUMN email_verified_at DATETIME NULL AFTER status,
    ADD COLUMN failed_login_count INT NOT NULL DEFAULT 0 AFTER email_verified_at,
    ADD COLUMN locked_until DATETIME NULL AFTER failed_login_count,
    ADD CONSTRAINT chk_users_grade_v9 CHECK (grade IS NULL OR grade IN ('10', '11', '12', 'other'));

CREATE TABLE auth_email_tokens (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BINARY(16) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    token_type ENUM('email_verification', 'password_reset') NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_auth_email_tokens PRIMARY KEY (id),
    CONSTRAINT uk_auth_email_tokens_hash UNIQUE (token_hash),
    CONSTRAINT fk_auth_email_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_auth_email_tokens_user_type
ON auth_email_tokens (user_id, token_type, created_at);

CREATE INDEX idx_auth_email_tokens_expiry
ON auth_email_tokens (expires_at, used_at);

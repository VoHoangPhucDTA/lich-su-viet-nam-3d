-- V10: Social OAuth support
-- 1. Allow password_hash to be NULL for social-only accounts
--    (existing local accounts keep their hash; no data loss)
ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL;

-- 2. Social provider link table (many-to-one with users)
--    One user can link multiple providers (google + facebook in future).
--    One (provider, provider_id) pair maps to exactly one user.
CREATE TABLE user_social_providers (
    id           BIGINT        NOT NULL AUTO_INCREMENT,
    user_id      BINARY(16)    NOT NULL,
    provider     VARCHAR(20)   NOT NULL,    -- 'google' | 'facebook'
    provider_id  VARCHAR(255)  NOT NULL,    -- 'sub' from Google tokeninfo
    email        VARCHAR(255)  NULL,        -- email as returned by provider (audit trail)
    display_name VARCHAR(255)  NULL,        -- full name from provider at time of link
    avatar_url   VARCHAR(1000) NULL,        -- picture URL from provider at time of link
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_usp  PRIMARY KEY (id),
    -- One provider identity belongs to at most one account
    CONSTRAINT uk_usp_provider UNIQUE (provider, provider_id),
    CONSTRAINT fk_usp_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Fast lookup: all social providers for a given user
CREATE INDEX idx_usp_user_id ON user_social_providers (user_id);

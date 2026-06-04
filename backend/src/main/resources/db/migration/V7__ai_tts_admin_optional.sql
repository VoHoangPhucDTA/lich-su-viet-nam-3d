CREATE TABLE rag_index_status (
    id BIGINT NOT NULL AUTO_INCREMENT,
    event_id VARCHAR(160) NOT NULL,
    content_hash CHAR(64) NOT NULL,
    collection_name VARCHAR(120) NOT NULL,
    chunk_count INT NOT NULL DEFAULT 0,
    status ENUM('pending', 'indexed', 'failed', 'stale') NOT NULL DEFAULT 'pending',
    indexed_at DATETIME NULL,
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_rag_index_status PRIMARY KEY (id),
    CONSTRAINT fk_rag_index_status_event FOREIGN KEY (event_id) REFERENCES historical_events (id) ON DELETE CASCADE,
    CONSTRAINT uk_rag_event_collection UNIQUE (event_id, collection_name),
    CONSTRAINT chk_rag_index_status_chunks CHECK (chunk_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_rag_status
ON rag_index_status (status, updated_at);

CREATE TABLE tts_requests (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BINARY(16) NULL,
    event_id VARCHAR(160) NULL,
    text_hash CHAR(64) NOT NULL,
    voice VARCHAR(80) NOT NULL,
    speed DECIMAL(3, 2) NOT NULL DEFAULT 1.00,
    provider VARCHAR(80) NOT NULL,
    audio_url VARCHAR(1000) NULL,
    status ENUM('pending', 'success', 'failed') NOT NULL DEFAULT 'pending',
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_tts_requests PRIMARY KEY (id),
    CONSTRAINT fk_tts_requests_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_tts_requests_event FOREIGN KEY (event_id) REFERENCES historical_events (id) ON DELETE SET NULL,
    CONSTRAINT uk_tts_cache UNIQUE (text_hash, voice, speed, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_tts_event
ON tts_requests (event_id);

CREATE INDEX idx_tts_user_created
ON tts_requests (user_id, created_at);

CREATE TABLE event_provinces (
    event_id VARCHAR(160) NOT NULL,
    province_name VARCHAR(120) NOT NULL,
    role ENUM('primary', 'secondary', 'related') NOT NULL DEFAULT 'primary',
    sort_order INT NOT NULL DEFAULT 0,
    CONSTRAINT pk_event_provinces PRIMARY KEY (event_id, province_name, role),
    CONSTRAINT fk_event_provinces_event FOREIGN KEY (event_id) REFERENCES historical_events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_event_provinces_name
ON event_provinces (province_name, event_id);

CREATE TABLE admin_audit_logs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BINARY(16) NULL,
    action VARCHAR(120) NOT NULL,
    entity_type VARCHAR(120) NOT NULL,
    entity_id VARCHAR(180) NULL,
    before_json JSON NULL,
    after_json JSON NULL,
    ip_address VARCHAR(80) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_admin_audit_logs PRIMARY KEY (id),
    CONSTRAINT fk_admin_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_admin_audit_entity
ON admin_audit_logs (entity_type, entity_id, created_at);

CREATE INDEX idx_admin_audit_user
ON admin_audit_logs (user_id, created_at);

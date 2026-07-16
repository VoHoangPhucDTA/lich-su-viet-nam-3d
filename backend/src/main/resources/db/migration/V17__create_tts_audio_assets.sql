CREATE TABLE tts_audio_assets (
    id CHAR(36) NOT NULL,
    cache_key CHAR(64) NOT NULL,
    event_id VARCHAR(160) NOT NULL,
    text_hash CHAR(64) NOT NULL,

    provider VARCHAR(80) NOT NULL,
    voice VARCHAR(80) NOT NULL,
    synthesis_speed DECIMAL(3, 2) NOT NULL DEFAULT 1.00,
    audio_format VARCHAR(20) NOT NULL DEFAULT 'mp3',
    return_option INT NOT NULL DEFAULT 3,
    without_filter BOOLEAN NOT NULL DEFAULT FALSE,
    text_processing_version VARCHAR(40) NOT NULL,

    storage_provider VARCHAR(40) NULL,
    storage_public_id VARCHAR(255) NULL,
    audio_url VARCHAR(1000) NULL,
    mime_type VARCHAR(120) NULL,
    file_size BIGINT NULL,
    duration_ms BIGINT NULL,

    status VARCHAR(20) NOT NULL,
    claimed_at DATETIME NULL,
    last_attempt_at DATETIME NULL,
    attempt_count INT NOT NULL DEFAULT 0,

    error_code VARCHAR(80) NULL,
    error_message TEXT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_tts_audio_assets PRIMARY KEY (id),
    CONSTRAINT uk_tts_audio_assets_cache_key UNIQUE (cache_key),
    CONSTRAINT fk_tts_audio_assets_event FOREIGN KEY (event_id) REFERENCES historical_events (id) ON DELETE RESTRICT,
    CONSTRAINT chk_tts_audio_assets_attempt_count CHECK (attempt_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_tts_audio_assets_event_id
ON tts_audio_assets (event_id);

CREATE INDEX idx_tts_audio_assets_status_updated_at
ON tts_audio_assets (status, updated_at);

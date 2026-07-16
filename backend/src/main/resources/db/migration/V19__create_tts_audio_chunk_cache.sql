CREATE TABLE tts_audio_chunks (
    id CHAR(36) NOT NULL,
    chunk_key CHAR(64) NOT NULL,
    chunk_text TEXT NOT NULL,
    text_hash CHAR(64) NOT NULL,

    provider VARCHAR(80) NOT NULL,
    voice VARCHAR(80) NOT NULL,
    synthesis_speed DECIMAL(3, 2) NOT NULL DEFAULT 1.00,
    audio_format VARCHAR(20) NOT NULL DEFAULT 'mp3',
    return_option INT NOT NULL DEFAULT 3,
    without_filter BOOLEAN NOT NULL DEFAULT FALSE,
    text_processing_version VARCHAR(40) NOT NULL,
    chunking_version VARCHAR(40) NOT NULL,

    status VARCHAR(20) NOT NULL,
    claim_token VARCHAR(36) NULL,
    claim_expires_at DATETIME NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    last_attempt_at DATETIME NULL,
    error_code VARCHAR(80) NULL,
    error_message TEXT NULL,

    storage_provider VARCHAR(40) NULL,
    storage_public_id VARCHAR(255) NULL,
    audio_url VARCHAR(1000) NULL,
    mime_type VARCHAR(120) NULL,
    file_size BIGINT NULL,
    duration_ms BIGINT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_tts_audio_chunks PRIMARY KEY (id),
    CONSTRAINT uk_tts_audio_chunks_chunk_key UNIQUE (chunk_key),
    CONSTRAINT chk_tts_audio_chunks_attempt_count CHECK (attempt_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_tts_audio_chunks_status_claim_expires_at
ON tts_audio_chunks (status, claim_expires_at);

CREATE TABLE tts_audio_asset_chunks (
    asset_id CHAR(36) NOT NULL,
    chunk_id CHAR(36) NOT NULL,
    chunk_index INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_tts_audio_asset_chunks PRIMARY KEY (asset_id, chunk_index),
    CONSTRAINT uk_tts_audio_asset_chunks_chunk UNIQUE (asset_id, chunk_id, chunk_index),
    CONSTRAINT fk_tts_audio_asset_chunks_asset FOREIGN KEY (asset_id)
        REFERENCES tts_audio_assets (id) ON DELETE RESTRICT,
    CONSTRAINT fk_tts_audio_asset_chunks_chunk FOREIGN KEY (chunk_id)
        REFERENCES tts_audio_chunks (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_tts_audio_asset_chunks_chunk_id
ON tts_audio_asset_chunks (chunk_id);

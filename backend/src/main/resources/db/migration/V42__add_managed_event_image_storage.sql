ALTER TABLE event_media
    ADD COLUMN managed_asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN storage_provider VARCHAR(32) NULL,
    ADD COLUMN storage_public_id VARCHAR(255) NULL,
    ADD COLUMN storage_asset_id VARCHAR(255) NULL,
    ADD COLUMN storage_original_url VARCHAR(1000) NULL,
    ADD COLUMN storage_version BIGINT NULL,
    ADD COLUMN storage_mime_type VARCHAR(100) NULL,
    ADD COLUMN storage_format VARCHAR(16) NULL,
    ADD COLUMN storage_byte_size BIGINT NULL,
    ADD COLUMN storage_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN storage_width INT NULL,
    ADD COLUMN storage_height INT NULL,
    ADD COLUMN uploaded_by BINARY(16) NULL,
    ADD COLUMN uploaded_at DATETIME(6) NULL,
    ADD COLUMN storage_state VARCHAR(24) NOT NULL DEFAULT 'UNMANAGED',
    ADD COLUMN upload_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN upload_started_at DATETIME(6) NULL,
    ADD COLUMN upload_expires_at DATETIME(6) NULL;

ALTER TABLE event_media
    ADD CONSTRAINT chk_event_media_storage_state
        CHECK (storage_state IN (
            'UNMANAGED', 'UPLOADING', 'READY', 'DELETE_PENDING', 'DELETE_FAILED'
        ));

ALTER TABLE event_media
    ADD CONSTRAINT chk_event_media_storage_byte_size
        CHECK (storage_byte_size IS NULL OR storage_byte_size > 0);

ALTER TABLE event_media
    ADD CONSTRAINT chk_event_media_storage_dimensions
        CHECK (
            (storage_width IS NULL AND storage_height IS NULL)
            OR (
                storage_width IS NOT NULL
                AND storage_height IS NOT NULL
                AND storage_width > 0
                AND storage_height > 0
            )
        );

CREATE UNIQUE INDEX uk_event_media_managed_asset
    ON event_media (managed_asset_id);

CREATE UNIQUE INDEX uk_event_media_storage_identity
    ON event_media (storage_provider, storage_public_id);

CREATE INDEX idx_event_media_managed_read
    ON event_media (event_id, storage_state, status, is_thumbnail, sort_order, id);

CREATE INDEX idx_event_media_upload_expiry
    ON event_media (storage_state, upload_expires_at, id);

ALTER TABLE event_media
    ADD CONSTRAINT fk_event_media_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL;

CREATE TABLE event_media_storage_cleanup_tasks (
    id BIGINT NOT NULL AUTO_INCREMENT,
    provider VARCHAR(32) NOT NULL,
    public_id VARCHAR(255) NOT NULL,
    provider_asset_id VARCHAR(255) NULL,
    operation VARCHAR(24) NOT NULL,
    task_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME(6) NOT NULL,
    claim_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    claim_expires_at DATETIME(6) NULL,
    last_error_code VARCHAR(64) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_event_media_storage_cleanup_tasks PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE event_media_storage_cleanup_tasks
    ADD CONSTRAINT chk_event_media_cleanup_operation
        CHECK (operation IN ('DELETE'));

ALTER TABLE event_media_storage_cleanup_tasks
    ADD CONSTRAINT chk_event_media_cleanup_status
        CHECK (task_status IN ('PENDING', 'CLAIMED', 'COMPLETED', 'FAILED'));

ALTER TABLE event_media_storage_cleanup_tasks
    ADD CONSTRAINT chk_event_media_cleanup_attempts
        CHECK (attempts >= 0);

CREATE UNIQUE INDEX uk_event_media_cleanup_identity
    ON event_media_storage_cleanup_tasks (provider, public_id, operation);

CREATE INDEX idx_event_media_cleanup_claim
    ON event_media_storage_cleanup_tasks
        (task_status, next_attempt_at, claim_expires_at, id);

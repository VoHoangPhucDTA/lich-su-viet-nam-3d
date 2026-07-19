CREATE TABLE event_textbook_contents (
    event_id VARCHAR(160) NOT NULL,
    content MEDIUMTEXT NULL,
    content_status VARCHAR(40) NOT NULL,
    content_source VARCHAR(40) NOT NULL,
    reference_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    grade_scope VARCHAR(32) NULL,
    correction_note TEXT NULL,
    content_hash CHAR(64) NULL,
    verified_at DATETIME NULL,
    verified_by VARCHAR(100) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_event_textbook_contents PRIMARY KEY (event_id),
    CONSTRAINT chk_event_textbook_contents_reference_count CHECK (reference_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_event_textbook_contents_status
ON event_textbook_contents (content_status, updated_at);

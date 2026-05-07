CREATE TABLE data_import_runs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    source_name VARCHAR(255) NOT NULL,
    source_path VARCHAR(1000) NULL,
    source_hash CHAR(64) NULL,
    import_type ENUM('event_json', 'media', 'textbook_ref', 'rag_seed') NOT NULL,
    event_count INT NOT NULL DEFAULT 0,
    created_count INT NOT NULL DEFAULT 0,
    updated_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    status ENUM('running', 'success', 'failed', 'partial') NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    error_log MEDIUMTEXT NULL,
    CONSTRAINT pk_data_import_runs PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_import_runs_status_started
ON data_import_runs (status, started_at);

CREATE TABLE import_run_events (
    id BIGINT NOT NULL AUTO_INCREMENT,
    import_run_id BIGINT NOT NULL,
    event_id VARCHAR(160) NOT NULL,
    action ENUM('created', 'updated', 'skipped', 'failed') NOT NULL,
    old_content_hash CHAR(64) NULL,
    new_content_hash CHAR(64) NULL,
    message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_import_run_events PRIMARY KEY (id),
    CONSTRAINT fk_import_run_events_run FOREIGN KEY (import_run_id) REFERENCES data_import_runs (id) ON DELETE CASCADE,
    CONSTRAINT fk_import_run_events_event FOREIGN KEY (event_id) REFERENCES historical_events (id) ON DELETE CASCADE,
    CONSTRAINT uk_import_run_event UNIQUE (import_run_id, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_import_run_events_run
ON import_run_events (import_run_id);

CREATE INDEX idx_import_run_events_event
ON import_run_events (event_id);

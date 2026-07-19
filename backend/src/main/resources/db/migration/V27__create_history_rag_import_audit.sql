CREATE TABLE history_rag_import_changes (
    id BIGINT NOT NULL AUTO_INCREMENT,
    run_id BIGINT NULL,
    section VARCHAR(80) NOT NULL,
    record_key VARCHAR(255) NOT NULL,
    operation VARCHAR(32) NOT NULL,
    before_json JSON NULL,
    after_json JSON NULL,
    status VARCHAR(32) NOT NULL,
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_history_rag_import_changes PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_history_rag_import_changes_run
ON history_rag_import_changes (run_id, section, created_at);

CREATE INDEX idx_history_rag_import_changes_record
ON history_rag_import_changes (record_key, created_at);

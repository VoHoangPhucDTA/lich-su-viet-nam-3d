CREATE TABLE source_catalog (
    id BIGINT NOT NULL AUTO_INCREMENT,
    import_key VARCHAR(64) NULL,
    dedupe_key CHAR(64) NOT NULL,
    source_type VARCHAR(32) NOT NULL,
    title VARCHAR(1000) NOT NULL,
    canonical_uri VARCHAR(2048) NULL,
    external_id VARCHAR(128) NULL,
    language VARCHAR(16) NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_source_catalog PRIMARY KEY (id),
    CONSTRAINT uk_source_catalog_dedupe_key UNIQUE (dedupe_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_source_catalog_import_key
ON source_catalog (import_key);

CREATE INDEX idx_source_catalog_type_internal
ON source_catalog (source_type, is_internal);

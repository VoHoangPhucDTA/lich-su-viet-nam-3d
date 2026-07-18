CREATE TABLE event_textbook_content_refs (
    event_id VARCHAR(160) NOT NULL,
    textbook_ref_id BIGINT NOT NULL,
    source_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT pk_event_textbook_content_refs PRIMARY KEY (event_id, textbook_ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_event_textbook_content_refs_ref
ON event_textbook_content_refs (textbook_ref_id, source_order);

CREATE TABLE event_research_sources (
    event_id VARCHAR(160) NOT NULL,
    source_id BIGINT NOT NULL,
    source_order SMALLINT UNSIGNED NOT NULL,
    source_role VARCHAR(100) NULL,
    usage_note TEXT NULL,
    verification_status VARCHAR(40) NOT NULL,
    CONSTRAINT pk_event_research_sources PRIMARY KEY (event_id, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_event_research_sources_source
ON event_research_sources (source_id, source_order);

CREATE TABLE event_external_sources (
    event_id VARCHAR(160) NOT NULL,
    source_id BIGINT NOT NULL,
    source_order SMALLINT UNSIGNED NOT NULL,
    match_type VARCHAR(40) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    verification_status VARCHAR(40) NOT NULL,
    notes TEXT NULL,
    CONSTRAINT pk_event_external_sources PRIMARY KEY (event_id, source_id, match_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_event_external_sources_source
ON event_external_sources (source_id, source_order);

CREATE INDEX idx_event_external_sources_selection
ON event_external_sources (event_id, match_type, is_primary, source_order);

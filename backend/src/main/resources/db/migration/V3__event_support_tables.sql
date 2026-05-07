CREATE TABLE event_grades (
    event_id VARCHAR(160) NOT NULL,
    grade TINYINT NOT NULL,
    CONSTRAINT pk_event_grades PRIMARY KEY (event_id, grade),
    CONSTRAINT fk_event_grades_event FOREIGN KEY (event_id) REFERENCES historical_events (id) ON DELETE CASCADE,
    CONSTRAINT chk_event_grades_grade CHECK (grade IN (10, 11, 12))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_event_grades_grade_event
ON event_grades (grade, event_id);

CREATE TABLE event_textbook_refs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    event_id VARCHAR(160) NOT NULL,
    grade TINYINT NOT NULL,
    book VARCHAR(255) NOT NULL,
    theme VARCHAR(500) NULL,
    lesson VARCHAR(500) NULL,
    page_start INT NULL,
    page_end INT NULL,
    excerpt TEXT NULL,
    source_key VARCHAR(180) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_event_textbook_refs PRIMARY KEY (id),
    CONSTRAINT fk_event_textbook_refs_event FOREIGN KEY (event_id) REFERENCES historical_events (id) ON DELETE CASCADE,
    CONSTRAINT chk_event_textbook_refs_grade CHECK (grade IN (10, 11, 12)),
    CONSTRAINT chk_event_textbook_refs_pages CHECK (
        page_start IS NULL OR page_end IS NULL OR page_end >= page_start
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_refs_event
ON event_textbook_refs (event_id);

CREATE INDEX idx_refs_grade_lesson
ON event_textbook_refs (grade, lesson);

CREATE INDEX idx_refs_source_key
ON event_textbook_refs (source_key);

CREATE TABLE event_media (
    id BIGINT NOT NULL AUTO_INCREMENT,
    event_id VARCHAR(160) NOT NULL,
    media_type ENUM('image', 'video', 'document', 'audio') NOT NULL,
    url VARCHAR(1000) NOT NULL,
    caption VARCHAR(1000) NULL,
    alt_text VARCHAR(500) NULL,
    source_name VARCHAR(255) NULL,
    license VARCHAR(255) NULL,
    storage_type ENUM('local', 'external', 'object_storage') NOT NULL DEFAULT 'external',
    is_thumbnail BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    status ENUM('active', 'missing', 'hidden') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_event_media PRIMARY KEY (id),
    CONSTRAINT fk_event_media_event FOREIGN KEY (event_id) REFERENCES historical_events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_media_event_order
ON event_media (event_id, sort_order);

CREATE INDEX idx_media_event_thumb
ON event_media (event_id, is_thumbnail);

CREATE TABLE event_relations (
    id BIGINT NOT NULL AUTO_INCREMENT,
    source_event_id VARCHAR(160) NOT NULL,
    target_event_id VARCHAR(160) NOT NULL,
    relation_type ENUM('related', 'predecessor', 'successor', 'same_topic', 'same_location') NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_event_relations PRIMARY KEY (id),
    CONSTRAINT fk_event_relations_source FOREIGN KEY (source_event_id) REFERENCES historical_events (id) ON DELETE CASCADE,
    CONSTRAINT fk_event_relations_target FOREIGN KEY (target_event_id) REFERENCES historical_events (id) ON DELETE CASCADE,
    CONSTRAINT uk_event_relation UNIQUE (source_event_id, target_event_id, relation_type),
    CONSTRAINT chk_event_relations_not_self CHECK (source_event_id <> target_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_relation_source_type
ON event_relations (source_event_id, relation_type, sort_order);

CREATE INDEX idx_relation_target_type
ON event_relations (target_event_id, relation_type);

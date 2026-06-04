CREATE TABLE historical_events (
    id VARCHAR(160) NOT NULL,
    slug VARCHAR(180) NOT NULL,
    title VARCHAR(500) NOT NULL,
    short_title VARCHAR(255) NULL,
    event_level ENUM('collection', 'atomic') NOT NULL,
    event_type ENUM('military', 'political', 'economic', 'cultural') NOT NULL,
    event_subtype VARCHAR(120) NULL,
    start_year INT NOT NULL,
    end_year INT NULL,
    effective_end_year INT NOT NULL,
    display_date VARCHAR(120) NULL,
    date_precision VARCHAR(40) NULL,
    geo_type ENUM('single_point', 'multi_region', 'nationwide', 'no_location') NOT NULL,
    lat DECIMAL(10, 7) NULL,
    lng DECIMAL(10, 7) NULL,
    province_names JSON NULL,
    historical_locations JSON NULL,
    parent_id VARCHAR(160) NULL,
    root_id VARCHAR(160) NULL,
    level INT NOT NULL DEFAULT 0,
    order_in_parent INT NOT NULL DEFAULT 0,
    card_summary VARCHAR(1000) NULL,
    canonical_summary TEXT NULL,
    detailed_narrative MEDIUMTEXT NULL,
    significance TEXT NULL,
    show_on_homepage BOOLEAN NOT NULL DEFAULT TRUE,
    show_on_timeline BOOLEAN NOT NULL DEFAULT TRUE,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'published',
    content_hash CHAR(64) NULL,
    raw_json JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    published_at DATETIME NULL,
    CONSTRAINT pk_historical_events PRIMARY KEY (id),
    CONSTRAINT uk_events_slug UNIQUE (slug),
    CONSTRAINT fk_events_parent FOREIGN KEY (parent_id) REFERENCES historical_events (id) ON DELETE SET NULL,
    CONSTRAINT fk_events_root FOREIGN KEY (root_id) REFERENCES historical_events (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_events_timeline
ON historical_events (status, show_on_timeline, start_year, effective_end_year);

CREATE INDEX idx_events_type_timeline
ON historical_events (event_type, status, show_on_timeline, start_year, effective_end_year);

CREATE INDEX idx_events_geo_status
ON historical_events (geo_type, status);

CREATE INDEX idx_events_featured
ON historical_events (status, featured);

CREATE INDEX idx_events_parent_order
ON historical_events (parent_id, order_in_parent, id);

CREATE INDEX idx_events_root_level_order
ON historical_events (root_id, level, order_in_parent);

CREATE TABLE exam_datasets (
    id BINARY(16) NOT NULL,
    aggregate_hash CHAR(64) NOT NULL,
    build_id VARCHAR(120) NOT NULL,
    status VARCHAR(24) NOT NULL,
    hash_schema_version INT NOT NULL,
    build_algorithm_version INT NOT NULL,
    source_count INT NOT NULL,
    exam_count INT NOT NULL DEFAULT 0,
    section_count INT NOT NULL DEFAULT 0,
    question_count INT NOT NULL DEFAULT 0,
    topic_count INT NOT NULL DEFAULT 0,
    tagging_count INT NOT NULL DEFAULT 0,
    build_metadata_json LONGTEXT NOT NULL,
    validated_at DATETIME(6) NULL,
    promoted_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_exam_datasets PRIMARY KEY (id),
    CONSTRAINT uq_exam_datasets_aggregate_hash UNIQUE (aggregate_hash),
    CONSTRAINT chk_exam_datasets_status CHECK (status IN ('STAGING', 'VALIDATED', 'ACTIVE', 'SUPERSEDED', 'FAILED')),
    CONSTRAINT chk_exam_datasets_counts CHECK (
        source_count >= 0 AND exam_count >= 0 AND section_count >= 0
        AND question_count >= 0 AND topic_count >= 0 AND tagging_count >= 0
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exam_import_runs (
    id BINARY(16) NOT NULL,
    dataset_id BINARY(16) NULL,
    aggregate_hash CHAR(64) NOT NULL,
    run_mode VARCHAR(20) NOT NULL,
    status VARCHAR(24) NOT NULL,
    source_commit VARCHAR(80) NULL,
    exam_count INT NOT NULL DEFAULT 0,
    section_count INT NOT NULL DEFAULT 0,
    question_count INT NOT NULL DEFAULT 0,
    topic_count INT NOT NULL DEFAULT 0,
    tagging_count INT NOT NULL DEFAULT 0,
    warning_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    report_json LONGTEXT NULL,
    started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    finished_at DATETIME(6) NULL,
    CONSTRAINT pk_exam_import_runs PRIMARY KEY (id),
    CONSTRAINT fk_exam_import_runs_dataset FOREIGN KEY (dataset_id) REFERENCES exam_datasets (id) ON DELETE SET NULL,
    CONSTRAINT chk_exam_import_runs_mode CHECK (run_mode IN ('DRY_RUN', 'IMPORT')),
    CONSTRAINT chk_exam_import_runs_status CHECK (status IN ('RUNNING', 'VALIDATED', 'PROMOTED', 'FAILED', 'SKIPPED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_exam_import_runs_hash_started ON exam_import_runs (aggregate_hash, started_at);

CREATE TABLE exam_runtime_state (
    state_id TINYINT NOT NULL,
    active_dataset_id BINARY(16) NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_exam_runtime_state PRIMARY KEY (state_id),
    CONSTRAINT fk_exam_runtime_state_dataset FOREIGN KEY (active_dataset_id) REFERENCES exam_datasets (id),
    CONSTRAINT chk_exam_runtime_state_singleton CHECK (state_id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO exam_runtime_state (state_id, active_dataset_id) VALUES (1, NULL);

CREATE TABLE exam_definitions (
    id BINARY(16) NOT NULL,
    dataset_id BINARY(16) NOT NULL,
    exam_id VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    exam_year INT NULL,
    source_name VARCHAR(255) NULL,
    source_detail VARCHAR(1000) NULL,
    exam_code VARCHAR(120) NULL,
    exam_format VARCHAR(80) NOT NULL,
    time_limit_minutes INT NOT NULL,
    total_score DECIMAL(5, 2) NOT NULL,
    source_file VARCHAR(500) NOT NULL,
    content_hash CHAR(64) NOT NULL,
    visibility_status VARCHAR(20) NOT NULL,
    verification_status VARCHAR(24) NOT NULL,
    warnings_json LONGTEXT NULL,
    mcq_count INT NOT NULL,
    tf_count INT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_exam_definitions PRIMARY KEY (id),
    CONSTRAINT fk_exam_definitions_dataset FOREIGN KEY (dataset_id) REFERENCES exam_datasets (id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_definitions_dataset_exam UNIQUE (dataset_id, exam_id),
    CONSTRAINT chk_exam_definitions_visibility CHECK (visibility_status IN ('PUBLIC', 'HIDDEN')),
    CONSTRAINT chk_exam_definitions_verification CHECK (verification_status IN ('VERIFIED', 'REVIEW_REQUIRED')),
    CONSTRAINT chk_exam_definitions_time CHECK (time_limit_minutes > 0),
    CONSTRAINT chk_exam_definitions_score CHECK (total_score > 0),
    CONSTRAINT chk_exam_definitions_counts CHECK (mcq_count >= 0 AND tf_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_exam_definitions_catalog
ON exam_definitions (dataset_id, visibility_status, verification_status, exam_year);

CREATE TABLE exam_sections (
    id BINARY(16) NOT NULL,
    exam_definition_id BINARY(16) NOT NULL,
    section_id VARCHAR(120) NOT NULL,
    section_type VARCHAR(24) NOT NULL,
    title VARCHAR(500) NOT NULL,
    order_in_exam INT NOT NULL,
    total_questions INT NOT NULL,
    max_score DECIMAL(5, 2) NULL,
    scoring_config_json LONGTEXT NULL,
    CONSTRAINT pk_exam_sections PRIMARY KEY (id),
    CONSTRAINT fk_exam_sections_definition FOREIGN KEY (exam_definition_id) REFERENCES exam_definitions (id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_sections_definition_section UNIQUE (exam_definition_id, section_id),
    CONSTRAINT uq_exam_sections_definition_order UNIQUE (exam_definition_id, order_in_exam),
    CONSTRAINT chk_exam_sections_type CHECK (section_type IN ('mcq', 'true_false')),
    CONSTRAINT chk_exam_sections_order CHECK (order_in_exam > 0),
    CONSTRAINT chk_exam_sections_total CHECK (total_questions >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exam_questions (
    id BINARY(16) NOT NULL,
    dataset_id BINARY(16) NOT NULL,
    exam_section_id BINARY(16) NOT NULL,
    question_id VARCHAR(255) NOT NULL,
    order_in_section INT NOT NULL,
    order_in_exam INT NOT NULL,
    question_type VARCHAR(24) NOT NULL,
    question_text LONGTEXT NOT NULL,
    explanation LONGTEXT NULL,
    difficulty VARCHAR(24) NOT NULL,
    cognitive_level VARCHAR(32) NOT NULL,
    raw_topic VARCHAR(500) NOT NULL,
    has_image BOOLEAN NOT NULL DEFAULT FALSE,
    content_hash CHAR(64) NOT NULL,
    CONSTRAINT pk_exam_questions PRIMARY KEY (id),
    CONSTRAINT fk_exam_questions_dataset FOREIGN KEY (dataset_id) REFERENCES exam_datasets (id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_questions_section FOREIGN KEY (exam_section_id) REFERENCES exam_sections (id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_questions_dataset_public_id UNIQUE (dataset_id, question_id),
    CONSTRAINT uq_exam_questions_section_order UNIQUE (exam_section_id, order_in_section),
    CONSTRAINT chk_exam_questions_type CHECK (question_type IN ('mcq', 'true_false')),
    CONSTRAINT chk_exam_questions_order CHECK (order_in_section > 0 AND order_in_exam > 0),
    CONSTRAINT chk_exam_questions_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard')),
    CONSTRAINT chk_exam_questions_cognitive CHECK (cognitive_level IN ('knowledge', 'comprehension', 'application'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_exam_questions_filter
ON exam_questions (dataset_id, question_type, difficulty, cognitive_level);

CREATE TABLE exam_mcq_options (
    id BIGINT NOT NULL AUTO_INCREMENT,
    question_internal_id BINARY(16) NOT NULL,
    option_key VARCHAR(16) NOT NULL,
    option_text LONGTEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    order_in_question INT NOT NULL,
    CONSTRAINT pk_exam_mcq_options PRIMARY KEY (id),
    CONSTRAINT fk_exam_mcq_options_question FOREIGN KEY (question_internal_id) REFERENCES exam_questions (id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_mcq_options_key UNIQUE (question_internal_id, option_key),
    CONSTRAINT chk_exam_mcq_options_order CHECK (order_in_question > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exam_tf_statements (
    id BIGINT NOT NULL AUTO_INCREMENT,
    question_internal_id BINARY(16) NOT NULL,
    statement_key VARCHAR(16) NOT NULL,
    statement_text LONGTEXT NOT NULL,
    is_true BOOLEAN NOT NULL,
    order_in_question INT NOT NULL,
    CONSTRAINT pk_exam_tf_statements PRIMARY KEY (id),
    CONSTRAINT fk_exam_tf_statements_question FOREIGN KEY (question_internal_id) REFERENCES exam_questions (id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_tf_statements_key UNIQUE (question_internal_id, statement_key),
    CONSTRAINT chk_exam_tf_statements_order CHECK (order_in_question > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exam_question_sources (
    id BIGINT NOT NULL AUTO_INCREMENT,
    question_internal_id BINARY(16) NOT NULL,
    source_title VARCHAR(1000) NOT NULL,
    source_location VARCHAR(500) NULL,
    order_in_question INT NOT NULL,
    CONSTRAINT pk_exam_question_sources PRIMARY KEY (id),
    CONSTRAINT fk_exam_question_sources_question FOREIGN KEY (question_internal_id) REFERENCES exam_questions (id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_question_sources_order UNIQUE (question_internal_id, order_in_question),
    CONSTRAINT chk_exam_question_sources_order CHECK (order_in_question > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exam_topics (
    id BINARY(16) NOT NULL,
    dataset_id BINARY(16) NOT NULL,
    topic_slug VARCHAR(180) NOT NULL,
    title VARCHAR(500) NOT NULL,
    period_slug VARCHAR(180) NOT NULL,
    period_title VARCHAR(500) NOT NULL,
    display_order INT NOT NULL,
    CONSTRAINT pk_exam_topics PRIMARY KEY (id),
    CONSTRAINT fk_exam_topics_dataset FOREIGN KEY (dataset_id) REFERENCES exam_datasets (id) ON DELETE CASCADE,
    CONSTRAINT uq_exam_topics_dataset_slug UNIQUE (dataset_id, topic_slug),
    CONSTRAINT uq_exam_topics_dataset_order UNIQUE (dataset_id, display_order),
    CONSTRAINT chk_exam_topics_order CHECK (display_order > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_exam_topics_period ON exam_topics (dataset_id, period_slug);

CREATE TABLE exam_question_topics (
    question_internal_id BINARY(16) NOT NULL,
    topic_id BINARY(16) NOT NULL,
    raw_topic VARCHAR(500) NOT NULL,
    CONSTRAINT pk_exam_question_topics PRIMARY KEY (question_internal_id, topic_id),
    CONSTRAINT fk_exam_question_topics_question FOREIGN KEY (question_internal_id) REFERENCES exam_questions (id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_question_topics_topic FOREIGN KEY (topic_id) REFERENCES exam_topics (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_exam_question_topics_topic ON exam_question_topics (topic_id, question_internal_id);

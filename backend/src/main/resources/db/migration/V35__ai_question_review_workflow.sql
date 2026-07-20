CREATE TABLE ai_generation_receipts (
    id BINARY(16) NOT NULL, user_id BINARY(16) NOT NULL, request_id VARCHAR(64) NOT NULL,
    generation_query VARCHAR(1000) NOT NULL, grade INT NOT NULL, lesson_number INT NULL,
    difficulty VARCHAR(16) NOT NULL, requested_count INT NOT NULL, response_json LONGTEXT NOT NULL,
    generation_model VARCHAR(120) NOT NULL, embedding_model VARCHAR(120) NOT NULL,
    embedding_dimension INT NOT NULL, prompt_version VARCHAR(120) NOT NULL, schema_version VARCHAR(120) NOT NULL,
    corpus_sha256 CHAR(64) NOT NULL, collection_name VARCHAR(180) NOT NULL,
    validation_status VARCHAR(40) NOT NULL, warnings_json LONGTEXT NOT NULL,
    expires_at DATETIME(6) NOT NULL, created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_ai_generation_receipts PRIMARY KEY (id),
    CONSTRAINT fk_ai_generation_receipts_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uq_ai_generation_receipts_request UNIQUE (request_id),
    CONSTRAINT chk_ai_generation_receipts_grade CHECK (grade IN (10, 11, 12)),
    CONSTRAINT chk_ai_generation_receipts_dimension CHECK (embedding_dimension > 0),
    CONSTRAINT chk_ai_generation_receipts_count CHECK (requested_count BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_ai_generation_receipts_expiry ON ai_generation_receipts (expires_at);

CREATE TABLE ai_question_candidates (
    id BINARY(16) NOT NULL, receipt_id BINARY(16) NOT NULL, receipt_question_index INT NOT NULL,
    status VARCHAR(24) NOT NULL, question_type VARCHAR(24) NOT NULL,
    question_text LONGTEXT NOT NULL, explanation LONGTEXT NOT NULL, difficulty VARCHAR(16) NOT NULL,
    original_question_text LONGTEXT NOT NULL, original_explanation LONGTEXT NOT NULL,
    original_correct_option_id VARCHAR(4) NOT NULL, grade INT NOT NULL, lesson_number INT NULL,
    topic VARCHAR(500) NULL, generation_query VARCHAR(1000) NOT NULL, requested_count INT NOT NULL,
    generation_request_id VARCHAR(64) NOT NULL, generation_model VARCHAR(120) NOT NULL,
    embedding_model VARCHAR(120) NOT NULL, embedding_dimension INT NOT NULL,
    prompt_version VARCHAR(120) NOT NULL, schema_version VARCHAR(120) NOT NULL,
    corpus_sha256 CHAR(64) NOT NULL, collection_name VARCHAR(180) NOT NULL,
    validation_status VARCHAR(40) NOT NULL, validation_warnings_json LONGTEXT NOT NULL,
    generation_warnings_json LONGTEXT NOT NULL, created_by BINARY(16) NOT NULL,
    submitted_by BINARY(16) NULL, reviewed_by BINARY(16) NULL, published_by BINARY(16) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    submitted_at DATETIME(6) NULL, reviewed_at DATETIME(6) NULL, published_at DATETIME(6) NULL,
    rejection_reason VARCHAR(2000) NULL, review_note VARCHAR(2000) NULL,
    official_question_id BINARY(16) NULL, version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_ai_question_candidates PRIMARY KEY (id),
    CONSTRAINT fk_ai_question_candidates_receipt FOREIGN KEY (receipt_id) REFERENCES ai_generation_receipts (id),
    CONSTRAINT fk_ai_question_candidates_creator FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_ai_question_candidates_submitter FOREIGN KEY (submitted_by) REFERENCES users (id),
    CONSTRAINT fk_ai_question_candidates_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id),
    CONSTRAINT fk_ai_question_candidates_publisher FOREIGN KEY (published_by) REFERENCES users (id),
    CONSTRAINT fk_ai_question_candidates_official FOREIGN KEY (official_question_id) REFERENCES exam_questions (id),
    CONSTRAINT uq_ai_question_candidates_receipt_item UNIQUE (receipt_id, receipt_question_index),
    CONSTRAINT uq_ai_question_candidates_official UNIQUE (official_question_id),
    CONSTRAINT chk_ai_question_candidates_status CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED')),
    CONSTRAINT chk_ai_question_candidates_type CHECK (question_type = 'mcq'),
    CONSTRAINT chk_ai_question_candidates_difficulty CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    CONSTRAINT chk_ai_question_candidates_grade CHECK (grade IN (10, 11, 12)),
    CONSTRAINT chk_ai_question_candidates_version CHECK (version >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_ai_candidates_status_created ON ai_question_candidates (status, created_at);
CREATE INDEX idx_ai_candidates_creator_created ON ai_question_candidates (created_by, created_at);
CREATE INDEX idx_ai_candidates_reviewer_created ON ai_question_candidates (reviewed_by, created_at);
CREATE INDEX idx_ai_candidates_grade_lesson ON ai_question_candidates (grade, lesson_number);

CREATE TABLE ai_question_candidate_options (
    id BIGINT NOT NULL AUTO_INCREMENT, candidate_id BINARY(16) NOT NULL, option_id VARCHAR(4) NOT NULL,
    option_text LONGTEXT NOT NULL, is_correct BOOLEAN NOT NULL, display_order INT NOT NULL,
    original_option_text LONGTEXT NOT NULL,
    CONSTRAINT pk_ai_question_candidate_options PRIMARY KEY (id),
    CONSTRAINT fk_ai_candidate_options_candidate FOREIGN KEY (candidate_id) REFERENCES ai_question_candidates (id) ON DELETE CASCADE,
    CONSTRAINT uq_ai_candidate_options_key UNIQUE (candidate_id, option_id),
    CONSTRAINT uq_ai_candidate_options_order UNIQUE (candidate_id, display_order),
    CONSTRAINT chk_ai_candidate_options_key CHECK (option_id IN ('A', 'B', 'C', 'D')),
    CONSTRAINT chk_ai_candidate_options_order CHECK (display_order BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_question_candidate_sources (
    id BIGINT NOT NULL AUTO_INCREMENT, candidate_id BINARY(16) NOT NULL, chunk_id VARCHAR(255) NOT NULL,
    document_id VARCHAR(255) NULL, grade INT NULL, lesson_number INT NULL,
    lesson_title VARCHAR(1000) NULL, section_title VARCHAR(1000) NULL,
    page_start INT NULL, page_end INT NULL, chunk_hash CHAR(64) NULL, display_order INT NOT NULL,
    CONSTRAINT pk_ai_question_candidate_sources PRIMARY KEY (id),
    CONSTRAINT fk_ai_candidate_sources_candidate FOREIGN KEY (candidate_id) REFERENCES ai_question_candidates (id) ON DELETE CASCADE,
    CONSTRAINT uq_ai_candidate_sources_chunk UNIQUE (candidate_id, chunk_id),
    CONSTRAINT uq_ai_candidate_sources_order UNIQUE (candidate_id, display_order),
    CONSTRAINT chk_ai_candidate_sources_order CHECK (display_order > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_question_candidate_audit_events (
    id BIGINT NOT NULL AUTO_INCREMENT, candidate_id BINARY(16) NOT NULL,
    event_type VARCHAR(32) NOT NULL, actor_id BINARY(16) NOT NULL,
    from_status VARCHAR(24) NULL, to_status VARCHAR(24) NULL,
    changed_fields_json LONGTEXT NOT NULL, note VARCHAR(2000) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), request_id VARCHAR(64) NOT NULL,
    CONSTRAINT pk_ai_candidate_audit_events PRIMARY KEY (id),
    CONSTRAINT fk_ai_candidate_audit_candidate FOREIGN KEY (candidate_id) REFERENCES ai_question_candidates (id),
    CONSTRAINT fk_ai_candidate_audit_actor FOREIGN KEY (actor_id) REFERENCES users (id),
    CONSTRAINT chk_ai_candidate_audit_type CHECK (event_type IN ('CREATED', 'SUBMITTED', 'EDITED', 'APPROVED', 'REJECTED', 'PUBLISHED', 'PUBLISH_FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_ai_candidate_audit_timeline ON ai_question_candidate_audit_events (candidate_id, created_at, id);

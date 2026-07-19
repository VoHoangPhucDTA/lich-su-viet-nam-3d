CREATE TABLE exam_sessions (
    id BINARY(16) NOT NULL,
    public_session_id VARCHAR(120) NOT NULL,
    user_id BINARY(16) NULL,
    anonymous_token_hash CHAR(64) NULL,
    source_dataset_id BINARY(16) NOT NULL,
    dataset_version CHAR(64) NOT NULL,
    mode VARCHAR(32) NOT NULL,
    title VARCHAR(500) NOT NULL,
    exam_id VARCHAR(255) NULL,
    exam_content_hash CHAR(64) NULL,
    config_json LONGTEXT NULL,
    scoring_version VARCHAR(64) NOT NULL,
    started_at_server DATETIME(6) NOT NULL,
    deadline_at DATETIME(6) NULL,
    submit_grace_seconds INT NOT NULL,
    status VARCHAR(24) NOT NULL,
    result_json LONGTEXT NULL,
    completed_at DATETIME(6) NULL,
    submitted_at_server DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_exam_sessions PRIMARY KEY (id),
    CONSTRAINT uq_exam_sessions_public_id UNIQUE (public_session_id),
    CONSTRAINT uq_exam_sessions_token_hash UNIQUE (anonymous_token_hash),
    CONSTRAINT fk_exam_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_exam_sessions_dataset FOREIGN KEY (source_dataset_id) REFERENCES exam_datasets (id),
    CONSTRAINT chk_exam_sessions_mode CHECK (mode IN (
        'TIMED_ORIGINAL', 'CUSTOM_MOCK', 'FREE_PRACTICE',
        'TOPIC_PRACTICE', 'RETRY_WRONG', 'CUSTOM_PRACTICE'
    )),
    CONSTRAINT chk_exam_sessions_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'SUBMITTED', 'EXPIRED', 'CANCELLED')),
    CONSTRAINT chk_exam_sessions_grace CHECK (submit_grace_seconds >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_exam_sessions_user_created ON exam_sessions (user_id, created_at);
CREATE INDEX idx_exam_sessions_dataset_status ON exam_sessions (source_dataset_id, status);

CREATE TABLE exam_session_questions (
    id BINARY(16) NOT NULL,
    session_id BINARY(16) NOT NULL,
    public_question_instance_id VARCHAR(120) NOT NULL,
    source_question_id BINARY(16) NULL,
    public_question_id VARCHAR(255) NOT NULL,
    position_in_session INT NOT NULL,
    section_id VARCHAR(120) NULL,
    section_type VARCHAR(24) NOT NULL,
    safe_snapshot_json LONGTEXT NOT NULL,
    answer_key_snapshot_json LONGTEXT NOT NULL,
    practice_answer_json LONGTEXT NULL,
    checked_result_json LONGTEXT NULL,
    checked_at DATETIME(6) NULL,
    CONSTRAINT pk_exam_session_questions PRIMARY KEY (id),
    CONSTRAINT fk_exam_session_questions_session FOREIGN KEY (session_id) REFERENCES exam_sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_session_questions_source FOREIGN KEY (source_question_id) REFERENCES exam_questions (id),
    CONSTRAINT uq_exam_session_questions_instance UNIQUE (public_question_instance_id),
    CONSTRAINT uq_exam_session_questions_position UNIQUE (session_id, position_in_session),
    CONSTRAINT uq_exam_session_questions_public_question UNIQUE (session_id, public_question_id),
    CONSTRAINT chk_exam_session_questions_position CHECK (position_in_session > 0),
    CONSTRAINT chk_exam_session_questions_type CHECK (section_type IN ('mcq', 'true_false'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_exam_session_questions_session_checked ON exam_session_questions (session_id, checked_at);

CREATE TABLE exam_submission_receipts (
    id BINARY(16) NOT NULL,
    session_id BINARY(16) NOT NULL,
    user_id BINARY(16) NULL,
    client_submission_id VARCHAR(120) NOT NULL,
    submission_hash CHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL,
    error_code VARCHAR(80) NULL,
    attempt_id BINARY(16) NULL,
    success_slot TINYINT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    completed_at DATETIME(6) NULL,
    CONSTRAINT pk_exam_submission_receipts PRIMARY KEY (id),
    CONSTRAINT fk_exam_submission_receipts_session FOREIGN KEY (session_id) REFERENCES exam_sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_submission_receipts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_exam_submission_receipts_attempt FOREIGN KEY (attempt_id) REFERENCES exam_v2_attempts (id) ON DELETE SET NULL,
    CONSTRAINT uq_exam_submission_receipts_client_id UNIQUE (client_submission_id),
    CONSTRAINT uq_exam_submission_receipts_attempt UNIQUE (attempt_id),
    CONSTRAINT uq_exam_submission_receipts_success UNIQUE (session_id, success_slot),
    CONSTRAINT chk_exam_submission_receipts_status CHECK (status IN (
        'RECEIVED', 'PROCESSING', 'SUCCESS', 'SUPERSEDED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT',
        'VERSION_MISMATCH', 'AUTH_MISMATCH'
    )),
    CONSTRAINT chk_exam_submission_receipts_success_slot CHECK (success_slot IS NULL OR success_slot = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_exam_submission_receipts_session_status ON exam_submission_receipts (session_id, status);

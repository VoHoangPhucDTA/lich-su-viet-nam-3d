CREATE TABLE exam_v2_attempts (
    id BINARY(16) NOT NULL,
    user_id BINARY(16) NOT NULL,
    session_id VARCHAR(120) NOT NULL,
    mode VARCHAR(40) NOT NULL,
    exam_id VARCHAR(255) NULL,
    title VARCHAR(500) NULL,
    is_custom BOOLEAN NOT NULL DEFAULT FALSE,
    source_exam_ids_json LONGTEXT NULL,
    question_refs_json LONGTEXT NULL,
    question_snapshots_json LONGTEXT NULL,
    answers_json LONGTEXT NULL,
    config_json LONGTEXT NULL,
    result_json LONGTEXT NOT NULL,
    total_questions INT NOT NULL,
    total_score DECIMAL(5, 2) NOT NULL,
    mcq_score DECIMAL(5, 2) NULL,
    tf_score DECIMAL(5, 2) NULL,
    duration_seconds INT NULL,
    submitted_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_exam_v2_attempts PRIMARY KEY (id),
    CONSTRAINT uq_exam_v2_attempts_user_session UNIQUE (user_id, session_id),
    CONSTRAINT fk_exam_v2_attempts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_exam_v2_attempts_total_questions CHECK (total_questions > 0),
    CONSTRAINT chk_exam_v2_attempts_total_score CHECK (total_score BETWEEN 0 AND 10),
    CONSTRAINT chk_exam_v2_attempts_mcq_score CHECK (mcq_score IS NULL OR mcq_score >= 0),
    CONSTRAINT chk_exam_v2_attempts_tf_score CHECK (tf_score IS NULL OR tf_score >= 0),
    CONSTRAINT chk_exam_v2_attempts_duration CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_exam_v2_attempts_user_submitted
ON exam_v2_attempts (user_id, submitted_at);

CREATE INDEX idx_exam_v2_attempts_user_updated
ON exam_v2_attempts (user_id, updated_at);


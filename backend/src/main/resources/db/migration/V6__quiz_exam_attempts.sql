CREATE TABLE quiz_attempts (
    id BINARY(16) NOT NULL,
    user_id BINARY(16) NULL,
    source ENUM('mock', 'rag', 'question_bank') NOT NULL DEFAULT 'mock',
    source_mode VARCHAR(50) NULL,
    status ENUM('in_progress', 'submitted', 'abandoned') NOT NULL,
    grade TINYINT NULL,
    topic VARCHAR(255) NULL,
    event_id VARCHAR(160) NULL,
    difficulty VARCHAR(30) NULL,
    config_json JSON NOT NULL,
    questions_json JSON NOT NULL,
    total_questions INT NOT NULL,
    correct_count INT NULL,
    incorrect_count INT NULL,
    skipped_count INT NULL,
    score10 DECIMAL(4, 2) NULL,
    duration_ms INT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_quiz_attempts PRIMARY KEY (id),
    CONSTRAINT fk_quiz_attempts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_quiz_attempts_event FOREIGN KEY (event_id) REFERENCES historical_events (id) ON DELETE SET NULL,
    CONSTRAINT chk_quiz_attempts_grade CHECK (grade IS NULL OR grade IN (10, 11, 12)),
    CONSTRAINT chk_quiz_attempts_total CHECK (total_questions > 0),
    CONSTRAINT chk_quiz_attempts_correct CHECK (correct_count IS NULL OR correct_count >= 0),
    CONSTRAINT chk_quiz_attempts_incorrect CHECK (incorrect_count IS NULL OR incorrect_count >= 0),
    CONSTRAINT chk_quiz_attempts_skipped CHECK (skipped_count IS NULL OR skipped_count >= 0),
    CONSTRAINT chk_quiz_attempts_score CHECK (score10 IS NULL OR score10 BETWEEN 0 AND 10),
    CONSTRAINT chk_quiz_attempts_duration CHECK (duration_ms IS NULL OR duration_ms >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_quiz_user_submitted
ON quiz_attempts (user_id, submitted_at);

CREATE INDEX idx_quiz_user_status
ON quiz_attempts (user_id, status);

CREATE INDEX idx_quiz_event
ON quiz_attempts (event_id);

CREATE TABLE quiz_answers (
    id BIGINT NOT NULL AUTO_INCREMENT,
    attempt_id BINARY(16) NOT NULL,
    question_id VARCHAR(160) NOT NULL,
    selected_option CHAR(1) NULL,
    correct_option CHAR(1) NOT NULL,
    is_correct BOOLEAN NOT NULL,
    time_spent_ms INT NULL,
    question_snapshot_json JSON NOT NULL,
    answered_at DATETIME NULL,
    CONSTRAINT pk_quiz_answers PRIMARY KEY (id),
    CONSTRAINT fk_quiz_answers_attempt FOREIGN KEY (attempt_id) REFERENCES quiz_attempts (id) ON DELETE CASCADE,
    CONSTRAINT chk_quiz_answers_selected CHECK (selected_option IS NULL OR selected_option IN ('A', 'B', 'C', 'D')),
    CONSTRAINT chk_quiz_answers_correct CHECK (correct_option IN ('A', 'B', 'C', 'D')),
    CONSTRAINT chk_quiz_answers_time CHECK (time_spent_ms IS NULL OR time_spent_ms >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_quiz_answers_attempt
ON quiz_answers (attempt_id);

CREATE TABLE exam_attempts (
    id BINARY(16) NOT NULL,
    user_id BINARY(16) NULL,
    mode ENUM('practice', 'thpt_mock', 'custom') NOT NULL,
    status ENUM('in_progress', 'submitted', 'abandoned') NOT NULL,
    grade TINYINT NULL,
    title VARCHAR(255) NULL,
    difficulty VARCHAR(30) NULL,
    config_json JSON NOT NULL,
    questions_json JSON NOT NULL,
    total_questions INT NOT NULL,
    correct_count INT NULL,
    wrong_count INT NULL,
    blank_count INT NULL,
    score10 DECIMAL(4, 2) NULL,
    percentage DECIMAL(5, 2) NULL,
    duration_seconds INT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_exam_attempts PRIMARY KEY (id),
    CONSTRAINT fk_exam_attempts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT chk_exam_attempts_grade CHECK (grade IS NULL OR grade IN (10, 11, 12)),
    CONSTRAINT chk_exam_attempts_total CHECK (total_questions > 0),
    CONSTRAINT chk_exam_attempts_correct CHECK (correct_count IS NULL OR correct_count >= 0),
    CONSTRAINT chk_exam_attempts_wrong CHECK (wrong_count IS NULL OR wrong_count >= 0),
    CONSTRAINT chk_exam_attempts_blank CHECK (blank_count IS NULL OR blank_count >= 0),
    CONSTRAINT chk_exam_attempts_score CHECK (score10 IS NULL OR score10 BETWEEN 0 AND 10),
    CONSTRAINT chk_exam_attempts_percentage CHECK (percentage IS NULL OR percentage BETWEEN 0 AND 100),
    CONSTRAINT chk_exam_attempts_duration CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_exam_user_submitted
ON exam_attempts (user_id, submitted_at);

CREATE INDEX idx_exam_user_status
ON exam_attempts (user_id, status);

CREATE INDEX idx_exam_mode_grade
ON exam_attempts (mode, grade);

CREATE TABLE exam_answers (
    id BIGINT NOT NULL AUTO_INCREMENT,
    attempt_id BINARY(16) NOT NULL,
    question_id VARCHAR(160) NOT NULL,
    selected_option CHAR(1) NULL,
    correct_option CHAR(1) NOT NULL,
    is_correct BOOLEAN NOT NULL,
    question_snapshot_json JSON NOT NULL,
    answered_at DATETIME NULL,
    CONSTRAINT pk_exam_answers PRIMARY KEY (id),
    CONSTRAINT fk_exam_answers_attempt FOREIGN KEY (attempt_id) REFERENCES exam_attempts (id) ON DELETE CASCADE,
    CONSTRAINT chk_exam_answers_selected CHECK (selected_option IS NULL OR selected_option IN ('A', 'B', 'C', 'D')),
    CONSTRAINT chk_exam_answers_correct CHECK (correct_option IN ('A', 'B', 'C', 'D'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_exam_answers_attempt
ON exam_answers (attempt_id);

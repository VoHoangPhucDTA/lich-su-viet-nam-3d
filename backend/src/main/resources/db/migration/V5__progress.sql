CREATE TABLE event_view_logs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BINARY(16) NOT NULL,
    event_id VARCHAR(160) NOT NULL,
    viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INT NULL,
    progress_percent TINYINT NULL,
    source ENUM('map', 'detail', 'search', 'quiz', 'exam') NULL,
    created_date DATE NOT NULL,
    CONSTRAINT pk_event_view_logs PRIMARY KEY (id),
    CONSTRAINT fk_event_view_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_event_view_logs_event FOREIGN KEY (event_id) REFERENCES historical_events (id) ON DELETE CASCADE,
    CONSTRAINT chk_event_view_logs_duration CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    CONSTRAINT chk_event_view_logs_progress CHECK (
        progress_percent IS NULL OR progress_percent BETWEEN 0 AND 100
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_event_view_user_time
ON event_view_logs (user_id, viewed_at);

CREATE INDEX idx_event_view_event_time
ON event_view_logs (event_id, viewed_at);

CREATE INDEX idx_event_view_user_date
ON event_view_logs (user_id, created_date);

CREATE TABLE learning_progress (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BINARY(16) NOT NULL,
    scope_type ENUM('overall', 'grade', 'event_type', 'topic', 'event') NOT NULL,
    scope_id VARCHAR(160) NULL,
    events_viewed INT NOT NULL DEFAULT 0,
    quiz_completed INT NOT NULL DEFAULT 0,
    exam_completed INT NOT NULL DEFAULT 0,
    avg_score DECIMAL(5, 2) NULL,
    total_minutes INT NOT NULL DEFAULT 0,
    last_activity_at DATETIME NULL,
    stats_json JSON NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_learning_progress PRIMARY KEY (id),
    CONSTRAINT fk_learning_progress_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uk_progress_scope UNIQUE (user_id, scope_type, scope_id),
    CONSTRAINT chk_learning_progress_events CHECK (events_viewed >= 0),
    CONSTRAINT chk_learning_progress_quiz CHECK (quiz_completed >= 0),
    CONSTRAINT chk_learning_progress_exam CHECK (exam_completed >= 0),
    CONSTRAINT chk_learning_progress_score CHECK (avg_score IS NULL OR avg_score BETWEEN 0 AND 10),
    CONSTRAINT chk_learning_progress_minutes CHECK (total_minutes >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

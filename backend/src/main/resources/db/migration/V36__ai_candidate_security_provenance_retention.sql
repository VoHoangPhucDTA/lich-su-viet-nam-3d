INSERT INTO roles (code, name)
SELECT 'teacher', 'Giao vien'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'teacher');

ALTER TABLE ai_generation_receipts
    ADD COLUMN last_used_at DATETIME(6) NULL;

CREATE INDEX idx_ai_generation_receipts_cleanup
ON ai_generation_receipts (expires_at, created_at);

ALTER TABLE ai_question_candidates
    ADD COLUMN self_review_override_used BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ai_question_candidates
    ADD COLUMN self_review_override_reason VARCHAR(2000) NULL;

CREATE TABLE ai_candidate_provenance_validations (
    id BIGINT NOT NULL AUTO_INCREMENT,
    candidate_id BINARY(16) NOT NULL,
    candidate_version BIGINT NOT NULL,
    validation_action VARCHAR(16) NOT NULL,
    corpus_sha256 CHAR(64) NOT NULL,
    collection_name VARCHAR(180) NOT NULL,
    source_count INT NOT NULL,
    valid BOOLEAN NOT NULL,
    error_codes_json LONGTEXT NOT NULL,
    validated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_ai_candidate_provenance_validations PRIMARY KEY (id),
    CONSTRAINT fk_ai_provenance_candidate FOREIGN KEY (candidate_id)
        REFERENCES ai_question_candidates (id) ON DELETE CASCADE,
    CONSTRAINT chk_ai_provenance_action CHECK (validation_action IN ('SUBMIT', 'APPROVE', 'PUBLISH')),
    CONSTRAINT chk_ai_provenance_version CHECK (candidate_version >= 0),
    CONSTRAINT chk_ai_provenance_source_count CHECK (source_count >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ai_provenance_candidate_time
ON ai_candidate_provenance_validations (candidate_id, validated_at, id);

ALTER TABLE ai_question_candidate_audit_events
    DROP CHECK chk_ai_candidate_audit_type;

ALTER TABLE ai_question_candidate_audit_events
    ADD CONSTRAINT chk_ai_candidate_audit_type CHECK (event_type IN (
        'CREATED', 'SUBMITTED', 'EDITED', 'APPROVED', 'REJECTED', 'PUBLISHED', 'PUBLISH_FAILED',
        'SELF_REVIEW_OVERRIDE_USED', 'PROVENANCE_VALIDATED', 'PROVENANCE_VALIDATION_FAILED'
    ));

ALTER TABLE ai_question_candidates
    MODIFY COLUMN receipt_id BINARY(16) NULL,
    MODIFY COLUMN receipt_question_index INT NULL;

ALTER TABLE ai_question_candidates ADD COLUMN origin_type VARCHAR(16) NOT NULL DEFAULT 'GENERATED';
ALTER TABLE ai_question_candidates ADD COLUMN parent_candidate_id BINARY(16) NULL;
ALTER TABLE ai_question_candidates ADD COLUMN root_official_question_id BINARY(16) NULL;
ALTER TABLE ai_question_candidates ADD COLUMN base_official_question_id BINARY(16) NULL;
ALTER TABLE ai_question_candidates ADD COLUMN revision_number INT NULL;
ALTER TABLE ai_question_candidates ADD COLUMN revision_reason VARCHAR(2000) NULL;
ALTER TABLE ai_question_candidates ADD COLUMN base_content_hash CHAR(64) NULL;
ALTER TABLE ai_question_candidates ADD COLUMN base_question_text LONGTEXT NULL;
ALTER TABLE ai_question_candidates ADD COLUMN base_explanation LONGTEXT NULL;
ALTER TABLE ai_question_candidates ADD COLUMN base_difficulty VARCHAR(16) NULL;
ALTER TABLE ai_question_candidates ADD COLUMN base_topic VARCHAR(500) NULL;
ALTER TABLE ai_question_candidates ADD CONSTRAINT fk_ai_candidate_parent FOREIGN KEY (parent_candidate_id) REFERENCES ai_question_candidates (id);
ALTER TABLE ai_question_candidates ADD CONSTRAINT fk_ai_candidate_root_official FOREIGN KEY (root_official_question_id) REFERENCES exam_questions (id);
ALTER TABLE ai_question_candidates ADD CONSTRAINT fk_ai_candidate_base_official FOREIGN KEY (base_official_question_id) REFERENCES exam_questions (id);
ALTER TABLE ai_question_candidates ADD CONSTRAINT chk_ai_candidate_origin CHECK (origin_type IN ('GENERATED', 'REVISION'));
ALTER TABLE ai_question_candidates ADD CONSTRAINT uq_ai_candidate_root_revision UNIQUE (root_official_question_id, revision_number);

ALTER TABLE ai_question_candidate_options ADD COLUMN base_option_text LONGTEXT NULL;
ALTER TABLE ai_question_candidate_options ADD COLUMN base_is_correct BOOLEAN NULL;

CREATE INDEX idx_ai_candidate_parent ON ai_question_candidates (parent_candidate_id);
CREATE INDEX idx_ai_candidate_revision_base ON ai_question_candidates (base_official_question_id, status);

UPDATE ai_question_candidates
SET root_official_question_id=official_question_id,
    base_official_question_id=official_question_id,
    revision_number=1,
    base_content_hash=(SELECT q.content_hash FROM exam_questions q WHERE q.id=official_question_id),
    base_question_text=question_text,
    base_explanation=explanation,
    base_difficulty=difficulty,
    base_topic=topic
WHERE status='PUBLISHED' AND official_question_id IS NOT NULL;

CREATE TABLE ai_question_revision_heads (
    root_official_question_id BINARY(16) NOT NULL,
    head_official_question_id BINARY(16) NOT NULL,
    open_candidate_id BINARY(16) NULL,
    next_revision_number INT NOT NULL DEFAULT 2,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_ai_revision_heads PRIMARY KEY (root_official_question_id),
    CONSTRAINT uq_ai_revision_head_official UNIQUE (head_official_question_id),
    CONSTRAINT uq_ai_revision_open_candidate UNIQUE (open_candidate_id),
    CONSTRAINT fk_ai_revision_head_root FOREIGN KEY (root_official_question_id) REFERENCES exam_questions (id),
    CONSTRAINT fk_ai_revision_head_current FOREIGN KEY (head_official_question_id) REFERENCES exam_questions (id),
    CONSTRAINT fk_ai_revision_head_open FOREIGN KEY (open_candidate_id) REFERENCES ai_question_candidates (id),
    CONSTRAINT chk_ai_revision_next_number CHECK (next_revision_number >= 2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO ai_question_revision_heads (root_official_question_id,head_official_question_id,next_revision_number)
SELECT official_question_id,official_question_id,2
FROM ai_question_candidates
WHERE status='PUBLISHED' AND official_question_id IS NOT NULL;

CREATE TABLE ai_question_official_revisions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    root_official_question_id BINARY(16) NOT NULL,
    previous_official_question_id BINARY(16) NULL,
    new_official_question_id BINARY(16) NOT NULL,
    candidate_id BINARY(16) NOT NULL,
    revision_number INT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_by BINARY(16) NOT NULL,
    CONSTRAINT pk_ai_official_revisions PRIMARY KEY (id),
    CONSTRAINT fk_ai_official_revision_root FOREIGN KEY (root_official_question_id) REFERENCES exam_questions (id),
    CONSTRAINT fk_ai_official_revision_previous FOREIGN KEY (previous_official_question_id) REFERENCES exam_questions (id),
    CONSTRAINT fk_ai_official_revision_new FOREIGN KEY (new_official_question_id) REFERENCES exam_questions (id),
    CONSTRAINT fk_ai_official_revision_candidate FOREIGN KEY (candidate_id) REFERENCES ai_question_candidates (id),
    CONSTRAINT fk_ai_official_revision_actor FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT uq_ai_official_revision_number UNIQUE (root_official_question_id, revision_number),
    CONSTRAINT uq_ai_official_revision_new UNIQUE (new_official_question_id),
    CONSTRAINT uq_ai_official_revision_candidate UNIQUE (candidate_id),
    CONSTRAINT chk_ai_official_revision_number CHECK (revision_number >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO ai_question_official_revisions
    (root_official_question_id,previous_official_question_id,new_official_question_id,candidate_id,revision_number,created_by)
SELECT official_question_id,NULL,official_question_id,id,1,published_by
FROM ai_question_candidates
WHERE status='PUBLISHED' AND official_question_id IS NOT NULL AND published_by IS NOT NULL;

ALTER TABLE ai_question_candidate_audit_events
    DROP CHECK chk_ai_candidate_audit_type;

ALTER TABLE ai_candidate_provenance_validations
    DROP CHECK chk_ai_provenance_action;

ALTER TABLE ai_candidate_provenance_validations
    ADD CONSTRAINT chk_ai_provenance_action CHECK (validation_action IN ('SUBMIT', 'APPROVE', 'PUBLISH', 'REMAP'));

ALTER TABLE ai_question_candidate_audit_events
    ADD CONSTRAINT chk_ai_candidate_audit_type CHECK (event_type IN (
        'CREATED', 'SUBMITTED', 'EDITED', 'APPROVED', 'REJECTED', 'PUBLISHED', 'PUBLISH_FAILED',
        'SELF_REVIEW_OVERRIDE_USED', 'PROVENANCE_VALIDATED', 'PROVENANCE_VALIDATION_FAILED',
        'REVISION_CREATED', 'REVISION_EDITED', 'REVISION_SOURCE_REMAPPED', 'REVISION_SUBMITTED',
        'REVISION_APPROVED', 'REVISION_REJECTED', 'REVISION_PUBLISHED', 'REVISION_PUBLISH_FAILED',
        'REVISION_BASE_CONFLICT'
    ));

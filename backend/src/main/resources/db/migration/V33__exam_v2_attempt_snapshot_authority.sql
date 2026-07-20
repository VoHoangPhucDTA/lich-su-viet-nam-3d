ALTER TABLE exam_v2_attempts
    ADD COLUMN snapshot_schema_version INT NULL AFTER result_json;

ALTER TABLE exam_v2_attempts
    ADD COLUMN score_authority VARCHAR(32) NULL AFTER snapshot_schema_version;

ALTER TABLE exam_v2_attempts
    ADD COLUMN timing_authority VARCHAR(32) NULL AFTER score_authority;

ALTER TABLE exam_v2_attempts
    ADD COLUMN submission_origin VARCHAR(40) NULL AFTER timing_authority;

ALTER TABLE exam_v2_attempts
    ADD COLUMN scoring_version VARCHAR(64) NULL AFTER submission_origin;

ALTER TABLE exam_v2_attempts
    ADD COLUMN dataset_version CHAR(64) NULL AFTER scoring_version;

ALTER TABLE exam_v2_attempts
    ADD COLUMN exam_content_hash CHAR(64) NULL AFTER dataset_version;

CREATE INDEX idx_exam_v2_attempts_authority_history
ON exam_v2_attempts (user_id, timing_authority, submission_origin, submitted_at);

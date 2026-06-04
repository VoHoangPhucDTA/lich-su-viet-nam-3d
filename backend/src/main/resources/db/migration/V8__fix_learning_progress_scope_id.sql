UPDATE learning_progress
SET scope_id = ''
WHERE scope_id IS NULL;

ALTER TABLE learning_progress
    MODIFY scope_id VARCHAR(160) NOT NULL DEFAULT '';

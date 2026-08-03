-- Dashboard analytics filters by owner and mode in a submitted-at range, then
-- orders newest-first with created_at as its deterministic tie-break.
CREATE INDEX idx_exam_v2_attempts_dashboard
ON exam_v2_attempts (user_id, mode, submitted_at DESC, created_at DESC);

ALTER TABLE tts_audio_assets
    ADD COLUMN claim_token VARCHAR(36) NULL AFTER status;

ALTER TABLE tts_audio_assets
    ADD COLUMN claim_expires_at DATETIME NULL AFTER claim_token;

CREATE INDEX idx_tts_audio_assets_status_claim_expires_at
ON tts_audio_assets (status, claim_expires_at);

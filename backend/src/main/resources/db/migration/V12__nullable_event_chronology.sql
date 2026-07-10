ALTER TABLE historical_events
    MODIFY COLUMN start_year INT NULL,
    MODIFY COLUMN effective_end_year INT NULL;

UPDATE historical_events
SET start_year = NULL
WHERE start_year = 0;

UPDATE historical_events
SET end_year = NULL
WHERE end_year = 0;

UPDATE historical_events
SET effective_end_year = NULL
WHERE effective_end_year = 0;

ALTER TABLE historical_events
    ADD CONSTRAINT chk_events_start_year_not_zero
        CHECK (start_year IS NULL OR start_year <> 0),
    ADD CONSTRAINT chk_events_end_year_not_zero
        CHECK (end_year IS NULL OR end_year <> 0),
    ADD CONSTRAINT chk_events_effective_end_year_not_zero
        CHECK (effective_end_year IS NULL OR effective_end_year <> 0);

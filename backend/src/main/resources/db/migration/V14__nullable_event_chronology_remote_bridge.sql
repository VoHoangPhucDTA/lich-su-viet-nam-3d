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

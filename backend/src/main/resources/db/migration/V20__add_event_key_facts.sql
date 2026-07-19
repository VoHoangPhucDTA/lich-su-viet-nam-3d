ALTER TABLE historical_events
ADD COLUMN key_facts JSON NULL AFTER significance;

UPDATE historical_events
SET key_facts = COALESCE(
    JSON_EXTRACT(raw_json, '$.textbookContent.keyFacts'),
    JSON_ARRAY()
);

ALTER TABLE historical_events
MODIFY COLUMN key_facts JSON NOT NULL;

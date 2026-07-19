ALTER TABLE event_textbook_refs
    ADD COLUMN url VARCHAR(1000) NULL AFTER excerpt;

ALTER TABLE event_textbook_refs
    ADD COLUMN detailed_narrative MEDIUMTEXT NULL AFTER url;

ALTER TABLE event_textbook_refs
    ADD COLUMN show_on_detail TINYINT(1) NOT NULL DEFAULT 0
        AFTER page_mapping_status;

ALTER TABLE event_textbook_refs
    ADD COLUMN page_scope VARCHAR(32) NOT NULL DEFAULT 'REFERENCE_RANGE' AFTER page_end;

ALTER TABLE event_textbook_refs
    ADD COLUMN page_number_basis VARCHAR(32) NOT NULL DEFAULT 'PRINTED_BOOK_PAGE' AFTER page_scope;

ALTER TABLE event_textbook_refs
    ADD COLUMN page_mapping_status VARCHAR(48) NOT NULL DEFAULT 'REFERENCE_RANGE_MAPPED' AFTER page_number_basis;

CREATE INDEX idx_refs_page_mapping
ON event_textbook_refs (page_mapping_status, page_scope);

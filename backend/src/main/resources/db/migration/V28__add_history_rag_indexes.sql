CREATE INDEX idx_event_textbook_contents_hash
ON event_textbook_contents (content_hash);

CREATE INDEX idx_event_textbook_refs_event_page
ON event_textbook_refs (event_id, page_start, page_end, id);

CREATE INDEX idx_source_catalog_external_id
ON source_catalog (source_type, external_id);

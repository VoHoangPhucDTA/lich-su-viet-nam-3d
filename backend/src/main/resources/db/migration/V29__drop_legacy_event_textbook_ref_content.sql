-- Textbook narrative is canonicalized in event_textbook_contents.content.
-- event_textbook_refs remains metadata/provenance only.
ALTER TABLE event_textbook_refs
    DROP COLUMN content;

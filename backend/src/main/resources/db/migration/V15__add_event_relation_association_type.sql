SET @has_event_relation_association_type := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'event_relations'
      AND COLUMN_NAME = 'association_type'
);

SET @add_event_relation_association_type_sql := IF(
    @has_event_relation_association_type = 0,
    'ALTER TABLE event_relations ADD COLUMN association_type ENUM(''predecessor'', ''successor'', ''related'') NULL AFTER target_event_id',
    'SELECT 1'
);

PREPARE add_event_relation_association_type_stmt FROM @add_event_relation_association_type_sql;
EXECUTE add_event_relation_association_type_stmt;
DEALLOCATE PREPARE add_event_relation_association_type_stmt;

UPDATE event_relations
SET association_type = CASE
    WHEN relation_type = 'predecessor' THEN 'predecessor'
    WHEN relation_type = 'successor' THEN 'successor'
    ELSE 'related'
END
WHERE association_type IS NULL;

ALTER TABLE event_relations
MODIFY COLUMN association_type ENUM('predecessor', 'successor', 'related') NOT NULL;

SET @has_event_relation_association_index := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'event_relations'
      AND INDEX_NAME = 'idx_event_relations_assoc'
);

SET @add_event_relation_association_index_sql := IF(
    @has_event_relation_association_index = 0,
    'CREATE INDEX idx_event_relations_assoc ON event_relations (source_event_id, association_type, sort_order)',
    'SELECT 1'
);

PREPARE add_event_relation_association_index_stmt FROM @add_event_relation_association_index_sql;
EXECUTE add_event_relation_association_index_stmt;
DEALLOCATE PREPARE add_event_relation_association_index_stmt;

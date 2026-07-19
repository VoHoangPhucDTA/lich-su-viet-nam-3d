import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

public class ApplyEventAssociationsToDb {
    private static final Path DEFAULT_SQL = Path.of(
            "backend/src/main/resources/db/migration/V16__import_event_associations.sql"
    );

    public static void main(String[] args) throws Exception {
        boolean apply = List.of(args).contains("--apply");
        Path sqlPath = DEFAULT_SQL;
        for (String arg : args) {
            if (arg.startsWith("--sql=")) {
                sqlPath = Path.of(arg.substring("--sql=".length()));
            }
        }

        Properties env = loadEnv();
        String url = first(env.getProperty("SPRING_DATASOURCE_URL"), System.getenv("SPRING_DATASOURCE_URL"));
        String username = first(env.getProperty("SPRING_DATASOURCE_USERNAME"), System.getenv("SPRING_DATASOURCE_USERNAME"), "root");
        String password = first(env.getProperty("SPRING_DATASOURCE_PASSWORD"), System.getenv("SPRING_DATASOURCE_PASSWORD"), "");
        if (isBlank(url)) {
            throw new IllegalStateException("SPRING_DATASOURCE_URL is required in backend/.env or environment.");
        }

        List<RelationRow> rows = parseRows(sqlPath);
        if (rows.isEmpty()) {
            throw new IllegalStateException("No relation rows found in " + sqlPath);
        }

        try (Connection connection = DriverManager.getConnection(url, username, password)) {
            connection.setAutoCommit(false);
            try {
                Counts before = inspect(connection, rows);
                printCounts("DRY_RUN", before, rows.size());

                if (!apply) {
                    connection.rollback();
                    System.out.println("Dry-run only. Re-run with --apply to write changes.");
                    return;
                }

                ensureAssociationTypeColumn(connection);
                deleteAndInsertRelations(connection, rows);
                syncRawJsonAssociations(connection);

                Counts after = inspect(connection, rows);
                printCounts("APPLIED", after, rows.size());

                if (after.eventRelations != rows.size() || after.invalidSources != 0
                        || after.invalidTargets != 0 || after.selfLinks != 0 || after.duplicateSourceTargets != 0) {
                    throw new IllegalStateException("Post-apply verification failed; rolling back.");
                }

                connection.commit();
                System.out.println("Committed vetted event associations.");
            } catch (Exception ex) {
                connection.rollback();
                throw ex;
            }
        }
    }

    private static Properties loadEnv() throws IOException {
        Properties properties = new Properties();
        Path envPath = Path.of("backend/.env");
        if (!Files.isRegularFile(envPath)) {
            return properties;
        }
        for (String line : Files.readAllLines(envPath)) {
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            int eq = trimmed.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            String key = trimmed.substring(0, eq).trim();
            String value = trimmed.substring(eq + 1).trim();
            if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.substring(1, value.length() - 1);
            }
            properties.setProperty(key, value);
        }
        return properties;
    }

    private static List<RelationRow> parseRows(Path sqlPath) throws IOException {
        List<RelationRow> rows = new ArrayList<>();
        for (String line : Files.readAllLines(sqlPath)) {
            String trimmed = line.trim();
            if (!trimmed.startsWith("('")) {
                continue;
            }
            String values = trimmed;
            if (values.endsWith(",")) {
                values = values.substring(0, values.length() - 1);
            }
            if (values.endsWith(";")) {
                values = values.substring(0, values.length() - 1);
            }
            values = values.substring(1, values.length() - 1);
            List<String> parts = splitSqlValues(values);
            if (parts.size() != 5) {
                throw new IllegalArgumentException("Unexpected relation row: " + line);
            }
            rows.add(new RelationRow(parts.get(0), parts.get(1), parts.get(2), parts.get(3), Integer.parseInt(parts.get(4))));
        }
        return rows;
    }

    private static List<String> splitSqlValues(String values) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inString = false;
        for (int i = 0; i < values.length(); i++) {
            char ch = values.charAt(i);
            if (ch == '\'') {
                inString = !inString;
                continue;
            }
            if (ch == ',' && !inString) {
                parts.add(cleanValue(current.toString()));
                current.setLength(0);
                continue;
            }
            current.append(ch);
        }
        parts.add(cleanValue(current.toString()));
        return parts;
    }

    private static String cleanValue(String value) {
        return value.trim();
    }

    private static Counts inspect(Connection connection, List<RelationRow> rows) throws SQLException {
        return new Counts(
                scalar(connection, "SELECT COUNT(*) FROM event_relations"),
                scalar(connection, """
                        SELECT COUNT(*)
                        FROM event_relations er
                        LEFT JOIN historical_events e ON e.id = er.source_event_id
                        WHERE e.id IS NULL
                        """),
                scalar(connection, """
                        SELECT COUNT(*)
                        FROM event_relations er
                        LEFT JOIN historical_events e ON e.id = er.target_event_id
                        WHERE e.id IS NULL
                        """),
                scalar(connection, "SELECT COUNT(*) FROM event_relations WHERE source_event_id = target_event_id"),
                countDuplicateSourceTargets(rows),
                scalar(connection, """
                        SELECT COUNT(*)
                        FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'event_relations'
                          AND COLUMN_NAME = 'association_type'
                        """),
                scalar(connection, """
                        SELECT COUNT(*)
                        FROM information_schema.STATISTICS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'event_relations'
                          AND INDEX_NAME = 'idx_event_relations_assoc'
                        """)
        );
    }

    private static int countDuplicateSourceTargets(List<RelationRow> rows) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (RelationRow row : rows) {
            counts.merge(row.sourceEventId + "\u0000" + row.targetEventId, 1, Integer::sum);
        }
        int duplicates = 0;
        for (Integer count : counts.values()) {
            if (count > 1) {
                duplicates++;
            }
        }
        return duplicates;
    }

    private static int scalar(Connection connection, String sql) throws SQLException {
        try (Statement statement = connection.createStatement();
             ResultSet resultSet = statement.executeQuery(sql)) {
            resultSet.next();
            return resultSet.getInt(1);
        }
    }

    private static void ensureAssociationTypeColumn(Connection connection) throws SQLException {
        if (scalar(connection, """
                SELECT COUNT(*)
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'event_relations'
                  AND COLUMN_NAME = 'association_type'
                """) == 0) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("""
                        ALTER TABLE event_relations
                        ADD COLUMN association_type ENUM('predecessor', 'successor', 'related') NULL
                        AFTER target_event_id
                        """);
            }
        }

        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                    UPDATE event_relations
                    SET association_type = CASE
                        WHEN relation_type = 'predecessor' THEN 'predecessor'
                        WHEN relation_type = 'successor' THEN 'successor'
                        ELSE 'related'
                    END
                    WHERE association_type IS NULL
                    """);
            statement.execute("""
                    ALTER TABLE event_relations
                    MODIFY COLUMN association_type ENUM('predecessor', 'successor', 'related') NOT NULL
                    """);
        }

        if (scalar(connection, """
                SELECT COUNT(*)
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'event_relations'
                  AND INDEX_NAME = 'idx_event_relations_assoc'
                """) == 0) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("""
                        CREATE INDEX idx_event_relations_assoc
                        ON event_relations (source_event_id, association_type, sort_order)
                        """);
            }
        }
    }

    private static void deleteAndInsertRelations(Connection connection, List<RelationRow> rows) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate("DELETE FROM event_relations");
        }
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO event_relations
                    (source_event_id, target_event_id, association_type, relation_type, sort_order)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    association_type = VALUES(association_type),
                    relation_type = VALUES(relation_type),
                    sort_order = VALUES(sort_order)
                """)) {
            for (RelationRow row : rows) {
                statement.setString(1, row.sourceEventId);
                statement.setString(2, row.targetEventId);
                statement.setString(3, row.associationType);
                statement.setString(4, row.relationType);
                statement.setInt(5, row.sortOrder);
                statement.addBatch();
            }
            statement.executeBatch();
        }
    }

    private static void syncRawJsonAssociations(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                    UPDATE historical_events he
                    LEFT JOIN (
                        SELECT source_event_id, JSON_ARRAYAGG(target_event_id) AS ids
                        FROM (
                            SELECT source_event_id, target_event_id, MIN(sort_order) AS sort_order
                            FROM event_relations
                            WHERE association_type = 'predecessor'
                            GROUP BY source_event_id, target_event_id
                        ) x
                        GROUP BY source_event_id
                    ) pred ON pred.source_event_id = he.id
                    LEFT JOIN (
                        SELECT source_event_id, JSON_ARRAYAGG(target_event_id) AS ids
                        FROM (
                            SELECT source_event_id, target_event_id, MIN(sort_order) AS sort_order
                            FROM event_relations
                            WHERE association_type = 'successor'
                            GROUP BY source_event_id, target_event_id
                        ) x
                        GROUP BY source_event_id
                    ) succ ON succ.source_event_id = he.id
                    LEFT JOIN (
                        SELECT source_event_id, JSON_ARRAYAGG(target_event_id) AS ids
                        FROM (
                            SELECT er.source_event_id, er.target_event_id, MIN(er.sort_order) AS sort_order
                            FROM event_relations er
                            WHERE er.association_type = 'related'
                              AND NOT EXISTS (
                                  SELECT 1
                                  FROM event_relations temporal
                                  WHERE temporal.source_event_id = er.source_event_id
                                    AND temporal.target_event_id = er.target_event_id
                                    AND temporal.association_type IN ('predecessor', 'successor')
                              )
                            GROUP BY er.source_event_id, er.target_event_id
                        ) x
                        GROUP BY source_event_id
                    ) rel ON rel.source_event_id = he.id
                    SET he.raw_json = JSON_SET(
                        he.raw_json,
                        '$.associations.predecessorEventIds', COALESCE(pred.ids, JSON_ARRAY()),
                        '$.associations.successorEventIds', COALESCE(succ.ids, JSON_ARRAY()),
                        '$.associations.relatedEventIds', COALESCE(rel.ids, JSON_ARRAY()),
                        '$.associations.relatedFigureIds', COALESCE(JSON_EXTRACT(he.raw_json, '$.associations.relatedFigureIds'), JSON_ARRAY())
                    )
                    """);
        }
    }

    private static void printCounts(String label, Counts counts, int plannedRows) {
        System.out.printf(
                "%s plannedRows=%d eventRelations=%d invalidSources=%d invalidTargets=%d selfLinks=%d duplicateSourceTargetsInSeed=%d associationTypeColumn=%d associationIndex=%d%n",
                label,
                plannedRows,
                counts.eventRelations,
                counts.invalidSources,
                counts.invalidTargets,
                counts.selfLinks,
                counts.duplicateSourceTargets,
                counts.associationTypeColumn,
                counts.associationIndex
        );
    }

    private static String first(String... values) {
        for (String value : values) {
            if (!isBlank(value)) {
                return value;
            }
        }
        return null;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private record RelationRow(
            String sourceEventId,
            String targetEventId,
            String associationType,
            String relationType,
            int sortOrder
    ) {
    }

    private record Counts(
            int eventRelations,
            int invalidSources,
            int invalidTargets,
            int selfLinks,
            int duplicateSourceTargets,
            int associationTypeColumn,
            int associationIndex
    ) {
    }
}

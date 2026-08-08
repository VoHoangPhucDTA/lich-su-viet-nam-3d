package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncRepository.DbEventRow;
import io.github.cdimascio.dotenv.Dotenv;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Standalone SELECT-only CLI. It never starts Spring, Flyway, repositories, importers or seeders. */
public final class RemoteCanonicalGeographyReadOnlyCli {

    private static final String TARGET = RemoteCanonicalGeographyReadOnlyPlanner.ALLOWED_EVENT_ID;
    private static final String EVENT_COLUMNS = "id,title,geo_type,lat,lng,province_names,"
            + "historical_locations,raw_json,updated_at";

    private RemoteCanonicalGeographyReadOnlyCli() { }

    public record RunResult(ObjectNode artifact, List<PlanRow> planRows, String databaseFingerprint) { }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            throw new IllegalArgumentException("Usage: RemoteCanonicalGeographyReadOnlyCli <plan-output.json>");
        }
        generatePlan(Path.of(args[0]).toAbsolutePath().normalize());
    }

    static RunResult generatePlan(Path output) throws Exception {
        Path canonicalPath = Path.of("..", "crawData", "stage4b_curate_tree", "output", "phase2",
                "core_events.jsonl").toAbsolutePath().normalize();
        Dotenv dotenv = Dotenv.configure().directory(Path.of("").toAbsolutePath().toString())
                .ignoreIfMissing().load();
        String jdbcUrl = secret("SPRING_DATASOURCE_URL", dotenv);
        String username = secret("SPRING_DATASOURCE_USERNAME", dotenv);
        String password = secret("SPRING_DATASOURCE_PASSWORD", dotenv);
        Target target = parseTarget(jdbcUrl);

        ObjectMapper mapper = new ObjectMapper();
        CanonicalGeographyProjection projection = new CanonicalGeographyProjection(mapper);
        RemoteCanonicalGeographyReadOnlyPlanner planner = new RemoteCanonicalGeographyReadOnlyPlanner(mapper);
        try (Connection connection = DriverManager.getConnection(jdbcUrl, username, password)) {
            connection.setAutoCommit(true);
            String database = scalar(connection, "SELECT DATABASE()");
            String serverVersion = scalar(connection, "SELECT VERSION()");
            String flyway = scalar(connection,
                    "SELECT MAX(CAST(version AS UNSIGNED)) FROM flyway_schema_history WHERE success = 1");
            long count = Long.parseLong(scalar(connection, "SELECT COUNT(*) FROM historical_events"));
            Set<String> ids = new LinkedHashSet<>(strings(connection,
                    "SELECT id FROM historical_events ORDER BY id"));
            String schema = schemaSignature(connection);
            List<DbEventRow> beforeRows = eventRows(connection,
                    "SELECT " + EVENT_COLUMNS + " FROM historical_events ORDER BY id");
            DbEventRow before = findTarget(beforeRows);
            JsonNode beforeRaw = mapper.readTree(before.rawJson());
            String beforeRowFingerprint = rowFingerprint(before, projection, mapper);

            var metadata = new RemoteCanonicalGeographyReadOnlyPlanner.DatabaseMetadata(
                    target.host(), target.port(), database, serverVersion, flyway, count, schema, ids);
            SnapshotRepository repository = new SnapshotRepository(beforeRows);
            CanonicalGeographySyncService service = new CanonicalGeographySyncService(
                    repository, projection, mapper, new NeverUsedTransactions());
            var release = CanonicalGeographyReleaseContract.validate(service, canonicalPath, "");
            var planRows = service.buildPlan(release);
            var artifact = planner.build(release, metadata, planRows);
            var artifactSummary = planner.verifyArtifactConsistency(artifact.json(), planRows);

            DbEventRow after = eventRows(connection, "SELECT " + EVENT_COLUMNS
                    + " FROM historical_events WHERE id='" + TARGET + "'").getFirst();
            String afterRowFingerprint = rowFingerprint(after, projection, mapper);
            if (!beforeRowFingerprint.equals(afterRowFingerprint)) {
                throw new IllegalStateException("CRITICAL_REMOTE_DRY_RUN_MUTATED_DB");
            }
            Files.createDirectories(output.getParent());
            Files.writeString(output, mapper.writerWithDefaultPrettyPrinter()
                    .writeValueAsString(artifact.json()) + "\n", StandardCharsets.UTF_8);

            System.out.println("READ_ONLY_MECHANISM=dedicated bounded-SELECT-only JDBC CLI; no write API");
            System.out.println("HOST_SHA256=" + CanonicalGeographyProjection.sha256(target.host()));
            System.out.println("DATABASE=" + database);
            System.out.println("SERVER_VERSION=" + serverVersion);
            System.out.println("FLYWAY_VERSION=" + flyway);
            System.out.println("HISTORICAL_EVENT_COUNT=" + count);
            System.out.println("DATABASE_FINGERPRINT=" + artifact.databaseFingerprint());
            System.out.println("RUNTIME_GEO_TYPE=" + before.geoType());
            System.out.println("RUNTIME_SLUG=" + beforeRaw.path("slug").asText());
            System.out.println("RUNTIME_MARKER=" + beforeRaw.path("mapData").path("marker"));
            System.out.println("RUNTIME_MARKER_COUNT=" + beforeRaw.path("mapData").path("markers").size());
            System.out.println("RUNTIME_REGION_COUNT=" + beforeRaw.path("mapData").path("regions").size());
            System.out.println("RUNTIME_PROVINCE_NAMES=" + beforeRaw.path("mapData").path("provinceNames"));
            System.out.println("RUNTIME_GADM_REFS=" + beforeRaw.path("mapData").path("gadmRefs"));
            System.out.println("RUNTIME_SHOW_ON_MAP="
                    + beforeRaw.path("display").path("showOnMap").asBoolean());
            System.out.println("CHANGED_ROWS=" + artifactSummary.changedRows());
            System.out.println("EVENT_ID=" + String.join(",", artifactSummary.eventIds()));
            System.out.println("NON_GEOGRAPHY_DIFF=" + artifactSummary.nonGeographyDiffs());
            System.out.println("PLAN_SHA=" + artifactSummary.planSha256());
            System.out.println("BEFORE_ROW_FINGERPRINT=" + beforeRowFingerprint);
            System.out.println("AFTER_ROW_FINGERPRINT=" + afterRowFingerprint);
            System.out.println("DB_MUTATED=false");
            System.out.println("REMOTE_APPLY_BLOCKED=true");
            return new RunResult(artifact.json().deepCopy(), List.copyOf(planRows),
                    artifact.databaseFingerprint());
        }
    }

    private static String scalar(Connection connection, String sql) throws SQLException {
        RemoteCanonicalGeographyReadOnlyPlanner.requireReadOnlySql(sql);
        try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery(sql)) {
            if (!rs.next()) throw new IllegalStateException("Metadata SELECT returned no row");
            return rs.getString(1);
        }
    }

    private static List<String> strings(Connection connection, String sql) throws SQLException {
        RemoteCanonicalGeographyReadOnlyPlanner.requireReadOnlySql(sql);
        List<String> values = new ArrayList<>();
        try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery(sql)) {
            while (rs.next()) values.add(rs.getString(1));
        }
        return values;
    }

    private static String schemaSignature(Connection connection) throws SQLException {
        String sql = "SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS "
                + "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='historical_events' ORDER BY ORDINAL_POSITION";
        RemoteCanonicalGeographyReadOnlyPlanner.requireReadOnlySql(sql);
        StringBuilder signature = new StringBuilder();
        try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery(sql)) {
            while (rs.next()) signature.append(rs.getString(1)).append(':').append(rs.getString(2))
                    .append(':').append(rs.getString(3)).append(';');
        }
        return signature.toString();
    }

    private static List<DbEventRow> eventRows(Connection connection, String sql) throws SQLException {
        RemoteCanonicalGeographyReadOnlyPlanner.requireReadOnlySql(sql);
        List<DbEventRow> rows = new ArrayList<>();
        try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery(sql)) {
            while (rs.next()) rows.add(new DbEventRow(rs.getString("id"), rs.getString("title"),
                    rs.getString("geo_type"), rs.getBigDecimal("lat"), rs.getBigDecimal("lng"),
                    rs.getString("province_names"), rs.getString("historical_locations"),
                    rs.getString("raw_json"), rs.getTimestamp("updated_at")));
        }
        return rows;
    }

    private static DbEventRow findTarget(List<DbEventRow> rows) {
        return rows.stream().filter(row -> TARGET.equals(row.id())).findFirst()
                .orElseThrow(() -> new IllegalStateException("Target event missing"));
    }

    private static String rowFingerprint(DbEventRow row, CanonicalGeographyProjection projection,
                                         ObjectMapper mapper) throws Exception {
        JsonNode raw = mapper.readTree(row.rawJson());
        return CanonicalGeographyProjection.sha256(row.id() + "|" + row.geoType() + "|" + row.lat()
                + "|" + row.lng() + "|" + row.provinceNamesJson() + "|" + row.historicalLocationsJson()
                + "|" + projection.canonicalJsonString(raw) + "|" + timestamp(row.updatedAt()));
    }

    private static String timestamp(Timestamp value) {
        return value == null ? "" : value.toInstant().toString();
    }

    static String secret(String name, Dotenv dotenv) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) value = System.getProperty(name);
        if ((value == null || value.isBlank()) && dotenv != null) value = dotenv.get(name);
        if (value == null || value.isBlank()) throw new IllegalStateException(name + " is required");
        return value;
    }

    private static Target parseTarget(String jdbcUrl) {
        String value = jdbcUrl.substring("jdbc:".length());
        URI uri = URI.create(value);
        if (!"mysql".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) {
            throw new IllegalStateException("Only explicit jdbc:mysql targets are supported");
        }
        return new Target(uri.getHost().toLowerCase(), uri.getPort() < 0 ? 3306 : uri.getPort());
    }

    private record Target(String host, int port) { }

    private static final class SnapshotRepository extends CanonicalGeographySyncRepository {
        private final List<DbEventRow> rows;
        SnapshotRepository(List<DbEventRow> rows) { super(null); this.rows = List.copyOf(rows); }
        @Override public List<DbEventRow> loadAll() { return rows; }
    }

    private static final class NeverUsedTransactions implements PlatformTransactionManager {
        @Override public TransactionStatus getTransaction(TransactionDefinition definition) {
            throw new IllegalStateException("Transactions are unavailable in the read-only planner");
        }
        @Override public void commit(TransactionStatus status) { throw new UnsupportedOperationException(); }
        @Override public void rollback(TransactionStatus status) { throw new UnsupportedOperationException(); }
    }
}

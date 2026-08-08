package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncRepository.DbEventRow;
import com.lichsuvn.backend.importer.canonicalgeo.RemoteCanonicalGeographyApplyPlanner.Authorization;
import com.lichsuvn.backend.importer.canonicalgeo.RemoteCanonicalGeographyApplyPlanner.TransactionPort;
import com.lichsuvn.backend.importer.canonicalgeo.RemoteCanonicalGeographyApplyPlanner.TransactionWork;
import com.lichsuvn.backend.importer.canonicalgeo.RemoteCanonicalGeographyApplyPlanner.UpdateCommand;
import io.github.cdimascio.dotenv.Dotenv;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;

/** Standalone one-event apply CLI. Default invocation verifies only and performs zero DML. */
public final class RemoteCanonicalGeographyApplyCli {

    private static final String APPLY_FLAG = "--apply-reviewed-plan";
    private static final String RELEASE_ID_PREFIX = "--release-id=";
    private static final String AUTHORIZATION_PREFIX = "--authorization=";
    private static final String PLAN_SHA_PREFIX = "--plan-sha=";
    private static final String CANONICAL_SHA_PREFIX = "--canonical-sha=";
    private static final String EVENT_ID_PREFIX = "--event-id=";
    private static final String COLUMNS = "id,title,geo_type,lat,lng,province_names,"
            + "historical_locations,raw_json,updated_at";

    private RemoteCanonicalGeographyApplyCli() { }

    public static void main(String[] args) throws Exception {
        if (args.length != 1 && args.length != 7) {
            throw new IllegalArgumentException("Usage: <reviewed-plan.json> "
                    + "[--apply-reviewed-plan --release-id=<locked-release> "
                    + "--authorization=<exact-owner-authorization> --plan-sha=<locked-sha> "
                    + "--canonical-sha=<locked-sha> --event-id=<locked-event>]");
        }
        boolean apply = args.length == 7 && APPLY_FLAG.equals(args[1])
                && args[2].startsWith(RELEASE_ID_PREFIX)
                && args[3].startsWith(AUTHORIZATION_PREFIX)
                && args[4].startsWith(PLAN_SHA_PREFIX)
                && args[5].startsWith(CANONICAL_SHA_PREFIX)
                && args[6].startsWith(EVENT_ID_PREFIX);
        if (args.length == 7 && !apply) {
            throw new IllegalArgumentException("BLOCKED_REVIEWED_PLAN_MISMATCH");
        }
        String releaseId = apply ? value(args[2], RELEASE_ID_PREFIX) : "";
        String authorizationValue = apply ? value(args[3], AUTHORIZATION_PREFIX) : "";
        String planSha = apply ? value(args[4], PLAN_SHA_PREFIX) : "";
        String canonicalSha = apply ? value(args[5], CANONICAL_SHA_PREFIX) : "";
        String eventId = apply ? value(args[6], EVENT_ID_PREFIX) : "";
        if (apply) {
            ControlledGeographyRelease1287Contract.requireApplyAuthorization(
                    releaseId, authorizationValue, planSha, canonicalSha, eventId);
        }

        ObjectMapper mapper = new ObjectMapper();
        Path reviewedPath = Path.of(args[0]).toAbsolutePath().normalize();
        JsonNode reviewed = mapper.readTree(Files.readString(reviewedPath));
        Path liveTemp = Files.createTempFile("remote-geo-1287-live-", ".json");
        try {
            var live = RemoteCanonicalGeographyReadOnlyCli.generatePlan(liveTemp);
            RemoteCanonicalGeographyApplyPlanner planner = new RemoteCanonicalGeographyApplyPlanner(mapper);
            var prepared = planner.prepare(reviewed, live.databaseFingerprint(), live.artifact(), live.planRows());
            if (!apply) {
                System.out.println("REMOTE_WRITE_AUTHORIZED=false");
                System.out.println("VERIFY_ONLY=true");
                return;
            }

            Dotenv dotenv = Dotenv.configure().directory(Path.of("").toAbsolutePath().toString())
                    .ignoreIfMissing().load();
            String url = RemoteCanonicalGeographyReadOnlyCli.secret("SPRING_DATASOURCE_URL", dotenv);
            String user = RemoteCanonicalGeographyReadOnlyCli.secret("SPRING_DATASOURCE_USERNAME", dotenv);
            String password = RemoteCanonicalGeographyReadOnlyCli.secret("SPRING_DATASOURCE_PASSWORD", dotenv);
            try (Connection connection = DriverManager.getConnection(url, user, password)) {
                var result = planner.execute(prepared, new Authorization(true,
                                releaseId, authorizationValue, planSha, canonicalSha, eventId),
                        new JdbcTransactionPort(connection));
                System.out.println("REMOTE_APPLY_UPDATED=" + result.affectedRows());
            }
        } finally {
            Files.deleteIfExists(liveTemp);
        }
    }

    private static String value(String argument, String prefix) {
        return argument.substring(prefix.length());
    }

    static final class JdbcTransactionPort implements TransactionPort {
        private final Connection connection;
        private final ObjectMapper mapper = new ObjectMapper();
        private final CanonicalGeographyProjection projection = new CanonicalGeographyProjection(mapper);

        JdbcTransactionPort(Connection connection) { this.connection = connection; }

        @Override
        public <T> T inTransaction(TransactionWork<T> work) {
            try {
                boolean previousAutoCommit = connection.getAutoCommit();
                connection.setAutoCommit(false);
                try {
                    T result = work.run();
                    connection.commit();
                    return result;
                } catch (Exception ex) {
                    connection.rollback();
                    if (ex instanceof RuntimeException runtime) throw runtime;
                    throw new IllegalStateException(ex);
                } finally {
                    connection.setAutoCommit(previousAutoCommit);
                }
            } catch (SQLException ex) {
                throw new IllegalStateException("Remote apply transaction failure", ex);
            }
        }

        @Override public DbEventRow lockTarget(String eventId) { return select(eventId, true); }

        @Override
        public int update(UpdateCommand command) {
            String sql = "UPDATE historical_events SET geo_type=?,lat=?,lng=?,"
                    + "province_names=CAST(? AS JSON),historical_locations=CAST(? AS JSON),"
                    + "raw_json=CAST(? AS JSON) WHERE id=? AND updated_at=?";
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, command.geoType());
                statement.setBigDecimal(2, command.lat());
                statement.setBigDecimal(3, command.lng());
                statement.setString(4, command.provinceNamesJson());
                statement.setString(5, command.historicalLocationsJson());
                statement.setString(6, command.rawJson());
                statement.setString(7, command.eventId());
                statement.setTimestamp(8, Timestamp.valueOf(command.expectedUpdatedAt().replace('T', ' ')));
                return statement.executeUpdate();
            } catch (SQLException ex) {
                throw new IllegalStateException("Remote prepared UPDATE failed", ex);
            }
        }

        @Override public DbEventRow readBack(String eventId) { return select(eventId, true); }

        @Override
        public String geoHash(DbEventRow row) {
            try {
                JsonNode raw = mapper.readTree(row.rawJson());
                return projection.geoHash(row.geoType(), row.lat(), row.lng(),
                        stringList(mapper.readTree(row.provinceNamesJson())), raw.path("mapData"),
                        raw.path("display").path("showOnMap").asBoolean(true));
            } catch (Exception ex) {
                throw new IllegalStateException("Cannot hash locked geography", ex);
            }
        }

        @Override
        public String nonGeoHash(DbEventRow row) {
            try {
                return projection.nonGeoHash(mapper.readTree(row.rawJson()));
            } catch (Exception ex) {
                throw new IllegalStateException("Cannot hash locked non-geography", ex);
            }
        }

        private java.util.List<String> stringList(JsonNode array) {
            java.util.List<String> values = new java.util.ArrayList<>();
            array.forEach(value -> values.add(value.asText()));
            return values;
        }

        private DbEventRow select(String eventId, boolean lock) {
            String sql = "SELECT " + COLUMNS + " FROM historical_events WHERE id=?"
                    + (lock ? " FOR UPDATE" : "");
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, eventId);
                try (ResultSet rs = statement.executeQuery()) {
                    if (!rs.next()) return null;
                    return new DbEventRow(rs.getString("id"), rs.getString("title"),
                            rs.getString("geo_type"), rs.getBigDecimal("lat"), rs.getBigDecimal("lng"),
                            rs.getString("province_names"), rs.getString("historical_locations"),
                            rs.getString("raw_json"), rs.getTimestamp("updated_at"));
                }
            } catch (SQLException ex) {
                throw new IllegalStateException("Remote target SELECT failed", ex);
            }
        }
    }
}

package com.lichsuvn.backend.importer.canonicalgeo;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * JDBC access for the canonical geography sync. Reads rows with their current
 * geography + raw_json, locks rows for update, and applies only the allowlisted
 * geography columns. Never inserts or deletes rows.
 */
@Repository
public class CanonicalGeographySyncRepository {

    private static final String GEO_COLUMNS = """
            id, title, geo_type, lat, lng, province_names, historical_locations,
            raw_json, updated_at
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public CanonicalGeographySyncRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record DbEventRow(
            String id,
            String title,
            String geoType,
            BigDecimal lat,
            BigDecimal lng,
            String provinceNamesJson,
            String historicalLocationsJson,
            String rawJson,
            Timestamp updatedAt
    ) {
    }

    public List<DbEventRow> loadAll() {
        return jdbc.query("SELECT " + GEO_COLUMNS + " FROM historical_events ORDER BY id",
                (rs, rowNum) -> new DbEventRow(
                        rs.getString("id"),
                        rs.getString("title"),
                        rs.getString("geo_type"),
                        rs.getBigDecimal("lat"),
                        rs.getBigDecimal("lng"),
                        rs.getString("province_names"),
                        rs.getString("historical_locations"),
                        rs.getString("raw_json"),
                        rs.getTimestamp("updated_at")));
    }

    public List<DbEventRow> loadForUpdate(String eventId) {
        return jdbc.query("SELECT " + GEO_COLUMNS
                        + " FROM historical_events WHERE id = :id FOR UPDATE",
                new MapSqlParameterSource("id", eventId),
                (rs, rowNum) -> new DbEventRow(
                        rs.getString("id"),
                        rs.getString("title"),
                        rs.getString("geo_type"),
                        rs.getBigDecimal("lat"),
                        rs.getBigDecimal("lng"),
                        rs.getString("province_names"),
                        rs.getString("historical_locations"),
                        rs.getString("raw_json"),
                        rs.getTimestamp("updated_at")));
    }

    /**
     * Applies only the allowlisted geography columns. Returns the affected-row
     * count (must be exactly 1 for an expected update).
     */
    public int updateGeography(
            String eventId,
            String geoType,
            BigDecimal lat,
            BigDecimal lng,
            String provinceNamesJson,
            String historicalLocationsJson,
            String rawJson
    ) {
        return jdbc.update("""
                UPDATE historical_events
                SET geo_type = :geoType,
                    lat = :lat,
                    lng = :lng,
                    province_names = CAST(:provinceNames AS JSON),
                    historical_locations = CAST(:historicalLocations AS JSON),
                    raw_json = CAST(:rawJson AS JSON)
                WHERE id = :id
                """, new MapSqlParameterSource()
                .addValue("id", eventId)
                .addValue("geoType", geoType)
                .addValue("lat", lat)
                .addValue("lng", lng)
                .addValue("provinceNames", provinceNamesJson)
                .addValue("historicalLocations", historicalLocationsJson)
                .addValue("rawJson", rawJson));
    }

    public long countRows() {
        Long count = jdbc.getJdbcTemplate().queryForObject("SELECT COUNT(*) FROM historical_events", Long.class);
        return count == null ? 0 : count;
    }

    /** Sorted event id set (stable identity shape). */
    public Set<String> loadIds() {
        List<String> ids = jdbc.getJdbcTemplate().queryForList(
                "SELECT id FROM historical_events ORDER BY id", String.class);
        return new LinkedHashSet<>(ids);
    }

    public String serverVersion() {
        return jdbc.getJdbcTemplate().queryForObject("SELECT VERSION()", String.class);
    }

    /** Max successful Flyway version, or "" when the history table is absent. */
    public String flywayVersion() {
        try {
            String value = jdbc.getJdbcTemplate().queryForObject(
                    "SELECT MAX(CAST(version AS UNSIGNED)) FROM flyway_schema_history WHERE success = 1",
                    String.class);
            return value == null ? "" : value;
        } catch (Exception ex) {
            return "";
        }
    }

    /** Schema signature of the geography columns (non-secret). */
    public String schemaSignature() {
        List<Map<String, Object>> rows = jdbc.getJdbcTemplate().queryForList("""
                SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'historical_events'
                ORDER BY ORDINAL_POSITION
                """);
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> row : rows) {
            sb.append(row.get("COLUMN_NAME")).append(':')
                    .append(row.get("COLUMN_TYPE")).append(':')
                    .append(row.get("IS_NULLABLE")).append(';');
        }
        return sb.toString();
    }

    /** Full current geography distribution by geo_type. */
    public Map<String, Long> geoTypeDistribution() {
        Map<String, Long> distribution = new java.util.LinkedHashMap<>();
        jdbc.getJdbcTemplate().queryForList(
                        "SELECT geo_type, COUNT(*) AS c FROM historical_events GROUP BY geo_type ORDER BY geo_type")
                .forEach(row -> distribution.put((String) row.get("geo_type"), ((Number) row.get("c")).longValue()));
        return distribution;
    }

    /** List of distinct non-canonical geo_type values present. */
    public List<String> legacyGeoTypes() {
        return new ArrayList<>(jdbc.getJdbcTemplate().queryForList(
                "SELECT DISTINCT geo_type FROM historical_events "
                        + "WHERE geo_type NOT IN ('point','multi_point','multi_polygon','mixed','nationwide','no_location') "
                        + "ORDER BY geo_type",
                String.class));
    }
}

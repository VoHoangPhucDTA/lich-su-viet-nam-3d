package com.lichsuvn.backend.admin.infrastructure;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.application.AdminEventGeographyCanonicalizer;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public class AdminEventGeographyMutationRepository {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public AdminEventGeographyMutationRepository(
            NamedParameterJdbcTemplate jdbc,
            ObjectMapper mapper
    ) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public Optional<CurrentGeography> lockCurrent(String id) {
        List<CurrentGeography> rows = jdbc.query("""
                SELECT id, updated_at, geo_type, lat, lng, province_names,
                       historical_locations, raw_json,
                       JSON_EXTRACT(raw_json, '$.mapData') AS map_data
                FROM historical_events
                WHERE id=:id
                FOR UPDATE
                """, new MapSqlParameterSource("id", id), (rs, rowNum) ->
                new CurrentGeography(
                        rs.getString("id"),
                        timestamp(rs.getTimestamp("updated_at")),
                        rs.getString("geo_type"),
                        rs.getBigDecimal("lat"),
                        rs.getBigDecimal("lng"),
                        strings(rs.getString("province_names")),
                        strings(rs.getString("historical_locations")),
                        jsonNode(rs.getString("map_data")),
                        jsonNode(rs.getString("raw_json"))
                ));
        return rows.stream().findFirst();
    }

    public boolean update(
            String id,
            LocalDateTime expected,
            AdminEventGeographyCanonicalizer.CanonicalGeography geography
    ) {
        int changed = jdbc.update("""
                UPDATE historical_events
                SET geo_type=:geoType,
                    lat=:lat,
                    lng=:lng,
                    province_names=CAST(:provinceNames AS JSON),
                    historical_locations=CAST(:historicalLocations AS JSON),
                    raw_json=JSON_SET(raw_json, '$.mapData', CAST(:mapData AS JSON)),
                    updated_at=GREATEST(CURRENT_TIMESTAMP(6), updated_at + INTERVAL 1 MICROSECOND)
                WHERE id=:id AND updated_at=:expectedUpdatedAt
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("expectedUpdatedAt", expected)
                .addValue("geoType", geography.geoType())
                .addValue("lat", geography.lat())
                .addValue("lng", geography.lng())
                .addValue("provinceNames", json(geography.provinceNames()))
                .addValue("historicalLocations", json(geography.historicalLocations()))
                .addValue("mapData", geography.mapDataJson()));
        return changed == 1;
    }

    public LocalDateTime currentVersion(String id) {
        Timestamp value = jdbc.queryForObject(
                "SELECT updated_at FROM historical_events WHERE id=:id",
                new MapSqlParameterSource("id", id), Timestamp.class);
        return timestamp(value);
    }

    private List<String> strings(String json) {
        if (json == null) return List.of();
        try {
            return mapper.readValue(json, new TypeReference<>() {});
        } catch (Exception ex) {
            return List.of();
        }
    }

    private JsonNode jsonNode(String json) {
        if (json == null) return null;
        try {
            return mapper.readTree(json);
        } catch (Exception ex) {
            return null;
        }
    }

    private String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_GEOGRAPHY_REQUEST", "Cannot serialize geography values");
        }
    }

    private static LocalDateTime timestamp(Timestamp value) {
        return value == null ? null : value.toLocalDateTime();
    }

    public record CurrentGeography(
            String id,
            LocalDateTime updatedAt,
            String geoType,
            BigDecimal lat,
            BigDecimal lng,
            List<String> provinceNames,
            List<String> historicalLocations,
            JsonNode mapData,
            JsonNode rawJson
    ) {
    }
}

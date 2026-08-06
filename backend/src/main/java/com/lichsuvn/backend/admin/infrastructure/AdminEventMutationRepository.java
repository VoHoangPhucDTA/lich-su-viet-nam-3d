package com.lichsuvn.backend.admin.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventMutationDtos;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Repository
public class AdminEventMutationRepository {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public AdminEventMutationRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public void insertDraft(AdminEventMutationDtos.Create request, String id, List<Integer> grades) {
        String keyFacts = json(request.keyFacts());
        try {
            jdbc.update("""
                    INSERT INTO historical_events (
                      id, slug, title, short_title, event_level, event_type, event_subtype,
                      start_year, end_year, effective_end_year, display_date, date_precision,
                      geo_type, province_names, historical_locations, card_summary,
                      canonical_summary, detailed_narrative, significance, key_facts,
                      show_on_homepage, show_on_timeline, featured, status, raw_json
                    ) VALUES (
                      :id, :slug, :title, :shortTitle, :eventLevel, :eventType, :eventSubtype,
                      :startYear, :endYear, :effectiveEndYear, :displayDate, :datePrecision,
                      'no_location', CAST('[]' AS JSON), CAST('[]' AS JSON), :cardSummary,
                      :canonicalSummary, :detailedNarrative, :significance,
                      CAST(:keyFacts AS JSON), :showOnHomepage, :showOnTimeline, :featured,
                      'draft', CAST('{}' AS JSON)
                    )
                    """, new MapSqlParameterSource()
                    .addValue("id", id)
                    .addValue("slug", request.slug())
                    .addValue("title", request.title())
                    .addValue("shortTitle", request.shortTitle())
                    .addValue("eventLevel", request.eventLevel())
                    .addValue("eventType", request.eventType())
                    .addValue("eventSubtype", request.eventSubtype())
                    .addValue("startYear", request.startYear())
                    .addValue("endYear", request.endYear())
                    .addValue("effectiveEndYear", request.effectiveEndYear())
                    .addValue("displayDate", request.displayDate())
                    .addValue("datePrecision", request.datePrecision())
                    .addValue("cardSummary", request.cardSummary())
                    .addValue("canonicalSummary", request.canonicalSummary())
                    .addValue("detailedNarrative", request.detailedNarrative())
                    .addValue("significance", request.significance())
                    .addValue("keyFacts", keyFacts)
                    .addValue("showOnHomepage", Boolean.TRUE.equals(request.showOnHomepage()))
                    .addValue("showOnTimeline", Boolean.TRUE.equals(request.showOnTimeline()))
                    .addValue("featured", Boolean.TRUE.equals(request.featured())));
        } catch (DuplicateKeyException ex) {
            throw new ApiException(org.springframework.http.HttpStatus.CONFLICT,
                    "EVENT_SLUG_EXISTS", "Slug already exists");
        }
        replaceGrades(id, grades);
    }

    public Map<String, Object> current(String id) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, slug, title, short_title, event_level, event_type, event_subtype,
                       start_year, end_year, effective_end_year, display_date, date_precision,
                       card_summary, canonical_summary, detailed_narrative, significance,
                       key_facts, show_on_homepage, show_on_timeline, featured, updated_at
                FROM historical_events WHERE id=:id FOR UPDATE
                """, new MapSqlParameterSource("id", id));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public boolean updateCore(String id, LocalDateTime expected, List<String> assignments, MapSqlParameterSource params) {
        if (assignments.isEmpty()) return false;
        String sql = "UPDATE historical_events SET " + String.join(", ", assignments)
                + " WHERE id=:id AND updated_at=:expectedUpdatedAt";
        params.addValue("id", id).addValue("expectedUpdatedAt", expected);
        return jdbc.update(sql, params) == 1;
    }

    /**
     * Atomically claims the version before touching event_grades. No non-locking
     * pre-read is used for this operation.
     */
    public boolean claimGradeVersion(String id, LocalDateTime expected) {
        return claimEventVersion(id, expected);
    }

    public boolean claimEventVersion(String id, LocalDateTime expected) {
        return jdbc.update("""
                UPDATE historical_events
                SET updated_at=GREATEST(CURRENT_TIMESTAMP(6),
                    updated_at + INTERVAL 1 MICROSECOND)
                WHERE id=:id AND updated_at=:expectedUpdatedAt
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("expectedUpdatedAt", expected)) == 1;
    }

    public void replaceGrades(String id, List<Integer> grades) {
        jdbc.update("DELETE FROM event_grades WHERE event_id=:id", new MapSqlParameterSource("id", id));
        for (Integer grade : grades) {
            jdbc.update("INSERT INTO event_grades (event_id, grade) VALUES (:id, :grade)",
                    new MapSqlParameterSource().addValue("id", id).addValue("grade", grade));
        }
    }

    public void audit(byte[] userId, String action, String id, String before, String after) {
        String boundedBefore = AdminAuditMetadataPolicy.requireBoundedObject(objectMapper, before);
        String boundedAfter = AdminAuditMetadataPolicy.requireBoundedObject(objectMapper, after);
        jdbc.update("""
                INSERT INTO admin_audit_logs
                    (user_id, action, entity_type, entity_id, before_json, after_json)
                VALUES (:userId, :action, 'historical_event', :id,
                        CAST(:beforeJson AS JSON), CAST(:afterJson AS JSON))
                """, new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("action", action)
                .addValue("id", id)
                .addValue("beforeJson", boundedBefore)
                .addValue("afterJson", boundedAfter));
    }

    public boolean exists(String id) {
        Boolean value = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM historical_events WHERE id=:id)",
                new MapSqlParameterSource("id", id), Boolean.class);
        return Boolean.TRUE.equals(value);
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST,
                    "INVALID_KEY_FACTS", "keyFacts must be valid JSON values");
        }
    }
}

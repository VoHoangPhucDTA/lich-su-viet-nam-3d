package com.lichsuvn.backend.tts.infrastructure;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class TtsEventNarrationRepository {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public TtsEventNarrationRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Optional<EventNarrationData> findPublishedById(String eventId) {
        String sql = """
                SELECT id, title, short_title, display_date, province_names, card_summary,
                       canonical_summary, detailed_narrative, significance
                FROM historical_events
                WHERE id = :eventId
                  AND status = 'published'
                LIMIT 1
                """;
        List<EventNarrationData> results = jdbc.query(
                sql,
                new MapSqlParameterSource("eventId", eventId),
                (rs, rowNum) -> new EventNarrationData(
                        rs.getString("id"),
                        rs.getString("title"),
                        rs.getString("short_title"),
                        rs.getString("display_date"),
                        parseStringList(rs.getString("province_names")),
                        rs.getString("card_summary"),
                        rs.getString("canonical_summary"),
                        rs.getString("detailed_narrative"),
                        rs.getString("significance")
                )
        );
        return results.stream().findFirst();
    }

    public boolean isPublished(String eventId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM historical_events
                WHERE id = :eventId
                  AND status = 'published'
                """, new MapSqlParameterSource("eventId", eventId), Integer.class);
        return count != null && count > 0;
    }

    private List<String> parseStringList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, STRING_LIST);
        } catch (Exception ignored) {
            return List.of();
        }
    }

    public record EventNarrationData(
            String id,
            String title,
            String shortTitle,
            String displayDate,
            List<String> provinceNames,
            String cardSummary,
            String canonicalSummary,
            String detailedNarrative,
            String significance
    ) {
    }
}

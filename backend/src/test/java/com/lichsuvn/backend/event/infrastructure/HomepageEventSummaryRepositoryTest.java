package com.lichsuvn.backend.event.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.event.api.dto.HomepageEventSummaryDto;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

import java.sql.ResultSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class HomepageEventSummaryRepositoryTest {

    @Test
    void usesOneCompactPublishedOnlyProjectionWithoutDetailOrEnrichmentQueries() {
        NamedParameterJdbcTemplate jdbc = mockJdbcReturning(List.of());
        EventReadRepository repository = new EventReadRepository(jdbc, new ObjectMapper());
        List<String> slugs = List.of("first", "second");

        repository.findHomepageSummaries(slugs);

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<SqlParameterSource> paramsCaptor = ArgumentCaptor.forClass(SqlParameterSource.class);
        verify(jdbc, times(1)).query(sqlCaptor.capture(), paramsCaptor.capture(), any(RowMapper.class));

        String sql = sqlCaptor.getValue();
        assertTrue(sql.contains("SELECT e.id, e.slug, e.title, e.start_year, e.event_type"));
        assertTrue(sql.contains("e.province_names, e.card_summary"));
        assertTrue(sql.contains("e.status = 'published'"));
        assertTrue(sql.contains("e.slug IN (:slugs)"));
        assertFalse(sql.contains("SELECT *"));
        assertFalse(sql.contains("raw_json"));
        assertFalse(sql.contains("detailed_narrative"));
        assertFalse(sql.contains("event_media"));
        assertFalse(sql.contains("event_relations"));
        assertFalse(sql.contains("information_schema"));
        assertFalse(sql.contains("COUNT("));
        assertEquals(slugs, ((MapSqlParameterSource) paramsCaptor.getValue()).getValue("slugs"));
    }

    @Test
    void mapsNullableChronologyAndNormalizedProvinceNamesWithoutRawJsonParsing() throws Exception {
        NamedParameterJdbcTemplate jdbc = mockJdbcReturning(List.of());
        EventReadRepository repository = new EventReadRepository(jdbc, new ObjectMapper());
        repository.findHomepageSummaries(List.of("event"));

        ArgumentCaptor<RowMapper<HomepageEventSummaryDto>> mapperCaptor = ArgumentCaptor.forClass(RowMapper.class);
        verify(jdbc).query(anyString(), any(SqlParameterSource.class), mapperCaptor.capture());

        ResultSet row = mock(ResultSet.class);
        when(row.getString("id")).thenReturn("event");
        when(row.getString("slug")).thenReturn("event");
        when(row.getString("title")).thenReturn("Event");
        when(row.getInt("start_year")).thenReturn(0);
        when(row.wasNull()).thenReturn(true);
        when(row.getString("event_type")).thenReturn("military");
        when(row.getString("province_names")).thenReturn("[\"H\u00e0 N\u1ed9i\", \"H\u1ea3i Ph\u00f2ng\"]");
        when(row.getString("card_summary")).thenReturn("Card summary");

        HomepageEventSummaryDto dto = mapperCaptor.getValue().mapRow(row, 0);

        assertEquals("event", dto.id());
        assertEquals(null, dto.startYear());
        assertEquals(List.of("H\u00e0 N\u1ed9i", "H\u1ea3i Ph\u00f2ng"), dto.provinceNames());
        assertEquals("Card summary", dto.cardSummary());
    }

    @Test
    void skipsTheDatabaseForAnEmptyCatalog() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        EventReadRepository repository = new EventReadRepository(jdbc, new ObjectMapper());

        assertEquals(List.of(), repository.findHomepageSummaries(List.of()));

        verifyNoInteractions(jdbc);
    }

    private static NamedParameterJdbcTemplate mockJdbcReturning(List<HomepageEventSummaryDto> result) {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        when(jdbc.query(anyString(), any(SqlParameterSource.class), any(RowMapper.class))).thenReturn(result);
        return jdbc;
    }
}

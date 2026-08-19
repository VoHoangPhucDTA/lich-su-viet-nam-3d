package com.lichsuvn.backend.event.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.event.api.dto.EventSummaryDto;
import com.lichsuvn.backend.event.api.dto.TimelineEventDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

import java.sql.ResultSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class EventReadRepositoryNullableChronologyTest {

    @Test
    void nullableIntegerMapperPreservesSqlNullAndNegativeYears() throws Exception {
        ResultSet nullResult = mock(ResultSet.class);
        when(nullResult.getInt("start_year")).thenReturn(0);
        when(nullResult.wasNull()).thenReturn(true);

        assertNull(EventReadRepository.getInteger(nullResult, "start_year"));

        ResultSet bceResult = mock(ResultSet.class);
        when(bceResult.getInt("effective_end_year")).thenReturn(-208);
        when(bceResult.wasNull()).thenReturn(false);

        assertEquals(-208, EventReadRepository.getInteger(bceResult, "effective_end_year"));
    }

    @Test
    void eventYearFilterUsesFilterF1AndNullLastOrdering() {
        NamedParameterJdbcTemplate jdbc = mockJdbcReturning(List.<EventSummaryDto>of());
        EventReadRepository repository = new EventReadRepository(jdbc, new ObjectMapper());

        repository.findEvents(1945, null, null, null, null, null, null, 10, 0);

        String sql = capturedSql(jdbc);
        assertValidChronologyOrderBy(sql);
        assertTrue(sql.contains("e.start_year IS NOT NULL AND e.effective_end_year IS NOT NULL"));
        assertTrue(sql.contains("e.start_year <= :year AND e.effective_end_year >= :year"));
        assertTrue(sql.contains("e.id ASC"));
    }

    @ParameterizedTest
    @ValueSource(ints = {-938, 0, 1945, 2026})
    void eventYearFilterBindsExactSignedYearIncludingNoMatchYear(int year) {
        NamedParameterJdbcTemplate jdbc = mockJdbcReturning(List.<EventSummaryDto>of());
        EventReadRepository repository = new EventReadRepository(jdbc, new ObjectMapper());

        repository.findEvents(year, null, null, null, null, null, null, 10, 0);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<MapSqlParameterSource> params = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        ArgumentCaptor<RowMapper> mapper = ArgumentCaptor.forClass(RowMapper.class);
        org.mockito.Mockito.verify(jdbc).query(sql.capture(), params.capture(), mapper.capture());
        assertTrue(sql.getValue().contains("e.start_year <= :year AND e.effective_end_year >= :year"));
        assertEquals(year, params.getValue().getValue("year"));
    }

    @Test
    void unfilteredEventsKeepUndatedRecordsInScope() {
        NamedParameterJdbcTemplate jdbc = mockJdbcReturning(List.<EventSummaryDto>of());
        EventReadRepository repository = new EventReadRepository(jdbc, new ObjectMapper());

        repository.findEvents(null, null, null, null, null, null, null, 10, 0);

        String sql = capturedSql(jdbc);
        assertValidChronologyOrderBy(sql);
        assertFalse(sql.contains(EventReadRepository.NUMERIC_CHRONOLOGY_REQUIRED));
    }

    @Test
    void timelineRangeFiltersExcludeNullChronologyForBothBounds() {
        NamedParameterJdbcTemplate jdbc = mockJdbcReturning(List.<TimelineEventDto>of());
        EventReadRepository repository = new EventReadRepository(jdbc, new ObjectMapper());

        repository.findTimeline(1601, 1833, null, null);

        String sql = capturedSql(jdbc);
        assertValidChronologyOrderBy(sql);
        assertEquals(1, occurrences(sql, EventReadRepository.NUMERIC_CHRONOLOGY_REQUIRED));
        assertTrue(sql.contains("e.effective_end_year >= :fromYear"));
        assertTrue(sql.contains("e.start_year <= :toYear"));
    }

    @Test
    void unfilteredTimelineUsesValidNullLastOrdering() {
        NamedParameterJdbcTemplate jdbc = mockJdbcReturning(List.<TimelineEventDto>of());
        EventReadRepository repository = new EventReadRepository(jdbc, new ObjectMapper());

        repository.findTimeline(null, null, null, null);

        String sql = capturedSql(jdbc);
        assertValidChronologyOrderBy(sql);
        assertFalse(sql.contains(EventReadRepository.NUMERIC_CHRONOLOGY_REQUIRED));
    }

    @Test
    void timelineOneSidedFiltersStillExcludeNullChronology() {
        NamedParameterJdbcTemplate fromJdbc = mockJdbcReturning(List.<TimelineEventDto>of());
        EventReadRepository fromRepository = new EventReadRepository(fromJdbc, new ObjectMapper());
        fromRepository.findTimeline(1945, null, null, null);

        String fromSql = capturedSql(fromJdbc);
        assertValidChronologyOrderBy(fromSql);
        assertTrue(fromSql.contains(EventReadRepository.NUMERIC_CHRONOLOGY_REQUIRED));
        assertTrue(fromSql.contains("e.effective_end_year >= :fromYear"));
        assertFalse(fromSql.contains("e.start_year <= :toYear"));

        NamedParameterJdbcTemplate toJdbc = mockJdbcReturning(List.<TimelineEventDto>of());
        EventReadRepository toRepository = new EventReadRepository(toJdbc, new ObjectMapper());
        toRepository.findTimeline(null, 1945, null, null);

        String toSql = capturedSql(toJdbc);
        assertValidChronologyOrderBy(toSql);
        assertTrue(toSql.contains(EventReadRepository.NUMERIC_CHRONOLOGY_REQUIRED));
        assertFalse(toSql.contains("e.effective_end_year >= :fromYear"));
        assertTrue(toSql.contains("e.start_year <= :toYear"));
    }

    @Test
    void hierarchyChildOrderingKeepsOrderInParentPrimary() {
        NamedParameterJdbcTemplate jdbc = mockJdbcReturning(List.<EventSummaryDto>of());
        EventReadRepository repository = new EventReadRepository(jdbc, new ObjectMapper());

        repository.findChildren("parent");

        String sql = capturedSql(jdbc);
        assertTrue(sql.contains("ORDER BY e.order_in_parent ASC"));
        assertTrue(sql.contains("CASE WHEN e.start_year IS NULL THEN 1 ELSE 0 END"));
        assertFalse(sql.contains("ORDER BYCASE"));
        assertFalse(sql.contains("ORDER BY  CASE"));
    }

    private static NamedParameterJdbcTemplate mockJdbcReturning(List<?> result) {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        when(jdbc.query(anyString(), any(SqlParameterSource.class), any(RowMapper.class))).thenReturn((List) result);
        return jdbc;
    }

    private static String capturedSql(NamedParameterJdbcTemplate jdbc) {
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<MapSqlParameterSource> params = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        ArgumentCaptor<RowMapper> mapper = ArgumentCaptor.forClass(RowMapper.class);
        org.mockito.Mockito.verify(jdbc).query(sql.capture(), params.capture(), mapper.capture());
        return sql.getValue();
    }

    private static int occurrences(String value, String needle) {
        int count = 0;
        int index = value.indexOf(needle);
        while (index >= 0) {
            count++;
            index = value.indexOf(needle, index + needle.length());
        }
        return count;
    }

    private static void assertValidChronologyOrderBy(String sql) {
        assertTrue(sql.contains("ORDER BY CASE WHEN e.start_year IS NULL THEN 1 ELSE 0 END"));
        assertFalse(sql.contains("ORDER BYCASE"));
        assertFalse(sql.contains("ORDER BY  CASE"));
        assertTrue(sql.contains("e.start_year ASC"));
        assertTrue(sql.contains("e.order_in_parent ASC"));
        assertTrue(sql.contains("e.title ASC"));
        assertTrue(sql.contains("e.id ASC"));
    }
}

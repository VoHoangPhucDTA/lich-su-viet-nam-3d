package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.auth.domain.RoleEntity;
import com.lichsuvn.backend.auth.domain.UserEntity;
import com.lichsuvn.backend.auth.infrastructure.RoleRepository;
import com.lichsuvn.backend.auth.infrastructure.UserRepository;
import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminServiceSafetyTest {

    private NamedParameterJdbcTemplate jdbc;
    private UserRepository userRepository;
    private RoleRepository roleRepository;
    private AdminService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(NamedParameterJdbcTemplate.class);
        userRepository = mock(UserRepository.class);
        roleRepository = mock(RoleRepository.class);
        service = new AdminService(jdbc, new ObjectMapper(), userRepository, roleRepository);
    }

    @Test
    void administratorCannotDisableTheirOwnAccount() {
        String id = UUID.randomUUID().toString();
        UserEntity target = user(id, "active", "admin");
        when(userRepository.findById(any(byte[].class))).thenReturn(Optional.of(target));

        ApiException error = assertThrows(ApiException.class, () ->
                service.updateUserStatus(id, Map.of("status", "disabled"), principal(id)));

        assertEquals("ADMIN_GUARDRAIL", error.getCode());
        verify(userRepository).findById(any(byte[].class));
    }

    @Test
    void administratorCannotDemoteTheirOwnAccount() {
        String id = UUID.randomUUID().toString();
        UserEntity target = user(id, "active", "admin");
        when(userRepository.findById(any(byte[].class))).thenReturn(Optional.of(target));

        ApiException error = assertThrows(ApiException.class, () ->
                service.updateUserRole(id, Map.of("role", "student"), principal(id)));

        assertEquals("ADMIN_GUARDRAIL", error.getCode());
    }

    @Test
    void lastActiveAdministratorCannotBeDisabled() {
        String targetId = UUID.randomUUID().toString();
        String actorId = UUID.randomUUID().toString();
        UserEntity target = user(targetId, "active", "admin");
        when(userRepository.findById(any(byte[].class))).thenReturn(Optional.of(target));
        when(jdbc.queryForObject(
                anyString(), any(MapSqlParameterSource.class), eq(Integer.class)))
                .thenReturn(1);

        ApiException error = assertThrows(ApiException.class, () ->
                service.updateUserStatus(targetId, Map.of("status", "disabled"), principal(actorId)));

        assertEquals("ADMIN_GUARDRAIL", error.getCode());
    }

    @Test
    void lastActiveAdministratorCannotBeDemoted() {
        String targetId = UUID.randomUUID().toString();
        String actorId = UUID.randomUUID().toString();
        UserEntity target = user(targetId, "active", "admin");
        when(userRepository.findById(any(byte[].class))).thenReturn(Optional.of(target));
        when(jdbc.queryForObject(
                anyString(), any(MapSqlParameterSource.class), eq(Integer.class)))
                .thenReturn(1);

        ApiException error = assertThrows(ApiException.class, () ->
                service.updateUserRole(targetId, Map.of("role", "student"), principal(actorId)));

        assertEquals("ADMIN_GUARDRAIL", error.getCode());
    }

    @Test
    void teacherRoleIsCurrentlyRejectedByAdminMutationContract() {
        String targetId = UUID.randomUUID().toString();
        String actorId = UUID.randomUUID().toString();
        UserEntity target = user(targetId, "active", "student");
        when(userRepository.findById(any(byte[].class)))
                .thenReturn(Optional.of(target));

        ApiException error = assertThrows(ApiException.class, () ->
                service.updateUserRole(targetId, Map.of("role", "teacher"), principal(actorId)));

        assertEquals("INVALID_ROLE", error.getCode());
    }

    @Test
    void userListQueryCurrentlyCollapsesTeacherIntoStudent() {
        when(jdbc.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        when(jdbc.query(anyString(), any(MapSqlParameterSource.class), any(RowMapper.class)))
                .thenReturn(List.of());

        service.users(null, null, null, 20, 0);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(MapSqlParameterSource.class), any(RowMapper.class));
        assertTrue(sql.getValue().contains("ELSE 'student'"));
    }

    @Test
    void eventListUsesServerPaginationAndParameterizedSearchFilters() {
        when(jdbc.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Integer.class)))
                .thenReturn(1);
        when(jdbc.query(anyString(), any(MapSqlParameterSource.class), any(RowMapper.class)))
                .thenReturn(List.of());

        service.events("bach dang", "published", "atomic", "military", 900, 1000, 20, 40);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<MapSqlParameterSource> params = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(jdbc).query(sql.capture(), params.capture(), any(RowMapper.class));

        assertTrue(sql.getValue().contains("e.title LIKE :query"));
        assertTrue(sql.getValue().contains("e.status = :status"));
        assertTrue(sql.getValue().contains("e.event_level = :eventLevel"));
        assertTrue(sql.getValue().contains("e.event_type = :eventType"));
        assertTrue(sql.getValue().contains("LIMIT :limit OFFSET :offset"));
        assertEquals(20, params.getValue().getValue("limit"));
        assertEquals(40, params.getValue().getValue("offset"));
        assertEquals(900, params.getValue().getValue("from"));
        assertEquals(1000, params.getValue().getValue("to"));
    }

    @Test
    void eventListPreservesUnknownChronologyAndMissingOptionalValues() throws Exception {
        when(jdbc.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Integer.class)))
                .thenReturn(1);
        when(jdbc.query(anyString(), any(MapSqlParameterSource.class), any(RowMapper.class)))
                .thenAnswer(invocation -> {
                    @SuppressWarnings("unchecked")
                    RowMapper<Map<String, Object>> mapper = invocation.getArgument(2);
                    ResultSet rs = mock(ResultSet.class);
                    when(rs.getString("id")).thenReturn("undated-event");
                    when(rs.getString("slug")).thenReturn("undated-event");
                    when(rs.getString("title")).thenReturn("Undated event");
                    when(rs.getString("eventLevel")).thenReturn("atomic");
                    when(rs.getString("eventType")).thenReturn("political");
                    when(rs.getObject("startYear")).thenReturn(null);
                    when(rs.getObject("endYear")).thenReturn(null);
                    when(rs.getString("status")).thenReturn("draft");
                    when(rs.getTimestamp("updatedAt")).thenReturn(Timestamp.from(Instant.parse("2026-01-01T00:00:00Z")));
                    return List.of(mapper.mapRow(rs, 0));
                });

        Map<String, Object> page = service.events(null, null, null, null, null, null, 20, 0);
        @SuppressWarnings("unchecked")
        Map<String, Object> item = ((List<Map<String, Object>>) page.get("items")).getFirst();

        assertNull(item.get("startYear"));
        assertNull(item.get("endYear"));
        assertNull(item.get("cardSummary"));
        assertNull(item.get("thumbnailUrl"));
    }

    @Test
    void eventDetailReadsCanonicalGeoTypeWithoutNormalizingIt() throws Exception {
        when(jdbc.query(anyString(), any(MapSqlParameterSource.class), any(RowMapper.class)))
                .thenAnswer(invocation -> {
                    @SuppressWarnings("unchecked")
                    RowMapper<Map<String, Object>> mapper = invocation.getArgument(2);
                    ResultSet rs = mock(ResultSet.class);
                    when(rs.getString("id")).thenReturn("mixed-event");
                    when(rs.getObject("id")).thenReturn("mixed-event");
                    when(rs.getObject("geo_type")).thenReturn("mixed");
                    return List.of(mapper.mapRow(rs, 0));
                });

        Map<String, Object> event = service.event("mixed-event");

        assertEquals("mixed", event.get("geoType"));
        assertNull(event.get("startYear"));
        assertEquals(List.of(), event.get("provinceNames"));
    }

    @Test
    void canonicalPointGeoTypeIsCurrentlyRejectedByAdminWriteContract() {
        Map<String, Object> body = Map.of(
                "title", "Test event",
                "slug", "test-event",
                "startYear", 1945,
                "geoType", "point"
        );
        when(jdbc.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);

        ApiException error = assertThrows(ApiException.class, () ->
                service.createEvent(body, principal(UUID.randomUUID().toString())));

        assertEquals("INVALID_GEOTYPE", error.getCode());
    }

    @Test
    void createInsertCharacterizationCurrentlyOmitsRequiredKeyFactsColumn() {
        String slug = "characterization-event";
        when(jdbc.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(Integer.class)))
                .thenReturn(0);
        when(jdbc.query(anyString(), any(MapSqlParameterSource.class), any(RowMapper.class)))
                .thenReturn(List.of(Map.of("id", slug)));

        service.createEvent(Map.of(
                "title", "Characterization event",
                "slug", slug,
                "startYear", 1945,
                "geoType", "no_location"
        ), principal(UUID.randomUUID().toString()));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc, org.mockito.Mockito.atLeastOnce())
                .update(sql.capture(), any(MapSqlParameterSource.class));
        assertTrue(sql.getAllValues().getFirst().startsWith("INSERT INTO historical_events"));
        assertTrue(!sql.getAllValues().getFirst().contains("key_facts"),
                "This characterization intentionally records the current omission; Phase 2 should enable the regression after fixing it.");
    }

    @Test
    void partialUpdateCharacterizationShowsCurrentDefaultsAndPreservesRawMapData() {
        String eventId = "existing-event";
        Map<String, Object> current = Map.of(
                "id", eventId,
                "title", "Existing event",
                "slug", eventId,
                "startYear", 1945,
                "endYear", 1946,
                "geoType", "multi_region",
                "parentId", "parent",
                "showOnHomepage", false,
                "showOnTimeline", false,
                "featured", true
        );
        when(jdbc.query(anyString(), any(MapSqlParameterSource.class), any(RowMapper.class)))
                .thenReturn(List.of(current));
        when(jdbc.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(String.class)))
                .thenReturn("{\"mapData\":{\"geoType\":\"point\",\"marker\":{\"lat\":16.1,\"lng\":108.2}}}");

        service.updateEvent(eventId, Map.of(
                "title", "Updated title",
                "slug", eventId,
                "startYear", 1945
        ), principal(UUID.randomUUID().toString()));

        ArgumentCaptor<MapSqlParameterSource> params = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(jdbc, org.mockito.Mockito.atLeastOnce())
                .update(eq("UPDATE historical_events SET slug=:slug,title=:title,short_title=:shortTitle,event_level=:eventLevel,event_type=:eventType,event_subtype=:eventSubtype,start_year=:startYear,end_year=:endYear,effective_end_year=:effectiveEndYear,display_date=:displayDate,date_precision=:datePrecision,geo_type=:geoType,lat=:lat,lng=:lng,province_names=CAST(:provinceNames AS JSON),historical_locations=CAST(:historicalLocations AS JSON),parent_id=:parentId,root_id=:rootId,level=:level,order_in_parent=:orderInParent,card_summary=:cardSummary,canonical_summary=:canonicalSummary,detailed_narrative=:detailedNarrative,significance=:significance,show_on_homepage=:showOnHomepage,show_on_timeline=:showOnTimeline,featured=:featured,status=:status,content_hash=:contentHash,raw_json=CAST(:rawJson AS JSON),published_at=CASE WHEN :status='published' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END WHERE id=:id"), params.capture());

        MapSqlParameterSource update = params.getValue();
        assertEquals("no_location", update.getValue("geoType"));
        assertEquals("[]", update.getValue("provinceNames"));
        assertEquals(true, update.getValue("showOnHomepage"));
        assertEquals(false, update.getValue("featured"));
        assertEquals(null, update.getValue("parentId"));
        assertTrue(String.valueOf(update.getValue("rawJson")).contains("\"mapData\""));
    }

    private static UserEntity user(String id, String status, String roleCode) {
        UserEntity user = new UserEntity();
        user.setId(UuidBytes.fromUuid(UUID.fromString(id)));
        user.setStatus(status);
        RoleEntity role = mock(RoleEntity.class);
        when(role.getCode()).thenReturn(roleCode);
        user.setRoles(Set.of(role));
        return user;
    }

    private static UserPrincipal principal(String id) {
        return new UserPrincipal(
                id,
                UuidBytes.fromUuid(UUID.fromString(id)),
                id + "@example.test",
                List.of("admin")
        );
    }
}

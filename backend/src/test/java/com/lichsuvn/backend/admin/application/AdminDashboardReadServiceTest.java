package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminDashboardDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminDashboardReadRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminDashboardReadServiceTest {
    private final AdminEventReadRepository eventRepository = mock(AdminEventReadRepository.class);
    private final AdminDashboardReadRepository dashboardRepository =
            mock(AdminDashboardReadRepository.class);
    private final AdminDashboardReadService service = new AdminDashboardReadService(
            eventRepository, dashboardRepository, new EventCompletenessService());

    @Test
    void aggregateUsesFourFixedRepositoryCallsAndSharedIssueCodes() throws Exception {
        var complete = row("complete", "published", true, 1, true, Instant.parse("2026-01-02T00:00:00Z"));
        var incomplete = row("incomplete", "draft", false, 0, false, Instant.parse("2026-01-01T00:00:00Z"));
        when(eventRepository.findDashboardRows()).thenReturn(List.of(complete, incomplete));
        when(eventRepository.findGrades(List.of("complete", "incomplete")))
                .thenReturn(Map.of("complete", List.of(10), "incomplete", List.of()));
        when(dashboardRepository.findUserMetrics())
                .thenReturn(new AdminDashboardDtos.UserMetrics(7, 2));
        when(dashboardRepository.findRecentAudit(10)).thenReturn(List.of());

        AdminDashboardDtos.Dashboard dashboard = service.findDashboard();

        assertEquals(2, dashboard.metrics().events().total());
        assertEquals(1, dashboard.metrics().events().published());
        assertEquals(1, dashboard.metrics().events().draft());
        assertEquals(1, dashboard.metrics().events().missingThumbnail());
        assertEquals(1, dashboard.metrics().events().missingActiveMedia());
        assertEquals(1, dashboard.metrics().events().missingOrInvalidMapData());
        assertEquals(1, dashboard.metrics().events().withCompletenessIssues());
        assertEquals("incomplete", dashboard.attention().getFirst().id());
        assertEquals(
                new EventCompletenessService().assess(incomplete.facts().withGrades(List.of()))
                        .completeness().issues(),
                dashboard.attention().getFirst().completeness().issues());
        verify(eventRepository, times(1)).findDashboardRows();
        verify(eventRepository, times(1)).findGrades(List.of("complete", "incomplete"));
        verify(dashboardRepository, times(1)).findUserMetrics();
        verify(dashboardRepository, times(1)).findRecentAudit(10);
    }

    @Test
    void attentionIsUniqueStableOrderedExcludesArchivedAndStopsAtTen() throws Exception {
        List<AdminEventReadRepository.ListRow> rows = new ArrayList<>();
        for (int index = 0; index < 12; index++) {
            rows.add(row("draft-" + index, "draft", false, 0, false,
                    Instant.parse("2026-01-%02dT00:00:00Z".formatted(index + 1))));
        }
        rows.add(row("published", "published", false, 0, false,
                Instant.parse("2026-02-01T00:00:00Z")));
        rows.add(row("archived", "archived", false, 0, false,
                Instant.parse("2025-01-01T00:00:00Z")));
        rows.add(rows.getFirst());
        when(eventRepository.findDashboardRows()).thenReturn(rows);
        when(eventRepository.findGrades(rows.stream().map(AdminEventReadRepository.ListRow::id).toList()))
                .thenReturn(Map.of());

        List<AdminDashboardDtos.AttentionEvent> attention = service.findAttention();

        assertEquals(10, attention.size());
        assertEquals("published", attention.getFirst().id());
        assertFalse(attention.stream().anyMatch(item -> item.id().equals("archived")));
        assertEquals(attention.size(), attention.stream().map(AdminDashboardDtos.AttentionEvent::id)
                .distinct().count());
    }

    private static AdminEventReadRepository.ListRow row(
            String id,
            String status,
            boolean thumbnail,
            int mediaCount,
            boolean mapData,
            Instant updatedAt
    ) throws Exception {
        EventCompletenessFacts facts = new EventCompletenessFacts(
                true, true, true, true, true, true,
                new ObjectMapper().readTree("[\"Fact\"]"),
                thumbnail, mediaCount, mapData ? "point" : "point",
                java.math.BigDecimal.valueOf(21), java.math.BigDecimal.valueOf(105),
                List.of(), List.of(), mapData, mapData,
                mapData ? new ObjectMapper().readTree("""
                        {"geoType":"point","marker":{"lat":21,"lng":105}}
                        """) : null,
                938, null, 938, "atomic", "political", List.of()
        );
        AdminEventDtos.Thumbnail thumbnailDto = thumbnail
                ? new AdminEventDtos.Thumbnail(1L, "https://example.test/image.jpg", "Image") : null;
        return new AdminEventReadRepository.ListRow(
                id, id, id, null, "atomic", "political", null,
                new AdminEventDtos.Chronology(938, null, 938, null, "year"),
                status, "point", "Card", thumbnailDto, mediaCount,
                new AdminEventDtos.Flags(false, false, false),
                Instant.parse("2025-01-01T00:00:00Z"), updatedAt, facts
        );
    }
}

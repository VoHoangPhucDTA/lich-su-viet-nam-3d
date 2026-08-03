package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminEventReadServiceQueryPlanTest {
    private final AdminEventReadRepository repository = mock(AdminEventReadRepository.class);
    private final AdminEventReadService service =
            new AdminEventReadService(repository, new EventCompletenessService());

    @Test
    void listUsesOnePageBatchForGradesAndNeverQueriesPerRow() throws Exception {
        var first = listRow("event-1");
        var second = listRow("event-2");
        when(repository.count(any())).thenReturn(2L);
        when(repository.findPage(any())).thenReturn(List.of(first, second));
        when(repository.findGrades(List.of("event-1", "event-2")))
                .thenReturn(Map.of("event-1", List.of(10), "event-2", List.of(11)));

        var page = service.findEvents(
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, 20, 0);

        assertEquals(2, page.count());
        verify(repository, times(1)).count(any());
        verify(repository, times(1)).findPage(any());
        verify(repository, times(1)).findGrades(List.of("event-1", "event-2"));
    }

    @Test
    void emptyPageStillUsesTheSafeEmptyGradeBatch() {
        when(repository.count(any())).thenReturn(0L);
        when(repository.findPage(any())).thenReturn(List.of());
        when(repository.findGrades(List.of())).thenReturn(Map.of());

        var page = service.findEvents(
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, 20, 0);

        assertEquals(0, page.count());
        verify(repository, times(1)).findGrades(List.of());
    }

    @Test
    void detailUsesSevenFixedRepositoryCalls() throws Exception {
        var row = mock(AdminEventReadRepository.DetailRow.class);
        when(row.id()).thenReturn("event-1");
        when(row.slug()).thenReturn("event-1");
        when(row.title()).thenReturn("Event 1");
        when(row.eventLevel()).thenReturn("atomic");
        when(row.eventType()).thenReturn("political");
        when(row.status()).thenReturn("draft");
        when(row.normalizedGeoType()).thenReturn("no_location");
        when(row.chronology()).thenReturn(new AdminEventDtos.Chronology(null, null, null, null, null));
        when(row.flags()).thenReturn(new AdminEventDtos.Flags(false, false, false));
        when(row.keyFacts()).thenReturn(List.of("Fact"));
        when(row.provinceNames()).thenReturn(List.of());
        when(row.historicalLocations()).thenReturn(List.of());
        when(row.facts()).thenReturn(facts());
        when(repository.findCore("event-1")).thenReturn(Optional.of(row));
        when(repository.findGrades(List.of("event-1"))).thenReturn(Map.of("event-1", List.of(10)));
        when(repository.findMedia("event-1")).thenReturn(List.of());
        when(repository.findHierarchy("event-1", null, null))
                .thenReturn(new AdminEventReadRepository.HierarchyRows(null, null, List.of()));
        when(repository.findRelations("event-1")).thenReturn(List.of());
        when(repository.findVisibleTextbookReferences("event-1")).thenReturn(List.of());
        when(repository.findExternalSources("event-1")).thenReturn(List.of());

        service.findEvent("event-1");

        verify(repository, times(1)).findCore("event-1");
        verify(repository, times(1)).findGrades(List.of("event-1"));
        verify(repository, times(1)).findMedia("event-1");
        verify(repository, times(1)).findHierarchy("event-1", null, null);
        verify(repository, times(1)).findRelations("event-1");
        verify(repository, times(1)).findVisibleTextbookReferences("event-1");
        verify(repository, times(1)).findExternalSources("event-1");
    }

    private static AdminEventReadRepository.ListRow listRow(String id) throws Exception {
        return new AdminEventReadRepository.ListRow(
                id, id, "Event", null, "atomic", "political", null,
                new AdminEventDtos.Chronology(null, null, null, null, null),
                "draft", "no_location", "Card", null, 0,
                new AdminEventDtos.Flags(false, false, false), null, null, facts()
        );
    }

    private static EventCompletenessFacts facts() throws Exception {
        return new EventCompletenessFacts(
                true, true, true, true, true, true,
                new ObjectMapper().readTree("[\"Fact\"]"),
                false, 0, "no_location", null, null, List.of(), List.of(),
                false, false, null, null, null, null, "atomic", "political", List.of()
        );
    }
}

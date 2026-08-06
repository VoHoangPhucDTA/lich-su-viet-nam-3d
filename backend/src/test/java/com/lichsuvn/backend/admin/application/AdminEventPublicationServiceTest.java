package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventPublicationDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMutationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventPublicationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import com.lichsuvn.backend.common.exception.ApiException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminEventPublicationServiceTest {
    private static final String VERSION = "2026-07-26T03:00:00.123456Z";
    private static final LocalDateTime LOCAL_VERSION =
            LocalDateTime.of(2026, 7, 26, 10, 0, 0, 123_456_000);

    private final AdminEventPublicationRepository repository =
            mock(AdminEventPublicationRepository.class);
    private final AdminEventReadRepository readRepository =
            mock(AdminEventReadRepository.class);
    private final AdminEventMutationRepository auditRepository =
            mock(AdminEventMutationRepository.class);
    private final AdminEventReadService readService = mock(AdminEventReadService.class);
    private final AdminEventPublicationService service = new AdminEventPublicationService(
            repository,
            readRepository,
            auditRepository,
            new EventCompletenessService(),
            readService,
            new ObjectMapper());

    @Test
    void supportsOnlyTheFiveAllowedTransitions() {
        assertTransition("draft", "publish", "published", "event.published");
        assertTransition("draft", "archive", "archived", "event.archived");
        assertTransition("published", "unpublish", "draft", "event.unpublished");
        assertTransition("published", "archive", "archived", "event.archived");
        assertTransition("archived", "restore", "draft", "event.restored");
    }

    @Test
    void sameTargetPrecedesInvalidTransitionAndUnknownActionsAreStableBadRequests() {
        assertRejected("draft", "restore", "EVENT_ALREADY_IN_STATUS");
        assertRejected("draft", "unpublish", "EVENT_ALREADY_IN_STATUS");
        assertRejected("published", "publish", "EVENT_ALREADY_IN_STATUS");
        assertRejected("archived", "archive", "EVENT_ALREADY_IN_STATUS");
        assertRejected("archived", "publish", "INVALID_EVENT_STATUS_TRANSITION");
        assertRejected("published", "restore", "INVALID_EVENT_STATUS_TRANSITION");
        assertRejected("draft", "remove", "INVALID_PUBLICATION_ACTION");
    }

    @Test
    void publishBlocksOnlySharedErrorIssuesAndReturnsNoWarningIssues() {
        arrangeCurrent("draft", null);
        when(readRepository.findCompletenessFacts("event-1"))
                .thenReturn(Optional.of(invalidContentFacts()));
        when(readRepository.findGrades(List.of("event-1"))).thenReturn(Map.of());

        EventPublishBlockedException blocked = assertThrows(
                EventPublishBlockedException.class,
                () -> service.update("event-1", request("publish"), null));

        assertEquals(List.of("MISSING_CORE_CONTENT"), blocked.getIssues().stream()
                .map(AdminEventDtos.CompletenessIssue::code).toList());
        verify(repository, never()).update(anyString(), any(), anyString(), anyBoolean());
        verify(auditRepository, never()).audit(any(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void warningsUnknownChronologyAndValidNoLocationDoNotBlockPublication() {
        arrangeCurrent("draft", null);
        when(readRepository.findCompletenessFacts("event-1"))
                .thenReturn(Optional.of(validUnknownNoLocationFacts()));
        when(readRepository.findGrades(List.of("event-1"))).thenReturn(Map.of());
        when(repository.update(eq("event-1"), eq(LOCAL_VERSION), eq("published"), eq(true)))
                .thenReturn(true);
        when(repository.currentVersion("event-1"))
                .thenReturn(LOCAL_VERSION.plusNanos(1_000));
        when(readService.findEvent("event-1")).thenReturn(detail("published"));

        AdminEventDtos.Detail result = service.update("event-1", request("publish"), null);

        assertEquals("published", result.publication().status());
        verify(repository).update("event-1", LOCAL_VERSION, "published", true);
        verify(auditRepository).audit(
                eq(null), eq("event.published"), eq("event-1"), anyString(), anyString());
    }

    @Test
    void staleVersionChecksBeforeCompletenessAndWritesNothing() {
        when(repository.lockCurrent("event-1")).thenReturn(Optional.of(
                new AdminEventPublicationRepository.CurrentPublication(
                        "event-1", "draft", null, LOCAL_VERSION.plusSeconds(1))));

        ApiException conflict = assertThrows(ApiException.class,
                () -> service.update("event-1", request("publish"), null));

        assertEquals("EVENT_UPDATE_CONFLICT", conflict.getCode());
        verify(readRepository, never()).findCompletenessFacts(anyString());
        verify(repository, never()).update(anyString(), any(), anyString(), anyBoolean());
        verify(auditRepository, never()).audit(any(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void invalidVersionAndMissingEventHaveStableErrors() {
        when(repository.lockCurrent("event-1")).thenReturn(Optional.empty());
        ApiException missing = assertThrows(ApiException.class,
                () -> service.update("event-1", request("publish"), null));
        assertEquals("EVENT_NOT_FOUND", missing.getCode());

        arrangeCurrent("draft", null);
        ApiException invalidVersion = assertThrows(ApiException.class,
                () -> service.update("event-1",
                        new AdminEventPublicationDtos.Patch("2026-07-26T03:00:00Z", "publish"),
                        null));
        assertEquals("INVALID_EXPECTED_VERSION", invalidVersion.getCode());
    }

    private void assertTransition(
            String currentStatus,
            String action,
            String targetStatus,
            String auditAction
    ) {
        LocalDateTime publishedAt = "draft".equals(currentStatus)
                ? null : LOCAL_VERSION.minusDays(1);
        arrangeCurrent(currentStatus, publishedAt);
        if ("publish".equals(action)) {
            when(readRepository.findCompletenessFacts("event-1"))
                    .thenReturn(Optional.of(validUnknownNoLocationFacts()));
            when(readRepository.findGrades(List.of("event-1")))
                    .thenReturn(Map.of("event-1", List.of(10)));
        }
        when(repository.update(
                eq("event-1"), eq(LOCAL_VERSION), eq(targetStatus),
                eq("publish".equals(action) && publishedAt == null))).thenReturn(true);
        when(repository.currentVersion("event-1")).thenReturn(LOCAL_VERSION.plusNanos(1_000));
        when(readService.findEvent("event-1")).thenReturn(detail(targetStatus));

        assertEquals(targetStatus,
                service.update("event-1", request(action), null).publication().status());
        verify(auditRepository, atLeastOnce()).audit(
                eq(null), eq(auditAction), eq("event-1"), anyString(), anyString());
    }

    private void assertRejected(String status, String action, String code) {
        arrangeCurrent(status, "draft".equals(status) ? null : LOCAL_VERSION.minusDays(1));
        ApiException exception = assertThrows(ApiException.class,
                () -> service.update("event-1", request(action), null));
        assertEquals(code, exception.getCode());
        verify(repository, never()).update(anyString(), any(), anyString(), anyBoolean());
        verify(auditRepository, never()).audit(any(), anyString(), anyString(), anyString(), anyString());
    }

    private void arrangeCurrent(String status, LocalDateTime publishedAt) {
        when(repository.lockCurrent("event-1")).thenReturn(Optional.of(
                new AdminEventPublicationRepository.CurrentPublication(
                        "event-1", status, publishedAt, LOCAL_VERSION)));
    }

    private static AdminEventPublicationDtos.Patch request(String action) {
        return new AdminEventPublicationDtos.Patch(VERSION, action);
    }

    private static EventCompletenessFacts validUnknownNoLocationFacts() {
        return new EventCompletenessFacts(
                true, true, true, true, true, true,
                new ObjectMapper().createArrayNode().add("Fact"),
                0, 0, "no_location", null, null, List.of(), List.of(),
                false, false, null, null, null, null,
                "atomic", "political", List.of());
    }

    private static EventCompletenessFacts invalidContentFacts() {
        return new EventCompletenessFacts(
                true, true, false, false, false, false,
                new ObjectMapper().createArrayNode(),
                0, 0, "no_location", null, null, List.of(), List.of(),
                false, false, null, null, null, null,
                "atomic", "political", List.of());
    }

    private static AdminEventDtos.Detail detail(String status) {
        return new AdminEventDtos.Detail(
                new AdminEventDtos.Core("event-1", "event-1", "Event", null),
                null, null, null,
                new AdminEventDtos.Publication(
                        status,
                        new AdminEventDtos.Flags(false, false, false),
                        status.equals("published") ? Instant.parse("2026-07-26T03:00:00Z") : null,
                        null,
                        Instant.parse("2026-07-26T03:00:00.123457Z")),
                null, null, null, null, List.of(),
                new AdminEventDtos.Completeness(true, 0, List.of()));
    }
}

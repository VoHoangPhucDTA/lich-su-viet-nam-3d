package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventImageRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMutationRepository;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit-level confirmation that {@link AdminEventImageUploadService#finalizeUpload}
 * delegates to the diff-based lenient guard so legacy incomplete published
 * events can still upload gallery images. The opposite direction (lifecycle
 * regressions that introduce new ERROR codes) is already covered by the
 * policy tests in {@link AdminEventReadServicePublicationGuardTest}; this file
 * proves the upload service wires the guard correctly.
 */
class AdminEventImageUploadPublicationGuardTest {

    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    @Test
    void finalizeUploadAcceptsLegacyIncompletePublishedEventViaDiffGuard() throws Exception {
        var setup = setupUploadMocks();
        when(setup.readService.findEvent(eq("event-id")))
                .thenReturn(detailWith("published",
                        List.of(new AdminEventDtos.CompletenessIssue(
                                "MISSING_CORE_CONTENT", "CONTENT", "ERROR",
                                List.of("canonicalSummary")))));
        // Post-finalize detail shows the same ERROR → diff guard says: no NEW error.
        when(setup.readService.findEventAfterMutation(eq("event-id"), any()))
                .thenReturn(detailWith("published",
                        List.of(new AdminEventDtos.CompletenessIssue(
                                "MISSING_CORE_CONTENT", "CONTENT", "ERROR",
                                List.of("canonicalSummary")))));

        var response = assertDoesNotThrow(() -> setup.service.finalizeUpload(
                "event-id",
                "2026-07-29T07:59:00.123456Z",
                LocalDateTime.of(2026, 7, 29, 7, 59),
                AdminEventImageNaming.Kind.GALLERY,
                setup.validatedImage,
                setup.reservation,
                setup.stored,
                setup.principal));

        assertEquals(42L, response.mediaId());
        assertEquals("published", response.event().publication().status());
    }

    @Test
    void finalizeUploadPropagatesDiffBasedGuardRejection() throws Exception {
        // The diff-based guard lives inside AdminEventReadService and is
        // exercised when the mock lets the call through. Here we simulate
        // the guard's verified outcome by having findEventAfterMutation
        // throw the bounded PublishedEventMutationBlockedException the
        // production code would emit when an upload introduces a new ERROR.
        var setup = setupUploadMocks();
        when(setup.readService.findEvent(eq("event-id")))
                .thenReturn(detailWith("published", List.of()));
        PublishedEventMutationBlockedException guardRejection = new PublishedEventMutationBlockedException(
                List.of(new AdminEventDtos.CompletenessIssue(
                        "INVALID_GEOGRAPHY", "GEOGRAPHY", "ERROR", List.of("geoType"))));
        when(setup.readService.findEventAfterMutation(eq("event-id"), any()))
                .thenThrow(guardRejection);

        PublishedEventMutationBlockedException propagated = assertThrows(
                PublishedEventMutationBlockedException.class,
                () -> setup.service.finalizeUpload(
                        "event-id",
                        "2026-07-29T07:59:00.123456Z",
                        LocalDateTime.of(2026, 7, 29, 7, 59),
                        AdminEventImageNaming.Kind.GALLERY,
                        setup.validatedImage,
                        setup.reservation,
                        setup.stored,
                        setup.principal));

        assertEquals(guardRejection.getCode(), propagated.getCode());
        assertEquals(1, propagated.introduced().size());
        assertEquals("INVALID_GEOGRAPHY", propagated.introduced().getFirst().code());
    }

    @Test
    void finalizeUploadKeepsDraftEventsUngoverned() throws Exception {
        var setup = setupUploadMocks();
        when(setup.readService.findEvent(eq("event-id")))
                .thenReturn(detailWith("draft",
                        List.of(new AdminEventDtos.CompletenessIssue(
                                "MISSING_GRADES", "CLASSIFICATION", "WARNING",
                                List.of("grades")))));
        when(setup.readService.findEventAfterMutation(eq("event-id"), any()))
                .thenReturn(detailWith("draft", List.of()));

        var response = assertDoesNotThrow(() -> setup.service.finalizeUpload(
                "event-id",
                "2026-07-29T07:59:00.123456Z",
                LocalDateTime.of(2026, 7, 29, 7, 59),
                AdminEventImageNaming.Kind.GALLERY,
                setup.validatedImage,
                setup.reservation,
                setup.stored,
                setup.principal));

        assertEquals(42L, response.mediaId());
        assertEquals("draft", response.event().publication().status());
    }

    private AdminEventDtos.Detail detailWith(
            String status, List<AdminEventDtos.CompletenessIssue> issues
    ) {
        var completeness = new AdminEventDtos.Completeness(
                issues.isEmpty(), issues.size(), issues);
        var flags = new AdminEventDtos.Flags(true, true, false);
        var publication = new AdminEventDtos.Publication(
                status, flags,
                "published".equals(status) ? Instant.parse("2026-07-29T08:00:00.000000Z") : null,
                Instant.parse("2026-07-29T07:00:00.000000Z"),
                Instant.parse("2026-07-29T08:00:00.000000Z"));
        return new AdminEventDtos.Detail(
                new AdminEventDtos.Core("event-id", "slug", "Sự kiện", null),
                new AdminEventDtos.Content(
                        "Tóm tắt", "Tóm tắt chuẩn", "Nội dung", "Ý nghĩa",
                        List.of("Fact")),
                new AdminEventDtos.Chronology(1945, 1945, 1945, null, null),
                new AdminEventDtos.Classification("atomic", "military", null, List.of(10)),
                publication,
                new AdminEventDtos.MediaSection(null, List.of(), 1),
                new AdminEventDtos.Geography("no_location", "no_location", null, null,
                        List.of(), List.of(), null),
                new AdminEventDtos.Hierarchy(null, null, List.of(), List.of()),
                new AdminEventDtos.Textbook(List.of(), 0, 0, false),
                List.of(),
                completeness);
    }

    private UploadSetup setupUploadMocks() throws Exception {
        var repository = mock(AdminEventImageRepository.class);
        var auditRepository = mock(AdminEventMutationRepository.class);
        var readService = mock(AdminEventReadService.class);
        var validator = mock(EventImageValidator.class);
        var storage = mock(EventImageStorage.class);
        var transactions = mock(TransactionTemplate.class);

        var reservation = new AdminEventImageUploadService.UploadReservation(
                42L,
                "00000000-0000-4000-8000-000000004242",
                "events/event-id/media/00000000-0000-4000-8000-000000004242",
                "00000000-0000-4000-8000-000000004243",
                1);
        var row = new AdminEventImageRepository.ReservationRow(
                reservation.mediaId(),
                "event-id",
                reservation.assetId(),
                reservation.publicId(),
                "UPLOADING",
                reservation.uploadToken(),
                LocalDateTime.of(2026, 7, 29, 19, 0),
                false,
                "hidden");
        var validatedImage = new EventImageValidator.ValidatedEventImage(
                new byte[]{1, 2, 3}, "image/png", "png", 3, "0".repeat(64),
                4, 2, "Alt text", null, null, null);
        var stored = new EventImageStorage.StoredImage(
                reservation.publicId(), "asset", 1,
                "https://provider.example.test/original", "image/png", "png",
                3, 4, 2);

        // Match the event status to a published-event flow so the strict
        // guard inside the service (lock-based) accepts the reservation;
        // the diff guard happens later inside findEventAfterMutation.
        var event = new AdminEventImageRepository.EventLock(
                "event-id", "published", LocalDateTime.of(2026, 7, 29, 7, 59));

        when(repository.lockEvent("event-id")).thenReturn(event);
        when(repository.lockReservation(42L)).thenReturn(row);
        when(storage.deliveryUrl(any())).thenReturn(
                "https://delivery.example.test/events/event-id/media/" + reservation.assetId());
        when(repository.bumpEventVersion(eq("event-id"), any())).thenReturn(true);
        when(transactions.execute(any())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            org.springframework.transaction.support.TransactionCallback<Object> callback =
                    invocation.getArgument(0);
            return callback.doInTransaction(null);
        });
        org.mockito.Mockito.doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            java.util.function.Consumer<Object> callback = invocation.getArgument(0);
            callback.accept(null);
            return null;
        }).when(transactions).executeWithoutResult(any());

        var service = new AdminEventImageUploadService(
                repository, auditRepository, readService, validator, storage,
                new ObjectMapper(), transactions,
                Clock.fixed(Instant.parse("2026-07-29T08:00:00Z"), DATABASE_ZONE), 10);

        return new UploadSetup(service, readService, reservation, validatedImage, stored,
                new UserPrincipal("admin", new byte[16], "admin@example.test", List.of("admin")));
    }

    private static final class UploadSetup {
        final AdminEventImageUploadService service;
        final AdminEventReadService readService;
        final AdminEventImageUploadService.UploadReservation reservation;
        final EventImageValidator.ValidatedEventImage validatedImage;
        final EventImageStorage.StoredImage stored;
        final UserPrincipal principal;

        UploadSetup(AdminEventImageUploadService service,
                    AdminEventReadService readService,
                    AdminEventImageUploadService.UploadReservation reservation,
                    EventImageValidator.ValidatedEventImage validatedImage,
                    EventImageStorage.StoredImage stored,
                    UserPrincipal principal) {
            this.service = service;
            this.readService = readService;
            this.reservation = reservation;
            this.validatedImage = validatedImage;
            this.stored = stored;
            this.principal = principal;
        }
    }
}

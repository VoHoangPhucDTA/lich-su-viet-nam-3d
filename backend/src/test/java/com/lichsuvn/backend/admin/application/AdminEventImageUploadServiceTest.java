package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventImageRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMutationRepository;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AdminEventImageUploadServiceTest {
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    @Test
    void duplicateFinalizeOfReadyReservationIsIdempotent() {
        var repository = mock(AdminEventImageRepository.class);
        var auditRepository = mock(AdminEventMutationRepository.class);
        var readService = mock(AdminEventReadService.class);
        var validator = mock(EventImageValidator.class);
        var storage = mock(EventImageStorage.class);
        var transactions = mock(TransactionTemplate.class);
        var clock = Clock.fixed(
                Instant.parse("2026-07-29T08:00:00Z"), DATABASE_ZONE);
        var service = new AdminEventImageUploadService(
                repository,
                auditRepository,
                readService,
                validator,
                storage,
                new ObjectMapper(),
                transactions,
                clock,
                10);

        LocalDateTime expected = LocalDateTime.ofInstant(
                Instant.parse("2026-07-29T07:59:00.123456Z"), DATABASE_ZONE);
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
                "READY",
                null,
                null,
                false,
                "active");
        var detail = mock(AdminEventDtos.Detail.class);
        var publication = mock(AdminEventDtos.Publication.class);
        when(detail.publication()).thenReturn(publication);
        when(publication.updatedAt())
                .thenReturn(Instant.parse("2026-07-29T08:00:00.654321Z"));
        when(repository.lockEvent("event-id"))
                .thenReturn(new AdminEventImageRepository.EventLock(
                        "event-id", "draft", expected.plusNanos(1_000)));
        when(repository.lockReservation(42L)).thenReturn(row);
        when(readService.findEvent("event-id")).thenReturn(detail);

        var image = new EventImageValidator.ValidatedEventImage(
                new byte[]{1}, "image/png", "png", 1, "0".repeat(64),
                1, 1, "Alt text", null, null, null);
        var stored = new EventImageStorage.StoredImage(
                reservation.publicId(), "asset", 1,
                "https://provider.example.test/original", "image/png", "png",
                1, 1, 1);
        var principal = new UserPrincipal(
                "admin", new byte[16], "admin@example.test", List.of("admin"));

        var first = service.finalizeUpload(
                "event-id",
                "2026-07-29T07:59:00.123456Z",
                expected,
                AdminEventImageNaming.Kind.GALLERY,
                image,
                reservation,
                stored,
                principal);
        var second = service.finalizeUpload(
                "event-id",
                "2026-07-29T07:59:00.123456Z",
                expected,
                AdminEventImageNaming.Kind.GALLERY,
                image,
                reservation,
                stored,
                principal);

        assertEquals(42L, first.mediaId());
        assertEquals(first, second);
        verify(repository, times(2)).lockEvent("event-id");
        verify(repository, times(2)).lockReservation(42L);
        verify(repository, never()).bumpEventVersion(any(), any());
        verify(repository, never()).finalizeReservation(
                anyLong(), any(), any(), anyBoolean(), anyInt());
        verify(auditRepository, never()).audit(any(), any(), any(), any(), any());
    }

    @Test
    void validationFailureDoesNotReserveOrInvokeStorage() {
        var repository = mock(AdminEventImageRepository.class);
        var auditRepository = mock(AdminEventMutationRepository.class);
        var readService = mock(AdminEventReadService.class);
        var validator = mock(EventImageValidator.class);
        var storage = mock(EventImageStorage.class);
        var transactions = mock(TransactionTemplate.class);
        var service = new AdminEventImageUploadService(
                repository,
                auditRepository,
                readService,
                validator,
                storage,
                new ObjectMapper(),
                transactions,
                Clock.system(DATABASE_ZONE),
                10);
        var file = new MockMultipartFile(
                "file", "client-name.svg", "image/svg+xml", new byte[]{1});
        when(storage.available()).thenReturn(true);
        when(validator.validate(file, "Alt text", null, null, null))
                .thenThrow(new ApiException(
                        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                        "EVENT_IMAGE_UNSUPPORTED_FORMAT",
                        "Invalid image"));

        ApiException rejected = assertThrows(ApiException.class, () -> service.upload(
                "event-id",
                file,
                "2026-07-29T07:59:00.123456Z",
                "gallery",
                "Alt text",
                null,
                null,
                null,
                new UserPrincipal(
                        "admin", new byte[16], "admin@example.test", List.of("admin"))));

        assertEquals("EVENT_IMAGE_UNSUPPORTED_FORMAT", rejected.getCode());
        verifyNoInteractions(repository);
        verify(storage, never()).upload(any());
    }

    @Test
    void uploadFeatureFlagRejectsNewUploadWhileStorageRemainsAvailableForCleanup() {
        var repository = mock(AdminEventImageRepository.class);
        var auditRepository = mock(AdminEventMutationRepository.class);
        var readService = mock(AdminEventReadService.class);
        var validator = mock(EventImageValidator.class);
        var storage = mock(EventImageStorage.class);
        var transactions = mock(TransactionTemplate.class);
        when(storage.available()).thenReturn(true);
        var service = new AdminEventImageUploadService(
                repository,
                auditRepository,
                readService,
                validator,
                storage,
                new ObjectMapper(),
                transactions,
                Clock.system(DATABASE_ZONE),
                10,
                false);

        ApiException rejected = assertThrows(ApiException.class, () -> service.upload(
                "event-id",
                new MockMultipartFile(
                        "file", "image.png", "image/png", new byte[]{1}),
                "2026-07-29T07:59:00.123456Z",
                "gallery",
                "Alt text",
                null,
                null,
                null,
                new UserPrincipal(
                        "admin", new byte[16], "admin@example.test", List.of("admin"))));

        assertEquals("EVENT_IMAGE_UPLOAD_UNAVAILABLE", rejected.getCode());
        verifyNoInteractions(repository, validator);
        verify(storage, never()).upload(any());
    }
}

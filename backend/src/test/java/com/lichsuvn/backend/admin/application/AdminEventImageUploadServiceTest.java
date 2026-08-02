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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doAnswer;
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

    @Test
    void replacementKeepsMediaIdentityEnqueuesOnlyOldAssetAndAddsOwnershipMetadata() {
        var fixture = replacementFixture();
        when(fixture.storage.upload(any())).thenAnswer(invocation -> {
            EventImageStorage.UploadCommand command = invocation.getArgument(0);
            fixture.uploadCommand = command;
            return new EventImageStorage.StoredImage(command.publicId(), "new-provider-asset", 9,
                    "https://provider.example.test/new", "image/png", "png", 4, 2, 2);
        });
        when(fixture.storage.deliveryUrl(any())).thenReturn("https://delivery.example.test/new");
        var result = fixture.service.replace("event-id", 42L, fixture.file,
                fixture.version, null, null, null, null, fixture.principal);

        assertEquals(42L, result.mediaId());
        assertEquals("event-id", fixture.uploadCommand.ownershipContext().get("event_id"));
        assertEquals("managed-event-media", fixture.uploadCommand.ownershipTags().get(1));
        verify(fixture.repository).replaceManagedStorage(any(), any(), any(), any(), any(), any(), any());
        verify(fixture.repository).armCleanup(eq("events/event-id/media/old"), eq("old-provider-asset"), any());
        verify(fixture.storage, never()).delete(any());
    }

    @Test
    void replacementPersistenceFailureCompensatesOnlyNewOrphan() {
        var fixture = replacementFixture();
        when(fixture.storage.upload(any())).thenAnswer(invocation -> {
            EventImageStorage.UploadCommand command = invocation.getArgument(0);
            fixture.uploadCommand = command;
            return new EventImageStorage.StoredImage(command.publicId(), "new-provider-asset", 9,
                    "https://provider.example.test/new", "image/png", "png", 4, 2, 2);
        });
        when(fixture.storage.deliveryUrl(any())).thenReturn("https://delivery.example.test/new");
        org.mockito.Mockito.doThrow(new IllegalStateException("db failure"))
                .when(fixture.repository).replaceManagedStorage(any(), any(), any(), any(), any(), any(), any());

        ApiException error = assertThrows(ApiException.class, () -> fixture.service.replace(
                "event-id", 42L, fixture.file, fixture.version, null, null, null, null, fixture.principal));

        assertEquals("EVENT_IMAGE_REPLACEMENT_PERSISTENCE_FAILED", error.getCode());
        verify(fixture.repository).armCleanup(eq(fixture.uploadCommand.publicId()),
                eq("new-provider-asset"), any());
        verify(fixture.repository, never()).armCleanup(eq("events/event-id/media/old"), any(), any());
    }

    @Test
    void invalidProviderResponseQueuesOnlyTheNewOrphan() {
        var fixture = replacementFixture();
        when(fixture.storage.upload(any())).thenAnswer(invocation -> {
            EventImageStorage.UploadCommand command = invocation.getArgument(0);
            fixture.uploadCommand = command;
            return new EventImageStorage.StoredImage(command.publicId(), "new-provider-asset", 9,
                    "https://provider.example.test/new", "image/png", "png", 4, 1, 2);
        });

        ApiException error = assertThrows(ApiException.class, () -> fixture.service.replace(
                "event-id", 42L, fixture.file, fixture.version, null, null, null, null, fixture.principal));

        assertEquals("EVENT_IMAGE_PROVIDER_RESPONSE_INVALID", error.getCode());
        verify(fixture.repository).armCleanup(eq(fixture.uploadCommand.publicId()),
                eq("new-provider-asset"), any());
        verify(fixture.repository, never()).armCleanup(eq("events/event-id/media/old"), any(), any());
    }

    @Test
    void staleReplacementFailsBeforeCloudinaryUpload() {
        var fixture = replacementFixture();
        when(fixture.repository.lockEvent("event-id"))
                .thenReturn(new AdminEventImageRepository.EventLock(
                        "event-id", "draft", LocalDateTime.of(2026, 7, 29, 16, 0)));

        ApiException error = assertThrows(ApiException.class, () -> fixture.service.replace(
                "event-id", 42L, fixture.file, fixture.version, null, null, null, null, fixture.principal));

        assertEquals("EVENT_UPDATE_CONFLICT", error.getCode());
        verify(fixture.storage, never()).upload(any());
    }

    private ReplacementFixture replacementFixture() {
        var repository = mock(AdminEventImageRepository.class);
        var auditRepository = mock(AdminEventMutationRepository.class);
        var readService = mock(AdminEventReadService.class);
        var validator = mock(EventImageValidator.class);
        var storage = mock(EventImageStorage.class);
        var transactions = mock(TransactionTemplate.class);
        var clock = Clock.fixed(Instant.parse("2026-07-29T08:00:00Z"), DATABASE_ZONE);
        when(storage.available()).thenReturn(true);
        when(transactions.execute(any())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            org.springframework.transaction.support.TransactionCallback<Object> callback = invocation.getArgument(0);
            return callback.doInTransaction(null);
        });
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            java.util.function.Consumer<Object> callback = invocation.getArgument(0);
            callback.accept(null);
            return null;
        }).when(transactions).executeWithoutResult(any());
        var service = new AdminEventImageUploadService(
                repository, auditRepository, readService, validator, storage, new ObjectMapper(),
                transactions, clock, 10);
        var event = new AdminEventImageRepository.EventLock(
                "event-id", "draft", LocalDateTime.of(2026, 7, 29, 15, 0));
        var row = new AdminEventImageRepository.ReplacementMedia(
                42L, "event-id", "old-asset", "cloudinary", "events/event-id/media/old",
                "old-provider-asset", "READY", false, "active", 2,
                "Caption", "Alt text", "Source", "License");
        when(repository.lockEvent("event-id")).thenReturn(event);
        when(repository.lockReplacementMedia(42L)).thenReturn(row);
        when(repository.bumpEventVersion(eq("event-id"), any())).thenReturn(true);
        var detail = mockDetail();
        when(readService.findEventAfterMutation("event-id")).thenReturn(detail);
        when(validator.validate(any(), any(), any(), any(), any())).thenReturn(
                new EventImageValidator.ValidatedEventImage(
                        new byte[]{1, 2}, "image/png", "png", 2, "0".repeat(64),
                        2, 2, "Alt text", null, null, null));
        return new ReplacementFixture(repository, storage, service,
                new MockMultipartFile("file", "replacement.png", "image/png", new byte[]{1, 2}),
                "2026-07-29T08:00:00.000000Z",
                new UserPrincipal("admin", new byte[16], "admin@example.test", List.of("admin")));
    }

    private AdminEventDtos.Detail mockDetail() {
        var detail = mock(AdminEventDtos.Detail.class);
        var publication = mock(AdminEventDtos.Publication.class);
        when(detail.publication()).thenReturn(publication);
        when(publication.updatedAt()).thenReturn(Instant.parse("2026-07-29T08:00:00.654321Z"));
        return detail;
    }

    private static final class ReplacementFixture {
        final AdminEventImageRepository repository;
        final EventImageStorage storage;
        final AdminEventImageUploadService service;
        final MockMultipartFile file;
        final String version;
        final UserPrincipal principal;
        EventImageStorage.UploadCommand uploadCommand;

        ReplacementFixture(AdminEventImageRepository repository, EventImageStorage storage,
                           AdminEventImageUploadService service, MockMultipartFile file,
                           String version, UserPrincipal principal) {
            this.repository = repository;
            this.storage = storage;
            this.service = service;
            this.file = file;
            this.version = version;
            this.principal = principal;
        }
    }
}

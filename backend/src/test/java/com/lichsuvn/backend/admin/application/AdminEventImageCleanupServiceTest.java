package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.infrastructure.AdminEventImageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.function.Consumer;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminEventImageCleanupServiceTest {
    private AdminEventImageRepository repository;
    private EventImageStorage storage;
    private TransactionTemplate transactions;

    @BeforeEach
    void setUp() {
        repository = mock(AdminEventImageRepository.class);
        storage = mock(EventImageStorage.class);
        transactions = mock(TransactionTemplate.class);
        when(storage.available()).thenReturn(true);
        when(repository.countOverduePending(any())).thenReturn(0L);
        when(transactions.execute(any())).thenAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(null);
        });
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Consumer<Object> callback = invocation.getArgument(0);
            callback.accept(null);
            return null;
        }).when(transactions).executeWithoutResult(any());
    }

    @Test
    void nonRetryableProviderFailureBecomesTerminalImmediately() {
        var claim = claim(1);
        arrangeClaim(claim);
        when(storage.delete(any())).thenThrow(
                new EventImageStorage.EventImageStorageException(
                        "EVENT_IMAGE_PROVIDER_RESPONSE_INVALID", false));
        var service = service(3);

        service.runOnce();

        verify(repository).failCleanup(
                eq(claim.id()), anyString(), eq("EVENT_IMAGE_PROVIDER_RESPONSE_INVALID"));
        verify(repository, never()).releaseCleanup(
                anyLong(), anyString(), any(), anyString());
    }

    @Test
    void retryableProviderFailureUsesBoundedRetrySchedule() {
        var claim = claim(1);
        arrangeClaim(claim);
        when(storage.delete(any())).thenThrow(
                new EventImageStorage.EventImageStorageException(
                        "EVENT_IMAGE_PROVIDER_DELETE_FAILED", true));
        var service = service(3);

        service.runOnce();

        verify(repository).releaseCleanup(
                anyLong(), anyString(), any(), anyString());
        verify(repository, never()).failCleanup(
                anyLong(), anyString(), anyString());
    }

    @Test
    void activeManagedAssetIsNeverDeletedByCleanupWorker() {
        var claim = claim(1);
        when(repository.claimCleanup(any(), any(), anyString(), anyInt())).thenReturn(claim);
        when(repository.cleanupDecision(anyString(), any()))
                .thenReturn(new AdminEventImageRepository.CleanupDecision("READY", null));
        when(storage.available()).thenReturn(true);
        var service = service(3);

        service.runOnce();

        verify(storage, never()).delete(any());
        verify(repository).finishCleanup(eq(claim.id()), anyString(), eq("__never_matches_ready__"));
    }

    private void arrangeClaim(AdminEventImageRepository.CleanupClaim claim) {
        when(repository.claimCleanup(any(), any(), anyString(), anyInt()))
                .thenReturn(claim);
        when(repository.cleanupDecision(anyString(), any()))
                .thenReturn(new AdminEventImageRepository.CleanupDecision(
                        "DELETE_PENDING", null));
        when(storage.available()).thenReturn(true);
    }

    private AdminEventImageCleanupService service(int maxAttempts) {
        return new AdminEventImageCleanupService(
                repository,
                storage,
                transactions,
                Clock.fixed(
                        Instant.parse("2026-07-29T08:00:00Z"),
                        ZoneId.of("Asia/Ho_Chi_Minh")),
                true,
                120,
                maxAttempts,
                60_000L);
    }

    private AdminEventImageRepository.CleanupClaim claim(int attempts) {
        return new AdminEventImageRepository.CleanupClaim(
                7L, "cloudinary", "events/event/media/asset", "provider", attempts);
    }
}

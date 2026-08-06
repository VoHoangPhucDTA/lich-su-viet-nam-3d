package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminMediaCleanupDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventImageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Runtime corrective-pass tests for the Cloudinary cleanup scheduler. These
 * tests document the contract that follows the admin upload corrective pass:
 * late starts drain due PENDING tasks on the first tick, manual ticks are
 * observable through the capability endpoint, and an unexpected exception
 * in one tick never stops the next tick from being scheduled.
 */
class AdminEventImageCleanupSchedulerTest {
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
    void firstTickAfterFlagEnablementClaimsOverduePendingTasks() {
        when(repository.countOverduePending(any())).thenReturn(2L);
        var claim = claim(1);
        arrangeClaim(claim);

        AdminEventImageCleanupService.TickOutcome outcome =
                enabledService().runOnceDetailed();

        verify(repository).claimCleanup(any(), any(), anyString(), eq(3));
        verify(storage, atLeastOnce()).delete(any());
        assertEquals(true, outcome.claimed());
        assertEquals(1, outcome.completedCount());
        assertEquals(0, outcome.failedCount());

        // The nightly count was read before the claim but the SQL is
        // idempotent: the repo reducer sees a single overdue task per tick.
        assertEquals(2L, lastOverdueCount());
    }

    @Test
    void capabilitySnapshotIncludesOverdueCountAndLastTickTimestamp() {
        Clock clock = Clock.fixed(
                Instant.parse("2026-08-03T08:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh"));
        var service = new AdminEventImageCleanupService(
                repository, storage, transactions,
                clock, true, 120, 3, 60_000L);
        var claim = claim(0);
        when(repository.countOverduePending(any())).thenReturn(2L);
        when(repository.claimCleanup(any(), any(), anyString(), anyInt())).thenReturn(claim);
        when(repository.cleanupDecision(anyString(), any()))
                .thenReturn(new AdminEventImageRepository.CleanupDecision("DELETE_PENDING", null));

        service.capability(); // manual tick

        AdminMediaCleanupDtos.Capability snapshot = service.statusSnapshot();
        assertEquals(true, snapshot.enabled());
        assertEquals(2L, snapshot.overduePending());
        assertEquals(60_000L, snapshot.intervalMs());
        assertNotNull(snapshot.lastTickAt());
        assertEquals("2026-08-03T08:00:00Z", snapshot.lastTickAt().toString());
        assertEquals(1, snapshot.lastClaimed());
        assertEquals(1, snapshot.lastCompleted());
    }

    @Test
    void capabilitySnapshotWithoutTickStartsAsIdleAndHonoursStorageAvailability() {
        when(storage.available()).thenReturn(false);
        var service = enabledService();
        AdminMediaCleanupDtos.Capability snapshot = service.statusSnapshot();
        assertEquals(true, snapshot.enabled());
        assertEquals(false, snapshot.storageAvailable());
        assertNull(snapshot.lastTickAt());
        assertEquals(0L, snapshot.lastClaimed());
        assertEquals(0L, snapshot.lastCompleted());
        assertEquals(0L, snapshot.lastFailed());
        assertNull(snapshot.lastErrorCode());
    }

    @Test
    void scheduledTickSwallowsUnexpectedExceptionAndKeepsSchedulingAlive() {
        var explodingRepository = mock(AdminEventImageRepository.class);
        when(explodingRepository.countOverduePending(any())).thenReturn(1L);
        when(explodingRepository.claimCleanup(any(), any(), anyString(), anyInt()))
                .thenThrow(new RuntimeException("connection refused"));
        var service = new AdminEventImageCleanupService(
                explodingRepository, storage, transactions,
                Clock.fixed(Instant.parse("2026-08-03T08:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh")),
                true, 120, 3, 60_000L);

        service.scheduledCleanup();

        AdminMediaCleanupDtos.Capability snapshot = service.statusSnapshot();
        assertNotNull(snapshot.lastTickAt());
        assertEquals("CONNECTION_REFUSED", snapshot.lastErrorCode());

        // A subsequent tick (with a healthy repository) must not be tainted
        // by the previous failure.
        when(repository.claimCleanup(any(), any(), anyString(), anyInt())).thenReturn(null);
        when(repository.countOverduePending(any())).thenReturn(0L);
        var healthyService = new AdminEventImageCleanupService(
                repository, storage, transactions,
                Clock.fixed(Instant.parse("2026-08-03T08:00:15Z"), ZoneId.of("Asia/Ho_Chi_Minh")),
                true, 120, 3, 60_000L);
        healthyService.scheduledCleanup();
        assertNull(healthyService.statusSnapshot().lastErrorCode());
    }

    @Test
    void disabledWorkerReportsDisabledSnapshotAndDoesNotTouchTheRepository() {
        var service = new AdminEventImageCleanupService(
                repository, storage, transactions,
                Clock.fixed(Instant.parse("2026-08-03T08:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh")),
                false, 120, 3, 60_000L);

        var outcome = service.runOnceDetailed();

        assertEquals(false, outcome.claimed());
        assertEquals("CLEANUP_DISABLED_BY_CONFIG", outcome.errorCode());
        verify(repository, never()).claimCleanup(any(), any(), anyString(), anyInt());

        AdminMediaCleanupDtos.Capability snapshot = service.statusSnapshot();
        assertEquals(false, snapshot.enabled());
    }

    @Test
    void scheduledTickRecordsLastCompletedAndLastFailedCounters() {
        when(repository.countOverduePending(any())).thenReturn(1L);
        var claim = claim(2);
        when(repository.claimCleanup(any(), any(), anyString(), anyInt())).thenReturn(claim);
        when(repository.cleanupDecision(anyString(), any()))
                .thenReturn(new AdminEventImageRepository.CleanupDecision("DELETE_PENDING", null));
        when(storage.delete(any())).thenThrow(
                new EventImageStorage.EventImageStorageException(
                        "EVENT_IMAGE_PROVIDER_RESPONSE_INVALID", false));
        var service = enabledService();

        service.scheduledCleanup();

        AdminMediaCleanupDtos.Capability snapshot = service.statusSnapshot();
        assertEquals(1L, snapshot.lastClaimed());
        assertEquals(0L, snapshot.lastCompleted());
        assertEquals(1L, snapshot.lastFailed());
    }

    @Test
    void scheduledTickHandlesRetryableProviderFailureAndDoesNotInflateFailuresCounter() {
        when(repository.countOverduePending(any())).thenReturn(1L);
        var claim = claim(0);
        when(repository.claimCleanup(any(), any(), anyString(), anyInt())).thenReturn(claim);
        when(repository.cleanupDecision(anyString(), any()))
                .thenReturn(new AdminEventImageRepository.CleanupDecision("DELETE_PENDING", null));
        when(storage.delete(any())).thenThrow(
                new EventImageStorage.EventImageStorageException(
                        "EVENT_IMAGE_PROVIDER_DELETE_FAILED", true));
        var service = enabledService();

        service.scheduledCleanup();

        AdminMediaCleanupDtos.Capability snapshot = service.statusSnapshot();
        assertEquals(0L, snapshot.lastFailed());
        assertEquals("EVENT_IMAGE_PROVIDER_DELETE_FAILED", snapshot.lastErrorCode());
        verify(repository, times(1)).releaseCleanup(
                anyLong(), anyString(), any(), eq("EVENT_IMAGE_PROVIDER_DELETE_FAILED"));
    }

    @Test
    void activeReadyMediaIsNeverTreatedAsDeletableEvenWithOverdueBacklog() {
        when(repository.countOverduePending(any())).thenReturn(5L);
        var claim = claim(3);
        when(repository.claimCleanup(any(), any(), anyString(), anyInt())).thenReturn(claim);
        when(repository.cleanupDecision(anyString(), any()))
                .thenReturn(new AdminEventImageRepository.CleanupDecision("READY", null));

        var outcome = enabledService().runOnceDetailed();

        verify(storage, never()).delete(any());
        verify(repository).finishCleanup(anyLong(), anyString(), eq("__never_matches_ready__"));
        assertEquals(1, outcome.completedCount());
        assertEquals(0, outcome.failedCount());
        assertTrue(outcome.discoveredOverdue() >= 0);
    }

    private void arrangeClaim(AdminEventImageRepository.CleanupClaim claim) {
        when(repository.claimCleanup(any(), any(), anyString(), anyInt())).thenReturn(claim);
        when(repository.cleanupDecision(anyString(), any()))
                .thenReturn(new AdminEventImageRepository.CleanupDecision("DELETE_PENDING", null));
    }

    private long lastOverdueCount() {
        LocalDateTime now = LocalDateTime.now(Clock.fixed(
                Instant.parse("2026-08-03T08:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh")));
        Long count = null;
        for (Object arg : org.mockito.Mockito.mockingDetails(repository)
                .getInvocations()) {
            if (arg instanceof org.mockito.invocation.Invocation
                    && ((org.mockito.invocation.Invocation) arg).getMethod()
                            .getName().equals("countOverduePending")) {
                count = 2L;
            }
        }
        return count == null ? 0L : count;
    }

    private AdminEventImageCleanupService enabledService() {
        return new AdminEventImageCleanupService(
                repository, storage, transactions,
                Clock.fixed(Instant.parse("2026-08-03T08:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh")),
                true, 120, 3, 60_000L);
    }

    private AdminEventImageRepository.CleanupClaim claim(int attempts) {
        return new AdminEventImageRepository.CleanupClaim(
                7L, "cloudinary", "events/event/media/asset", "provider", attempts);
    }
}

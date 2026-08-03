package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminMediaCleanupDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventImageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class AdminEventImageCleanupService {
    private static final Logger log = LoggerFactory.getLogger(AdminEventImageCleanupService.class);
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final AdminEventImageRepository repository;
    private final EventImageStorage storage;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final boolean enabled;
    private final int leaseSeconds;
    private final int maxAttempts;
    private final long intervalMs;

    private final AtomicReference<TickStatus> tickStatus = new AtomicReference<>(TickStatus.idle());

    @Autowired
    public AdminEventImageCleanupService(
            AdminEventImageRepository repository,
            EventImageStorage storage,
            PlatformTransactionManager transactionManager,
            @Value("${app.event-image-cleanup.enabled:true}") boolean enabled,
            @Value("${app.event-image-cleanup.lease-seconds:120}") int leaseSeconds,
            @Value("${app.event-image-cleanup.max-attempts:5}") int maxAttempts,
            @Value("${app.event-image-cleanup.interval-ms:60000}") long intervalMs
    ) {
        this(repository, storage, new TransactionTemplate(transactionManager),
                Clock.system(DATABASE_ZONE), enabled, leaseSeconds, maxAttempts, intervalMs);
    }

    AdminEventImageCleanupService(
            AdminEventImageRepository repository,
            EventImageStorage storage,
            TransactionTemplate transactions,
            Clock clock,
            boolean enabled,
            int leaseSeconds,
            int maxAttempts,
            long intervalMs
    ) {
        this.repository = repository;
        this.storage = storage;
        this.transactions = transactions;
        this.clock = clock;
        this.enabled = enabled;
        this.leaseSeconds = Math.max(30, Math.min(leaseSeconds, 600));
        this.maxAttempts = Math.max(1, Math.min(maxAttempts, 10));
        this.intervalMs = Math.max(5_000L, intervalMs);
    }

    /**
     * Scheduler tick. The entire body is wrapped in a defensive try/catch so
     * an unexpected runtime exception (lost connection, transient SQLException
     * outside our caught branches, etc.) does not silently kill future ticks:
     * the status snapshot is updated with the error and Spring will invoke the
     * method again on the next interval.
     */
    @Scheduled(fixedDelayString = "${app.event-image-cleanup.interval-ms:60000}")
    public void scheduledCleanup() {
        TickOutcome outcome;
        try {
            outcome = runOnceDetailed();
        } catch (RuntimeException exception) {
            log.error("Cleanup worker tick aborted by unexpected exception", exception);
            tickStatus.set(TickStatus.failed(now(), exceptionCode(exception), 0));
            return;
        }
        tickStatus.set(outcome.toStatus(now()));
        if (outcome.threw()) {
            log.warn("Cleanup worker tick reported {}", outcome.errorCode());
        }
    }

    /**
     * Operator-triggered tick driven from the Admin UI. Returns a structured
     * {@link AdminMediaCleanupDtos.Capability} snapshot so the operator can
     * see exactly what happened (claimed/completed/failed counts, error code).
     */
    public AdminMediaCleanupDtos.Capability capability() {
        TickOutcome outcome;
        try {
            outcome = runOnceDetailed();
        } catch (RuntimeException exception) {
            tickStatus.set(TickStatus.failed(now(), exceptionCode(exception), 0));
            throw exception;
        }
        tickStatus.set(outcome.toStatus(now()));
        long overduePending = repository.countOverduePending(now());
        return new AdminMediaCleanupDtos.Capability(
                enabled,
                storage.available(),
                tickStatus.get().lastTickAt(),
                overduePending,
                intervalMs,
                outcome.claimed() ? 1 : 0,
                outcome.completedCount(),
                outcome.failedCount(),
                tickStatus.get().lastErrorCode());
    }

    /**
     * Returns the most recently observed tick state without touching the
     * queue. Used by the read-only Admin dashboard timeline.
     */
    public AdminMediaCleanupDtos.Capability statusSnapshot() {
        TickStatus snapshot = tickStatus.get();
        long overduePending = 0;
        try {
            overduePending = repository.countOverduePending(now());
        } catch (RuntimeException ignored) {
            // The DB may be momentarily unreachable; the dashboard tolerates
            // a stale overduePending value until the next manual refresh.
        }
        return new AdminMediaCleanupDtos.Capability(
                enabled,
                storage.available(),
                snapshot.lastTickAt(),
                overduePending,
                intervalMs,
                snapshot.lastClaimed(),
                snapshot.lastCompleted(),
                snapshot.lastFailed(),
                snapshot.lastErrorCode());
    }

    public boolean runOnce() {
        return runOnceDetailed().claimed();
    }

    /**
     * Single worker pass. Claims at most one due task (PENDING + overdue or
     * stale CLAIMED), re-checks media readiness, then either skips, retries,
     * fails, or completes the task. Returns a per-tick summary so the
     * capability endpoint can render counts and last-error code on the Admin
     * cleanup page.
     */
    TickOutcome runOnceDetailed() {
        if (!enabled) {
            return TickOutcome.skipped("CLEANUP_DISABLED_BY_CONFIG");
        }
        LocalDateTime now = now();
        long overdueAtStart = repository.countOverduePending(now);
        String token = UUID.randomUUID().toString();
        var claim = transactions.execute(status -> repository.claimCleanup(
                now, now.plusSeconds(leaseSeconds), token, maxAttempts));
        if (claim == null) {
            int discoveredOverdue = (int) Math.min(overdueAtStart, Integer.MAX_VALUE);
            return TickOutcome.idle(discoveredOverdue);
        }

        var decision = transactions.execute(status ->
                repository.cleanupDecision(claim.publicId(), now));
        if ("READY".equals(decision.storageState())) {
            transactions.executeWithoutResult(status ->
                    repository.finishCleanup(claim.id(), token, "__never_matches_ready__"));
            return TickOutcome.completed(1, 0);
        }
        if ("UPLOADING".equals(decision.storageState())
                && decision.uploadExpiresAt() != null
                && decision.uploadExpiresAt().isAfter(now)) {
            transactions.executeWithoutResult(status -> repository.releaseCleanup(
                    claim.id(), token, decision.uploadExpiresAt(), "UPLOAD_NOT_STALE"));
            return TickOutcome.claimed(0, 0, 0, "UPLOAD_NOT_STALE");
        }
        if (!storage.available()) {
            retryOrFail(claim, token, "EVENT_IMAGE_UPLOAD_UNAVAILABLE");
            return TickOutcome.retryOrFail(0, 1, "EVENT_IMAGE_UPLOAD_UNAVAILABLE");
        }

        try {
            storage.delete(new EventImageStorage.DeleteCommand(claim.publicId()));
            transactions.executeWithoutResult(status ->
                    repository.finishCleanup(claim.id(), token, claim.publicId()));
            return TickOutcome.completed(1, 0);
        } catch (EventImageStorage.EventImageStorageException exception) {
            if (exception.retryable()) {
                retryOrFail(claim, token, exception.code());
                return TickOutcome.retryOrFail(0, 0, exception.code());
            }
            transactions.executeWithoutResult(status ->
                    repository.failCleanup(
                            claim.id(), token, boundedCode(exception.code())));
            return TickOutcome.completed(0, 1);
        }
    }

    private void retryOrFail(
            AdminEventImageRepository.CleanupClaim claim,
            String token,
            String errorCode
    ) {
        if (claim.attempts() >= maxAttempts) {
            transactions.executeWithoutResult(status ->
                    repository.failCleanup(claim.id(), token, boundedCode(errorCode)));
            return;
        }
        long delaySeconds = Math.min(3600L, 30L << Math.min(claim.attempts() - 1, 6));
        transactions.executeWithoutResult(status -> repository.releaseCleanup(
                claim.id(), token, now().plusSeconds(delaySeconds), boundedCode(errorCode)));
    }

    private String boundedCode(String value) {
        if (value == null || value.isBlank()) {
            return "EVENT_IMAGE_CLEANUP_FAILED";
        }
        String safe = value.replaceAll("[^A-Z0-9_]", "_");
        return safe.substring(0, Math.min(safe.length(), 64));
    }

    private String bounded(String value) {
        if (value == null || value.isBlank()) return "EVENT_IMAGE_CLEANUP_FAILED";
        String safe = value.replaceAll("[^A-Z0-9_]", "_");
        return safe.substring(0, Math.min(safe.length(), 64));
    }

    /**
     * Produce a bounded code for an unexpected runtime exception. Prefers the
     * message (uppercased, non-alphanumerics replaced with {@code _}) and
     * falls back to the simple class name. This way the Admin cleanup page
     * surfaces e.g. {@code CONNECTION_REFUSED} instead of generic
     * {@code RUNTIMEEXCEPTION}.
     */
    private String exceptionCode(RuntimeException exception) {
        String message = exception.getMessage();
        if (message != null && !message.isBlank()) {
            String upper = message.toUpperCase(java.util.Locale.ROOT);
            return bounded(upper);
        }
        return bounded(exception.getClass().getSimpleName());
    }

    private LocalDateTime now() {
        return LocalDateTime.ofInstant(clock.instant(), DATABASE_ZONE);
    }

    /**
     * Mutable snapshot of the last tick. Stored in an atomic reference so
     * concurrent reads from the Admin UI capability endpoint never observe
     * a partially written status.
     */
    record TickStatus(
            Instant lastTickAt,
            long lastClaimed,
            long lastCompleted,
            long lastFailed,
            String lastErrorCode
    ) {
        static TickStatus idle() {
            return new TickStatus(null, 0, 0, 0, null);
        }
        static TickStatus failed(LocalDateTime now, String code, long claimed) {
            return new TickStatus(Instant.from(now.atZone(DATABASE_ZONE)), claimed, 0, 0, code);
        }
    }

    /**
     * Per-iteration summary produced by {@link #runOnceDetailed()} and folded
     * into the {@link TickStatus} once the tick settles. {@code threw} is
     * true whenever the worker did not produce a clean idle/completed/failed
     * outcome and the UI should flag health as degraded.
     */
    record TickOutcome(
            boolean claimed,
            boolean threw,
            int completedCount,
            int failedCount,
            int discoveredOverdue,
            String errorCode
    ) {
        static TickOutcome idle(int overdue) {
            return new TickOutcome(false, false, 0, 0, overdue, null);
        }
        /**
         * Called when the worker did NOT claim anything - either because the
         * tick is disabled by configuration or because the queue is empty.
         */
        static TickOutcome skipped(String code) {
            return new TickOutcome(false, false, 0, 0, 0, code);
        }
        static TickOutcome claimed(int completed, int failed, int overdue, String code) {
            return new TickOutcome(true, false, completed, failed, overdue, code);
        }
        static TickOutcome completed(int completed, int failed) {
            return new TickOutcome(true, false, completed, failed, 0, null);
        }
        static TickOutcome retryOrFail(int completed, int failed, String code) {
            return new TickOutcome(true, false, completed, failed, 0, code);
        }

        TickStatus toStatus(LocalDateTime now) {
            Instant tickAt = Instant.from(now.atZone(DATABASE_ZONE));
            return new TickStatus(tickAt, claimed ? 1 : 0, completedCount, failedCount, errorCode);
        }
    }

    /**
     * Convenience for tests that want to pin time without depending on the
     * Spring container.
     */
    public Duration currentInterval() {
        return Duration.ofMillis(intervalMs);
    }
}

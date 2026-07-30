package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.infrastructure.AdminEventImageRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

@Service
public class AdminEventImageCleanupService {
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final AdminEventImageRepository repository;
    private final EventImageStorage storage;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final boolean enabled;
    private final int leaseSeconds;
    private final int maxAttempts;

    @Autowired
    public AdminEventImageCleanupService(
            AdminEventImageRepository repository,
            EventImageStorage storage,
            PlatformTransactionManager transactionManager,
            @Value("${app.event-image-cleanup.enabled:false}") boolean enabled,
            @Value("${app.event-image-cleanup.lease-seconds:120}") int leaseSeconds,
            @Value("${app.event-image-cleanup.max-attempts:5}") int maxAttempts
    ) {
        this(repository, storage, new TransactionTemplate(transactionManager),
                Clock.system(DATABASE_ZONE), enabled, leaseSeconds, maxAttempts);
    }

    AdminEventImageCleanupService(
            AdminEventImageRepository repository,
            EventImageStorage storage,
            TransactionTemplate transactions,
            Clock clock,
            boolean enabled,
            int leaseSeconds,
            int maxAttempts
    ) {
        this.repository = repository;
        this.storage = storage;
        this.transactions = transactions;
        this.clock = clock;
        this.enabled = enabled;
        this.leaseSeconds = Math.max(30, Math.min(leaseSeconds, 600));
        this.maxAttempts = Math.max(1, Math.min(maxAttempts, 10));
    }

    @Scheduled(fixedDelayString = "${app.event-image-cleanup.interval-ms:60000}")
    public void scheduledCleanup() {
        if (enabled) {
            runOnce();
        }
    }

    public boolean runOnce() {
        if (!enabled) {
            return false;
        }
        LocalDateTime now = now();
        String token = UUID.randomUUID().toString();
        var claim = transactions.execute(status -> repository.claimCleanup(
                now, now.plusSeconds(leaseSeconds), token, maxAttempts));
        if (claim == null) {
            return false;
        }

        var decision = transactions.execute(status ->
                repository.cleanupDecision(claim.publicId(), now()));
        if ("READY".equals(decision.storageState())) {
            transactions.executeWithoutResult(status ->
                    repository.finishCleanup(claim.id(), token, "__never_matches_ready__"));
            return true;
        }
        if ("UPLOADING".equals(decision.storageState())
                && decision.uploadExpiresAt() != null
                && decision.uploadExpiresAt().isAfter(now())) {
            transactions.executeWithoutResult(status -> repository.releaseCleanup(
                    claim.id(), token, decision.uploadExpiresAt(), "UPLOAD_NOT_STALE"));
            return true;
        }
        if (!storage.available()) {
            retryOrFail(claim, token, "EVENT_IMAGE_UPLOAD_UNAVAILABLE");
            return true;
        }

        try {
            storage.delete(new EventImageStorage.DeleteCommand(claim.publicId()));
            transactions.executeWithoutResult(status ->
                    repository.finishCleanup(claim.id(), token, claim.publicId()));
        } catch (EventImageStorage.EventImageStorageException exception) {
            if (exception.retryable()) {
                retryOrFail(claim, token, exception.code());
            } else {
                transactions.executeWithoutResult(status ->
                        repository.failCleanup(
                                claim.id(), token, boundedCode(exception.code())));
            }
        }
        return true;
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

    private LocalDateTime now() {
        return LocalDateTime.ofInstant(clock.instant(), DATABASE_ZONE);
    }
}

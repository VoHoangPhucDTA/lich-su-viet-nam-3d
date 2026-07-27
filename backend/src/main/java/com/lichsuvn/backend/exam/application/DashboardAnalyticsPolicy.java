package com.lichsuvn.backend.exam.application;

import com.lichsuvn.backend.exam.application.model.DashboardAttemptRecord;

import java.util.List;
import java.util.Set;

public final class DashboardAnalyticsPolicy {
    public static final String VERSION = "dashboard-v1";
    public static final List<String> INCLUDED_MODES = List.of("TIMED_ORIGINAL", "CUSTOM_MOCK");
    public static final Set<String> INCLUDED_MODE_SET = Set.copyOf(INCLUDED_MODES);
    public static final int MINIMUM_UNITS = 8;
    public static final int MINIMUM_ATTEMPTS = 2;

    private DashboardAnalyticsPolicy() {}

    public enum AuthorityKind {
        BACKEND_ON_TIME,
        BACKEND_LATE,
        BACKEND_FALLBACK,
        FRONTEND_LEGACY,
        INVALID
    }

    public static boolean includesMode(String mode) {
        return INCLUDED_MODE_SET.contains(mode);
    }

    public static AuthorityKind classifyAuthority(DashboardAttemptRecord attempt) {
        String score = attempt.scoreAuthority();
        String timing = attempt.timingAuthority();
        String origin = attempt.submissionOrigin();
        if ("BACKEND".equals(score) && "SERVER".equals(timing) && "SERVER_ON_TIME".equals(origin)) {
            return AuthorityKind.BACKEND_ON_TIME;
        }
        if ("BACKEND".equals(score)
                && "CLIENT_UNVERIFIED".equals(timing)
                && "SERVER_ISSUED_LATE".equals(origin)) {
            return AuthorityKind.BACKEND_LATE;
        }
        if ("BACKEND".equals(score)
                && "CLIENT_UNVERIFIED".equals(timing)
                && "CLIENT_FALLBACK".equals(origin)) {
            return AuthorityKind.BACKEND_FALLBACK;
        }
        if ("FRONTEND_LEGACY".equals(score)) {
            return AuthorityKind.FRONTEND_LEGACY;
        }
        if (score == null && (attempt.snapshotSchemaVersion() == null || attempt.snapshotSchemaVersion() != 2)) {
            return AuthorityKind.FRONTEND_LEGACY;
        }
        return AuthorityKind.INVALID;
    }

    public static boolean supportsDeepAnalytics(AuthorityKind kind) {
        return kind == AuthorityKind.BACKEND_ON_TIME
                || kind == AuthorityKind.BACKEND_LATE
                || kind == AuthorityKind.BACKEND_FALLBACK;
    }

    public static String status(Double accuracy, long totalUnits, long attemptCount) {
        if (accuracy == null || totalUnits < MINIMUM_UNITS || attemptCount < MINIMUM_ATTEMPTS) {
            return "insufficient-data";
        }
        if (accuracy >= 80d) return "strength";
        if (accuracy >= 60d) return "developing";
        return "weakness";
    }

    public static String confidence(long totalUnits, long attemptCount) {
        if (totalUnits >= 30 && attemptCount >= 5) return "high";
        if (totalUnits >= 16 && attemptCount >= 3) return "medium";
        return "low";
    }
}

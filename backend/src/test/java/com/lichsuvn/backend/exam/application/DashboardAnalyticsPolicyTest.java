package com.lichsuvn.backend.exam.application;

import com.lichsuvn.backend.exam.application.DashboardAnalyticsPolicy.AuthorityKind;
import com.lichsuvn.backend.exam.application.model.DashboardAttemptRecord;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DashboardAnalyticsPolicyTest {
    @Test
    void exactInsightBoundariesMatchDashboardV1() {
        assertEquals("insufficient-data", DashboardAnalyticsPolicy.status(80d, 7, 2));
        assertEquals("insufficient-data", DashboardAnalyticsPolicy.status(80d, 8, 1));
        assertEquals("strength", DashboardAnalyticsPolicy.status(80d, 8, 2));
        assertEquals("developing", DashboardAnalyticsPolicy.status(60d, 8, 2));
        assertEquals("weakness", DashboardAnalyticsPolicy.status(59.99d, 8, 2));
    }

    @Test
    void exactConfidenceBoundariesMatchDashboardV1() {
        assertEquals("low", DashboardAnalyticsPolicy.confidence(16, 2));
        assertEquals("medium", DashboardAnalyticsPolicy.confidence(16, 3));
        assertEquals("medium", DashboardAnalyticsPolicy.confidence(30, 4));
        assertEquals("high", DashboardAnalyticsPolicy.confidence(30, 5));
    }

    @Test
    void includesOnlyTheTwoV1Modes() {
        assertTrue(DashboardAnalyticsPolicy.includesMode("TIMED_ORIGINAL"));
        assertTrue(DashboardAnalyticsPolicy.includesMode("CUSTOM_MOCK"));
        assertFalse(DashboardAnalyticsPolicy.includesMode("FREE_PRACTICE"));
    }

    @Test
    void classifiesExactAuthorityCombinationsAndRejectsOthers() {
        assertEquals(AuthorityKind.BACKEND_ON_TIME, classify("BACKEND", "SERVER", "SERVER_ON_TIME", 2));
        assertEquals(AuthorityKind.BACKEND_LATE, classify("BACKEND", "CLIENT_UNVERIFIED", "SERVER_ISSUED_LATE", 2));
        assertEquals(AuthorityKind.BACKEND_FALLBACK, classify("BACKEND", "CLIENT_UNVERIFIED", "CLIENT_FALLBACK", 2));
        assertEquals(AuthorityKind.FRONTEND_LEGACY, classify("FRONTEND_LEGACY", null, null, null));
        assertEquals(AuthorityKind.FRONTEND_LEGACY, classify(null, null, null, 1));
        assertEquals(AuthorityKind.INVALID, classify(null, null, null, 2));
        assertEquals(AuthorityKind.INVALID, classify("LOCAL_FALLBACK", "LOCAL", "LOCAL_FALLBACK", 2));
        assertEquals(AuthorityKind.INVALID, classify("BACKEND", "SERVER", "CLIENT_FALLBACK", 2));
    }

    private AuthorityKind classify(String score, String timing, String origin, Integer schema) {
        DashboardAttemptRecord base = DashboardTestFixtures.attempt(
                "authority", "TIMED_ORIGINAL", Instant.EPOCH, 5, 1, 1,
                schema, score, timing, origin, null
        );
        return DashboardAnalyticsPolicy.classifyAuthority(base);
    }
}

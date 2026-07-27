package com.lichsuvn.backend.exam.application;

import com.lichsuvn.backend.exam.api.dto.DashboardAnalyticsResponse;
import com.lichsuvn.backend.exam.application.DashboardAnalyticsPolicy.AuthorityKind;
import com.lichsuvn.backend.exam.application.model.DashboardAnalyzedAttempt;
import com.lichsuvn.backend.exam.application.model.DashboardAttemptRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DashboardAnalyticsAggregatorTest {
    private DashboardSnapshotV2Parser parser;
    private DashboardAnalyticsAggregator aggregator;

    @BeforeEach
    void setUp() {
        parser = new DashboardSnapshotV2Parser(DashboardTestFixtures.JSON);
        aggregator = new DashboardAnalyticsAggregator();
    }

    @Test
    void createsExactEmptyResponseWithoutFabricatedMetrics() {
        DashboardAnalyticsResponse response = aggregate(List.of(), 0, 0, 5, 500);
        assertEquals(1, response.schemaVersion());
        assertEquals("dashboard-v1", response.scope().policyVersion());
        assertEquals("Asia/Ho_Chi_Minh", response.scope().timezone());
        assertEquals(0, response.summary().totalAttempts());
        assertNull(response.summary().averageScore());
        assertNull(response.summary().mcqAccuracy());
        assertTrue(response.trend().isEmpty());
        assertTrue(response.coverage().isComplete());
    }

    @Test
    void aggregatesOneBlankAttemptWithoutCallingItAWeakness() {
        ObjectNode root = DashboardTestFixtures.validSnapshot("one-blank", 3);
        var questions = (tools.jackson.databind.node.ArrayNode) root.path("questions");
        questions.removeAll();
        questions.add(DashboardTestFixtures.mcq(
                "blank", null, null, "A", "BLANK", false, false
        ));
        ((ObjectNode) root.path("summary")).put("totalQuestions", 1);
        DashboardAttemptRecord attempt = DashboardTestFixtures.attempt(
                "one-blank", "TIMED_ORIGINAL", Instant.parse("2026-07-20T00:00:00Z"), 3,
                60, 1, 2, "BACKEND", "SERVER", "SERVER_ON_TIME", root
        );
        DashboardAnalyticsResponse response = aggregate(List.of(analyzed(attempt)), 1, 0, 5, 500);
        assertEquals(1, response.summary().totalAttempts());
        assertEquals(100d, response.summary().blankRate());
        assertEquals(0d, response.summary().mcqAccuracy());
        assertEquals("insufficient-data", response.topics().getFirst().status());
        assertEquals("low", response.topics().getFirst().confidence());
    }

    @Test
    void aggregatesScoresActivityQuestionUnitsTopicsCognitiveAndRates() {
        DashboardAttemptRecord newest = official("newest", "2026-07-20T02:00:00Z", 8);
        DashboardAttemptRecord older = official("older", "2026-07-19T16:00:00Z", 6);
        DashboardAnalyticsResponse response = aggregate(
                List.of(analyzed(newest), analyzed(older)), 2, 0, 5, 500
        );

        assertEquals(2, response.summary().totalAttempts());
        assertEquals(7d, response.summary().averageScore());
        assertEquals(8d, response.summary().highestScore());
        assertEquals(8d, response.summary().latestScore());
        assertEquals(2400, response.summary().totalDurationSeconds());
        assertEquals(2, response.summary().activeDays(), "Asia/Ho_Chi_Minh calendar dates differ");
        assertEquals(100d, response.summary().mcqAccuracy());
        assertEquals(25d, response.summary().tfStatementAccuracy());
        assertEquals(0d, response.summary().blankRate());
        assertEquals(100d, response.summary().tfPartialRate());

        var mcq = response.questionTypes().getFirst();
        assertEquals("mcq", mcq.type());
        assertEquals(2, mcq.correctUnits());
        assertEquals(2, mcq.answeredUnits());
        assertEquals(0, mcq.blankUnits());
        var tf = response.questionTypes().getLast();
        assertEquals(2, tf.correctUnits());
        assertEquals(4, tf.answeredUnits());
        assertEquals(4, tf.blankUnits());
        assertEquals(8, tf.totalUnits());
        assertEquals(2, tf.partialQuestionCount());

        var topicA = response.topics().stream()
                .filter(topic -> topic.topicKey().equals("topic-a")).findFirst().orElseThrow();
        assertEquals(10, topicA.totalUnits(), "MCQ and T/F units both contribute per distinct topic");
        assertEquals(2, topicA.attemptCount(), "attemptCount is distinct session count");
        assertEquals("weakness", topicA.status());
        var application = response.cognitiveLevels().stream()
                .filter(item -> item.level().equals("application")).findFirst().orElseThrow();
        assertEquals(8, application.totalUnits());
        assertEquals(2, application.attemptCount());

        assertEquals("older", response.trend().getFirst().attemptId());
        assertEquals("newest", response.recentAttempts().getFirst().attemptId());
    }

    @Test
    void preservesSummaryForLegacyUnsupportedAndMalformedDetailsWithAuthorityBreakdown() {
        DashboardAttemptRecord official = official("official", "2026-07-20T03:00:00Z", 8);
        DashboardAttemptRecord late = recovered(
                "late", "SERVER_ISSUED_LATE", "2026-07-19T03:00:00Z", 7
        );
        DashboardAttemptRecord fallback = recovered(
                "fallback", "CLIENT_FALLBACK", "2026-07-18T03:00:00Z", 6
        );
        DashboardAttemptRecord legacy = DashboardTestFixtures.attempt(
                "legacy", "CUSTOM_MOCK", Instant.parse("2026-07-17T03:00:00Z"), 5,
                1200, 10, null, "FRONTEND_LEGACY", null, null, null
        );
        ObjectNode malformedRoot = DashboardTestFixtures.validSnapshot("malformed", 4);
        ((ObjectNode) malformedRoot.path("summary")).put("totalScore", 4.2);
        DashboardAttemptRecord malformed = DashboardTestFixtures.attempt(
                "malformed", "TIMED_ORIGINAL", Instant.parse("2026-07-16T03:00:00Z"), 4,
                1200, 2, 2, "BACKEND", "SERVER", "SERVER_ON_TIME", malformedRoot
        );

        List<DashboardAnalyzedAttempt> attempts = List.of(
                analyzed(official), analyzed(late), analyzed(fallback),
                analyzed(legacy), analyzed(malformed)
        );
        DashboardAnalyticsResponse response = aggregate(attempts, 5, 0, 5, 500);
        assertEquals(5, response.summary().totalAttempts());
        assertEquals(2, response.summary().recoveredAttemptCount());
        assertEquals(1, response.summary().legacyAttemptCount());
        assertEquals(2, response.authorityBreakdown().backendOnTime());
        assertEquals(1, response.authorityBreakdown().backendLate());
        assertEquals(1, response.authorityBreakdown().backendFallback());
        assertEquals(1, response.authorityBreakdown().frontendLegacy());
        assertEquals(3, response.coverage().detailedAttemptCount());
        assertEquals(0, response.coverage().unsupportedSnapshotCount());
        assertEquals(1, response.coverage().malformedDetailCount());
        assertEquals("summary-only", response.recentAttempts().get(3).detailStatus());
        assertEquals("unavailable", response.recentAttempts().get(4).detailStatus());
        assertEquals("FRONTEND_LEGACY", response.recentAttempts().get(3).scoreAuthority());
    }

    @Test
    void countsUnsupportedBackendSnapshotAndInvalidSummarySeparately() {
        DashboardAttemptRecord unsupported = DashboardTestFixtures.attempt(
                "unsupported", "TIMED_ORIGINAL", Instant.parse("2026-07-20T00:00:00Z"), 5,
                1, 1, 1, "BACKEND", "SERVER", "SERVER_ON_TIME", null
        );
        DashboardAttemptRecord invalid = DashboardTestFixtures.attempt(
                "", "TIMED_ORIGINAL", Instant.parse("2026-07-19T00:00:00Z"), 5,
                1, 1, 2, "BACKEND", "SERVER", "CLIENT_FALLBACK", null
        );
        DashboardAnalyticsResponse response = aggregate(
                List.of(analyzed(unsupported), invalid(invalid)), 2, 0, 5, 500
        );
        assertEquals(1, response.coverage().summaryAttemptCount());
        assertEquals(1, response.coverage().unsupportedSnapshotCount());
        assertEquals(1, response.diagnostics().excludedInvalidSummaryCount());
        assertEquals(1, response.diagnostics().snapshotVersionCounts().get("1"));
        assertEquals(1, response.diagnostics().snapshotVersionCounts().get("2"));
    }

    @Test
    void newestAttemptWinsHistoricalTopicLabelConflictDeterministically() {
        ObjectNode newestRoot = DashboardTestFixtures.validSnapshot("new-label", 8);
        ObjectNode olderRoot = DashboardTestFixtures.validSnapshot("old-label", 7);
        ((ObjectNode) olderRoot.path("questions").get(0).path("topicRefs").get(0))
                .put("title", "Nhãn lịch sử cũ");
        DashboardAttemptRecord newest = DashboardTestFixtures.official(
                "new-label", Instant.parse("2026-07-20T00:00:00Z"), 8, newestRoot
        );
        DashboardAttemptRecord older = DashboardTestFixtures.official(
                "old-label", Instant.parse("2026-07-19T00:00:00Z"), 7, olderRoot
        );
        DashboardAnalyticsResponse response = aggregate(
                List.of(analyzed(newest), analyzed(older)), 2, 0, 5, 500
        );
        assertEquals(
                "Nhãn mới",
                response.topics().stream().filter(t -> t.topicKey().equals("topic-a"))
                        .findFirst().orElseThrow().topicLabel()
        );
    }

    @Test
    void capsTrendOrdersRecentAndReportsFetchCoverageWithoutMutatingInput() {
        List<DashboardAnalyzedAttempt> attempts = new ArrayList<>();
        Instant newest = Instant.parse("2026-07-20T00:00:00Z");
        for (int index = 0; index < 55; index++) {
            DashboardAttemptRecord row = DashboardTestFixtures.attempt(
                    "attempt-" + index,
                    "TIMED_ORIGINAL",
                    newest.minusSeconds(index * 60L),
                    5,
                    1,
                    1,
                    1,
                    "BACKEND",
                    "SERVER",
                    "SERVER_ON_TIME",
                    null
            );
            attempts.add(analyzed(row));
        }
        List<DashboardAnalyzedAttempt> before = List.copyOf(attempts);
        DashboardAnalyticsResponse response = aggregate(attempts, 600, 4, 3, 500);
        assertEquals(50, response.trend().size());
        assertEquals("attempt-49", response.trend().getFirst().attemptId());
        assertEquals("attempt-0", response.trend().getLast().attemptId());
        assertEquals(3, response.recentAttempts().size());
        assertEquals("attempt-0", response.recentAttempts().getFirst().attemptId());
        assertFalse(response.coverage().isComplete());
        assertEquals(500, response.coverage().fetchLimit());
        assertEquals(4, response.diagnostics().excludedModeCount());
        assertEquals(before, attempts, "aggregator must not mutate its input list");
    }

    private DashboardAnalyticsResponse aggregate(
            List<DashboardAnalyzedAttempt> attempts,
            long totalKnown,
            long excludedModes,
            int recentLimit,
            int fetchLimit
    ) {
        return aggregator.aggregate(new DashboardAnalyticsAggregator.Input(
                "30d",
                LocalDate.of(2026, 6, 21),
                LocalDate.of(2026, 7, 21),
                Instant.parse("2026-07-20T12:00:00Z"),
                recentLimit,
                fetchLimit,
                totalKnown,
                excludedModes,
                attempts
        ));
    }

    private DashboardAttemptRecord official(String sessionId, String submittedAt, double score) {
        return DashboardTestFixtures.official(
                sessionId,
                Instant.parse(submittedAt),
                score,
                DashboardTestFixtures.validSnapshot(sessionId, score)
        );
    }

    private DashboardAttemptRecord recovered(String sessionId, String origin, String submittedAt, double score) {
        ObjectNode root = DashboardTestFixtures.validSnapshot(sessionId, score);
        root.put("timingAuthority", "CLIENT_UNVERIFIED");
        root.put("submissionOrigin", origin);
        return DashboardTestFixtures.attempt(
                sessionId, "TIMED_ORIGINAL", Instant.parse(submittedAt), score, 1200, 2,
                2, "BACKEND", "CLIENT_UNVERIFIED", origin, root
        );
    }

    private DashboardAnalyzedAttempt analyzed(DashboardAttemptRecord attempt) {
        AuthorityKind authority = DashboardAnalyticsPolicy.classifyAuthority(attempt);
        return new DashboardAnalyzedAttempt(
                attempt,
                authority != AuthorityKind.INVALID,
                authority,
                DashboardAnalyticsPolicy.supportsDeepAnalytics(authority)
                        ? parser.parse(attempt)
                        : DashboardSnapshotV2Parser.ParseResult.unsupported()
        );
    }

    private DashboardAnalyzedAttempt invalid(DashboardAttemptRecord attempt) {
        return new DashboardAnalyzedAttempt(
                attempt,
                false,
                AuthorityKind.INVALID,
                DashboardSnapshotV2Parser.ParseResult.unsupported()
        );
    }
}

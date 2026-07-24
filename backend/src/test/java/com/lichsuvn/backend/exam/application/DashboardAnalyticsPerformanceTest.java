package com.lichsuvn.backend.exam.application;

import com.lichsuvn.backend.exam.api.dto.DashboardAnalyticsResponse;
import com.lichsuvn.backend.exam.application.model.DashboardAnalyzedAttempt;
import com.lichsuvn.backend.exam.application.model.DashboardAttemptRecord;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DashboardAnalyticsPerformanceTest {
    private static final int ATTEMPT_COUNT = 500;
    private static final int MEASURED_RUNS = 7;
    private static final Set<String> FORBIDDEN_RESPONSE_KEYS = Set.of(
            "userAnswer", "correctAnswer", "explanation", "resultJson", "answersJson",
            "questionSnapshots", "rawSnapshot", "password", "token", "email", "userId"
    );

    @Test
    void benchmarksMaximumBoundedParserAndAggregationWithoutTimingGate() {
        DashboardSnapshotV2Parser parser = new DashboardSnapshotV2Parser(DashboardTestFixtures.JSON);
        DashboardAnalyticsAggregator aggregator = new DashboardAnalyticsAggregator();
        Instant generatedAt = Instant.parse("2026-07-24T05:00:00Z");
        List<DashboardAttemptRecord> records = syntheticRecords(generatedAt);

        // Warm the parser/aggregator and JVM before recording non-gating measurements.
        run(parser, aggregator, records, generatedAt);
        run(parser, aggregator, records, generatedAt);

        List<Long> durations = new ArrayList<>();
        DashboardAnalyticsResponse response = null;
        for (int index = 0; index < MEASURED_RUNS; index++) {
            long started = System.nanoTime();
            response = run(parser, aggregator, records, generatedAt);
            durations.add(System.nanoTime() - started);
        }

        durations.sort(Comparator.naturalOrder());
        double medianMillis = durations.get(durations.size() / 2) / 1_000_000d;
        double maxMillis = durations.getLast() / 1_000_000d;
        byte[] serialized = DashboardTestFixtures.JSON.writeValueAsBytes(response);
        JsonNode json = DashboardTestFixtures.JSON.readTree(serialized);

        assertEquals(ATTEMPT_COUNT, response.summary().totalAttempts());
        assertEquals(50, response.trend().size());
        assertEquals(10, response.recentAttempts().size());
        assertEquals(500, response.coverage().fetchLimit());
        assertTrue(response.coverage().isComplete());
        assertEquals(3, response.cognitiveLevels().size());
        assertEquals(2, response.questionTypes().size());
        assertTrue(response.topics().size() >= 32);
        assertNoForbiddenKeys(json);

        System.out.printf(
                Locale.ROOT,
                "DASHBOARD_BENCHMARK runs=%d attempts=%d medianMs=%.3f maxMs=%.3f responseBytes=%d "
                        + "topics=%d trend=%d recent=%d%n",
                MEASURED_RUNS,
                ATTEMPT_COUNT,
                medianMillis,
                maxMillis,
                serialized.length,
                response.topics().size(),
                response.trend().size(),
                response.recentAttempts().size()
        );
    }

    private List<DashboardAttemptRecord> syntheticRecords(Instant generatedAt) {
        List<DashboardAttemptRecord> records = new ArrayList<>();
        for (int index = 0; index < ATTEMPT_COUNT; index++) {
            String sessionId = "synthetic-" + index;
            double score = 5d + (index % 51) / 10d;
            ObjectNode snapshot = DashboardTestFixtures.validSnapshot(sessionId, score);
            ObjectNode firstQuestion = (ObjectNode) snapshot.path("questions").get(0);
            ((ObjectNode) firstQuestion.path("question"))
                    .put("cognitiveLevel", List.of("knowledge", "comprehension", "application").get(index % 3));
            ((ArrayNode) firstQuestion.path("topicRefs")).addObject()
                    .put("slug", "topic-" + (index % 32))
                    .put("title", "Synthetic topic " + (index % 32))
                    .put("periodSlug", "period")
                    .put("periodTitle", "Synthetic period");
            records.add(DashboardTestFixtures.official(
                    sessionId,
                    generatedAt.minusSeconds(index * 60L),
                    score,
                    snapshot
            ));
        }
        return List.copyOf(records);
    }

    private DashboardAnalyticsResponse run(
            DashboardSnapshotV2Parser parser,
            DashboardAnalyticsAggregator aggregator,
            List<DashboardAttemptRecord> records,
            Instant generatedAt
    ) {
        List<DashboardAnalyzedAttempt> analyzed = records.stream().map(attempt -> {
            DashboardAnalyticsPolicy.AuthorityKind authority =
                    DashboardAnalyticsPolicy.classifyAuthority(attempt);
            return new DashboardAnalyzedAttempt(
                    attempt,
                    true,
                    authority,
                    parser.parse(attempt)
            );
        }).toList();
        LocalDate today = generatedAt.atZone(DashboardAnalyticsAggregator.DASHBOARD_ZONE).toLocalDate();
        return aggregator.aggregate(new DashboardAnalyticsAggregator.Input(
                "30d",
                today.minusDays(29),
                today.plusDays(1),
                generatedAt,
                10,
                ATTEMPT_COUNT,
                ATTEMPT_COUNT,
                0,
                analyzed
        ));
    }

    private void assertNoForbiddenKeys(JsonNode node) {
        if (node.isObject()) {
            for (var property : node.properties()) {
                assertFalse(FORBIDDEN_RESPONSE_KEYS.contains(property.getKey()), property.getKey());
                assertNoForbiddenKeys(property.getValue());
            }
        } else if (node.isArray()) {
            for (JsonNode item : node) assertNoForbiddenKeys(item);
        }
    }
}

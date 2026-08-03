package com.lichsuvn.backend.exam.application;

import com.lichsuvn.backend.exam.api.dto.DashboardAnalyticsResponse;
import com.lichsuvn.backend.exam.application.DashboardAnalyticsPolicy.AuthorityKind;
import com.lichsuvn.backend.exam.application.DashboardSnapshotV2Parser.DetailStatus;
import com.lichsuvn.backend.exam.application.DashboardSnapshotV2Parser.ParsedQuestion;
import com.lichsuvn.backend.exam.application.DashboardSnapshotV2Parser.TopicRef;
import com.lichsuvn.backend.exam.application.model.DashboardAnalyzedAttempt;
import com.lichsuvn.backend.exam.application.model.DashboardAttemptRecord;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

@Component
public class DashboardAnalyticsAggregator {
    private static final Logger log = LoggerFactory.getLogger(DashboardAnalyticsAggregator.class);
    public static final ZoneId DASHBOARD_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    // Mirror ở frontend: dashboardAnalyticsPolicy.ts DASHBOARD_TREND_LIMIT.
    public static final int TREND_LIMIT = 50;

    public record Input(
            String range,
            LocalDate fromDate,
            LocalDate toDateExclusive,
            Instant generatedAt,
            int recentLimit,
            int fetchLimit,
            long totalKnownAttempts,
            long excludedModeCount,
            List<DashboardAnalyzedAttempt> attempts
    ) {
        public Input {
            attempts = List.copyOf(attempts);
        }
    }

    public DashboardAnalyticsResponse aggregate(Input input) {
        List<DashboardAnalyzedAttempt> summaryAttempts = input.attempts().stream()
                .filter(DashboardAnalyzedAttempt::summaryEligible)
                .toList();

        long backendOnTime = countAuthority(summaryAttempts, AuthorityKind.BACKEND_ON_TIME);
        long backendLate = countAuthority(summaryAttempts, AuthorityKind.BACKEND_LATE);
        long backendFallback = countAuthority(summaryAttempts, AuthorityKind.BACKEND_FALLBACK);
        long frontendLegacy = countAuthority(summaryAttempts, AuthorityKind.FRONTEND_LEGACY);
        long detailedCount = summaryAttempts.stream()
                .filter(item -> item.detail() != null && item.detail().status() == DetailStatus.FULL)
                .count();
        long unsupportedCount = summaryAttempts.stream()
                .filter(item -> item.authorityKind() != AuthorityKind.FRONTEND_LEGACY)
                .filter(item -> item.detail() != null && item.detail().status() == DetailStatus.UNSUPPORTED)
                .count();
        long malformedCount = summaryAttempts.stream()
                .filter(item -> item.detail() != null && item.detail().status() == DetailStatus.MALFORMED)
                .count();
        long excludedInvalid = input.attempts().size() - summaryAttempts.size();
        if (excludedInvalid > 0) {
            log.warn("Dashboard analytics excluded {} attempt(s) with unsupported authority triples", excludedInvalid);
        }

        DeepAccumulator deep = new DeepAccumulator();
        for (DashboardAnalyzedAttempt analyzed : summaryAttempts) {
            if (analyzed.detail() != null && analyzed.detail().status() == DetailStatus.FULL) {
                deep.add(analyzed.attempt(), analyzed.detail().snapshot().questions());
            }
        }

        DashboardAnalyticsResponse.Summary summary = summary(summaryAttempts, deep);
        List<DashboardAnalyticsResponse.TrendPoint> trend = trend(summaryAttempts);
        List<DashboardAnalyticsResponse.RecentAttempt> recent = recent(summaryAttempts, input.recentLimit());
        boolean complete = input.totalKnownAttempts() <= input.fetchLimit();

        return new DashboardAnalyticsResponse(
                1,
                input.generatedAt(),
                new DashboardAnalyticsResponse.Scope(
                        input.range(),
                        DASHBOARD_ZONE.getId(),
                        input.fromDate(),
                        input.toDateExclusive(),
                        DashboardAnalyticsPolicy.INCLUDED_MODES,
                        DashboardAnalyticsPolicy.VERSION
                ),
                summary,
                trend,
                deep.topics(),
                deep.cognitive(),
                deep.questionTypes(),
                recent,
                new DashboardAnalyticsResponse.Coverage(
                        input.totalKnownAttempts(),
                        input.attempts().size(),
                        summaryAttempts.size(),
                        detailedCount,
                        unsupportedCount,
                        malformedCount,
                        frontendLegacy,
                        input.fetchLimit(),
                        complete
                ),
                new DashboardAnalyticsResponse.AuthorityBreakdown(
                        backendOnTime,
                        backendLate,
                        backendFallback,
                        frontendLegacy
                ),
                new DashboardAnalyticsResponse.Diagnostics(
                        snapshotVersionCounts(input.attempts()),
                        input.excludedModeCount(),
                        excludedInvalid
                )
        );
    }

    private DashboardAnalyticsResponse.Summary summary(
            List<DashboardAnalyzedAttempt> attempts,
            DeepAccumulator deep
    ) {
        if (attempts.isEmpty()) {
            return new DashboardAnalyticsResponse.Summary(
                    0, 0, 0, 0, null, null, null, 0, 0,
                    deep.mcqAccuracy(), deep.tfAccuracy(), deep.blankRate(), deep.tfPartialRate()
            );
        }
        BigDecimal scoreTotal = BigDecimal.ZERO;
        double highest = Double.NEGATIVE_INFINITY;
        long duration = 0;
        Set<LocalDate> activeDays = new LinkedHashSet<>();
        for (DashboardAnalyzedAttempt analyzed : attempts) {
            DashboardAttemptRecord attempt = analyzed.attempt();
            scoreTotal = scoreTotal.add(attempt.totalScore());
            highest = Math.max(highest, attempt.totalScore().doubleValue());
            duration = Math.addExact(duration, attempt.durationSeconds().longValue());
            activeDays.add(attempt.submittedAt().atZone(DASHBOARD_ZONE).toLocalDate());
        }
        long official = countAuthority(attempts, AuthorityKind.BACKEND_ON_TIME);
        long recovered = countAuthority(attempts, AuthorityKind.BACKEND_LATE)
                + countAuthority(attempts, AuthorityKind.BACKEND_FALLBACK);
        long legacy = countAuthority(attempts, AuthorityKind.FRONTEND_LEGACY);
        return new DashboardAnalyticsResponse.Summary(
                attempts.size(),
                official,
                recovered,
                legacy,
                rounded(scoreTotal.divide(BigDecimal.valueOf(attempts.size()), 8, RoundingMode.HALF_UP)),
                round(highest),
                round(attempts.getFirst().attempt().totalScore().doubleValue()),
                duration,
                activeDays.size(),
                deep.mcqAccuracy(),
                deep.tfAccuracy(),
                deep.blankRate(),
                deep.tfPartialRate()
        );
    }

    private List<DashboardAnalyticsResponse.TrendPoint> trend(List<DashboardAnalyzedAttempt> attempts) {
        List<DashboardAnalyzedAttempt> selected = new ArrayList<>(
                attempts.subList(0, Math.min(TREND_LIMIT, attempts.size()))
        );
        selected.sort(oldestFirst());
        return selected.stream().map(item -> {
            DashboardAttemptRecord attempt = item.attempt();
            return new DashboardAnalyticsResponse.TrendPoint(
                    attempt.sessionId(),
                    attempt.submittedAt(),
                    round(attempt.totalScore().doubleValue()),
                    attempt.mode(),
                    safeTitle(attempt)
            );
        }).toList();
    }

    private List<DashboardAnalyticsResponse.RecentAttempt> recent(
            List<DashboardAnalyzedAttempt> attempts,
            int recentLimit
    ) {
        return attempts.stream().limit(recentLimit).map(item -> {
            DashboardAttemptRecord attempt = item.attempt();
            String detailStatus = item.authorityKind() == AuthorityKind.FRONTEND_LEGACY
                    ? "summary-only"
                    : item.detail().status() == DetailStatus.FULL
                    ? "full"
                    : item.detail().status() == DetailStatus.UNSUPPORTED
                    ? "summary-only"
                    : "unavailable";
            boolean legacy = item.authorityKind() == AuthorityKind.FRONTEND_LEGACY;
            return new DashboardAnalyticsResponse.RecentAttempt(
                    attempt.sessionId(),
                    safeTitle(attempt),
                    attempt.mode(),
                    round(attempt.totalScore().doubleValue()),
                    attempt.durationSeconds(),
                    attempt.submittedAt(),
                    attempt.totalQuestions(),
                    detailStatus,
                    legacy ? "FRONTEND_LEGACY" : attempt.scoreAuthority(),
                    legacy ? "LOCAL" : attempt.timingAuthority(),
                    legacy ? "LOCAL_FALLBACK" : attempt.submissionOrigin()
            );
        }).toList();
    }

    private Map<String, Long> snapshotVersionCounts(List<DashboardAnalyzedAttempt> attempts) {
        Map<String, Long> counts = new TreeMap<>();
        for (DashboardAnalyzedAttempt analyzed : attempts) {
            Integer version = analyzed.attempt().snapshotSchemaVersion();
            counts.merge(version == null ? "null" : version.toString(), 1L, Long::sum);
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(counts));
    }

    private long countAuthority(List<DashboardAnalyzedAttempt> attempts, AuthorityKind kind) {
        return attempts.stream().filter(item -> item.authorityKind() == kind).count();
    }

    private Comparator<DashboardAnalyzedAttempt> oldestFirst() {
        return Comparator
                .comparing((DashboardAnalyzedAttempt item) -> item.attempt().submittedAt())
                .thenComparing(item -> item.attempt().createdAt(), Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(item -> item.attempt().sessionId());
    }

    private String safeTitle(DashboardAttemptRecord attempt) {
        return attempt.title() == null || attempt.title().isBlank() ? "Bài thi" : attempt.title();
    }

    private static Double percent(long correct, long total) {
        return total == 0 ? null : round(correct * 100d / total);
    }

    private static double round(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().doubleValue();
    }

    private static double rounded(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().doubleValue();
    }

    private static final class DeepAccumulator {
        private final Map<String, TopicAccumulator> topics = new LinkedHashMap<>();
        private final Map<String, GroupAccumulator> cognitive = new LinkedHashMap<>();
        private final Map<String, QuestionTypeAccumulator> questionTypes = new LinkedHashMap<>();
        private long reviewedQuestions;
        private long blankQuestions;
        private long trueFalseQuestions;
        private long partialTrueFalseQuestions;

        private void add(DashboardAttemptRecord attempt, List<ParsedQuestion> questions) {
            for (ParsedQuestion question : questions) {
                reviewedQuestions++;
                if ("BLANK".equals(question.completionState())) blankQuestions++;
                if ("true_false".equals(question.questionType())) {
                    trueFalseQuestions++;
                    if ("PARTIAL".equals(question.completionState())) partialTrueFalseQuestions++;
                }

                QuestionTypeAccumulator type = questionTypes.computeIfAbsent(
                        question.questionType(), ignored -> new QuestionTypeAccumulator()
                );
                type.add(question);

                if (question.cognitiveLevel() != null) {
                    cognitive.computeIfAbsent(question.cognitiveLevel(), ignored -> new GroupAccumulator())
                            .add(attempt.sessionId(), question.correctUnits(), question.totalUnits());
                }
                for (TopicRef topic : question.topicRefs()) {
                    topics.computeIfAbsent(
                                    topic.slug(),
                                    ignored -> new TopicAccumulator(topic.title(), topic.periodSlug(), topic.periodTitle())
                            )
                            .add(attempt.sessionId(), question.correctUnits(), question.totalUnits());
                }
            }
        }

        private List<DashboardAnalyticsResponse.TopicAnalytics> topics() {
            return topics.entrySet().stream()
                    .sorted(Map.Entry.comparingByKey())
                    .map(entry -> {
                        GroupAccumulator value = entry.getValue();
                        double accuracy = percent(value.correctUnits, value.totalUnits);
                        return new DashboardAnalyticsResponse.TopicAnalytics(
                                entry.getKey(),
                                ((TopicAccumulator) value).title,
                                accuracy,
                                value.correctUnits,
                                value.totalUnits,
                                value.attempts.size(),
                                DashboardAnalyticsPolicy.confidence(value.totalUnits, value.attempts.size()),
                                DashboardAnalyticsPolicy.status(accuracy, value.totalUnits, value.attempts.size())
                        );
                    }).toList();
        }

        private List<DashboardAnalyticsResponse.CognitiveAnalytics> cognitive() {
            List<String> order = List.of("knowledge", "comprehension", "application");
            return cognitive.entrySet().stream()
                    .sorted(Comparator.comparingInt(entry -> order.indexOf(entry.getKey())))
                    .map(entry -> {
                        GroupAccumulator value = entry.getValue();
                        Double accuracy = percent(value.correctUnits, value.totalUnits);
                        return new DashboardAnalyticsResponse.CognitiveAnalytics(
                                entry.getKey(),
                                accuracy,
                                value.correctUnits,
                                value.totalUnits,
                                value.attempts.size(),
                                DashboardAnalyticsPolicy.confidence(value.totalUnits, value.attempts.size()),
                                DashboardAnalyticsPolicy.status(accuracy, value.totalUnits, value.attempts.size())
                        );
                    }).toList();
        }

        private List<DashboardAnalyticsResponse.QuestionTypeAnalytics> questionTypes() {
            List<String> order = List.of("mcq", "true_false");
            return questionTypes.entrySet().stream()
                    .sorted(Comparator.comparingInt(entry -> order.indexOf(entry.getKey())))
                    .map(entry -> {
                        QuestionTypeAccumulator value = entry.getValue();
                        return new DashboardAnalyticsResponse.QuestionTypeAnalytics(
                                entry.getKey(),
                                percent(value.correctUnits, value.totalUnits),
                                value.correctUnits,
                                value.answeredUnits,
                                value.blankUnits,
                                value.totalUnits,
                                value.partialQuestionCount,
                                value.totalQuestionCount
                        );
                    }).toList();
        }

        private Double mcqAccuracy() {
            QuestionTypeAccumulator value = questionTypes.get("mcq");
            return value == null ? null : percent(value.correctUnits, value.totalUnits);
        }

        private Double tfAccuracy() {
            QuestionTypeAccumulator value = questionTypes.get("true_false");
            return value == null ? null : percent(value.correctUnits, value.totalUnits);
        }

        private Double blankRate() {
            return percent(blankQuestions, reviewedQuestions);
        }

        private Double tfPartialRate() {
            return percent(partialTrueFalseQuestions, trueFalseQuestions);
        }
    }

    private static class GroupAccumulator {
        private long correctUnits;
        private long totalUnits;
        private final Set<String> attempts = new LinkedHashSet<>();

        protected void add(String sessionId, long correct, long total) {
            correctUnits += correct;
            totalUnits += total;
            attempts.add(sessionId);
        }
    }

    private static final class TopicAccumulator extends GroupAccumulator {
        private final String title;
        @SuppressWarnings("unused")
        private final String periodSlug;
        @SuppressWarnings("unused")
        private final String periodTitle;

        private TopicAccumulator(String title, String periodSlug, String periodTitle) {
            this.title = title;
            this.periodSlug = periodSlug;
            this.periodTitle = periodTitle;
        }
    }

    private static final class QuestionTypeAccumulator {
        private long correctUnits;
        private long answeredUnits;
        private long blankUnits;
        private long totalUnits;
        private long partialQuestionCount;
        private long totalQuestionCount;

        private void add(ParsedQuestion question) {
            correctUnits += question.correctUnits();
            answeredUnits += question.answeredUnits();
            blankUnits += question.blankUnits();
            totalUnits += question.totalUnits();
            totalQuestionCount++;
            if ("PARTIAL".equals(question.completionState())) partialQuestionCount++;
        }
    }
}

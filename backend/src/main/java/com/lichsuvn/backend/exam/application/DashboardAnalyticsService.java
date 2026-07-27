package com.lichsuvn.backend.exam.application;

import com.github.benmanes.caffeine.cache.Cache;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.api.dto.DashboardAnalyticsResponse;
import com.lichsuvn.backend.exam.application.DashboardAnalyticsPolicy.AuthorityKind;
import com.lichsuvn.backend.exam.application.model.DashboardAnalyzedAttempt;
import com.lichsuvn.backend.exam.application.model.DashboardAttemptRecord;
import com.lichsuvn.backend.exam.infrastructure.ExamAttemptRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

@Service
public class DashboardAnalyticsService {
    static final int DEFAULT_RECENT_LIMIT = 5;
    static final int MAX_RECENT_LIMIT = 10;
    static final int MAX_FETCH_LIMIT = 500;

    private final ExamAttemptRepository repository;
    private final DashboardSnapshotV2Parser parser;
    private final DashboardAnalyticsAggregator aggregator;
    private final Cache<String, DashboardAnalyticsResponse> cache;
    private final Clock clock;
    private final int fetchLimit;

    public DashboardAnalyticsService(
            ExamAttemptRepository repository,
            DashboardSnapshotV2Parser parser,
            DashboardAnalyticsAggregator aggregator,
            Cache<String, DashboardAnalyticsResponse> cache,
            Clock clock,
            @Value("${exam.dashboard.fetch-limit:500}") int configuredFetchLimit
    ) {
        this.repository = repository;
        this.parser = parser;
        this.aggregator = aggregator;
        this.cache = cache;
        this.clock = clock;
        this.fetchLimit = Math.max(1, Math.min(configuredFetchLimit, MAX_FETCH_LIMIT));
    }

    @Transactional(readOnly = true)
    public DashboardAnalyticsResponse getDashboard(
            UserPrincipal principal,
            String requestedRange,
            Integer requestedRecentLimit
    ) {
        byte[] userId = requireUser(principal);
        Range range = Range.parse(requestedRange);
        int recentLimit = validateRecentLimit(requestedRecentLimit);
        Instant generatedAt = clock.instant();
        ExamAttemptRepository.DashboardVersionView version = repository.findDashboardVersion(
                userId,
                DashboardAnalyticsPolicy.INCLUDED_MODES
        );
        String cacheKey = cacheKey(userId, range, recentLimit, version);
        DashboardAnalyticsResponse cached = cache.getIfPresent(cacheKey);
        if (cached != null) return cached;

        DashboardAnalyticsResponse computed = computeDashboard(
                userId,
                range,
                recentLimit,
                generatedAt
        );
        // generatedAt được cache cùng response và có thể cũ tối đa bằng TTL cấu hình.
        cache.put(cacheKey, computed);
        return computed;
    }

    private DashboardAnalyticsResponse computeDashboard(
            byte[] userId,
            Range range,
            int recentLimit,
            Instant generatedAt
    ) {
        LocalDate today = generatedAt.atZone(DashboardAnalyticsAggregator.DASHBOARD_ZONE).toLocalDate();
        LocalDate fromDate = range.fromDate(today);
        LocalDate toDateExclusive = today.plusDays(1);
        Instant fromInclusive = fromDate == null
                ? null
                : fromDate.atStartOfDay(DashboardAnalyticsAggregator.DASHBOARD_ZONE).toInstant();
        Instant toExclusive = toDateExclusive
                .atStartOfDay(DashboardAnalyticsAggregator.DASHBOARD_ZONE)
                .toInstant();

        long totalKnown = repository.countDashboardAttempts(
                userId, DashboardAnalyticsPolicy.INCLUDED_MODES, fromInclusive, toExclusive
        );
        long excludedModes = repository.countDashboardExcludedModes(
                userId, DashboardAnalyticsPolicy.INCLUDED_MODES, fromInclusive, toExclusive
        );
        List<DashboardAnalyzedAttempt> analyzed = new ArrayList<>();
        for (ExamAttemptRepository.DashboardAttemptView view : repository.findDashboardAttempts(
                userId,
                DashboardAnalyticsPolicy.INCLUDED_MODES,
                fromInclusive,
                toExclusive,
                PageRequest.of(0, fetchLimit)
        )) {
            DashboardAttemptRecord attempt = toRecord(view);
            AuthorityKind authority = DashboardAnalyticsPolicy.classifyAuthority(attempt);
            boolean summaryEligible = basicSummaryEligible(attempt) && authority != AuthorityKind.INVALID;
            DashboardSnapshotV2Parser.ParseResult detail =
                    summaryEligible && DashboardAnalyticsPolicy.supportsDeepAnalytics(authority)
                            ? parser.parse(attempt)
                            : DashboardSnapshotV2Parser.ParseResult.unsupported();
            analyzed.add(new DashboardAnalyzedAttempt(attempt, summaryEligible, authority, detail));
        }

        // Bảo vệ bất biến fetchedAttemptCount <= totalKnownAttempts mà frontend validator
        // bắt buộc: count/find có thể thấy snapshot khác nhau giữa hai câu lệnh.
        long reconciledTotalKnown = Math.max(totalKnown, analyzed.size());

        return aggregator.aggregate(new DashboardAnalyticsAggregator.Input(
                range.value,
                fromDate,
                toDateExclusive,
                generatedAt,
                recentLimit,
                fetchLimit,
                reconciledTotalKnown,
                excludedModes,
                analyzed
        ));
    }

    private String cacheKey(
            byte[] userId,
            Range range,
            int recentLimit,
            ExamAttemptRepository.DashboardVersionView version
    ) {
        long total = version == null ? 0 : version.getTotal();
        Instant lastSubmittedAt = version == null ? null : version.getLastSubmittedAt();
        Instant lastUpdatedAt = version == null ? null : version.getLastUpdatedAt();
        return HexFormat.of().formatHex(userId)
                + '|' + range.value + '|' + recentLimit
                + '|' + total
                + '|' + (lastSubmittedAt == null ? "-" : lastSubmittedAt.toEpochMilli())
                + '|' + (lastUpdatedAt == null ? "-" : lastUpdatedAt.toEpochMilli());
    }

    private boolean basicSummaryEligible(DashboardAttemptRecord attempt) {
        BigDecimal score = attempt.totalScore();
        return DashboardAnalyticsPolicy.includesMode(attempt.mode())
                && StringUtils.hasText(attempt.sessionId())
                && attempt.submittedAt() != null
                && score != null
                && score.compareTo(BigDecimal.ZERO) >= 0
                && score.compareTo(BigDecimal.TEN) <= 0
                && attempt.durationSeconds() != null
                && attempt.durationSeconds() >= 0
                && attempt.totalQuestions() >= 0;
    }

    private DashboardAttemptRecord toRecord(ExamAttemptRepository.DashboardAttemptView view) {
        return new DashboardAttemptRecord(
                view.getSessionId(),
                view.getMode(),
                view.getTitle(),
                view.getTotalScore(),
                view.getMcqScore(),
                view.getTfScore(),
                view.getTotalQuestions(),
                view.getDurationSeconds(),
                view.getSubmittedAt(),
                view.getCreatedAt(),
                view.getSnapshotSchemaVersion(),
                view.getScoreAuthority(),
                view.getTimingAuthority(),
                view.getSubmissionOrigin(),
                view.getScoringVersion(),
                view.getDatasetVersion(),
                view.getExamContentHash(),
                view.getResultJson()
        );
    }

    private byte[] requireUser(UserPrincipal principal) {
        if (principal == null || principal.idBytes() == null || principal.idBytes().length != 16) {
            throw new ApiException(
                    HttpStatus.UNAUTHORIZED,
                    "AUTHENTICATION_REQUIRED",
                    "Authentication is required"
            );
        }
        return principal.idBytes();
    }

    private int validateRecentLimit(Integer value) {
        int recentLimit = value == null ? DEFAULT_RECENT_LIMIT : value;
        if (recentLimit < 1 || recentLimit > MAX_RECENT_LIMIT) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_RECENT_LIMIT",
                    "recentLimit must be between 1 and 10"
            );
        }
        return recentLimit;
    }

    enum Range {
        SEVEN_DAYS("7d", 6),
        THIRTY_DAYS("30d", 29),
        NINETY_DAYS("90d", 89),
        ALL("all", null);

        private final String value;
        private final Integer daysBefore;

        Range(String value, Integer daysBefore) {
            this.value = value;
            this.daysBefore = daysBefore;
        }

        static Range parse(String value) {
            String normalized = StringUtils.hasText(value) ? value.trim() : "30d";
            for (Range range : values()) {
                if (range.value.equals(normalized)) return range;
            }
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_DASHBOARD_RANGE",
                    "range must be one of 7d, 30d, 90d or all"
            );
        }

        LocalDate fromDate(LocalDate today) {
            return daysBefore == null ? null : today.minusDays(daysBefore);
        }
    }
}

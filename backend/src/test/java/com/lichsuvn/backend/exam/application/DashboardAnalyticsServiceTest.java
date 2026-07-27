package com.lichsuvn.backend.exam.application;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.infrastructure.ExamAttemptRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class DashboardAnalyticsServiceTest {
    private static final Instant NOW = Instant.parse("2026-07-20T18:30:00Z");
    private ExamAttemptRepository repository;
    private DashboardAnalyticsService service;
    private UserPrincipal principal;

    @BeforeEach
    void setUp() {
        repository = mock(ExamAttemptRepository.class);
        DashboardSnapshotV2Parser parser = new DashboardSnapshotV2Parser(DashboardTestFixtures.JSON);
        service = new DashboardAnalyticsService(
                repository,
                parser,
                new DashboardAnalyticsAggregator(),
                Caffeine.newBuilder().build(),
                Clock.fixed(NOW, ZoneOffset.UTC),
                500
        );
        principal = new UserPrincipal("owner", new byte[16], "not-used@example.invalid", List.of("student"));
        when(repository.findDashboardAttempts(
                any(), any(), nullable(Instant.class), any(), any(Pageable.class)
        )).thenReturn(List.of());
    }

    static Stream<Arguments> ranges() {
        return Stream.of(
                Arguments.of("7d", Instant.parse("2026-07-14T17:00:00Z")),
                Arguments.of("30d", Instant.parse("2026-06-21T17:00:00Z")),
                Arguments.of("90d", Instant.parse("2026-04-22T17:00:00Z"))
        );
    }

    @ParameterizedTest
    @MethodSource("ranges")
    void computesInclusiveLowerAndExclusiveUpperAtVietnamMidnight(
            String range,
            Instant expectedFrom
    ) {
        var response = service.getDashboard(principal, range, 5);
        ArgumentCaptor<Instant> from = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Instant> to = ArgumentCaptor.forClass(Instant.class);
        verify(repository).countDashboardAttempts(
                eq(principal.idBytes()), eq(DashboardAnalyticsPolicy.INCLUDED_MODES),
                from.capture(), to.capture()
        );
        assertEquals(expectedFrom, from.getValue());
        assertEquals(Instant.parse("2026-07-21T17:00:00Z"), to.getValue());
        assertEquals("Asia/Ho_Chi_Minh", response.scope().timezone());
        assertEquals("2026-07-22", response.scope().toDateExclusive().toString());
    }

    @Test
    void allRangeHasNoLowerBoundAndDefaultIsThirtyDays() {
        service.getDashboard(principal, "all", null);
        ArgumentCaptor<Instant> allFrom = ArgumentCaptor.forClass(Instant.class);
        verify(repository).countDashboardAttempts(
                eq(principal.idBytes()), eq(DashboardAnalyticsPolicy.INCLUDED_MODES),
                allFrom.capture(), any(Instant.class)
        );
        assertNull(allFrom.getValue());

        repository = mock(ExamAttemptRepository.class);
        when(repository.findDashboardAttempts(any(), any(), nullable(Instant.class), any(), any(Pageable.class)))
                .thenReturn(List.of());
        service = new DashboardAnalyticsService(
                repository,
                new DashboardSnapshotV2Parser(DashboardTestFixtures.JSON),
                new DashboardAnalyticsAggregator(),
                Caffeine.newBuilder().build(),
                Clock.fixed(NOW, ZoneOffset.UTC),
                500
        );
        var response = service.getDashboard(principal, null, null);
        assertEquals("30d", response.scope().range());
        assertEquals("2026-06-22", response.scope().fromDate().toString());
    }

    @Test
    void usesVersionAndThreeBoundedOwnerScopedRepositoryQueries() {
        when(repository.countDashboardAttempts(any(), any(), any(), any())).thenReturn(0L);
        when(repository.countDashboardExcludedModes(any(), any(), any(), any())).thenReturn(3L);
        service.getDashboard(principal, "30d", 5);

        verify(repository).countDashboardAttempts(
                eq(principal.idBytes()), eq(DashboardAnalyticsPolicy.INCLUDED_MODES),
                any(Instant.class), any(Instant.class)
        );
        verify(repository).countDashboardExcludedModes(
                eq(principal.idBytes()), eq(DashboardAnalyticsPolicy.INCLUDED_MODES),
                any(Instant.class), any(Instant.class)
        );
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findDashboardAttempts(
                eq(principal.idBytes()), eq(DashboardAnalyticsPolicy.INCLUDED_MODES),
                any(Instant.class), any(Instant.class), pageable.capture()
        );
        verify(repository).findDashboardVersion(
                eq(principal.idBytes()), eq(DashboardAnalyticsPolicy.INCLUDED_MODES)
        );
        assertEquals(500, pageable.getValue().getPageSize());
        verifyNoMoreInteractions(repository);
    }

    @Test
    void reusesComputedDashboardWhileTheDataVersionIsUnchanged() {
        var version = version(1, "2026-07-20T00:00:00Z", "2026-07-20T00:01:00Z");
        when(repository.findDashboardVersion(any(), any())).thenReturn(version);

        service.getDashboard(principal, "30d", 5);
        service.getDashboard(principal, "30d", 5);

        verify(repository, times(2)).findDashboardVersion(any(), any());
        verify(repository, times(1)).findDashboardAttempts(any(), any(), any(), any(), any(Pageable.class));
        verify(repository, times(1)).countDashboardAttempts(any(), any(), any(), any());
    }

    @Test
    void recomputesDashboardWhenTheDataVersionChanges() {
        var firstVersion = version(1, "2026-07-20T00:00:00Z", "2026-07-20T00:01:00Z");
        var secondVersion = version(2, "2026-07-21T00:00:00Z", "2026-07-21T00:01:00Z");
        when(repository.findDashboardVersion(any(), any())).thenReturn(
                firstVersion,
                secondVersion
        );

        service.getDashboard(principal, "30d", 5);
        service.getDashboard(principal, "30d", 5);

        verify(repository, times(2)).findDashboardAttempts(any(), any(), any(), any(), any(Pageable.class));
        verify(repository, times(2)).countDashboardAttempts(any(), any(), any(), any());
    }

    @Test
    void reconcilesTotalKnownWhenCountLagsBehindFetchedRows() {
        when(repository.countDashboardAttempts(any(), any(), any(), any())).thenReturn(2L);
        var first = row("one", BigDecimal.valueOf(6), 60, "BACKEND", "SERVER", "SERVER_ON_TIME", 1);
        var second = row("two", BigDecimal.valueOf(7), 60, "BACKEND", "SERVER", "SERVER_ON_TIME", 1);
        var third = row("three", BigDecimal.valueOf(8), 60, "BACKEND", "SERVER", "SERVER_ON_TIME", 1);
        when(repository.findDashboardAttempts(any(), any(), any(), any(), any(Pageable.class)))
                .thenReturn(List.of(first, second, third));

        var response = service.getDashboard(principal, "30d", 5);

        assertEquals(3, response.coverage().totalKnownAttempts());
        assertTrue(response.coverage().fetchedAttemptCount() <= response.coverage().totalKnownAttempts());
    }

    @Test
    void validatesAuthenticationRangeAndRecentLimit() {
        assertEquals(
                "AUTHENTICATION_REQUIRED",
                assertThrows(ApiException.class, () -> service.getDashboard(null, "30d", 5)).getCode()
        );
        assertEquals(
                "INVALID_DASHBOARD_RANGE",
                assertThrows(ApiException.class, () -> service.getDashboard(principal, "14d", 5)).getCode()
        );
        assertEquals(
                "INVALID_RECENT_LIMIT",
                assertThrows(ApiException.class, () -> service.getDashboard(principal, "30d", 0)).getCode()
        );
        assertEquals(
                "INVALID_RECENT_LIMIT",
                assertThrows(ApiException.class, () -> service.getDashboard(principal, "30d", 11)).getCode()
        );
    }

    @Test
    void excludesInvalidBasicSummaryAndAuthorityWithoutFailingValidRows() {
        var valid = row("valid", BigDecimal.valueOf(8), 60, "BACKEND", "SERVER", "SERVER_ON_TIME", 1);
        var missingSession = row("", BigDecimal.valueOf(7), 60, "BACKEND", "SERVER", "SERVER_ON_TIME", 1);
        var invalidScore = row("score", BigDecimal.valueOf(11), 60, "BACKEND", "SERVER", "SERVER_ON_TIME", 1);
        var invalidAuthority = row("authority", BigDecimal.valueOf(6), 60, "BACKEND", "SERVER", "CLIENT_FALLBACK", 2);
        when(repository.countDashboardAttempts(any(), any(), any(), any())).thenReturn(4L);
        when(repository.findDashboardAttempts(any(), any(), any(), any(), any(Pageable.class)))
                .thenReturn(List.of(valid, missingSession, invalidScore, invalidAuthority));

        var response = service.getDashboard(principal, "30d", 5);
        assertEquals(1, response.summary().totalAttempts());
        assertEquals(4, response.coverage().fetchedAttemptCount());
        assertEquals(3, response.diagnostics().excludedInvalidSummaryCount());
    }

    private ExamAttemptRepository.DashboardAttemptView row(
            String sessionId,
            BigDecimal score,
            Integer duration,
            String scoreAuthority,
            String timingAuthority,
            String submissionOrigin,
            Integer schema
    ) {
        var row = mock(ExamAttemptRepository.DashboardAttemptView.class);
        when(row.getSessionId()).thenReturn(sessionId);
        when(row.getMode()).thenReturn("TIMED_ORIGINAL");
        when(row.getTitle()).thenReturn("Synthetic");
        when(row.getTotalScore()).thenReturn(score);
        when(row.getTotalQuestions()).thenReturn(1);
        when(row.getDurationSeconds()).thenReturn(duration);
        when(row.getSubmittedAt()).thenReturn(Instant.parse("2026-07-20T00:00:00Z"));
        when(row.getCreatedAt()).thenReturn(Instant.parse("2026-07-20T00:00:00Z"));
        when(row.getSnapshotSchemaVersion()).thenReturn(schema);
        when(row.getScoreAuthority()).thenReturn(scoreAuthority);
        when(row.getTimingAuthority()).thenReturn(timingAuthority);
        when(row.getSubmissionOrigin()).thenReturn(submissionOrigin);
        when(row.getScoringVersion()).thenReturn("v1");
        when(row.getDatasetVersion()).thenReturn("dataset");
        when(row.getResultJson()).thenReturn("{}");
        return row;
    }

    private ExamAttemptRepository.DashboardVersionView version(
            long total,
            String lastSubmittedAt,
            String lastUpdatedAt
    ) {
        var version = mock(ExamAttemptRepository.DashboardVersionView.class);
        when(version.getTotal()).thenReturn(total);
        when(version.getLastSubmittedAt()).thenReturn(Instant.parse(lastSubmittedAt));
        when(version.getLastUpdatedAt()).thenReturn(Instant.parse(lastUpdatedAt));
        return version;
    }
}

package com.lichsuvn.backend.progress.application;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.progress.infrastructure.EventViewLogRepository;
import com.lichsuvn.backend.progress.infrastructure.LearningProgressRepository;
import com.lichsuvn.backend.progress.infrastructure.ProfileLearningSummaryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProgressServiceTest {
    private static final Instant NOW = Instant.parse("2026-07-27T03:00:00Z");

    @Mock EventViewLogRepository eventViewLogRepository;
    @Mock LearningProgressRepository learningProgressRepository;
    @Mock ProfileLearningSummaryRepository summaryRepository;

    private ProgressService service;

    @BeforeEach
    void setUp() {
        service = new ProgressService(
                eventViewLogRepository,
                learningProgressRepository,
                summaryRepository,
                Clock.fixed(NOW, ZoneOffset.UTC)
        );
    }

    @Test
    void returnsVersionedTruthfulSummaryForOwner() {
        UserPrincipal owner = principal((byte) 7);
        when(summaryRepository.findTotals(argThat(value -> Arrays.equals(value, owner.idBytes()))))
                .thenReturn(new ProfileLearningSummaryRepository.Totals(12, 4, 3_661));
        when(summaryRepository.findActivityDates(argThat(value -> Arrays.equals(value, owner.idBytes()))))
                .thenReturn(List.of(
                        LocalDate.of(2026, 7, 27),
                        LocalDate.of(2026, 7, 26),
                        LocalDate.of(2026, 7, 25),
                        LocalDate.of(2026, 7, 23)
                ));

        var response = service.findMyLearningSummary(owner);

        assertEquals(1, response.schemaVersion());
        assertEquals(NOW, response.generatedAt());
        assertEquals("Asia/Ho_Chi_Minh", response.timezone());
        assertEquals(12, response.eventsViewed());
        assertEquals(4, response.quizzesCompleted());
        assertEquals(61, response.totalMinutes());
        assertEquals(3, response.streakDays());
        verify(summaryRepository).findTotals(argThat(value -> Arrays.equals(value, owner.idBytes())));
    }

    @Test
    void streakContinuesFromYesterdayButExpiresAfterAGap() {
        LocalDate today = LocalDate.of(2026, 7, 27);
        assertEquals(3, ProgressService.calculateCurrentStreak(
                List.of(today.minusDays(1), today.minusDays(2), today.minusDays(3)),
                today
        ));
        assertEquals(0, ProgressService.calculateCurrentStreak(
                List.of(today.minusDays(2), today.minusDays(3)),
                today
        ));
    }

    private UserPrincipal principal(byte marker) {
        byte[] id = new byte[16];
        Arrays.fill(id, marker);
        return new UserPrincipal("owner", id, "owner@example.test", List.of("student"));
    }
}

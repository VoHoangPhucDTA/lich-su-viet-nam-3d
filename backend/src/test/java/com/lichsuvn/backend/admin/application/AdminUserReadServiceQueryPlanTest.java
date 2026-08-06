package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminUserDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminUserReadRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class AdminUserReadServiceQueryPlanTest {
    private static final String ID = "11111111-1111-1111-1111-111111111111";
    private static final Instant NOW = Instant.parse("2026-07-26T03:00:00Z");
    private final AdminUserReadRepository repository = mock(AdminUserReadRepository.class);
    private final AdminUserReadService service = new AdminUserReadService(repository);

    @Test
    void nonEmptyListUsesCountPageAndOneActivityBatch() {
        when(repository.count(any())).thenReturn(1L);
        when(repository.findPage(any())).thenReturn(List.of(userRow()));
        when(repository.findLastMeaningfulActivity(anyList())).thenReturn(Map.of(ID, NOW));

        AdminUserDtos.Page result = service.findUsers(
                null, null, null, null, null, null, null, null);

        assertEquals(1, result.total());
        assertEquals(NOW, result.items().getFirst().lastMeaningfulActivityAt());
        verify(repository, times(1)).count(any());
        verify(repository, times(1)).findPage(any());
        verify(repository, times(1)).findLastMeaningfulActivity(anyList());
        verifyNoMoreInteractions(repository);
    }

    @Test
    void emptyListSkipsActivityBatchAndCannotProduceEmptyInClause() {
        when(repository.count(any())).thenReturn(0L);
        when(repository.findPage(any())).thenReturn(List.of());

        AdminUserDtos.Page result = service.findUsers(
                null, null, null, null, null, null, 20, 0);

        assertEquals(0, result.count());
        verify(repository, times(1)).count(any());
        verify(repository, times(1)).findPage(any());
        verify(repository, never()).findLastMeaningfulActivity(anyList());
        verifyNoMoreInteractions(repository);
    }

    @Test
    void detailUsesExactlyFourRepositoryCallsAndRoundsScoresHalfUpToTwoDecimals() {
        when(repository.findAccount(any())).thenReturn(Optional.of(accountRow()));
        when(repository.findLearning(any())).thenReturn(new AdminUserReadRepository.LearningRow(
                4, 2, 8, NOW, NOW, 2, new BigDecimal("8.125"),
                NOW.plusSeconds(1), 2, new BigDecimal("9.994"), NOW.plusSeconds(2)));
        when(repository.findRecentActivity(any())).thenReturn(List.of());
        when(repository.findRecentAudit(any(), any())).thenReturn(List.of());

        AdminUserDtos.Detail result = service.findUser(ID);

        assertEquals(new BigDecimal("8.13"), result.learning().quizzes().averageScore10());
        assertEquals(new BigDecimal("9.99"), result.learning().exams().averageScore10());
        assertEquals(NOW.plusSeconds(2), result.activity().lastMeaningfulActivityAt());
        assertEquals(AdminUserDtos.TrackingMode.STATELESS_JWT, result.sessions().trackingMode());
        assertEquals(false, result.sessions().trackingAvailable());
        assertNull(result.sessions().activeRefreshSessionCount());
        verify(repository, times(1)).findAccount(any());
        verify(repository, times(1)).findLearning(any());
        verify(repository, times(1)).findRecentActivity(any());
        verify(repository, times(1)).findRecentAudit(any(), any());
        verifyNoMoreInteractions(repository);
    }

    private static AdminUserReadRepository.UserRow userRow() {
        return new AdminUserReadRepository.UserRow(
                ID, "Teacher", "teacher@example.test",
                AdminUserDtos.Role.TEACHER, List.of(AdminUserDtos.Role.TEACHER),
                AdminUserDtos.Status.ACTIVE, true, NOW, NOW);
    }

    private static AdminUserReadRepository.AccountRow accountRow() {
        return new AdminUserReadRepository.AccountRow(
                ID, "Teacher", "teacher@example.test",
                AdminUserDtos.Role.TEACHER, List.of(AdminUserDtos.Role.TEACHER),
                AdminUserDtos.Status.ACTIVE, NOW, "other", "School",
                "https://cdn.example.test/avatar.png", NOW, NOW);
    }
}

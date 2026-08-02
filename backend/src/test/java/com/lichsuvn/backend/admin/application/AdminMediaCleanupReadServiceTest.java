package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.admin.infrastructure.AdminEventImageRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminMediaCleanupReadServiceTest {
    @Test
    void listUsesBoundedAllowlistedFiltersAndNeverBuildsRawClientSql() {
        var repository = mock(AdminEventImageRepository.class);
        when(repository.countCleanup(org.mockito.ArgumentMatchers.any())).thenReturn(1L);
        when(repository.findCleanup(org.mockito.ArgumentMatchers.any())).thenReturn(List.of());
        var service = new AdminMediaCleanupReadService(repository);

        var page = service.find("failed", "delete", "nextAttemptAt", "asc", 500, 9000);

        assertEquals(100, page.limit());
        assertEquals(5000, page.offset());
        ArgumentCaptor<AdminEventImageRepository.CleanupQuery> query =
                ArgumentCaptor.forClass(AdminEventImageRepository.CleanupQuery.class);
        verify(repository).findCleanup(query.capture());
        assertEquals("WHERE task.task_status=:status AND task.operation=:operation", query.getValue().where());
        assertEquals("task.next_attempt_at ASC, task.id ASC", query.getValue().orderBy());
        assertEquals("FAILED", query.getValue().parameters().getValue("status"));
        assertEquals("DELETE", query.getValue().parameters().getValue("operation"));
    }

    @Test
    void rejectsUnsafeFiltersAndSortDirection() {
        var service = new AdminMediaCleanupReadService(mock(AdminEventImageRepository.class));

        assertCode("INVALID_CLEANUP_STATUS", () -> service.find("FAILED OR 1=1", null, null, null, null, null));
        assertCode("INVALID_CLEANUP_OPERATION", () -> service.find(null, "DELETE; DROP", null, null, null, null));
        assertCode("INVALID_CLEANUP_SORT", () -> service.find(null, null, "publicId", null, null, null));
        assertCode("INVALID_CLEANUP_SORT_DIRECTION", () -> service.find(null, null, null, "sideways", null, null));
    }

    private void assertCode(String expected, Runnable operation) {
        ApiException exception = assertThrows(ApiException.class, operation::run);
        assertEquals(expected, exception.getCode());
    }
}

package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.infrastructure.AdminUserReadRepository;
import com.lichsuvn.backend.common.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AdminUserReadServiceValidationTest {
    private AdminUserReadService service;

    @BeforeEach
    void setUp() {
        AdminUserReadRepository repository = mock(AdminUserReadRepository.class);
        when(repository.findPage(any())).thenReturn(java.util.List.of());
        service = new AdminUserReadService(repository);
    }

    @Test
    void rejectsInvalidFiltersAndSortWithStableCodes() {
        assertCode("INVALID_USER_ROLE", () -> find(null, "owner", null, null, null, null, 20, 0));
        assertCode("INVALID_USER_STATUS", () -> find(null, null, "locked", null, null, null, 20, 0));
        assertCode("INVALID_EMAIL_VERIFICATION_FILTER",
                () -> find(null, null, null, "yes", null, null, 20, 0));
        assertCode("INVALID_USER_SORT",
                () -> find(null, null, null, null, "passwordHash", null, 20, 0));
        assertCode("INVALID_SORT_DIRECTION",
                () -> find(null, null, null, null, null, "sideways", 20, 0));
    }

    @Test
    void rejectsInvalidQueryPaginationAndUserId() {
        assertCode("INVALID_USER_QUERY",
                () -> find("line\nbreak", null, null, null, null, null, 20, 0));
        assertCode("INVALID_USER_QUERY",
                () -> find("x".repeat(201), null, null, null, null, null, 20, 0));
        assertCode("INVALID_LIMIT", () -> find(null, null, null, null, null, null, 0, 0));
        assertCode("INVALID_LIMIT", () -> find(null, null, null, null, null, null, 101, 0));
        assertCode("INVALID_OFFSET", () -> find(null, null, null, null, null, null, 20, -1));
        assertCode("INVALID_USER_ID", () -> service.findUser("not-a-uuid"));
    }

    @Test
    void acceptsAllSupportedRoleStatusVerificationAndSortValues() {
        for (String role : java.util.List.of("student", "teacher", "admin")) {
            find(null, role, null, null, null, null, 20, 0);
        }
        for (String status : java.util.List.of("active", "pending", "disabled", "deleted")) {
            find(null, null, status, null, null, null, 20, 0);
        }
        for (String verified : java.util.List.of("true", "false")) {
            find(null, null, null, verified, null, null, 20, 0);
        }
        for (String sort : java.util.List.of("displayName", "email", "createdAt", "updatedAt")) {
            find(null, null, null, null, sort, "asc", 20, 0);
            find(null, null, null, null, sort, "desc", 20, 0);
        }
    }

    private void find(
            String query, String role, String status, String verified,
            String sortBy, String sortDir, Integer limit, Integer offset
    ) {
        service.findUsers(query, role, status, verified, sortBy, sortDir, limit, offset);
    }

    private static void assertCode(String code, Runnable action) {
        ApiException error = assertThrows(ApiException.class, action::run);
        assertEquals(code, error.getCode());
    }
}

package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import com.lichsuvn.backend.common.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

class AdminEventReadServiceValidationTest {
    private AdminEventReadService service;

    @BeforeEach
    void setUp() {
        service = new AdminEventReadService(
                mock(AdminEventReadRepository.class), new EventCompletenessService());
    }

    @Test
    void rejectsInvalidFiltersAndSortWithStableCodes() {
        assertCode("INVALID_GRADE", () -> find(null, 9, null, null, null));
        assertCode("INVALID_GEO_TYPE", () -> find("legacy", null, null, null, null));
        assertCode("INVALID_CHRONOLOGY_FILTER", () -> find(null, null, "invalid", null, null));
        assertCode("INVALID_SORT_FIELD", () -> find(null, null, null, "raw_json", null));
        assertCode("INVALID_SORT_DIRECTION", () -> find(null, null, null, null, "sideways"));
    }

    @Test
    void rejectsInvalidPaginationAndChronologyRange() {
        assertCode("INVALID_LIMIT", () -> service.findEvents(
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, 101, 0));
        assertCode("INVALID_OFFSET", () -> service.findEvents(
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, 20, -1));
        assertCode("INVALID_START_YEAR_RANGE", () -> service.findEvents(
                null, null, null, null, null, null, null, 1945, 1945,
                null, null, null, null, null, 20, 0));
    }

    private void find(String geo, Integer grade, String chronology, String sort, String direction) {
        service.findEvents(null, null, null, null, grade, geo, chronology,
                null, null, null, null, null, sort, direction, 20, 0);
    }

    private static void assertCode(String code, Runnable action) {
        ApiException error = assertThrows(ApiException.class, action::run);
        assertEquals(code, error.getCode());
    }
}

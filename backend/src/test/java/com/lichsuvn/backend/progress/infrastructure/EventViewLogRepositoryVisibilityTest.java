package com.lichsuvn.backend.progress.infrastructure;

import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Query;

import static org.junit.jupiter.api.Assertions.assertTrue;

class EventViewLogRepositoryVisibilityTest {

    @Test
    void recentEventSummaryQueryRequiresPublishedEventsWithoutDeletingHistory() throws Exception {
        Query query = EventViewLogRepository.class
                .getMethod("findRecentEvents", byte[].class)
                .getAnnotation(Query.class);

        assertTrue(query.nativeQuery());
        assertTrue(query.value().contains("JOIN historical_events"));
        assertTrue(query.value().contains("e.status = 'published'"));
        assertTrue(query.value().contains("FROM event_view_logs"));
        assertTrue(!query.value().toUpperCase().contains("DELETE"));
    }

    @Test
    void viewLoggingAcceptsOnlyPublishedEventIds() throws Exception {
        Query query = EventViewLogRepository.class
                .getMethod("countPublishedEvent", String.class)
                .getAnnotation(Query.class);

        assertTrue(query.nativeQuery());
        assertTrue(query.value().contains("FROM historical_events"));
        assertTrue(query.value().contains("status = 'published'"));
        assertTrue(!query.value().toUpperCase().contains("DELETE"));
    }
}

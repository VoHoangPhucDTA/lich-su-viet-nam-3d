package com.lichsuvn.backend.event.api.dto;

import java.util.List;

/**
 * Immutable, non-paginated response for the backend-owned homepage curation.
 */
public record HomepageEventsResponse(List<HomepageEventSummaryDto> events) {
    public HomepageEventsResponse {
        events = List.copyOf(events == null ? List.of() : events);
    }
}

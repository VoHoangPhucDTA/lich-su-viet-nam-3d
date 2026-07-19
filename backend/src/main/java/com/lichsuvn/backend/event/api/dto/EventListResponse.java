package com.lichsuvn.backend.event.api.dto;

import java.util.List;

public record EventListResponse(
        List<EventSummaryDto> items,
        int count,
        int total,
        int limit,
        int offset
) {
    public EventListResponse(List<EventSummaryDto> items, int count) {
        this(items, count, count, count, 0);
    }
}

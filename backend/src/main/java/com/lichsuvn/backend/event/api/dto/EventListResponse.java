package com.lichsuvn.backend.event.api.dto;

import java.util.List;

public record EventListResponse(
        List<EventSummaryDto> items,
        int count
) {
}

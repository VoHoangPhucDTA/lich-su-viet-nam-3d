package com.lichsuvn.backend.event.api.dto;

import java.util.List;

public record EventRelatedEventsDto(
        List<EventRelatedEventDto> predecessors,
        List<EventRelatedEventDto> successors,
        List<EventRelatedEventDto> related
) {
    public static EventRelatedEventsDto empty() {
        return new EventRelatedEventsDto(List.of(), List.of(), List.of());
    }
}

package com.lichsuvn.backend.event.api;

import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.event.api.dto.EventDetailDto;
import com.lichsuvn.backend.event.api.dto.EventListResponse;
import com.lichsuvn.backend.event.api.dto.EventRelationDto;
import com.lichsuvn.backend.event.api.dto.TimelineEventDto;
import com.lichsuvn.backend.event.application.EventReadService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST controller cho nhóm API đọc sự kiện lịch sử.
 *
 * Controller chỉ nhận request/response, không chứa SQL hay logic nghiệp vụ.
 * Luồng chính: HTTP request -> EventReadService -> EventReadRepository -> DTO -> ApiResponse.
 */
@RestController
@RequestMapping("/api")
public class EventController {
    private final EventReadService eventReadService;

    public EventController(EventReadService eventReadService) {
        this.eventReadService = eventReadService;
    }

    @GetMapping("/events")
    public ApiResponse<EventListResponse> findEvents(
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer grade,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String geoType,
            @RequestParam(required = false, name = "q") String query,
            @RequestParam(required = false) String parentId,
            @RequestParam(required = false) Integer level,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset
    ) {
        return ApiResponse.ok(eventReadService.findEvents(
                year,
                grade,
                eventType,
                geoType,
                query,
                parentId,
                level,
                limit,
                offset
        ));
    }

    @GetMapping("/timeline")
    public ApiResponse<List<TimelineEventDto>> findTimeline(
            @RequestParam(required = false) Integer from,
            @RequestParam(required = false) Integer to,
            @RequestParam(required = false) Integer grade,
            @RequestParam(required = false) String eventType
    ) {
        return ApiResponse.ok(eventReadService.findTimeline(from, to, grade, eventType));
    }

    @GetMapping("/events/{idOrSlug}")
    public ApiResponse<EventDetailDto> findDetail(@PathVariable String idOrSlug) {
        return ApiResponse.ok(eventReadService.findDetail(idOrSlug));
    }

    @GetMapping("/events/{eventId}/children")
    public ApiResponse<EventListResponse> findChildren(@PathVariable String eventId) {
        return ApiResponse.ok(eventReadService.findChildren(eventId));
    }

    @GetMapping("/events/{eventId}/related")
    public ApiResponse<List<EventRelationDto>> findRelated(@PathVariable String eventId) {
        return ApiResponse.ok(eventReadService.findRelated(eventId));
    }
}

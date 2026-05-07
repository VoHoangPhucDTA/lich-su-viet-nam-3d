package com.lichsuvn.backend.event.application;

import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.NotFoundException;
import com.lichsuvn.backend.event.api.dto.EventDetailDto;
import com.lichsuvn.backend.event.api.dto.EventListResponse;
import com.lichsuvn.backend.event.api.dto.EventRelationDto;
import com.lichsuvn.backend.event.api.dto.EventSummaryDto;
import com.lichsuvn.backend.event.api.dto.TimelineEventDto;
import com.lichsuvn.backend.event.infrastructure.EventReadRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;

/**
 * Application service cho use case đọc sự kiện.
 *
 * Nhiệm vụ:
 * - Validate input từ controller: grade, eventType, geoType, limit/offset.
 * - Gọi repository projection để lấy DTO nhẹ.
 * - Ném ApiException có code rõ ràng khi request không hợp lệ.
 */
@Service
public class EventReadService {
    private static final Set<Integer> SUPPORTED_GRADES = Set.of(10, 11, 12);
    private static final Set<String> EVENT_TYPES = Set.of("military", "political", "economic", "cultural");
    private static final Set<String> GEO_TYPES = Set.of("single_point", "multi_region", "nationwide", "no_location");
    private static final int DEFAULT_LIMIT = 300;
    private static final int MAX_LIMIT = 1000;

    private final EventReadRepository eventReadRepository;

    public EventReadService(EventReadRepository eventReadRepository) {
        this.eventReadRepository = eventReadRepository;
    }

    public EventListResponse findEvents(
            Integer year,
            Integer grade,
            String eventType,
            String geoType,
            String query,
            String parentId,
            Integer level,
            Integer limit,
            Integer offset
    ) {
        validateGrade(grade);
        validateEnum("eventType", eventType, EVENT_TYPES);
        validateEnum("geoType", geoType, GEO_TYPES);

        int safeLimit = normalizeLimit(limit);
        int safeOffset = normalizeOffset(offset);
        List<EventSummaryDto> items = eventReadRepository.findEvents(
                year,
                grade,
                eventType,
                geoType,
                query,
                parentId,
                level,
                safeLimit,
                safeOffset
        );
        return new EventListResponse(items, items.size());
    }

    public List<TimelineEventDto> findTimeline(Integer from, Integer to, Integer grade, String eventType) {
        validateGrade(grade);
        validateEnum("eventType", eventType, EVENT_TYPES);
        if (from != null && to != null && from > to) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_YEAR_RANGE", "from must be less than or equal to to");
        }
        return eventReadRepository.findTimeline(from, to, grade, eventType);
    }

    public EventDetailDto findDetail(String idOrSlug) {
        return eventReadRepository.findDetailByIdOrSlug(idOrSlug)
                .orElseThrow(() -> new NotFoundException("EVENT_NOT_FOUND", "Historical event not found"));
    }

    public EventListResponse findChildren(String eventId) {
        List<EventSummaryDto> items = eventReadRepository.findChildren(eventId);
        return new EventListResponse(items, items.size());
    }

    public List<EventRelationDto> findRelated(String eventId) {
        return eventReadRepository.findRelations(eventId);
    }

    private void validateGrade(Integer grade) {
        if (grade != null && !SUPPORTED_GRADES.contains(grade)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_GRADE", "grade must be one of 10, 11, 12");
        }
    }

    private void validateEnum(String name, String value, Set<String> allowedValues) {
        if (value != null && !allowedValues.contains(value)) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_" + name.toUpperCase(),
                    name + " has unsupported value"
            );
        }
    }

    private int normalizeLimit(Integer limit) {
        if (limit == null) {
            return DEFAULT_LIMIT;
        }
        if (limit < 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_LIMIT", "limit must be greater than 0");
        }
        return Math.min(limit, MAX_LIMIT);
    }

    private int normalizeOffset(Integer offset) {
        if (offset == null) {
            return 0;
        }
        if (offset < 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_OFFSET", "offset must be greater than or equal to 0");
        }
        return offset;
    }
}

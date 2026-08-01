package com.lichsuvn.backend.event.application;

import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.NotFoundException;
import com.lichsuvn.backend.event.api.dto.EventDetailDto;
import com.lichsuvn.backend.event.api.dto.EventListResponse;
import com.lichsuvn.backend.event.api.dto.EventRelatedEventsDto;
import com.lichsuvn.backend.event.api.dto.EventSummaryDto;
import com.lichsuvn.backend.event.api.dto.HomepageEventSummaryDto;
import com.lichsuvn.backend.event.api.dto.HomepageEventsResponse;
import com.lichsuvn.backend.event.api.dto.TimelineEventDto;
import com.lichsuvn.backend.event.infrastructure.EventReadRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    private static final Set<String> EVENT_LEVELS = Set.of("collection", "atomic");
    private static final Set<String> SORT_FIELDS = Set.of("year", "name");
    private static final Set<String> SORT_DIRECTIONS = Set.of("asc", "desc");
    private static final int DEFAULT_LIMIT = 300;
    private static final int MAX_LIMIT = 1000;
    static final List<String> HOMEPAGE_EVENT_SLUGS = List.of(
            "chien-thang-bach-dang-938",
            "ly-thai-to-doi-do-thang-long",
            "khang-chien-chong-quan-thanh-1789",
            "ho-chi-minh-cong-bo-tuyen-ngon-doc-lap",
            "chien-dich-dien-bien-phu-1954",
            "chien-dich-giai-phong-sai-gon-gia-dinh-chien-dich-ho-chi-minh"
    );

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
            String eventLevel,
            Integer startYearFrom,
            Integer startYearTo,
            String sortBy,
            String sortDir,
            Integer limit,
            Integer offset
    ) {
        validateGrade(grade);
        validateEnum("eventType", eventType, EVENT_TYPES);
        validateEnum("geoType", geoType, GEO_TYPES);
        validateEnum("eventLevel", eventLevel, EVENT_LEVELS);
        validateEnum("sortBy", sortBy, SORT_FIELDS);
        validateEnum("sortDir", sortDir, SORT_DIRECTIONS);
        validateStartYearRange(startYearFrom, startYearTo);

        int safeLimit = normalizeLimit(limit);
        int safeOffset = normalizeOffset(offset);
        String safeSortBy = sortBy == null ? "year" : sortBy;
        String safeSortDir = sortDir == null ? "asc" : sortDir;
        // 1.1.5: EventReadService.java: Thực hiện truy vấn MySQL để lấy dữ liệu sự kiện lịch sử.
        List<EventSummaryDto> items = eventReadRepository.findEvents(
                year,
                grade,
                eventType,
                geoType,
                query,
                parentId,
                level,
                eventLevel,
                startYearFrom,
                startYearTo,
                safeSortBy,
                safeSortDir,
                safeLimit,
                safeOffset
        );
        int total = eventReadRepository.countEvents(
                year,
                grade,
                eventType,
                geoType,
                query,
                parentId,
                level,
                eventLevel,
                startYearFrom,
                startYearTo
        );
        // 1.1.7: EventReadService.java: Chuyển đổi thành DTO và trả kết quả cho EventController.java.
        return new EventListResponse(items, items.size(), total, safeLimit, safeOffset);
    }

    public HomepageEventsResponse findHomepageEvents() {
        List<HomepageEventSummaryDto> summaries = eventReadRepository.findHomepageSummaries(HOMEPAGE_EVENT_SLUGS);
        if (summaries == null || summaries.isEmpty()) {
            return new HomepageEventsResponse(List.of());
        }

        Map<String, HomepageEventSummaryDto> bySlug = new LinkedHashMap<>();
        Set<String> seenEventIds = new HashSet<>();
        for (HomepageEventSummaryDto summary : summaries) {
            if (!isUsableHomepageSummary(summary)
                    || !HOMEPAGE_EVENT_SLUGS.contains(summary.slug())
                    || !seenEventIds.add(summary.id())) {
                continue;
            }
            bySlug.putIfAbsent(summary.slug(), summary);
        }

        List<HomepageEventSummaryDto> ordered = new ArrayList<>(HOMEPAGE_EVENT_SLUGS.size());
        for (String slug : HOMEPAGE_EVENT_SLUGS) {
            HomepageEventSummaryDto summary = bySlug.get(slug);
            if (summary != null) {
                ordered.add(summary);
            }
        }
        return new HomepageEventsResponse(ordered);
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

    public EventRelatedEventsDto findRelated(String eventId) {
        return eventReadRepository.findRelatedEvents(eventId);
    }

    private boolean isUsableHomepageSummary(HomepageEventSummaryDto summary) {
        return summary != null
                && StringUtils.hasText(summary.id())
                && StringUtils.hasText(summary.slug())
                && StringUtils.hasText(summary.title())
                && EVENT_TYPES.contains(summary.eventType());
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

    private void validateStartYearRange(Integer startYearFrom, Integer startYearTo) {
        if (startYearFrom != null && startYearTo != null && startYearFrom >= startYearTo) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_START_YEAR_RANGE", "startYearFrom must be less than startYearTo");
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

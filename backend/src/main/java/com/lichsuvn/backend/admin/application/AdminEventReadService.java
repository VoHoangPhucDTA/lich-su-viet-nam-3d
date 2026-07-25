package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.NotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class AdminEventReadService {
    private static final Set<String> STATUSES = Set.of("draft", "published", "archived");
    private static final Set<String> LEVELS = Set.of("atomic", "collection");
    private static final Set<String> TYPES = Set.of("military", "political", "economic", "cultural");
    private static final Set<Integer> GRADES = Set.of(10, 11, 12);
    private static final Set<String> GEO_TYPES =
            Set.of("point", "multi_point", "multi_polygon", "mixed", "nationwide", "no_location");
    private static final Set<String> CHRONOLOGIES = Set.of("known", "unknown");
    private static final Set<String> SORT_FIELDS =
            Set.of("title", "chronology", "createdAt", "updatedAt");
    private static final Set<String> SORT_DIRECTIONS = Set.of("asc", "desc");

    private final AdminEventReadRepository repository;
    private final EventCompletenessService completenessService;

    public AdminEventReadService(
            AdminEventReadRepository repository,
            EventCompletenessService completenessService
    ) {
        this.repository = repository;
        this.completenessService = completenessService;
    }

    public AdminEventDtos.Page findEvents(
            String query,
            String status,
            String eventLevel,
            String eventType,
            Integer grade,
            String geoType,
            String chronology,
            Integer startYearFrom,
            Integer startYearTo,
            Boolean missingThumbnail,
            Boolean missingMedia,
            Boolean missingMapData,
            String sortBy,
            String sortDir,
            Integer limit,
            Integer offset
    ) {
        Query normalized = normalize(
                query, status, eventLevel, eventType, grade, geoType, chronology,
                startYearFrom, startYearTo, missingThumbnail, missingMedia, missingMapData,
                sortBy, sortDir, limit, offset
        );
        long total = repository.count(normalized);
        List<AdminEventReadRepository.ListRow> rows = repository.findPage(normalized);
        Map<String, List<Integer>> grades = repository.findGrades(
                rows.stream().map(AdminEventReadRepository.ListRow::id).toList());
        List<AdminEventDtos.ListItem> items = rows.stream().map(row -> {
            EventCompletenessFacts facts = row.facts()
                    .withGrades(grades.getOrDefault(row.id(), List.of()));
            EventCompletenessService.Assessment assessment = completenessService.assess(facts);
            return new AdminEventDtos.ListItem(
                    row.id(), row.slug(), row.title(), row.shortTitle(),
                    row.eventLevel(), row.eventType(), row.eventSubtype(), row.chronology(),
                    row.cardSummary(),
                    row.status(), facts.grades(), row.normalizedGeoType(),
                    assessment.canonicalGeoType(), row.thumbnail(),
                    row.activeMediaCount(), row.flags(), assessment.completeness(),
                    row.createdAt(), row.updatedAt()
            );
        }).toList();
        return new AdminEventDtos.Page(items, items.size(), total, normalized.limit(), normalized.offset());
    }

    public AdminEventDtos.Detail findEvent(String id) {
        AdminEventReadRepository.DetailRow row = repository.findCore(id)
                .orElseThrow(() -> new NotFoundException("EVENT_NOT_FOUND", "Historical event not found"));
        List<Integer> grades = repository.findGrades(List.of(id)).getOrDefault(id, List.of());
        EventCompletenessFacts facts = row.facts().withGrades(grades);
        EventCompletenessService.Assessment assessment = completenessService.assess(facts);
        List<AdminEventDtos.Media> media = repository.findMedia(id);
        AdminEventDtos.Thumbnail thumbnail = media.stream()
                .filter(item -> item.thumbnail() && "active".equals(item.status())
                        && "image".equals(item.mediaType()) && item.urlSafe())
                .map(item -> new AdminEventDtos.Thumbnail(item.id(), item.url(), item.altText()))
                .findFirst().orElse(null);
        AdminEventReadRepository.HierarchyRows hierarchy =
                repository.findHierarchy(id, row.parentId(), row.rootId());

        return new AdminEventDtos.Detail(
                new AdminEventDtos.Core(row.id(), row.slug(), row.title(), row.shortTitle()),
                new AdminEventDtos.Content(
                        row.cardSummary(), row.canonicalSummary(), row.detailedNarrative(),
                        row.significance(), row.keyFacts()
                ),
                row.chronology(),
                new AdminEventDtos.Classification(
                        row.eventLevel(), row.eventType(), row.eventSubtype(), grades),
                new AdminEventDtos.Publication(
                        row.status(), row.flags(), row.publishedAt(), row.createdAt(), row.updatedAt()),
                new AdminEventDtos.MediaSection(
                        thumbnail, media, (int) media.stream()
                        .filter(item -> "active".equals(item.status()) && item.urlSafe()).count()),
                new AdminEventDtos.Geography(
                        row.normalizedGeoType(), assessment.canonicalGeoType(),
                        row.lat(), row.lng(), row.provinceNames(), row.historicalLocations(), row.mapData()),
                new AdminEventDtos.Hierarchy(
                        hierarchy.parent(), hierarchy.root(), hierarchy.children(),
                        repository.findRelations(id)),
                new AdminEventDtos.Textbook(
                        repository.findVisibleTextbookReferences(id),
                        row.textbookRefCount(), row.visibleRefCount(), row.hasTextbookContent()),
                repository.findExternalSources(id),
                assessment.completeness()
        );
    }

    private Query normalize(
            String query, String status, String eventLevel, String eventType, Integer grade,
            String geoType, String chronology, Integer startYearFrom, Integer startYearTo,
            Boolean missingThumbnail, Boolean missingMedia, Boolean missingMapData,
            String sortBy, String sortDir, Integer limit, Integer offset
    ) {
        String normalizedQuery = StringUtils.hasText(query) ? query.trim() : null;
        if (normalizedQuery != null && normalizedQuery.length() > 200) {
            invalid("INVALID_QUERY", "q must not exceed 200 characters");
        }
        validate("INVALID_STATUS", "status", status, STATUSES);
        validate("INVALID_EVENT_LEVEL", "eventLevel", eventLevel, LEVELS);
        validate("INVALID_EVENT_TYPE", "eventType", eventType, TYPES);
        if (grade != null && !GRADES.contains(grade)) invalid("INVALID_GRADE", "grade must be 10, 11 or 12");
        validate("INVALID_GEO_TYPE", "geoType", geoType, GEO_TYPES);
        validate("INVALID_CHRONOLOGY_FILTER", "chronology", chronology, CHRONOLOGIES);
        if (startYearFrom != null && startYearTo != null && startYearFrom >= startYearTo) {
            invalid("INVALID_START_YEAR_RANGE", "startYearFrom must be less than startYearTo");
        }
        if ((startYearFrom != null || startYearTo != null) && chronology != null
                && !"known".equals(chronology)) {
            invalid("INVALID_CHRONOLOGY_FILTER", "Year range requires chronology=known or no chronology filter");
        }
        String normalizedSortBy = sortBy == null ? "updatedAt" : sortBy;
        String normalizedSortDir = sortDir == null ? "desc" : sortDir;
        validate("INVALID_SORT_FIELD", "sortBy", normalizedSortBy, SORT_FIELDS);
        validate("INVALID_SORT_DIRECTION", "sortDir", normalizedSortDir, SORT_DIRECTIONS);
        int normalizedLimit = limit == null ? 20 : limit;
        int normalizedOffset = offset == null ? 0 : offset;
        if (normalizedLimit < 1 || normalizedLimit > 100) {
            invalid("INVALID_LIMIT", "limit must be between 1 and 100");
        }
        if (normalizedOffset < 0) invalid("INVALID_OFFSET", "offset must be greater than or equal to 0");
        return new Query(
                normalizedQuery, status, eventLevel, eventType, grade, geoType, chronology,
                startYearFrom, startYearTo, missingThumbnail, missingMedia, missingMapData,
                normalizedSortBy, normalizedSortDir, normalizedLimit, normalizedOffset
        );
    }

    private static <T> void validate(String code, String name, T value, Set<T> allowed) {
        if (value != null && !allowed.contains(value)) invalid(code, name + " has unsupported value");
    }

    private static void invalid(String code, String message) {
        throw new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public record Query(
            String query,
            String status,
            String eventLevel,
            String eventType,
            Integer grade,
            String geoType,
            String chronology,
            Integer startYearFrom,
            Integer startYearTo,
            Boolean missingThumbnail,
            Boolean missingMedia,
            Boolean missingMapData,
            String sortBy,
            String sortDir,
            int limit,
            int offset
    ) {
    }
}

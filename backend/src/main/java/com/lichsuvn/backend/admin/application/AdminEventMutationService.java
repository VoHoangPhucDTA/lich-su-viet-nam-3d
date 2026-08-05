package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventMutationDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMutationRepository;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@PreAuthorize("hasAuthority('ROLE_admin')")
public class AdminEventMutationService {
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter VERSION_FORMATTER =
            new DateTimeFormatterBuilder().appendInstant(6).toFormatter();
    private static final Set<String> LEVELS = Set.of("atomic", "collection");
    private static final Set<String> TYPES = Set.of("military", "political", "economic", "cultural");
    private static final Set<Integer> GRADES = Set.of(10, 11, 12);
    private static final Set<String> PATCH_FIELDS = Set.of(
            "title", "slug", "shortTitle", "eventLevel", "eventType", "eventSubtype",
            "startYear", "endYear", "effectiveEndYear", "displayDate", "datePrecision",
            "cardSummary", "canonicalSummary", "detailedNarrative", "significance",
            "keyFacts", "showOnHomepage", "showOnTimeline", "featured");

    private final AdminEventMutationRepository repository;
    private final AdminEventReadService readService;
    private final ObjectMapper objectMapper;

    public AdminEventMutationService(
            AdminEventMutationRepository repository,
            AdminEventReadService readService,
            ObjectMapper objectMapper
    ) {
        this.repository = repository;
        this.readService = readService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public AdminEventDtos.Detail create(AdminEventMutationDtos.Create request, UserPrincipal principal) {
        validateCreate(request);
        List<Integer> grades = normalizeGrades(request.grades());
        AdminEventMutationDtos.Create normalized = withEffectiveEndYear(request);
        String id = normalized.slug();
        repository.insertDraft(normalized, id, grades);
        AdminEventDtos.Detail result = readService.findEvent(id);
        repository.audit(principal.idBytes(), "event.draft_created", id, "{}", json(Map.of(
                "status", "draft",
                "gradeCount", grades.size(),
                "changedSections", List.of("core", "grades"),
                "resultingVersion", formatVersion(result.publication().updatedAt())
        )));
        return result;
    }

    @Transactional
    public AdminEventDtos.Detail updateCore(
            String id, AdminEventMutationDtos.CorePatch request, UserPrincipal principal
    ) {
        validatePatch(request);
        Map<String, Object> current = repository.current(id);
        if (current == null) throw notFound();
        LocalDateTime currentVersion = databaseDateTime(current.get("updated_at"));
        LocalDateTime expected = parseExpected(request.expectedUpdatedAt());
        if (!currentVersion.equals(expected)) throw conflict();

        Set<String> fields = new LinkedHashSet<>(request.present());
        fields.remove("expectedUpdatedAt");
        if (fields.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "NO_CHANGES", "No event fields were submitted");

        List<String> assignments = new ArrayList<>();
        var params = new org.springframework.jdbc.core.namedparam.MapSqlParameterSource();
        List<String> changed = new ArrayList<>();
        for (String field : fields) {
            if (!PATCH_FIELDS.contains(field)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "UNSUPPORTED_FIELD", "Unsupported event field: " + field);
            }
            Object value = patchValue(request, field);
            validateField(field, value);
            Object existing = currentValue(current, field);
            if (same(field, existing, value)) continue;
            String column = column(field);
            assignments.add("keyFacts".equals(field)
                    ? column + "=CAST(:" + field + " AS JSON)"
                    : column + "=:" + field);
            params.addValue(field, sqlValue(field, value));
            changed.add(field);
        }
        if (changed.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "NO_CHANGES", "Submitted values do not change the event");
        if (fields.contains("startYear") || fields.contains("endYear") || fields.contains("effectiveEndYear")) {
            validateChronology(
                    fields.contains("startYear") ? (Integer) request.startYear() : intValue(current.get("start_year")),
                    fields.contains("endYear") ? (Integer) request.endYear() : intValue(current.get("end_year")),
                    fields.contains("effectiveEndYear") ? (Integer) request.effectiveEndYear() : intValue(current.get("effective_end_year")));
        }
        try {
            if (!repository.updateCore(id, expected, assignments, params)) {
                if (!repository.exists(id)) throw notFound();
                throw conflict();
            }
        } catch (DuplicateKeyException ex) {
            throw new ApiException(HttpStatus.CONFLICT, "EVENT_SLUG_EXISTS", "Slug already exists");
        }
        AdminEventDtos.Detail result = readService.findEventAfterMutation(id);
        repository.audit(principal.idBytes(), "event.core_updated", id,
                json(Map.of("changedFields", changed, "expectedVersion", request.expectedUpdatedAt())),
                json(Map.of("changedFields", changed,
                        "resultingVersion", formatVersion(result.publication().updatedAt()))));
        return result;
    }

    @Transactional
    public AdminEventDtos.Detail replaceGrades(
            String id, AdminEventMutationDtos.Grades request, UserPrincipal principal
    ) {
        List<Integer> grades = normalizeGrades(request.grades());
        LocalDateTime expected = parseExpected(request.expectedUpdatedAt());
        if (!repository.claimGradeVersion(id, expected)) {
            if (!repository.exists(id)) throw notFound();
            throw conflict();
        }
        List<Integer> before = readService.findEvent(id).classification().grades();
        repository.replaceGrades(id, grades);
        List<Integer> added = grades.stream().filter(value -> !before.contains(value)).toList();
        List<Integer> removed = before.stream().filter(value -> !grades.contains(value)).toList();
        AdminEventDtos.Detail result = readService.findEventAfterMutation(id);
        repository.audit(principal.idBytes(), "event.grades_replaced", id,
                json(Map.of(
                        "removed", removed,
                        "gradeCount", before.size(),
                        "expectedVersion", request.expectedUpdatedAt())),
                json(Map.of("added", added, "removed", removed, "gradeCount", grades.size(),
                        "resultingVersion", formatVersion(result.publication().updatedAt()))));
        return result;
    }

    private void validateCreate(AdminEventMutationDtos.Create request) {
        if (!LEVELS.contains(request.eventLevel())) invalid("INVALID_EVENT_LEVEL");
        if (!TYPES.contains(request.eventType())) invalid("INVALID_EVENT_TYPE");
        validateSlug(request.slug());
        validateChronology(request.startYear(), request.endYear(), effective(request));
        validateFacts(request.keyFacts());
        normalizeGrades(request.grades());
    }

    private void validatePatch(AdminEventMutationDtos.CorePatch request) {
        if (!StringUtils.hasText(request.expectedUpdatedAt())) invalid("INVALID_EXPECTED_VERSION");
        if (!request.unsupported().isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "UNSUPPORTED_FIELD",
                    "Unsupported event field: " + request.unsupported().iterator().next());
        }
    }

    private void validateField(String field, Object value) {
        if (("title".equals(field) || "slug".equals(field)) && !StringUtils.hasText((String) value)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", field + " cannot be empty");
        }
        if ("slug".equals(field)) validateSlug((String) value);
        if ("eventLevel".equals(field) && !LEVELS.contains(value)) invalid("INVALID_EVENT_LEVEL");
        if ("eventType".equals(field) && !TYPES.contains(value)) invalid("INVALID_EVENT_TYPE");
        if ("keyFacts".equals(field)) validateFacts((List<String>) value);
        if ("showOnHomepage".equals(field) || "showOnTimeline".equals(field) || "featured".equals(field))
            if (value == null) invalid("VALIDATION_ERROR");
        if (value instanceof String text) {
            int maximum = switch (field) {
                case "title" -> 500;
                case "slug" -> 180;
                case "shortTitle" -> 255;
                case "eventSubtype", "displayDate" -> 120;
                case "datePrecision" -> 40;
                case "cardSummary" -> 1000;
                case "canonicalSummary", "significance" -> 20000;
                case "detailedNarrative" -> 100000;
                default -> Integer.MAX_VALUE;
            };
            if (text.length() > maximum) invalid("VALIDATION_ERROR");
        }
    }

    private Object patchValue(AdminEventMutationDtos.CorePatch request, String field) {
        return switch (field) {
            case "title" -> request.title();
            case "slug" -> request.slug();
            case "shortTitle" -> request.shortTitle();
            case "eventLevel" -> request.eventLevel();
            case "eventType" -> request.eventType();
            case "eventSubtype" -> request.eventSubtype();
            case "startYear" -> request.startYear();
            case "endYear" -> request.endYear();
            case "effectiveEndYear" -> request.effectiveEndYear();
            case "displayDate" -> request.displayDate();
            case "datePrecision" -> request.datePrecision();
            case "cardSummary" -> request.cardSummary();
            case "canonicalSummary" -> request.canonicalSummary();
            case "detailedNarrative" -> request.detailedNarrative();
            case "significance" -> request.significance();
            case "keyFacts" -> request.keyFacts();
            case "showOnHomepage" -> request.showOnHomepage();
            case "showOnTimeline" -> request.showOnTimeline();
            case "featured" -> request.featured();
            default -> null;
        };
    }

    private Object currentValue(Map<String, Object> current, String field) {
        return switch (field) {
            case "shortTitle" -> current.get("short_title");
            case "eventLevel" -> current.get("event_level");
            case "eventType" -> current.get("event_type");
            case "eventSubtype" -> current.get("event_subtype");
            case "startYear" -> current.get("start_year");
            case "endYear" -> current.get("end_year");
            case "effectiveEndYear" -> current.get("effective_end_year");
            case "displayDate" -> current.get("display_date");
            case "datePrecision" -> current.get("date_precision");
            case "cardSummary" -> current.get("card_summary");
            case "canonicalSummary" -> current.get("canonical_summary");
            case "detailedNarrative" -> current.get("detailed_narrative");
            case "significance" -> current.get("significance");
            case "keyFacts" -> current.get("key_facts");
            case "showOnHomepage" -> current.get("show_on_homepage");
            case "showOnTimeline" -> current.get("show_on_timeline");
            case "featured" -> current.get("featured");
            default -> current.get(field);
        };
    }

    private Object sqlValue(String field, Object value) {
        return "keyFacts".equals(field) ? json(value) : value;
    }

    private String column(String field) {
        return switch (field) {
            case "shortTitle" -> "short_title";
            case "eventLevel" -> "event_level";
            case "eventType" -> "event_type";
            case "eventSubtype" -> "event_subtype";
            case "startYear" -> "start_year";
            case "endYear" -> "end_year";
            case "effectiveEndYear" -> "effective_end_year";
            case "displayDate" -> "display_date";
            case "datePrecision" -> "date_precision";
            case "cardSummary" -> "card_summary";
            case "canonicalSummary" -> "canonical_summary";
            case "detailedNarrative" -> "detailed_narrative";
            case "significance" -> "significance";
            case "keyFacts" -> "key_facts";
            case "showOnHomepage" -> "show_on_homepage";
            case "showOnTimeline" -> "show_on_timeline";
            case "featured" -> "featured";
            default -> field;
        };
    }

    private boolean same(String field, Object existing, Object value) {
        if ("keyFacts".equals(field)) {
            try {
                JsonNode left = existing == null ? null : objectMapper.readTree(String.valueOf(existing));
                JsonNode right = objectMapper.valueToTree(value);
                return java.util.Objects.equals(left, right);
            } catch (Exception ignored) {
                return false;
            }
        }
        if (existing instanceof Number && value instanceof Number)
            return ((Number) existing).longValue() == ((Number) value).longValue();
        if (existing instanceof Boolean || value instanceof Boolean)
            return Boolean.valueOf(String.valueOf(existing)).equals(value);
        return java.util.Objects.equals(existing, value);
    }

    private void validateFacts(List<String> facts) {
        if (facts == null || facts.size() > 20) invalid("INVALID_KEY_FACTS");
        if (facts != null && new LinkedHashSet<>(facts).size() != facts.size()) invalid("DUPLICATE_KEY_FACT");
        if (facts != null && facts.stream().anyMatch(value ->
                value == null || value.isBlank() || value.length() > 500)) invalid("INVALID_KEY_FACTS");
    }

    private List<Integer> normalizeGrades(List<Integer> values) {
        if (values == null) invalid("INVALID_GRADE");
        if (new LinkedHashSet<>(values).size() != values.size()) invalid("DUPLICATE_GRADE");
        if (!GRADES.containsAll(values)) invalid("INVALID_GRADE");
        return values.stream().sorted(Comparator.naturalOrder()).toList();
    }

    private Integer effective(AdminEventMutationDtos.Create request) {
        int expected = request.endYear() != null ? request.endYear()
                : request.startYear() == null ? 0 : request.startYear();
        if (request.effectiveEndYear() != null && request.effectiveEndYear() != expected) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_EFFECTIVE_END_YEAR",
                    "effectiveEndYear must match chronology");
        }
        return request.effectiveEndYear() == null && expected == 0 ? null : expected;
    }

    private AdminEventMutationDtos.Create withEffectiveEndYear(AdminEventMutationDtos.Create request) {
        return new AdminEventMutationDtos.Create(
                request.title().trim(), request.slug().trim(), trimNullable(request.shortTitle()),
                request.eventLevel(), request.eventType(), trimNullable(request.eventSubtype()),
                request.startYear(), request.endYear(), effective(request),
                trimNullable(request.displayDate()), trimNullable(request.datePrecision()),
                trimNullable(request.cardSummary()), trimNullable(request.canonicalSummary()),
                trimNullable(request.detailedNarrative()), trimNullable(request.significance()),
                request.keyFacts().stream().map(String::trim).toList(), request.grades(),
                request.showOnHomepage(), request.showOnTimeline(), request.featured());
    }

    private String trimNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void validateChronology(Integer start, Integer end, Integer effective) {
        if (start != null && start == 0 || end != null && end == 0 || effective != null && effective == 0)
            invalid("INVALID_CHRONOLOGY");
        if (start == null && (end != null || effective != null)) invalid("INVALID_EFFECTIVE_END_YEAR");
        if (start != null && end != null && end < start) invalid("INVALID_YEAR_RANGE");
        Integer expected = end != null ? end : start;
        if (!java.util.Objects.equals(effective, expected)) invalid("INVALID_EFFECTIVE_END_YEAR");
    }

    private LocalDateTime parseExpected(String value) {
        try {
            if (value == null || !value.matches(
                    "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z")) {
                invalid("INVALID_EXPECTED_VERSION");
            }
            Instant instant = Instant.from(VERSION_FORMATTER.parse(value));
            return LocalDateTime.ofInstant(instant, DATABASE_ZONE);
        } catch (Exception ex) {
            invalid("INVALID_EXPECTED_VERSION");
            return null;
        }
    }

    private LocalDateTime databaseDateTime(Object value) {
        if (value instanceof Timestamp timestamp) return timestamp.toLocalDateTime();
        if (value instanceof LocalDateTime localDateTime) return localDateTime;
        throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INVALID_EVENT_VERSION", "Event version is invalid");
    }

    private String formatVersion(Instant value) {
        return VERSION_FORMATTER.format(value);
    }

    private Integer intValue(Object value) {
        return value == null ? null : ((Number) value).intValue();
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND", "Historical event not found");
    }

    private ApiException conflict() {
        return new ApiException(HttpStatus.CONFLICT, "EVENT_UPDATE_CONFLICT",
                "The event changed after it was loaded");
    }

    private void validateSlug(String slug) {
        if (!StringUtils.hasText(slug) || !slug.matches("[a-z0-9]+(?:-[a-z0-9]+)*"))
            invalid("INVALID_SLUG");
    }

    private void invalid(String code) {
        throw new ApiException(HttpStatus.BAD_REQUEST, code, "Invalid event mutation request");
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Invalid JSON value");
        }
    }
}

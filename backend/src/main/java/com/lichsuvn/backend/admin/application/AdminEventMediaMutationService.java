package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventMediaMutationDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMediaMutationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMutationRepository;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.media.MediaUrlPolicy;
import org.springframework.http.HttpStatus;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class AdminEventMediaMutationService {
    public static final int MAX_MEDIA_PER_EVENT = 200;
    private static final Set<String> MEDIA_TYPES = Set.of("image", "video", "document", "audio");
    private static final Set<String> STATUSES = Set.of("active", "missing", "hidden");
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter VERSION_FORMATTER =
            new DateTimeFormatterBuilder().appendInstant(6).toFormatter();

    private final AdminEventMediaMutationRepository repository;
    private final AdminEventMutationRepository auditRepository;
    private final AdminEventReadService readService;
    private final MediaUrlPolicy mediaUrlPolicy;
    private final ObjectMapper objectMapper;

    public AdminEventMediaMutationService(
            AdminEventMediaMutationRepository repository,
            AdminEventMutationRepository auditRepository,
            AdminEventReadService readService,
            MediaUrlPolicy mediaUrlPolicy,
            ObjectMapper objectMapper
    ) {
        this.repository = repository;
        this.auditRepository = auditRepository;
        this.readService = readService;
        this.mediaUrlPolicy = mediaUrlPolicy;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public AddResult add(String eventId, AdminEventMediaMutationDtos.Create request, UserPrincipal principal) {
        if (!request.unsupported().isEmpty()) bad("UNSUPPORTED_FIELD");
        validateType(request.mediaType());
        String url = mediaUrlPolicy.requireAdminUrl(request.url());
        String status = normalizeStatus(request.status());
        ensureEvent(eventId);
        if (!repository.claimVersion(eventId, parseVersion(request.expectedUpdatedAt()))) {
            throw conflict();
        }
        List<Map<String, Object>> current = repository.lockMedia(eventId);
        if (current.size() >= MAX_MEDIA_PER_EVENT) {
            bad("EVENT_MEDIA_LIMIT_REACHED");
        }
        int sort = current.stream().mapToInt(row -> ((Number) row.get("sort_order")).intValue())
                .max().orElse(-1) + 1;
        long mediaId = repository.insert(eventId, request.mediaType(), url, trim(request.caption()),
                trim(request.altText()), trim(request.sourceName()), trim(request.license()), status, sort);
        AdminEventDtos.Detail detail = readService.findEventAfterMutation(eventId);
        auditRepository.audit(principal.idBytes(), "event.media_added", eventId, "{}",
                json(Map.of("mediaId", mediaId, "mediaType", request.mediaType(), "status", status)));
        return new AddResult(mediaId, detail);
    }

    @Transactional
    public AdminEventDtos.Detail patch(
            String eventId, long mediaId, AdminEventMediaMutationDtos.Patch request,
            UserPrincipal principal
    ) {
        if (!StringUtils.hasText(request.expectedUpdatedAt())) bad("INVALID_EXPECTED_VERSION");
        if (!request.unsupported().isEmpty()) bad("UNSUPPORTED_FIELD");
        claimEvent(eventId, request.expectedUpdatedAt());
        List<Map<String, Object>> locked = repository.lockMedia(eventId);
        Map<String, Object> current = findOwned(locked, eventId, mediaId);
        Map<String, Object> values = new HashMap<>(current);
        Set<String> fields = new HashSet<>(request.present());
        fields.remove("expectedUpdatedAt");
        for (String field : fields) {
            switch (field) {
                case "mediaType" -> {
                    validateType(request.mediaType());
                    values.put("media_type", request.mediaType());
                }
                case "url" -> values.put("url", mediaUrlPolicy.requireAdminUrl(request.url()));
                case "caption" -> values.put("caption", trim(request.caption()));
                case "altText" -> values.put("alt_text", trim(request.altText()));
                case "sourceName" -> values.put("source_name", trim(request.sourceName()));
                case "license" -> values.put("license", trim(request.license()));
                case "status" -> values.put("status", normalizeStatus(request.status()));
                default -> bad("UNSUPPORTED_FIELD");
            }
        }
        if (fields.isEmpty()) bad("NO_CHANGES");
        boolean thumbnail = Boolean.TRUE.equals(current.get("is_thumbnail"));
        String nextType = String.valueOf(values.get("media_type"));
        String nextStatus = String.valueOf(values.get("status"));
        String nextUrl = String.valueOf(values.get("url"));
        if (thumbnail && (!"image".equals(nextType) || !"active".equals(nextStatus)
                || !mediaUrlPolicy.isSafeAdminUrl(nextUrl))) {
            thumbnail = false;
        }
        if (sameMedia(current, values, thumbnail)) bad("NO_CHANGES");
        repository.update(mediaId, nextType, (String) values.get("url"),
                (String) values.get("caption"), (String) values.get("alt_text"),
                (String) values.get("source_name"), (String) values.get("license"),
                nextStatus, thumbnail);
        AdminEventDtos.Detail detail = readService.findEventAfterMutation(eventId);
        auditRepository.audit(principal.idBytes(), "event.media_updated", eventId, "{}",
                json(Map.of("mediaId", mediaId, "fields", fields)));
        return detail;
    }

    @Transactional
    public AdminEventDtos.Detail remove(
            String eventId, long mediaId, String expectedVersion, UserPrincipal principal
    ) {
        claimEvent(eventId, expectedVersion);
        List<Map<String, Object>> locked = repository.lockMedia(eventId);
        findOwned(locked, eventId, mediaId);
        repository.delete(mediaId);
        List<Map<String, Object>> remaining = locked.stream()
                .filter(row -> ((Number) row.get("id")).longValue() != mediaId)
                .sorted(Comparator.comparingInt((Map<String, Object> row) ->
                                ((Number) row.get("sort_order")).intValue())
                        .thenComparingLong(row -> ((Number) row.get("id")).longValue()))
                .toList();
        applyOrder(remaining, selectedThumbnailId(remaining));
        AdminEventDtos.Detail detail = readService.findEventAfterMutation(eventId);
        auditRepository.audit(principal.idBytes(), "event.media_removed", eventId, "{}",
                json(Map.of("mediaId", mediaId)));
        return detail;
    }

    @Transactional
    public AdminEventDtos.Detail reorder(
            String eventId, AdminEventMediaMutationDtos.Order request, UserPrincipal principal
    ) {
        if (!request.unsupported().isEmpty()) bad("UNSUPPORTED_FIELD");
        claimEvent(eventId, request.expectedUpdatedAt());
        List<Map<String, Object>> rows = repository.lockMedia(eventId);
        List<Long> requested = request.mediaIds();
        validateOrder(rows, requested);
        Long thumbnail = selectedThumbnailId(rows);
        List<Long> effective = pinThumbnail(requested, thumbnail);
        List<Long> current = rows.stream()
                .sorted(Comparator.comparingInt((Map<String, Object> row) ->
                                ((Number) row.get("sort_order")).intValue())
                        .thenComparingLong(row -> ((Number) row.get("id")).longValue()))
                .map(row -> ((Number) row.get("id")).longValue()).toList();
        if (current.equals(effective) && normalizedSort(rows, effective, thumbnail)) bad("NO_CHANGES");
        applyOrder(orderedRows(rows, effective), thumbnail);
        AdminEventDtos.Detail detail = readService.findEventAfterMutation(eventId);
        auditRepository.audit(principal.idBytes(), "event.media_reordered", eventId, "{}",
                json(Map.of("mediaIds", requested)));
        return detail;
    }

    @Transactional
    public AdminEventDtos.Detail selectThumbnail(
            String eventId, long mediaId, AdminEventMediaMutationDtos.Version request,
            UserPrincipal principal
    ) {
        if (!request.unsupported().isEmpty()) bad("UNSUPPORTED_FIELD");
        claimEvent(eventId, request.expectedUpdatedAt());
        List<Map<String, Object>> all = repository.lockMedia(eventId);
        Map<String, Object> candidate = findOwned(all, eventId, mediaId);
        if (!"image".equals(candidate.get("media_type")) || !"active".equals(candidate.get("status"))
                || !mediaUrlPolicy.isSafeAdminUrl(String.valueOf(candidate.get("url")))) {
            bad("INVALID_THUMBNAIL");
        }
        long thumbnailCount = all.stream().filter(row -> Boolean.TRUE.equals(row.get("is_thumbnail"))).count();
        List<Long> currentOrder = all.stream()
                .sorted(Comparator.comparingInt((Map<String, Object> item) ->
                                ((Number) item.get("sort_order")).intValue())
                        .thenComparingLong(item -> ((Number) item.get("id")).longValue()))
                .map(item -> ((Number) item.get("id")).longValue()).toList();
        List<Long> effectiveOrder = pinThumbnail(currentOrder, mediaId);
        if (thumbnailCount == 1 && Boolean.TRUE.equals(candidate.get("is_thumbnail"))
                && normalizedSort(all, effectiveOrder, mediaId)) bad("NO_CHANGES");
        repository.clearThumbnails(eventId);
        applyOrder(orderedRows(all, effectiveOrder), mediaId);
        AdminEventDtos.Detail detail = readService.findEventAfterMutation(eventId);
        auditRepository.audit(principal.idBytes(), "event.thumbnail_selected", eventId, "{}",
                json(Map.of("mediaId", mediaId)));
        return detail;
    }

    private void applyOrder(List<Map<String, Object>> ordered, Long thumbnail) {
        for (int i = 0; i < ordered.size(); i++) {
            long id = ((Number) ordered.get(i).get("id")).longValue();
            repository.updateOrder(id, i, thumbnail != null && id == thumbnail);
        }
    }

    private Long selectedThumbnailId(List<Map<String, Object>> rows) {
        return rows.stream().filter(row -> Boolean.TRUE.equals(row.get("is_thumbnail")))
                .map(row -> ((Number) row.get("id")).longValue()).min(Long::compareTo).orElse(null);
    }

    private List<Long> pinThumbnail(List<Long> ids, Long thumbnail) {
        if (thumbnail == null) return List.copyOf(ids);
        List<Long> result = new ArrayList<>(ids);
        result.remove(thumbnail);
        result.add(0, thumbnail);
        return List.copyOf(result);
    }

    private boolean normalizedSort(List<Map<String, Object>> rows, List<Long> ids, Long thumbnail) {
        Map<Long, Map<String, Object>> byId = new HashMap<>();
        rows.forEach(row -> byId.put(((Number) row.get("id")).longValue(), row));
        for (int i = 0; i < ids.size(); i++) {
            Map<String, Object> row = byId.get(ids.get(i));
            if (((Number) row.get("sort_order")).intValue() != i
                    || Boolean.TRUE.equals(row.get("is_thumbnail")) != (thumbnail != null && ids.get(i).equals(thumbnail))) {
                return false;
            }
        }
        return true;
    }

    private List<Map<String, Object>> orderedRows(List<Map<String, Object>> rows, List<Long> ids) {
        Map<Long, Map<String, Object>> byId = new HashMap<>();
        rows.forEach(row -> byId.put(((Number) row.get("id")).longValue(), row));
        return ids.stream().map(byId::get).toList();
    }

    private void validateOrder(List<Map<String, Object>> rows, List<Long> ids) {
        if (ids == null || ids.size() != rows.size()) bad("INVALID_MEDIA_ORDER");
        if (ids.stream().anyMatch(java.util.Objects::isNull)) bad("INVALID_MEDIA_ORDER");
        if (new HashSet<>(ids).size() != ids.size()) bad("DUPLICATE_MEDIA_ID");
        Set<Long> actual = rows.stream().map(row -> ((Number) row.get("id")).longValue()).collect(java.util.stream.Collectors.toSet());
        if (!actual.equals(new HashSet<>(ids))) bad("INVALID_MEDIA_ORDER");
    }

    private Map<String, Object> findOwned(List<Map<String, Object>> rows, String eventId, long mediaId) {
        Map<String, Object> owned = rows.stream()
                .filter(row -> ((Number) row.get("id")).longValue() == mediaId)
                .findFirst().orElse(null);
        if (owned != null) return owned;
        Map<String, Object> row = repository.findMedia(mediaId);
        if (row == null) throw new ApiException(HttpStatus.NOT_FOUND, "EVENT_MEDIA_NOT_FOUND", "Media not found");
        if (!eventId.equals(row.get("event_id"))) bad("EVENT_MEDIA_OWNERSHIP_MISMATCH");
        return row;
    }

    private boolean sameMedia(Map<String, Object> current, Map<String, Object> values, boolean thumbnail) {
        return java.util.Objects.equals(current.get("media_type"), values.get("media_type"))
                && java.util.Objects.equals(current.get("url"), values.get("url"))
                && java.util.Objects.equals(current.get("caption"), values.get("caption"))
                && java.util.Objects.equals(current.get("alt_text"), values.get("alt_text"))
                && java.util.Objects.equals(current.get("source_name"), values.get("source_name"))
                && java.util.Objects.equals(current.get("license"), values.get("license"))
                && java.util.Objects.equals(current.get("status"), values.get("status"))
                && Boolean.TRUE.equals(current.get("is_thumbnail")) == thumbnail;
    }

    private void ensureEvent(String id) {
        if (!repository.existsEvent(id)) throw notFound();
    }

    private void claimEvent(String eventId, String expectedVersion) {
        if (!repository.claimVersion(eventId, parseVersion(expectedVersion))) {
            throw repository.existsEvent(eventId) ? conflict() : notFound();
        }
    }

    private LocalDateTime parseVersion(String value) {
        try {
            if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z")) bad("INVALID_EXPECTED_VERSION");
            return LocalDateTime.ofInstant(Instant.from(VERSION_FORMATTER.parse(value)), DATABASE_ZONE);
        } catch (Exception ex) {
            bad("INVALID_EXPECTED_VERSION");
            return null;
        }
    }

    private String normalizeStatus(String status) {
        String value = status == null ? "active" : status;
        if (!STATUSES.contains(value)) bad("INVALID_MEDIA_STATUS");
        return value;
    }

    private void validateType(String type) {
        if (!MEDIA_TYPES.contains(type)) bad("INVALID_MEDIA_TYPE");
    }

    private String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    private ApiException conflict() {
        return new ApiException(HttpStatus.CONFLICT, "EVENT_UPDATE_CONFLICT", "The event changed after it was loaded");
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND", "Historical event not found");
    }

    private void bad(String code) {
        throw new ApiException(HttpStatus.BAD_REQUEST, code, "Invalid media mutation request");
    }

    private String json(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (Exception ex) { return "{}"; }
    }

    public record AddResult(long mediaId, AdminEventDtos.Detail detail) {
    }
}

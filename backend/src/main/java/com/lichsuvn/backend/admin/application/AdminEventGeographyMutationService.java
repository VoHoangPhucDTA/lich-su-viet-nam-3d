package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventGeographyDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventGeographyMutationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMutationRepository;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Iterator;
import com.fasterxml.jackson.databind.JsonNode;

@Service
@PreAuthorize("hasAuthority('ROLE_admin')")
public class AdminEventGeographyMutationService {
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter VERSION_FORMATTER =
            new DateTimeFormatterBuilder().appendInstant(6).toFormatter();

    private final AdminEventGeographyMutationRepository repository;
    private final AdminEventMutationRepository auditRepository;
    private final AdminEventGeographyCanonicalizer canonicalizer;
    private final AdminEventReadService readService;
    private final ObjectMapper mapper;

    public AdminEventGeographyMutationService(
            AdminEventGeographyMutationRepository repository,
            AdminEventMutationRepository auditRepository,
            AdminEventGeographyCanonicalizer canonicalizer,
            AdminEventReadService readService,
            ObjectMapper mapper
    ) {
        this.repository = repository;
        this.auditRepository = auditRepository;
        this.canonicalizer = canonicalizer;
        this.readService = readService;
        this.mapper = mapper;
    }

    @Transactional
    public AdminEventDtos.Detail update(
            String id,
            AdminEventGeographyDtos.Patch request,
            UserPrincipal principal
    ) {
        AdminEventGeographyMutationRepository.CurrentGeography current = repository.lockCurrent(id)
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND",
                        "Historical event not found"));
        if (request == null) {
            bad(HttpStatus.BAD_REQUEST, "INVALID_GEOGRAPHY_REQUEST", "request is required");
        }
        LocalDateTime expected = parseVersion(request.expectedUpdatedAt());
        if (!Objects.equals(current.updatedAt(), expected)) {
            throw conflict();
        }
        if (request.geography() == null) {
            bad(HttpStatus.BAD_REQUEST, "INVALID_GEOGRAPHY_REQUEST", "geography is required");
        }

        AdminEventGeographyCanonicalizer.CanonicalGeography next =
                canonicalizer.canonicalize(request.geography());
        if (logicallySame(current, next)) {
            bad(HttpStatus.BAD_REQUEST, "NO_CHANGES", "Submitted geography does not change the event");
        }
        if (!repository.update(id, expected, next)) {
            throw conflict();
        }

        String resultingVersion = VERSION_FORMATTER.format(
                repository.currentVersion(id).atZone(DATABASE_ZONE).toInstant());
        List<String> changedFields = changedFields(current, next);
        AdminEventDtos.Detail detail = readService.findEventAfterMutation(id);
        auditRepository.audit(principal.idBytes(), "event.geography_updated", id,
                json(Map.of(
                        "geoType", current.geoType(),
                        "markerCount", markerCount(current.mapData()),
                        "regionCount", regionCount(current.mapData()),
                        "expectedVersion", request.expectedUpdatedAt()
                )),
                json(Map.of(
                        "geoType", next.geoType(),
                        "markerCount", next.markerCount(),
                        "regionCount", next.regionCount(),
                        "changedFields", changedFields,
                        "resultingVersion", resultingVersion
                )));
        return detail;
    }

    private boolean logicallySame(
            AdminEventGeographyMutationRepository.CurrentGeography current,
            AdminEventGeographyCanonicalizer.CanonicalGeography next
    ) {
        return Objects.equals(current.geoType(), next.geoType())
                && decimalEquals(current.lat(), next.lat())
                && decimalEquals(current.lng(), next.lng())
                && Objects.equals(current.provinceNames(), next.provinceNames())
                && Objects.equals(current.historicalLocations(), next.historicalLocations())
                && jsonLogicalEquals(current.mapData(), next.mapData());
    }

    private List<String> changedFields(
            AdminEventGeographyMutationRepository.CurrentGeography current,
            AdminEventGeographyCanonicalizer.CanonicalGeography next
    ) {
        List<String> fields = new ArrayList<>();
        if (!Objects.equals(current.geoType(), next.geoType())) fields.add("geoType");
        if (!decimalEquals(current.lat(), next.lat())) fields.add("lat");
        if (!decimalEquals(current.lng(), next.lng())) fields.add("lng");
        if (!Objects.equals(current.provinceNames(), next.provinceNames())) fields.add("provinceNames");
        if (!Objects.equals(current.historicalLocations(), next.historicalLocations())) {
            fields.add("historicalLocations");
        }
        if (!Objects.equals(current.mapData(), next.mapData())) fields.add("mapData");
        return List.copyOf(fields);
    }

    private int markerCount(com.fasterxml.jackson.databind.JsonNode mapData) {
        if (mapData == null || !mapData.isObject()) return 0;
        if (mapData.path("markers").isArray()) return mapData.path("markers").size();
        return mapData.path("marker").isObject() ? 1 : 0;
    }

    private int regionCount(com.fasterxml.jackson.databind.JsonNode mapData) {
        return mapData != null && mapData.path("gadmRefs").isArray()
                ? mapData.path("gadmRefs").size() : 0;
    }

    private LocalDateTime parseVersion(String value) {
        try {
            if (value == null || !value.matches(
                    "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z")) {
                bad(HttpStatus.BAD_REQUEST, "INVALID_EXPECTED_VERSION",
                        "expectedUpdatedAt must be an opaque six-digit UTC version");
            }
            return LocalDateTime.ofInstant(
                    Instant.from(VERSION_FORMATTER.parse(value)), DATABASE_ZONE);
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            bad(HttpStatus.BAD_REQUEST, "INVALID_EXPECTED_VERSION",
                    "expectedUpdatedAt must be an opaque six-digit UTC version");
            return null;
        }
    }

    private boolean decimalEquals(BigDecimal left, BigDecimal right) {
        return left == null ? right == null : right != null && left.compareTo(right) == 0;
    }

    private boolean jsonLogicalEquals(JsonNode left, JsonNode right) {
        if (left == right) return true;
        if (left == null || right == null || left.getNodeType() != right.getNodeType()) return false;
        if (left.isNumber()) return left.decimalValue().compareTo(right.decimalValue()) == 0;
        if (left.isObject()) {
            if (left.size() != right.size()) return false;
            Iterator<String> names = left.fieldNames();
            while (names.hasNext()) {
                String name = names.next();
                if (!jsonLogicalEquals(left.get(name), right.get(name))) return false;
            }
            return true;
        }
        if (left.isArray()) {
            if (left.size() != right.size()) return false;
            for (int index = 0; index < left.size(); index++) {
                if (!jsonLogicalEquals(left.get(index), right.get(index))) return false;
            }
            return true;
        }
        return left.equals(right);
    }

    private String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot serialize bounded audit metadata", ex);
        }
    }

    private ApiException conflict() {
        return error(HttpStatus.CONFLICT, "EVENT_UPDATE_CONFLICT",
                "The event changed after it was loaded");
    }

    private static void bad(HttpStatus status, String code, String message) {
        throw error(status, code, message);
    }

    private static ApiException error(HttpStatus status, String code, String message) {
        return new ApiException(status, code, message);
    }
}

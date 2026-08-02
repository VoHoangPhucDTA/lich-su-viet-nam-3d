package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminMediaCleanupDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventImageRepository;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@PreAuthorize("hasAuthority('ROLE_admin')")
public class AdminMediaCleanupReadService {
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Set<String> STATUSES = Set.of("PENDING", "CLAIMED", "FAILED", "COMPLETED");
    private static final Set<String> OPERATIONS = Set.of("DELETE");
    private static final int MAX_LIMIT = 100;
    private static final int MAX_OFFSET = 5_000;

    private final AdminEventImageRepository repository;

    public AdminMediaCleanupReadService(AdminEventImageRepository repository) {
        this.repository = repository;
    }

    public AdminMediaCleanupDtos.Summary summary() {
        var result = repository.cleanupSummary();
        return new AdminMediaCleanupDtos.Summary(
                result.pending(), result.claimed(), result.failed(), result.completed());
    }

    public AdminMediaCleanupDtos.Page find(
            String status,
            String operation,
            String sortBy,
            String sortDir,
            Integer limit,
            Integer offset
    ) {
        int normalizedLimit = limit == null ? 25 : Math.max(1, Math.min(limit, MAX_LIMIT));
        int normalizedOffset = offset == null ? 0 : Math.max(0, Math.min(offset, MAX_OFFSET));
        List<String> clauses = new ArrayList<>();
        MapSqlParameterSource parameters = new MapSqlParameterSource();
        if (status != null && !status.isBlank()) {
            String normalized = status.trim().toUpperCase(Locale.ROOT);
            if (!STATUSES.contains(normalized)) {
                throw bad("INVALID_CLEANUP_STATUS");
            }
            clauses.add("task.task_status=:status");
            parameters.addValue("status", normalized);
        }
        if (operation != null && !operation.isBlank()) {
            String normalized = operation.trim().toUpperCase(Locale.ROOT);
            if (!OPERATIONS.contains(normalized)) {
                throw bad("INVALID_CLEANUP_OPERATION");
            }
            clauses.add("task.operation=:operation");
            parameters.addValue("operation", normalized);
        }
        String where = clauses.isEmpty() ? "" : "WHERE " + String.join(" AND ", clauses);
        String field = switch (sortBy == null ? "createdAt" : sortBy) {
            case "createdAt" -> "task.created_at";
            case "nextAttemptAt" -> "task.next_attempt_at";
            default -> throw bad("INVALID_CLEANUP_SORT");
        };
        String direction;
        if (sortDir == null || sortDir.isBlank() || "desc".equalsIgnoreCase(sortDir)) {
            direction = "DESC";
        } else if ("asc".equalsIgnoreCase(sortDir)) {
            direction = "ASC";
        } else {
            throw bad("INVALID_CLEANUP_SORT_DIRECTION");
        }
        var query = new AdminEventImageRepository.CleanupQuery(
                where, parameters, field + " " + direction + ", task.id " + direction,
                normalizedLimit, normalizedOffset);
        long total = repository.countCleanup(query);
        List<AdminMediaCleanupDtos.Item> items = repository.findCleanup(query).stream()
                .map(item -> new AdminMediaCleanupDtos.Item(
                        item.id(), item.provider(), item.publicId(), item.providerAssetId(),
                        item.operation(), item.status(), item.attempts(),
                        instant(item.nextAttemptAt()), instant(item.claimExpiresAt()),
                        item.lastErrorCode(), instant(item.createdAt()), instant(item.updatedAt()),
                        item.mediaId(), item.eventId(), item.managedAssetId()))
                .toList();
        return new AdminMediaCleanupDtos.Page(items, items.size(), total, normalizedLimit, normalizedOffset);
    }

    private java.time.Instant instant(java.time.LocalDateTime value) {
        return value == null ? null : value.atZone(DATABASE_ZONE).toInstant();
    }

    private ApiException bad(String code) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, "Invalid cleanup query");
    }
}

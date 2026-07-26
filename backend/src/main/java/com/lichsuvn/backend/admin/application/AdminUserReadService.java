package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminUserDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminUserReadRepository;
import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.NotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class AdminUserReadService {
    private static final Set<String> ROLES = Set.of("student", "teacher", "admin");
    private static final Set<String> STATUSES = Set.of("active", "pending", "disabled", "deleted");
    private static final Set<String> SORT_FIELDS =
            Set.of("displayName", "email", "createdAt", "updatedAt");
    private static final Set<String> SORT_DIRECTIONS = Set.of("asc", "desc");
    private static final int MAX_QUERY_LENGTH = 200;

    private final AdminUserReadRepository repository;

    public AdminUserReadService(AdminUserReadRepository repository) {
        this.repository = repository;
    }

    public AdminUserDtos.Page findUsers(
            String query,
            String role,
            String status,
            String verified,
            String sortBy,
            String sortDir,
            Integer limit,
            Integer offset
    ) {
        Query normalized = normalize(query, role, status, verified, sortBy, sortDir, limit, offset);
        long total = repository.count(normalized);
        List<AdminUserReadRepository.UserRow> rows = repository.findPage(normalized);
        Map<String, Instant> activity = rows.isEmpty()
                ? Map.of()
                : repository.findLastMeaningfulActivity(
                        rows.stream().map(row -> userId(row.id())).toList());
        List<AdminUserDtos.ListItem> items = rows.stream().map(row -> new AdminUserDtos.ListItem(
                row.id(), row.displayName(), row.email(), row.primaryRole(), row.roles(), row.status(),
                row.emailVerified(), row.createdAt(), row.updatedAt(), activity.get(row.id())
        )).toList();
        return new AdminUserDtos.Page(items, items.size(), total, normalized.limit(), normalized.offset());
    }

    public AdminUserDtos.Detail findUser(String id) {
        byte[] userId = userId(id);
        AdminUserReadRepository.AccountRow account = repository.findAccount(userId)
                .orElseThrow(() -> new NotFoundException(
                        "ADMIN_USER_NOT_FOUND", "Admin user account not found"));
        AdminUserReadRepository.LearningRow learning = repository.findLearning(userId);
        List<AdminUserDtos.ActivityItem> recent = repository.findRecentActivity(userId);
        List<AdminUserDtos.AuditEntry> audit = repository.findRecentAudit(userId, account.id());

        Instant meaningful = java.util.stream.Stream.of(
                        learning.eventViewAt(), learning.quizAt(), learning.examAt())
                .filter(java.util.Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);
        AdminUserDtos.Account accountDto = new AdminUserDtos.Account(
                account.id(), account.displayName(), account.email(),
                account.primaryRole(), account.roles(), account.status(),
                account.emailVerifiedAt() != null, account.emailVerifiedAt(),
                account.grade(), account.school(), account.avatarUrl(),
                account.createdAt(), AdminUserVersionCodec.format(account.updatedAt())
        );
        return new AdminUserDtos.Detail(
                accountDto,
                new AdminUserDtos.SessionTracking(
                        AdminUserDtos.TrackingMode.STATELESS_JWT, false, null),
                new AdminUserDtos.Learning(
                        new AdminUserDtos.Progress(
                                learning.eventsViewed(), learning.distinctEventsViewed(),
                                learning.totalMinutes(), learning.progressAt()),
                        new AdminUserDtos.AssessmentSummary(
                                learning.quizCount(), score(learning.quizAverage()), learning.quizAt()),
                        new AdminUserDtos.AssessmentSummary(
                                learning.examCount(), score(learning.examAverage()), learning.examAt())
                ),
                new AdminUserDtos.Activity(meaningful, recent),
                audit
        );
    }

    private Query normalize(
            String query, String role, String status, String verified,
            String sortBy, String sortDir, Integer limit, Integer offset
    ) {
        String normalizedQuery = StringUtils.hasText(query) ? query.trim() : null;
        if (normalizedQuery != null && (normalizedQuery.length() > MAX_QUERY_LENGTH
                || normalizedQuery.chars().anyMatch(Character::isISOControl))) {
            invalid("INVALID_USER_QUERY", "q is invalid or exceeds 200 characters");
        }
        validate("INVALID_USER_ROLE", "role", role, ROLES);
        validate("INVALID_USER_STATUS", "status", status, STATUSES);
        Boolean normalizedVerified = null;
        if (verified != null) {
            if ("true".equals(verified)) normalizedVerified = true;
            else if ("false".equals(verified)) normalizedVerified = false;
            else invalid("INVALID_EMAIL_VERIFICATION_FILTER", "verified must be true or false");
        }
        String normalizedSortBy = sortBy == null ? "createdAt" : sortBy;
        String normalizedSortDir = sortDir == null ? "desc" : sortDir;
        validate("INVALID_USER_SORT", "sortBy", normalizedSortBy, SORT_FIELDS);
        validate("INVALID_SORT_DIRECTION", "sortDir", normalizedSortDir, SORT_DIRECTIONS);
        int normalizedLimit = limit == null ? 20 : limit;
        int normalizedOffset = offset == null ? 0 : offset;
        if (normalizedLimit < 1 || normalizedLimit > 100) {
            invalid("INVALID_LIMIT", "limit must be between 1 and 100");
        }
        if (normalizedOffset < 0) invalid("INVALID_OFFSET", "offset must be greater than or equal to 0");
        return new Query(
                normalizedQuery, role, status, normalizedVerified,
                normalizedSortBy, normalizedSortDir, normalizedLimit, normalizedOffset);
    }

    private static <T> void validate(String code, String name, T value, Set<T> allowed) {
        if (value != null && !allowed.contains(value)) {
            invalid(code, name + " has unsupported value");
        }
    }

    private static byte[] userId(String id) {
        try {
            return UuidBytes.fromUuid(UUID.fromString(id));
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_USER_ID", "User ID must be a UUID");
        }
    }

    private static BigDecimal score(BigDecimal value) {
        return value == null ? null : value.setScale(2, RoundingMode.HALF_UP);
    }

    private static void invalid(String code, String message) {
        throw new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public record Query(
            String query,
            String role,
            String status,
            Boolean verified,
            String sortBy,
            String sortDir,
            int limit,
            int offset
    ) {
    }
}

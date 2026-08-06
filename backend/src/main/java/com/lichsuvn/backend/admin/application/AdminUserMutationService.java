package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminUserDtos;
import com.lichsuvn.backend.admin.api.dto.AdminUserMutationDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminUserMutationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminUserMutationRepository.LockedUser;
import com.lichsuvn.backend.admin.infrastructure.AdminUserMutationRepository.RoleRow;
import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@PreAuthorize("hasAuthority('ROLE_admin')")
public class AdminUserMutationService {
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final List<String> CANONICAL_ROLES = List.of("admin", "teacher", "student");
    private static final Set<String> SUPPORTED_ROLES = Set.copyOf(CANONICAL_ROLES);
    private static final Set<String> MUTABLE_STATUSES = Set.of("active", "pending", "disabled");

    private final AdminUserMutationRepository repository;
    private final AdminUserReadService readService;
    private final AdminUserMutationTransactionRunner transactionRunner;

    public AdminUserMutationService(
            AdminUserMutationRepository repository,
            AdminUserReadService readService,
            AdminUserMutationTransactionRunner transactionRunner
    ) {
        this.repository = repository;
        this.readService = readService;
        this.transactionRunner = transactionRunner;
    }

    public AdminUserDtos.Detail replaceRoles(
            String rawId,
            AdminUserMutationDtos.ReplaceRoles request,
            UserPrincipal principal
    ) {
        return transactionRunner.execute(() -> replaceRolesInTransaction(rawId, request, principal));
    }

    private AdminUserDtos.Detail replaceRolesInTransaction(
            String rawId,
            AdminUserMutationDtos.ReplaceRoles request,
            UserPrincipal principal
    ) {
        byte[] targetId = userId(rawId);
        LockedUser target = lockedUser(targetId);
        List<RoleRow> storedRows = repository.lockUserRoles(targetId);

        boolean selfAction = Arrays.equals(targetId, principal.idBytes());
        LocalDateTime expected = expected(request == null ? null : request.expectedUpdatedAt());
        requireExpectedVersion(target, expected);
        List<String> storedRoles = storedRoles(storedRows);
        List<String> nextRoles = requestedRoles(request == null ? null : request.roles());

        if ("deleted".equals(target.status())) {
            throw conflict("USER_DELETED_IMMUTABLE", "Deleted users are immutable");
        }
        if (storedRoles.equals(nextRoles)) {
            throw conflict("NO_CHANGES", "The requested roles already match the user");
        }
        rejectSelf(selfAction);
        adjustActiveAdminMembership(
                isActiveAdmin(target.status(), storedRoles),
                isActiveAdmin(target.status(), nextRoles));

        Map<String, Long> roleIds = repository.supportedRoleIds();
        if (!roleIds.keySet().containsAll(SUPPORTED_ROLES)) {
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "ROLE_SEED_MISSING",
                    "A required role seed is missing");
        }
        if (!repository.claimVersion(targetId, expected)) {
            throw conflict("USER_UPDATE_CONFLICT", "User version changed");
        }
        repository.replaceRoles(targetId, nextRoles, roleIds);
        String resultVersion = resultVersion(targetId, request.expectedUpdatedAt());
        repository.audit(
                principal,
                "user.roles_replaced",
                target.idString(),
                Map.of(
                        "roles", storedRoles,
                        "expectedVersion", request.expectedUpdatedAt()),
                Map.of(
                        "roles", nextRoles,
                        "resultingVersion", resultVersion));
        return readService.findUser(target.idString());
    }

    public AdminUserDtos.Detail updateStatus(
            String rawId,
            AdminUserMutationDtos.ChangeStatus request,
            UserPrincipal principal
    ) {
        return transactionRunner.execute(() -> updateStatusInTransaction(rawId, request, principal));
    }

    private AdminUserDtos.Detail updateStatusInTransaction(
            String rawId,
            AdminUserMutationDtos.ChangeStatus request,
            UserPrincipal principal
    ) {
        byte[] targetId = userId(rawId);
        LockedUser target = lockedUser(targetId);
        List<RoleRow> storedRows = repository.lockUserRoles(targetId);

        boolean selfAction = Arrays.equals(targetId, principal.idBytes());
        LocalDateTime expected = expected(request == null ? null : request.expectedUpdatedAt());
        requireExpectedVersion(target, expected);
        List<String> storedRoles = storedRoles(storedRows);
        String nextStatus = requestedStatus(request == null ? null : request.status());

        if ("deleted".equals(target.status())) {
            throw conflict("USER_DELETED_IMMUTABLE", "Deleted users are immutable");
        }
        if (target.status().equals(nextStatus)) {
            throw conflict("NO_CHANGES", "The requested status already matches the user");
        }
        rejectSelf(selfAction);
        if (!validTransition(target.status(), nextStatus)) {
            throw conflict(
                    "INVALID_USER_STATUS_TRANSITION",
                    "The requested user status transition is not allowed");
        }
        adjustActiveAdminMembership(
                isActiveAdmin(target.status(), storedRoles),
                isActiveAdmin(nextStatus, storedRoles));
        if (!repository.claimVersionAndStatus(targetId, expected, nextStatus)) {
            throw conflict("USER_UPDATE_CONFLICT", "User version changed");
        }
        String resultVersion = resultVersion(targetId, request.expectedUpdatedAt());
        repository.audit(
                principal,
                "user.status_updated",
                target.idString(),
                Map.of(
                        "status", target.status(),
                        "expectedVersion", request.expectedUpdatedAt()),
                Map.of(
                        "status", nextStatus,
                        "resultingVersion", resultVersion));
        return readService.findUser(target.idString());
    }

    private LockedUser lockedUser(byte[] targetId) {
        return repository.lockUser(targetId).orElseThrow(() -> new ApiException(
                HttpStatus.NOT_FOUND, "ADMIN_USER_NOT_FOUND", "Admin user account not found"));
    }

    private List<String> storedRoles(List<RoleRow> rows) {
        Set<String> values = new LinkedHashSet<>();
        for (RoleRow row : rows) {
            if (!SUPPORTED_ROLES.contains(row.code())) {
                throw conflict(
                        "UNSUPPORTED_STORED_USER_ROLE",
                        "The user has an unsupported stored role");
            }
            values.add(row.code());
        }
        return canonical(values);
    }

    private List<String> requestedRoles(List<String> roles) {
        if (roles == null || roles.isEmpty() || roles.size() > 3) {
            throw invalid("INVALID_USER_ROLES", "roles must contain one to three supported values");
        }
        Set<String> unique = new LinkedHashSet<>();
        for (String role : roles) {
            if (role == null || role.isBlank()) {
                throw invalid("INVALID_USER_ROLES", "roles must contain one to three supported values");
            }
            if (!SUPPORTED_ROLES.contains(role)) {
                throw invalid("UNSUPPORTED_USER_ROLE", "roles contains an unsupported value");
            }
            if (!unique.add(role)) {
                throw invalid("DUPLICATE_USER_ROLE", "roles must not contain duplicates");
            }
        }
        return canonical(unique);
    }

    private List<String> canonical(Set<String> roles) {
        List<String> result = new ArrayList<>(3);
        for (String role : CANONICAL_ROLES) {
            if (roles.contains(role)) result.add(role);
        }
        return List.copyOf(result);
    }

    private String requestedStatus(String status) {
        if (status == null || !MUTABLE_STATUSES.contains(status)) {
            throw invalid("INVALID_USER_STATUS", "status has an unsupported value");
        }
        return status;
    }

    private boolean validTransition(String current, String next) {
        return switch (current) {
            case "active" -> "disabled".equals(next);
            case "pending" -> "active".equals(next) || "disabled".equals(next);
            case "disabled" -> "active".equals(next) || "pending".equals(next);
            default -> false;
        };
    }

    private void adjustActiveAdminMembership(boolean wasActiveAdmin, boolean becomesActiveAdmin) {
        if (wasActiveAdmin && !becomesActiveAdmin
                && !repository.tryRemoveActiveAdmin()) {
            throw conflict(
                    "LAST_ACTIVE_ADMIN_REQUIRED",
                    "At least one active administrator must remain");
        }
        if (!wasActiveAdmin && becomesActiveAdmin) {
            repository.addActiveAdmin();
        }
    }

    private boolean isActiveAdmin(String status, List<String> roles) {
        return "active".equals(status) && roles.contains("admin");
    }

    private void requireExpectedVersion(LockedUser target, LocalDateTime expected) {
        if (!target.updatedAt().equals(expected)) {
            throw conflict("USER_UPDATE_CONFLICT", "User version changed");
        }
    }

    private String resultVersion(byte[] targetId, String expectedVersion) {
        LocalDateTime resulting = repository.currentVersion(targetId);
        String value = AdminUserVersionCodec.format(resulting.atZone(DATABASE_ZONE).toInstant());
        if (value.equals(expectedVersion)) {
            throw conflict("USER_UPDATE_CONFLICT", "User version did not advance");
        }
        return value;
    }

    private void rejectSelf(boolean selfAction) {
        if (selfAction) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "ADMIN_SELF_MUTATION_FORBIDDEN",
                    "Administrators cannot mutate their own role or status");
        }
    }

    private LocalDateTime expected(String value) {
        return AdminUserVersionCodec.parse(value);
    }

    private byte[] userId(String id) {
        try {
            return UuidBytes.fromUuid(UUID.fromString(id));
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw invalid("INVALID_USER_ID", "User ID must be a UUID");
        }
    }

    private ApiException invalid(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    private ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }
}

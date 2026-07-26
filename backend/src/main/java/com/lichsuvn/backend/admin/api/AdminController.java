package com.lichsuvn.backend.admin.api;

import com.lichsuvn.backend.admin.api.dto.AdminDashboardDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventMutationDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventMediaMutationDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventGeographyDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventPublicationDtos;
import com.lichsuvn.backend.admin.api.dto.AdminUserDtos;
import com.lichsuvn.backend.admin.application.AdminDashboardReadService;
import com.lichsuvn.backend.admin.application.AdminEventReadService;
import com.lichsuvn.backend.admin.application.AdminEventMutationService;
import com.lichsuvn.backend.admin.application.AdminEventMediaMutationService;
import com.lichsuvn.backend.admin.application.AdminEventGeographyMutationService;
import com.lichsuvn.backend.admin.application.AdminEventPublicationService;
import com.lichsuvn.backend.admin.application.AdminUserReadService;
import com.lichsuvn.backend.admin.application.AdminService;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import java.net.URI;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;

import java.util.Map;

/** API quản trị dữ liệu lịch sử. Mọi endpoint đều yêu cầu ROLE_admin. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final AdminService adminService;
    private final AdminEventReadService adminEventReadService;
    private final AdminDashboardReadService adminDashboardReadService;
    private final AdminEventMutationService adminEventMutationService;
    private final AdminEventMediaMutationService adminEventMediaMutationService;
    private final AdminEventGeographyMutationService adminEventGeographyMutationService;
    private final AdminEventPublicationService adminEventPublicationService;
    private final AdminUserReadService adminUserReadService;

    public AdminController(
            AdminService adminService,
            AdminEventReadService adminEventReadService,
            AdminDashboardReadService adminDashboardReadService,
            AdminEventMutationService adminEventMutationService,
            AdminEventMediaMutationService adminEventMediaMutationService,
            AdminEventGeographyMutationService adminEventGeographyMutationService,
            AdminEventPublicationService adminEventPublicationService,
            AdminUserReadService adminUserReadService
    ) {
        this.adminService = adminService;
        this.adminEventReadService = adminEventReadService;
        this.adminDashboardReadService = adminDashboardReadService;
        this.adminEventMutationService = adminEventMutationService;
        this.adminEventMediaMutationService = adminEventMediaMutationService;
        this.adminEventGeographyMutationService = adminEventGeographyMutationService;
        this.adminEventPublicationService = adminEventPublicationService;
        this.adminUserReadService = adminUserReadService;
    }

    @GetMapping("/dashboard")
    public ApiResponse<AdminDashboardDtos.Dashboard> dashboard() {
        return ApiResponse.ok(adminDashboardReadService.findDashboard());
    }

    @GetMapping("/dashboard/metrics")
    public ApiResponse<AdminDashboardDtos.Metrics> dashboardMetrics() {
        return ApiResponse.ok(adminDashboardReadService.findMetrics());
    }

    @GetMapping("/dashboard/attention")
    public ApiResponse<java.util.List<AdminDashboardDtos.AttentionEvent>> dashboardAttention() {
        return ApiResponse.ok(adminDashboardReadService.findAttention());
    }

    @GetMapping("/dashboard/audit")
    public ApiResponse<java.util.List<AdminDashboardDtos.AuditEntry>> dashboardAudit() {
        return ApiResponse.ok(adminDashboardReadService.findRecentAudit());
    }

    @GetMapping("/users")
    public ApiResponse<AdminUserDtos.Page> users(
            @RequestParam(required = false, name = "q") String query,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String verified,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false) String sortDir,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset
    ) {
        return ApiResponse.ok(adminUserReadService.findUsers(
                query, role, status, verified, sortBy, sortDir, limit, offset));
    }

    @GetMapping("/users/{id}")
    public ApiResponse<AdminUserDtos.Detail> user(@PathVariable String id) {
        return ApiResponse.ok(adminUserReadService.findUser(id));
    }

    @PatchMapping("/users/{id}/status")
    public ApiResponse<Map<String, Object>> updateUserStatus(
            @PathVariable String id,
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(adminService.updateUserStatus(id, body, principal));
    }

    @PatchMapping("/users/{id}/role")
    public ApiResponse<Map<String, Object>> updateUserRole(
            @PathVariable String id,
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(adminService.updateUserRole(id, body, principal));
    }

    @DeleteMapping("/users/{id}")
    public ApiResponse<Map<String, Object>> deleteUser(
            @PathVariable String id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(adminService.deleteUser(id, principal));
    }

    @GetMapping("/events")
    public ApiResponse<AdminEventDtos.Page> events(
            @RequestParam(required = false, name = "q") String query,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String eventLevel,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) Integer grade,
            @RequestParam(required = false) String geoType,
            @RequestParam(required = false) String chronology,
            @RequestParam(required = false) Integer startYearFrom,
            @RequestParam(required = false) Integer startYearTo,
            @RequestParam(required = false) Boolean missingThumbnail,
            @RequestParam(required = false) Boolean missingMedia,
            @RequestParam(required = false) Boolean missingMapData,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false) String sortDir,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset
    ) {
        return ApiResponse.ok(adminEventReadService.findEvents(
                query, status, eventLevel, eventType, grade, geoType, chronology,
                startYearFrom, startYearTo, missingThumbnail, missingMedia, missingMapData,
                sortBy, sortDir, limit, offset));
    }

    @GetMapping("/events/{id}")
    public ApiResponse<AdminEventDtos.Detail> event(@PathVariable String id) {
        return ApiResponse.ok(adminEventReadService.findEvent(id));
    }

    @PostMapping("/events")
    public ResponseEntity<ApiResponse<AdminEventDtos.Detail>> createEvent(
            @Valid @RequestBody AdminEventMutationDtos.Create body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        AdminEventDtos.Detail created = adminEventMutationService.create(body, principal);
        return ResponseEntity.created(URI.create("/api/admin/events/" + created.core().id()))
                .body(ApiResponse.ok(created));
    }

    @PutMapping("/events/{id}")
    public ApiResponse<Map<String, Object>> updateEvent(
            @PathVariable String id,
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        throw mutationDisabled(
                "ADMIN_EVENT_UPDATE_DISABLED",
                "Event updates are temporarily disabled while safe event editing is being completed");
    }

    @PatchMapping("/events/{id}/core")
    public ApiResponse<AdminEventDtos.Detail> updateEventCore(
            @PathVariable String id,
            @RequestBody AdminEventMutationDtos.CorePatch body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(adminEventMutationService.updateCore(id, body, principal));
    }

    @PutMapping("/events/{id}/grades")
    public ApiResponse<AdminEventDtos.Detail> replaceEventGrades(
            @PathVariable String id,
            @Valid @RequestBody AdminEventMutationDtos.Grades body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(adminEventMutationService.replaceGrades(id, body, principal));
    }

    @PostMapping("/events/{id}/media")
    public ResponseEntity<ApiResponse<AdminEventDtos.Detail>> addEventMedia(
            @PathVariable String id,
            @Valid @RequestBody AdminEventMediaMutationDtos.Create body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        AdminEventMediaMutationService.AddResult result =
                adminEventMediaMutationService.add(id, body, principal);
        return ResponseEntity.created(URI.create("/api/admin/events/" + id + "/media/" + result.mediaId()))
                .body(ApiResponse.ok(result.detail()));
    }

    @PatchMapping("/events/{id}/media/{mediaId}")
    public ApiResponse<AdminEventDtos.Detail> updateEventMedia(
            @PathVariable String id,
            @PathVariable long mediaId,
            @Valid @RequestBody AdminEventMediaMutationDtos.Patch body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(adminEventMediaMutationService.patch(id, mediaId, body, principal));
    }

    @DeleteMapping("/events/{id}/media/{mediaId}")
    public ApiResponse<AdminEventDtos.Detail> deleteEventMedia(
            @PathVariable String id,
            @PathVariable long mediaId,
            @RequestHeader(value = "X-Event-Version", required = false) String version,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        if (version == null || version.isBlank()) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "INVALID_EXPECTED_VERSION",
                    "X-Event-Version is required");
        }
        return ApiResponse.ok(adminEventMediaMutationService.remove(id, mediaId, version, principal));
    }

    @PutMapping("/events/{id}/media/order")
    public ApiResponse<AdminEventDtos.Detail> reorderEventMedia(
            @PathVariable String id,
            @Valid @RequestBody AdminEventMediaMutationDtos.Order body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(adminEventMediaMutationService.reorder(id, body, principal));
    }

    @PutMapping("/events/{id}/thumbnail/{mediaId}")
    public ApiResponse<AdminEventDtos.Detail> selectEventThumbnail(
            @PathVariable String id,
            @PathVariable long mediaId,
            @Valid @RequestBody AdminEventMediaMutationDtos.Version body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(adminEventMediaMutationService.selectThumbnail(id, mediaId, body, principal));
    }

    @PatchMapping("/events/{id}/geography")
    public ApiResponse<AdminEventDtos.Detail> updateEventGeography(
            @PathVariable String id,
            @Valid @RequestBody AdminEventGeographyDtos.Patch body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(adminEventGeographyMutationService.update(id, body, principal));
    }

    @PatchMapping("/events/{id}/publication")
    public ApiResponse<AdminEventDtos.Detail> updateEventPublication(
            @PathVariable String id,
            @Valid @RequestBody AdminEventPublicationDtos.Patch body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(adminEventPublicationService.update(id, body, principal));
    }

    @PatchMapping("/events/{id}/status")
    public ApiResponse<Map<String, Object>> updateEventStatus(
            @PathVariable String id,
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        throw mutationDisabled(
                "ADMIN_EVENT_STATUS_DISABLED",
                "Event status changes are outside the safe core editing phase");
    }

    @DeleteMapping("/events/{id}")
    public ApiResponse<Map<String, Object>> deleteEvent(
            @PathVariable String id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        throw mutationDisabled(
                "EVENT_HARD_DELETE_DISABLED",
                "Hard deletion of historical events is disabled");
    }

    private ApiException mutationDisabled(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }
}

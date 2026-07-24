package com.lichsuvn.backend.admin.api;

import com.lichsuvn.backend.admin.application.AdminService;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** API quản trị dữ liệu lịch sử. Mọi endpoint đều yêu cầu ROLE_admin. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/dashboard")
    public ApiResponse<Map<String, Object>> dashboard() {
        return ApiResponse.ok(adminService.dashboard());
    }

    @GetMapping("/users")
    public ApiResponse<Map<String, Object>> users(
            @RequestParam(required = false, name = "q") String query,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset
    ) {
        return ApiResponse.ok(adminService.users(query, status, role, limit, offset));
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
    public ApiResponse<Map<String, Object>> events(
            @RequestParam(required = false, name = "q") String query,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String eventLevel,
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) Integer startYearFrom,
            @RequestParam(required = false) Integer startYearTo,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset
    ) {
        return ApiResponse.ok(adminService.events(query, status, eventLevel, eventType, startYearFrom, startYearTo, limit, offset));
    }

    @GetMapping("/events/{id}")
    public ApiResponse<Map<String, Object>> event(@PathVariable String id) {
        return ApiResponse.ok(adminService.event(id));
    }

    @PostMapping("/events")
    public ApiResponse<Map<String, Object>> createEvent(
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        throw mutationDisabled(
                "ADMIN_EVENT_CREATE_DISABLED",
                "Event creation is temporarily disabled while safe event editing is being completed");
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

    @PatchMapping("/events/{id}/status")
    public ApiResponse<Map<String, Object>> updateEventStatus(
            @PathVariable String id,
            @RequestBody Map<String, Object> body,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ApiResponse.ok(adminService.updateEventStatus(id, body, principal));
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

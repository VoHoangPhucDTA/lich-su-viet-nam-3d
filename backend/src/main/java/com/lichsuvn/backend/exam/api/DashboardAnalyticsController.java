package com.lichsuvn.backend.exam.api;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.exam.api.dto.DashboardAnalyticsResponse;
import com.lichsuvn.backend.exam.application.DashboardAnalyticsService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/exams")
public class DashboardAnalyticsController {
    private final DashboardAnalyticsService service;

    public DashboardAnalyticsController(DashboardAnalyticsService service) {
        this.service = service;
    }

    @GetMapping("/dashboard-analytics")
    public ResponseEntity<ApiResponse<DashboardAnalyticsResponse>> dashboard(
            @RequestParam(required = false) String range,
            @RequestParam(required = false) Integer recentLimit,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        var body = ApiResponse.ok(service.getDashboard(principal, range, recentLimit));
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore().cachePrivate())
                .body(body);
    }
}

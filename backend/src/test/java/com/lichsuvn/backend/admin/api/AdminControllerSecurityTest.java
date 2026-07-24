package com.lichsuvn.backend.admin.api;

import com.lichsuvn.backend.admin.application.AdminService;
import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.config.JacksonConfig;
import com.lichsuvn.backend.common.config.SecurityConfig;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AdminController.class)
@Import({
        SecurityConfig.class,
        JacksonConfig.class,
        GlobalExceptionHandler.class,
        ApiAuthenticationEntryPoint.class,
        ApiAccessDeniedHandler.class,
        AdminControllerSecurityTest.EnableSecurity.class
})
class AdminControllerSecurityTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    AdminService adminService;

    @MockitoBean
    AuthService authService;

    @Test
    void anonymousCannotReadDashboard() throws Exception {
        mockMvc.perform(get("/api/admin/dashboard"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    @Test
    void studentCannotReadAdminResources() throws Exception {
        mockMvc.perform(get("/api/admin/dashboard")
                        .with(user("student").authorities(() -> "ROLE_student")))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/admin/events")
                        .with(user("student").authorities(() -> "ROLE_student")))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/admin/users")
                        .with(user("student").authorities(() -> "ROLE_student")))
                .andExpect(status().isForbidden());
    }

    @Test
    void teacherCannotUseCoreAdminResources() throws Exception {
        mockMvc.perform(get("/api/admin/dashboard")
                        .with(user("teacher").authorities(() -> "ROLE_teacher")))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/admin/events")
                        .with(user("teacher").authorities(() -> "ROLE_teacher")))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/admin/users")
                        .with(user("teacher").authorities(() -> "ROLE_teacher")))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanReadDashboardEventsAndUsers() throws Exception {
        when(adminService.dashboard()).thenReturn(Map.of(
                "users", Map.of("total", 1),
                "events", Map.of("total", 1),
                "recentAudit", List.of()
        ));
        when(adminService.events(null, null, null, null, null, null, null, null))
                .thenReturn(Map.of("items", List.of(), "count", 0, "total", 0, "limit", 25, "offset", 0));
        when(adminService.users(null, null, null, null, null))
                .thenReturn(Map.of("items", List.of(), "count", 0, "total", 0, "limit", 25, "offset", 0));

        var admin = user("admin").authorities(() -> "ROLE_admin");

        mockMvc.perform(get("/api/admin/dashboard").with(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
        mockMvc.perform(get("/api/admin/events").with(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
        mockMvc.perform(get("/api/admin/users").with(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void adminCanReachMutationEndpointWithoutWeakeningAuthorization() throws Exception {
        when(adminService.updateUserStatus(
                anyString(), anyMap(), nullable(UserPrincipal.class)))
                .thenReturn(Map.of("id", "user-1", "status", "disabled"));

        mockMvc.perform(patch("/api/admin/users/user-1/status")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .contentType("application/json")
                        .content("{\"status\":\"disabled\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mockMvc.perform(patch("/api/admin/users/user-1/status")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .contentType("application/json")
                        .content("{\"status\":\"disabled\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(patch("/api/admin/users/user-1/status")
                        .with(user("teacher").authorities(() -> "ROLE_teacher"))
                        .contentType("application/json")
                        .content("{\"status\":\"disabled\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminEventMutationsAreQuarantinedBeforeUnsafeServiceLogic() throws Exception {
        var admin = user("admin").authorities(() -> "ROLE_admin");

        mockMvc.perform(post("/api/admin/events")
                        .with(admin)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ADMIN_EVENT_CREATE_DISABLED"));

        mockMvc.perform(put("/api/admin/events/event-1")
                        .with(admin)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ADMIN_EVENT_UPDATE_DISABLED"));

        mockMvc.perform(delete("/api/admin/events/event-1").with(admin))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EVENT_HARD_DELETE_DISABLED"));

        verifyNoInteractions(adminService);
    }

    @Test
    void authorizationRunsBeforeAdminEventMutationQuarantine() throws Exception {
        mockMvc.perform(post("/api/admin/events")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(put("/api/admin/events/event-1")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(delete("/api/admin/events/event-1")
                        .with(user("teacher").authorities(() -> "ROLE_teacher")))
                .andExpect(status().isForbidden());

        verifyNoInteractions(adminService);
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {
    }
}

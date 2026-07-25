package com.lichsuvn.backend.admin.api;

import com.lichsuvn.backend.admin.api.dto.AdminDashboardDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.application.AdminDashboardReadService;
import com.lichsuvn.backend.admin.application.AdminEventReadService;
import com.lichsuvn.backend.admin.application.AdminEventMutationService;
import com.lichsuvn.backend.admin.application.AdminService;
import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.config.JacksonConfig;
import com.lichsuvn.backend.common.config.SecurityConfig;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
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
    AdminEventReadService adminEventReadService;

    @MockitoBean
    AdminDashboardReadService adminDashboardReadService;

    @MockitoBean
    AdminEventMutationService adminEventMutationService;

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

        mockMvc.perform(get("/api/admin/events/event-1")
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

        mockMvc.perform(get("/api/admin/events/event-1")
                        .with(user("teacher").authorities(() -> "ROLE_teacher")))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanReadDashboardEventsAndUsers() throws Exception {
        when(adminDashboardReadService.findDashboard()).thenReturn(new AdminDashboardDtos.Dashboard(
                new AdminDashboardDtos.Metrics(
                        new AdminDashboardDtos.EventMetrics(1, 1, 0, 0, 0, 0, 0, 0),
                        new AdminDashboardDtos.UserMetrics(1, 0)
                ),
                List.of(),
                List.of()
        ));
        when(adminEventReadService.findEvents(
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null))
                .thenReturn(new AdminEventDtos.Page(List.of(), 0, 0, 20, 0));
        when(adminService.users(null, null, null, null, null))
                .thenReturn(Map.of("items", List.of(), "count", 0, "total", 0, "limit", 25, "offset", 0));

        var admin = user("admin").authorities(() -> "ROLE_admin");

        mockMvc.perform(get("/api/admin/dashboard").with(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.metrics.events.total").value(1))
                .andExpect(jsonPath("$.data.metrics.users.activeTotal").value(1));
        mockMvc.perform(get("/api/admin/events").with(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
        mockMvc.perform(get("/api/admin/users").with(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void dashboardSectionsKeepAdminAuthorizationAndSerializeSafeTypedFields() throws Exception {
        var metrics = new AdminDashboardDtos.Metrics(
                new AdminDashboardDtos.EventMetrics(3, 1, 1, 1, 2, 2, 1, 2),
                new AdminDashboardDtos.UserMetrics(4, 1));
        var attention = new AdminDashboardDtos.AttentionEvent(
                "event-1", "Needs review",
                new AdminEventDtos.Chronology(null, null, null, null, null),
                "draft", null,
                new AdminEventDtos.Completeness(false, 1, List.of(
                        new AdminEventDtos.CompletenessIssue(
                                "MISSING_THUMBNAIL", "MEDIA", "WARNING", List.of("thumbnail")))),
                java.time.Instant.EPOCH, "MISSING_THUMBNAIL", "missingThumbnail=true");
        var audit = new AdminDashboardDtos.AuditEntry(
                new AdminDashboardDtos.ActorSummary("Administrator"),
                "event.status_updated", "historical_event", "event-1", java.time.Instant.EPOCH);
        when(adminDashboardReadService.findMetrics()).thenReturn(metrics);
        when(adminDashboardReadService.findAttention()).thenReturn(List.of(attention));
        when(adminDashboardReadService.findRecentAudit()).thenReturn(List.of(audit));
        var admin = user("admin").authorities(() -> "ROLE_admin");

        mockMvc.perform(get("/api/admin/dashboard/metrics").with(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.events.missingThumbnail").value(2));
        String attentionBody = mockMvc.perform(get("/api/admin/dashboard/attention").with(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].reasonCode").value("MISSING_THUMBNAIL"))
                .andReturn().getResponse().getContentAsString();
        String auditBody = mockMvc.perform(get("/api/admin/dashboard/audit").with(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].actor.displayName").value("Administrator"))
                .andReturn().getResponse().getContentAsString();

        for (String body : List.of(attentionBody, auditBody)) {
            org.junit.jupiter.api.Assertions.assertFalse(body.contains("raw_json"));
            org.junit.jupiter.api.Assertions.assertFalse(body.contains("rawJson"));
            org.junit.jupiter.api.Assertions.assertFalse(body.contains("sourceJson"));
            org.junit.jupiter.api.Assertions.assertFalse(body.contains("beforeJson"));
            org.junit.jupiter.api.Assertions.assertFalse(body.contains("afterJson"));
            org.junit.jupiter.api.Assertions.assertFalse(body.contains("local:"));
        }

        mockMvc.perform(get("/api/admin/dashboard/metrics")
                        .with(user("student").authorities(() -> "ROLE_student")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/dashboard/attention")
                        .with(user("teacher").authorities(() -> "ROLE_teacher")))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanReadTypedEventDetailWithoutExposingRawData() throws Exception {
        var detail = new AdminEventDtos.Detail(
                new AdminEventDtos.Core("event-1", "event-1", "Event", null),
                new AdminEventDtos.Content("Card", "Canonical", "Narrative", "Significance", List.of("Fact")),
                new AdminEventDtos.Chronology(null, null, null, null, null),
                new AdminEventDtos.Classification("atomic", "political", null, List.of(10)),
                new AdminEventDtos.Publication("draft", new AdminEventDtos.Flags(false, true, false),
                        null, java.time.Instant.EPOCH, java.time.Instant.EPOCH),
                new AdminEventDtos.MediaSection(null, List.of(), 0),
                new AdminEventDtos.Geography("no_location", "no_location", null, null,
                        List.of(), List.of(), null),
                new AdminEventDtos.Hierarchy(null, null, List.of(), List.of()),
                new AdminEventDtos.Textbook(List.of(), 0, 0, false),
                List.of(),
                new AdminEventDtos.Completeness(true, 0, List.of())
        );
        when(adminEventReadService.findEvent("event-1")).thenReturn(detail);

        String body = mockMvc.perform(get("/api/admin/events/event-1")
                        .with(user("admin").authorities(() -> "ROLE_admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.core.id").value("event-1"))
                .andReturn().getResponse().getContentAsString();

        org.junit.jupiter.api.Assertions.assertFalse(body.contains("rawJson"));
        org.junit.jupiter.api.Assertions.assertFalse(body.contains("sourceJson"));
        org.junit.jupiter.api.Assertions.assertFalse(body.contains("local:"));
    }

    @Test
    void invalidListSortReturnsStableBadRequestContract() throws Exception {
        when(adminEventReadService.findEvents(
                null, null, null, null, null, null, null,
                null, null, null, null, null, "raw_json", null, null, null))
                .thenThrow(new ApiException(
                        HttpStatus.BAD_REQUEST, "INVALID_SORT_FIELD", "sortBy has unsupported value"));

        mockMvc.perform(get("/api/admin/events")
                        .param("sortBy", "raw_json")
                        .with(user("admin").authorities(() -> "ROLE_admin")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("INVALID_SORT_FIELD"));
    }

    @Test
    void adminCanReachMutationEndpointWithoutWeakeningAuthorization() throws Exception {
        when(adminService.updateUserStatus(
                anyString(), anyMap(), nullable(UserPrincipal.class)))
                .thenReturn(Map.of("id", "user-1", "status", "disabled"));

        mockMvc.perform(patch("/api/admin/users/user-1/status")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf())
                        .contentType("application/json")
                        .content("{\"status\":\"disabled\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mockMvc.perform(patch("/api/admin/users/user-1/status")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .with(csrf())
                        .contentType("application/json")
                        .content("{\"status\":\"disabled\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(patch("/api/admin/users/user-1/status")
                        .with(user("teacher").authorities(() -> "ROLE_teacher"))
                        .with(csrf())
                        .contentType("application/json")
                        .content("{\"status\":\"disabled\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminEventMutationsAreQuarantinedBeforeUnsafeServiceLogic() throws Exception {
        var admin = user("admin").authorities(() -> "ROLE_admin");

        when(adminEventMutationService.create(any(), nullable(UserPrincipal.class))).thenReturn(
                new AdminEventDtos.Detail(
                        new AdminEventDtos.Core("draft-event", "draft-event", "Draft event", null),
                        null, null, null, null, null, null, null, null, List.of(), null));
        mockMvc.perform(post("/api/admin/events")
                        .with(admin)
                        .with(csrf())
                        .contentType("application/json")
                        .content("""
                                {"title":"Draft event","slug":"draft-event","eventLevel":"atomic",
                                 "eventType":"political","keyFacts":[],"grades":[]}
                                """))
                .andExpect(status().isCreated());

        mockMvc.perform(put("/api/admin/events/event-1")
                        .with(admin)
                        .with(csrf())
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ADMIN_EVENT_UPDATE_DISABLED"));

        mockMvc.perform(delete("/api/admin/events/event-1").with(admin).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EVENT_HARD_DELETE_DISABLED"));

        mockMvc.perform(patch("/api/admin/events/event-1/status")
                        .with(admin).with(csrf())
                        .contentType("application/json").content("{\"status\":\"published\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ADMIN_EVENT_STATUS_DISABLED"));

        verifyNoInteractions(adminService);
    }

    @Test
    void authorizationRunsBeforeAdminEventMutationQuarantine() throws Exception {
        mockMvc.perform(post("/api/admin/events")
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));

        mockMvc.perform(put("/api/admin/events/event-1")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .with(csrf())
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        mockMvc.perform(delete("/api/admin/events/event-1")
                        .with(user("teacher").authorities(() -> "ROLE_teacher"))
                        .with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        mockMvc.perform(patch("/api/admin/events/event-1/core")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .with(csrf())
                        .contentType("application/json")
                        .content("{\"expectedUpdatedAt\":\"2026-07-24T17:20:30.123456Z\",\"title\":\"x\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(put("/api/admin/events/event-1/grades")
                        .with(user("teacher").authorities(() -> "ROLE_teacher"))
                        .with(csrf())
                        .contentType("application/json")
                        .content("{\"expectedUpdatedAt\":\"2026-07-24T17:20:30.123456Z\",\"grades\":[]}"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(adminService);
    }

    @Test
    void adminCanReachTypedCoreAndGradeMutationEndpoints() throws Exception {
        var admin = user("admin").authorities(() -> "ROLE_admin");
        var mutationDetail = new AdminEventDtos.Detail(
                new AdminEventDtos.Core("event-1", "event-1", "Event", null),
                null, null, null,
                new AdminEventDtos.Publication(
                        "draft", new AdminEventDtos.Flags(false, false, false),
                        null, null, Instant.parse("2026-07-24T17:20:30Z")),
                null, null, null, null, List.of(), null);
        when(adminEventMutationService.updateCore(
                anyString(), any(), nullable(UserPrincipal.class))).thenReturn(mutationDetail);
        when(adminEventMutationService.replaceGrades(
                anyString(), any(), nullable(UserPrincipal.class))).thenReturn(mutationDetail);

        mockMvc.perform(patch("/api/admin/events/event-1/core")
                        .with(admin).with(csrf())
                        .contentType("application/json")
                        .content("{\"expectedUpdatedAt\":\"2026-07-24T17:20:30.123456Z\",\"title\":\"Updated\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.publication.updatedAt")
                        .value("2026-07-24T17:20:30.000000Z"));

        mockMvc.perform(put("/api/admin/events/event-1/grades")
                        .with(admin).with(csrf())
                        .contentType("application/json")
                        .content("{\"expectedUpdatedAt\":\"2026-07-24T17:20:30.123456Z\",\"grades\":[10,12]}"))
                .andExpect(status().isOk());
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {
    }
}

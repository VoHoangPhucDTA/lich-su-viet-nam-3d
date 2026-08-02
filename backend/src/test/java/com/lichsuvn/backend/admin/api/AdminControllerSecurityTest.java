package com.lichsuvn.backend.admin.api;

import com.lichsuvn.backend.admin.api.dto.AdminDashboardDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.api.dto.AdminUserDtos;
import com.lichsuvn.backend.admin.api.dto.AdminUserMutationDtos;
import com.lichsuvn.backend.admin.application.AdminDashboardReadService;
import com.lichsuvn.backend.admin.application.AdminEventReadService;
import com.lichsuvn.backend.admin.application.AdminEventMutationService;
import com.lichsuvn.backend.admin.application.AdminEventMediaMutationService;
import com.lichsuvn.backend.admin.application.AdminEventImageUploadService;
import com.lichsuvn.backend.admin.application.AdminMediaCleanupReadService;
import com.lichsuvn.backend.admin.api.dto.AdminMediaCleanupDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventImageDtos;
import com.lichsuvn.backend.admin.application.AdminEventGeographyMutationService;
import com.lichsuvn.backend.admin.application.AdminEventPublicationService;
import com.lichsuvn.backend.admin.application.AdminUserReadService;
import com.lichsuvn.backend.admin.application.AdminUserMutationService;
import com.lichsuvn.backend.admin.application.EventPublishBlockedException;
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
import org.springframework.mock.web.MockMultipartFile;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AdminController.class)
@Import({
        SecurityConfig.class,
        JacksonConfig.class,
        GlobalExceptionHandler.class,
        AdminEventPublicationExceptionHandler.class,
        ApiAuthenticationEntryPoint.class,
        ApiAccessDeniedHandler.class,
        AdminControllerSecurityTest.EnableSecurity.class
})
class AdminControllerSecurityTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    AdminEventReadService adminEventReadService;

    @MockitoBean
    AdminDashboardReadService adminDashboardReadService;

    @MockitoBean
    AdminEventMutationService adminEventMutationService;

    @MockitoBean
    AdminEventMediaMutationService adminEventMediaMutationService;

    @MockitoBean
    AdminEventImageUploadService adminEventImageUploadService;

    @MockitoBean
    AdminMediaCleanupReadService adminMediaCleanupReadService;

    @MockitoBean
    AdminEventGeographyMutationService adminEventGeographyMutationService;

    @MockitoBean
    AdminEventPublicationService adminEventPublicationService;

    @MockitoBean
    AdminUserReadService adminUserReadService;

    @MockitoBean
    AdminUserMutationService adminUserMutationService;

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
        when(adminUserReadService.findUsers(
                null, null, null, null, null, null, null, null))
                .thenReturn(new AdminUserDtos.Page(List.of(), 0, 0, 20, 0));

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
    void userDetailAuthorizationRunsBeforeReadServiceAndAdminReceivesTypedResponse() throws Exception {
        String id = "11111111-1111-1111-1111-111111111111";
        var detail = userDetail(id);
        when(adminUserReadService.findUser(id)).thenReturn(detail);

        mockMvc.perform(get("/api/admin/users/{id}", id))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/admin/users/{id}", id)
                        .with(user("student").authorities(() -> "ROLE_student")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/users/{id}", id)
                        .with(user("teacher").authorities(() -> "ROLE_teacher")))
                .andExpect(status().isForbidden());

        org.mockito.Mockito.verifyNoInteractions(adminUserReadService);

        String body = mockMvc.perform(get("/api/admin/users/{id}", id)
                        .with(user("admin").authorities(() -> "ROLE_admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.account.primaryRole").value("teacher"))
                .andExpect(jsonPath("$.data.sessions.trackingAvailable").value(false))
                .andExpect(jsonPath("$.data.sessions.activeRefreshSessionCount").isEmpty())
                .andReturn().getResponse().getContentAsString();

        for (String denied : List.of(
                "passwordHash", "password_hash", "tokenHash", "token_hash",
                "providerId", "provider_id", "failedLoginCount", "lockedUntil",
                "beforeJson", "afterJson", "ipAddress", "anonymousTokenHash",
                "questionsJson", "answersJson", "configJson", "resultJson", "local:")) {
            org.junit.jupiter.api.Assertions.assertFalse(body.contains(denied), denied);
        }
    }

    @Test
    void rejectedUserListRequestsNeverInvokeReadServiceAndAdminReceivesAllowlistedJson() throws Exception {
        var nonAdmin = user("teacher").authorities(() -> "ROLE_teacher");
        mockMvc.perform(get("/api/admin/users"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/admin/users").with(nonAdmin))
                .andExpect(status().isForbidden());
        verifyNoInteractions(adminUserReadService);

        Instant created = Instant.parse("2026-01-01T00:00:00Z");
        when(adminUserReadService.findUsers(
                "Teacher", "teacher", "deleted", "false", "email", "asc", 10, 20))
                .thenReturn(new AdminUserDtos.Page(List.of(new AdminUserDtos.ListItem(
                        "11111111-1111-1111-1111-111111111111",
                        null,
                        "teacher@example.test",
                        AdminUserDtos.Role.TEACHER,
                        List.of(AdminUserDtos.Role.TEACHER),
                        AdminUserDtos.Status.DELETED,
                        false,
                        created,
                        created,
                        null
                )), 1, 21, 10, 20));

        String body = mockMvc.perform(get("/api/admin/users")
                        .param("q", "Teacher")
                        .param("role", "teacher")
                        .param("status", "deleted")
                        .param("verified", "false")
                        .param("sortBy", "email")
                        .param("sortDir", "asc")
                        .param("limit", "10")
                        .param("offset", "20")
                        .with(user("admin").authorities(() -> "ROLE_admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].displayName").isEmpty())
                .andExpect(jsonPath("$.data.items[0].primaryRole").value("teacher"))
                .andExpect(jsonPath("$.data.items[0].roles[0]").value("teacher"))
                .andExpect(jsonPath("$.data.items[0].status").value("deleted"))
                .andExpect(jsonPath("$.data.items[0].emailVerified").value(false))
                .andExpect(jsonPath("$.data.total").value(21))
                .andReturn().getResponse().getContentAsString();
        for (String denied : List.of(
                "passwordHash", "tokenHash", "providerId", "failedLoginCount",
                "lockedUntil", "grade", "school", "avatarUrl", "local:")) {
            org.junit.jupiter.api.Assertions.assertFalse(body.contains(denied), denied);
        }
    }

    @Test
    void malformedAndMissingUserIdsAreResolvedOnlyAfterAdminAuthorization() throws Exception {
        String malformed = "not-a-uuid";
        mockMvc.perform(get("/api/admin/users/{id}", malformed))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/admin/users/{id}", malformed)
                        .with(user("student").authorities(() -> "ROLE_student")))
                .andExpect(status().isForbidden());
        verifyNoInteractions(adminUserReadService);

        when(adminUserReadService.findUser(malformed)).thenThrow(new ApiException(
                HttpStatus.BAD_REQUEST, "INVALID_USER_ID", "User ID must be a UUID"));
        mockMvc.perform(get("/api/admin/users/{id}", malformed)
                        .with(user("admin").authorities(() -> "ROLE_admin")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_USER_ID"));

        String missing = "11111111-1111-1111-1111-111111111199";
        when(adminUserReadService.findUser(missing)).thenThrow(new ApiException(
                HttpStatus.NOT_FOUND, "ADMIN_USER_NOT_FOUND", "Admin user account not found"));
        mockMvc.perform(get("/api/admin/users/{id}", missing)
                        .with(user("admin").authorities(() -> "ROLE_admin")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ADMIN_USER_NOT_FOUND"));
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
    void typedUserMutationsPreserveAuthorizationAndCsrfBoundaries() throws Exception {
        String id = "00000000-0000-0000-0000-000000000010";
        when(adminUserMutationService.updateStatus(
                anyString(), any(AdminUserMutationDtos.ChangeStatus.class),
                nullable(UserPrincipal.class)))
                .thenReturn(userDetail(id));
        when(adminUserMutationService.replaceRoles(
                anyString(), any(AdminUserMutationDtos.ReplaceRoles.class),
                nullable(UserPrincipal.class)))
                .thenReturn(userDetail(id));
        String statusBody = """
                {"expectedUpdatedAt":"2026-01-02T00:00:00.123456Z","status":"disabled"}
                """;
        String rolesBody = """
                {"expectedUpdatedAt":"2026-01-02T00:00:00.123456Z","roles":["teacher","student"]}
                """;

        mockMvc.perform(patch("/api/admin/users/" + id + "/status")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf())
                        .contentType("application/json")
                        .content(statusBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.account.id").value(id));

        mockMvc.perform(put("/api/admin/users/" + id + "/roles")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf())
                        .contentType("application/json")
                        .content(rolesBody))
                .andExpect(status().isOk());

        for (String role : List.of("student", "teacher")) {
            mockMvc.perform(patch("/api/admin/users/" + id + "/status")
                            .with(user(role).authorities(() -> "ROLE_" + role))
                            .with(csrf())
                            .contentType("application/json")
                            .content(statusBody))
                    .andExpect(status().isForbidden());
            mockMvc.perform(put("/api/admin/users/" + id + "/roles")
                            .with(user(role).authorities(() -> "ROLE_" + role))
                            .with(csrf())
                            .contentType("application/json")
                            .content(rolesBody))
                    .andExpect(status().isForbidden());
        }

        mockMvc.perform(patch("/api/admin/users/" + id + "/status")
                        .with(csrf())
                        .contentType("application/json")
                        .content(statusBody))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/admin/users/" + id + "/roles")
                        .with(csrf())
                        .contentType("application/json")
                        .content(rolesBody))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(put("/api/admin/users/" + id + "/roles")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .contentType("application/json")
                        .content(rolesBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        mockMvc.perform(patch("/api/admin/users/" + id + "/status")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .contentType("application/json")
                        .content(statusBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));

        mockMvc.perform(patch("/api/admin/users/" + id + "/status")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf().useInvalidToken())
                        .contentType("application/json")
                        .content(statusBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        mockMvc.perform(put("/api/admin/users/" + id + "/roles")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf().useInvalidToken())
                        .contentType("application/json")
                        .content(rolesBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
    }

    @Test
    void legacyUserMutationEndpointsAreQuarantinedWithoutCallingTypedService() throws Exception {
        var admin = user("admin").authorities(() -> "ROLE_admin");
        mockMvc.perform(patch("/api/admin/users/user-1/role")
                        .with(admin).with(csrf()).contentType("application/json")
                        .content("{\"role\":\"student\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ADMIN_USER_ROLE_ENDPOINT_RETIRED"));
        mockMvc.perform(delete("/api/admin/users/user-1").with(admin).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ADMIN_USER_DELETE_DISABLED"));
        verifyNoInteractions(adminUserMutationService);
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
        clearInvocations(adminEventMutationService);

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

        verifyNoInteractions(
                adminEventMutationService,
                adminEventMediaMutationService,
                adminEventGeographyMutationService,
                adminEventPublicationService);
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

        verifyNoInteractions(
                adminEventMutationService,
                adminEventMediaMutationService,
                adminEventGeographyMutationService,
                adminEventPublicationService);
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

    @Test
    void geographyMutationRequiresAdminAndCsrfAndRejectsOpenJsonShapes() throws Exception {
        var detail = new AdminEventDtos.Detail(
                new AdminEventDtos.Core("event-1", "event-1", "Event", null),
                null, null, null,
                new AdminEventDtos.Publication(
                        "draft", new AdminEventDtos.Flags(false, false, false),
                        null, null, Instant.parse("2026-07-24T17:20:30.123456Z")),
                null, null, null, null, List.of(), null);
        when(adminEventGeographyMutationService.update(
                anyString(), any(), nullable(UserPrincipal.class))).thenReturn(detail);
        String request = """
                {"expectedUpdatedAt":"2026-07-24T17:20:30.123456Z",
                 "geography":{"geoType":"point",
                   "marker":{"label":"Huế","lat":16.46,"lng":107.59},
                   "historicalLocations":[],"focus":{"mode":"auto","zoom":8}}}
                """;

        mockMvc.perform(patch("/api/admin/events/event-1/geography")
                        .with(csrf()).contentType("application/json").content(request))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(patch("/api/admin/events/event-1/geography")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .with(csrf()).contentType("application/json").content(request))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(patch("/api/admin/events/event-1/geography")
                        .with(user("teacher").authorities(() -> "ROLE_teacher"))
                        .with(csrf()).contentType("application/json").content(request))
                .andExpect(status().isForbidden());
        mockMvc.perform(patch("/api/admin/events/event-1/geography")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .contentType("application/json").content(request))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        mockMvc.perform(patch("/api/admin/events/event-1/geography")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf()).contentType("application/json").content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.core.id").value("event-1"));

        mockMvc.perform(patch("/api/admin/events/event-1/geography")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf()).contentType("application/json").content("""
                        {"expectedUpdatedAt":"2026-07-24T17:20:30.123456Z",
                         "geography":{"geoType":"point",
                           "marker":{"label":"Huế","lat":16.46,"lng":107.59},
                           "raw_json":{"mapData":{}}}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_JSON_PROPERTY"));
        mockMvc.perform(patch("/api/admin/events/event-1/geography")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf()).contentType("application/json").content("""
                        {"expectedUpdatedAt":"2026-07-24T17:20:30.123456Z",
                         "geography":{"geoType":"polygon"}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_GEO_TYPE"));
        mockMvc.perform(patch("/api/admin/events/event-1/geography")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf()).contentType("application/json").content("""
                        {"expectedUpdatedAt":"2026-07-24T17:20:30.123456Z",
                         "geography":{"geoType":"point",
                           "marker":{"label":"Huế","lat":16.46,"lng":107.59},
                           "historicalLocations":[],
                           "focus":{"mode":"auto","center":{"lat":16.46,"lng":107.59}}}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_JSON_PROPERTY"));
        mockMvc.perform(patch("/api/admin/events/event-1/geography")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf()).contentType("application/json").content("""
                        {"expectedUpdatedAt":"2026-07-24T17:20:30.123456Z",
                         "geography":{"geoType":"point",
                           "marker":{"label":"Huế","lat":16.46,"lng":107.59},
                           "historicalLocations":"not-an-array"}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_GEOGRAPHY_REQUEST"));
    }

    @Test
    void mediaMutationsPreserveCsrfRoleAndAdminSuccessContracts() throws Exception {
        var detail = new AdminEventDtos.Detail(
                new AdminEventDtos.Core("event-1", "event-1", "Event", null),
                null, null, null,
                new AdminEventDtos.Publication(
                        "draft", new AdminEventDtos.Flags(false, false, false),
                        null, null, Instant.parse("2026-07-24T17:20:30.123456Z")),
                new AdminEventDtos.MediaSection(null, List.of(), 0),
                null, null, null, List.of(), null);
        when(adminEventMediaMutationService.add(
                anyString(), any(), nullable(UserPrincipal.class)))
                .thenReturn(new AdminEventMediaMutationService.AddResult(41L, detail));
        when(adminEventMediaMutationService.remove(
                anyString(), anyLong(), anyString(), nullable(UserPrincipal.class)))
                .thenReturn(detail);

        String createBody = """
                {"expectedUpdatedAt":"2026-07-24T17:20:30.123456Z",
                 "mediaType":"image","url":"https://cdn.example.org/image.jpg","status":"active"}
                """;
        mockMvc.perform(post("/api/admin/events/event-1/media")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .contentType("application/json").content(createBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));

        mockMvc.perform(post("/api/admin/events/event-1/media")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .with(csrf()).contentType("application/json").content(createBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        mockMvc.perform(post("/api/admin/events/event-1/media")
                        .with(user("teacher").authorities(() -> "ROLE_teacher"))
                        .with(csrf()).contentType("application/json").content(createBody))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        mockMvc.perform(post("/api/admin/events/event-1/media")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf()).contentType("application/json").content(createBody))
                .andExpect(status().isCreated())
                .andExpect(header().string(
                        "Location", "/api/admin/events/event-1/media/41"))
                .andExpect(jsonPath("$.data.core.id").value("event-1"));

        mockMvc.perform(delete("/api/admin/events/event-1/media/41")
                        .header("X-Event-Version", "2026-07-24T17:20:30.123456Z")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.core.id").value("event-1"));

        mockMvc.perform(delete("/api/admin/events/event-1/media/41")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_EXPECTED_VERSION"));
    }

    @Test
    void managedImageUploadRequiresAdminCsrfAndReturnsOnlyTypedResponse() throws Exception {
        var detail = new AdminEventDtos.Detail(
                new AdminEventDtos.Core("event-1", "event-1", "Event", null),
                null, null, null,
                new AdminEventDtos.Publication(
                        "draft", new AdminEventDtos.Flags(false, false, false),
                        null, null, Instant.parse("2026-07-24T17:20:30.123457Z")),
                new AdminEventDtos.MediaSection(null, List.of(), 0),
                null, null, null, List.of(), null);
        when(adminEventImageUploadService.upload(
                anyString(), any(), anyString(), anyString(), anyString(),
                nullable(String.class), nullable(String.class), nullable(String.class),
                nullable(UserPrincipal.class)))
                .thenReturn(new AdminEventImageDtos.UploadResponse(
                        51L, "2026-07-24T17:20:30.123457Z", detail));
        var image = new MockMultipartFile(
                "file", "ignored.png", "image/png", new byte[]{1, 2, 3});

        mockMvc.perform(multipart("/api/admin/events/event-1/media/images")
                        .file(image)
                        .param("expectedUpdatedAt", "2026-07-24T17:20:30.123456Z")
                        .param("kind", "gallery")
                        .param("altText", "Ảnh lịch sử")
                        .with(csrf().asHeader()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(multipart("/api/admin/events/event-1/media/images")
                        .file(image)
                        .param("expectedUpdatedAt", "2026-07-24T17:20:30.123456Z")
                        .param("kind", "gallery")
                        .param("altText", "Ảnh lịch sử")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .with(csrf().asHeader()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(multipart("/api/admin/events/event-1/media/images")
                        .file(image)
                        .param("expectedUpdatedAt", "2026-07-24T17:20:30.123456Z")
                        .param("kind", "gallery")
                        .param("altText", "Ảnh lịch sử")
                        .with(user("admin").authorities(() -> "ROLE_admin")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        verifyNoInteractions(adminEventImageUploadService);

        String response = mockMvc.perform(multipart("/api/admin/events/event-1/media/images")
                        .file(image)
                        .param("expectedUpdatedAt", "2026-07-24T17:20:30.123456Z")
                        .param("kind", "gallery")
                        .param("altText", "Ảnh lịch sử")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf().asHeader()))
                .andExpect(status().isCreated())
                .andExpect(header().doesNotExist("Location"))
                .andExpect(jsonPath("$.data.mediaId").value(51))
                .andExpect(jsonPath("$.data.updatedAt")
                        .value("2026-07-24T17:20:30.123457Z"))
                .andReturn().getResponse().getContentAsString();
        for (String forbidden : List.of(
                "publicId", "providerAssetId", "checksum", "signature",
                "cleanupTask", "originalUrl")) {
            org.junit.jupiter.api.Assertions.assertFalse(response.contains(forbidden), forbidden);
        }
        verify(adminEventImageUploadService).upload(
                anyString(), any(), anyString(), anyString(), anyString(),
                nullable(String.class), nullable(String.class), nullable(String.class),
                nullable(UserPrincipal.class));
    }

    @Test
    void managedImageUploadRejectsUnknownOrDuplicateMultipartFieldsBeforeService() throws Exception {
        var admin = user("admin").authorities(() -> "ROLE_admin");
        var image = new MockMultipartFile(
                "file", "ignored.png", "image/png", new byte[]{1});
        var extra = new MockMultipartFile(
                "url", "", "text/plain", "https://forbidden".getBytes());

        mockMvc.perform(multipart("/api/admin/events/event-1/media/images")
                        .file(image).file(extra)
                        .param("expectedUpdatedAt", "2026-07-24T17:20:30.123456Z")
                        .param("kind", "gallery")
                        .param("altText", "Ảnh lịch sử")
                        .with(admin).with(csrf().asHeader()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MULTIPART_FIELD"));

        mockMvc.perform(multipart("/api/admin/events/event-1/media/images")
                        .file(image)
                        .param("expectedUpdatedAt",
                                "2026-07-24T17:20:30.123456Z",
                                "2026-07-24T17:20:30.123456Z")
                        .param("kind", "gallery")
                        .param("altText", "Ảnh lịch sử")
                        .with(admin).with(csrf().asHeader()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MULTIPART_FIELD"));
        verifyNoInteractions(adminEventImageUploadService);
    }

    @Test
    void replacementAndCleanupReadEndpointsRequireAdminAndCsrfWhereApplicable() throws Exception {
        var image = new MockMultipartFile("file", "replacement.png", "image/png", new byte[]{1});
        mockMvc.perform(multipart("/api/admin/events/event-1/media/42/replacement")
                        .file(image).param("expectedUpdatedAt", "2026-07-24T17:20:30.123456Z")
                        .with(user("student").authorities(() -> "ROLE_student")).with(csrf().asHeader()))
                .andExpect(status().isForbidden());
        mockMvc.perform(multipart("/api/admin/events/event-1/media/42/replacement")
                        .file(image).param("expectedUpdatedAt", "2026-07-24T17:20:30.123456Z")
                        .with(user("admin").authorities(() -> "ROLE_admin")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/media-cleanup/summary")
                        .with(user("teacher").authorities(() -> "ROLE_teacher")))
                .andExpect(status().isForbidden());

        when(adminMediaCleanupReadService.summary())
                .thenReturn(new AdminMediaCleanupDtos.Summary(1, 2, 3, 4));
        mockMvc.perform(get("/api/admin/media-cleanup/summary")
                        .with(user("admin").authorities(() -> "ROLE_admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.failed").value(3));
    }

    @Test
    void publicationEndpointPreservesAuthenticationCsrfRoleAndTypedSuccessContracts() throws Exception {
        var detail = new AdminEventDtos.Detail(
                new AdminEventDtos.Core("event-1", "event-1", "Event", null),
                null, null, null,
                new AdminEventDtos.Publication(
                        "published", new AdminEventDtos.Flags(false, false, false),
                        Instant.parse("2026-07-26T03:00:00Z"), null,
                        Instant.parse("2026-07-26T03:00:01.123456Z")),
                null, null, null, null, List.of(),
                new AdminEventDtos.Completeness(true, 0, List.of()));
        when(adminEventPublicationService.update(
                anyString(), any(), nullable(UserPrincipal.class))).thenReturn(detail);
        String request = """
                {"expectedUpdatedAt":"2026-07-26T02:59:59.123456Z","action":"publish"}
                """;

        mockMvc.perform(patch("/api/admin/events/event-1/publication")
                        .with(csrf()).contentType("application/json").content(request))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        mockMvc.perform(patch("/api/admin/events/event-1/publication")
                        .with(user("student").authorities(() -> "ROLE_student"))
                        .with(csrf()).contentType("application/json").content(request))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(patch("/api/admin/events/event-1/publication")
                        .with(user("teacher").authorities(() -> "ROLE_teacher"))
                        .with(csrf()).contentType("application/json").content(request))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(patch("/api/admin/events/event-1/publication")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .contentType("application/json").content(request))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_TOKEN_INVALID"));
        mockMvc.perform(patch("/api/admin/events/event-1/publication")
                        .with(user("admin").authorities(() -> "ROLE_admin"))
                        .with(csrf()).contentType("application/json").content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.publication.status").value("published"))
                .andExpect(jsonPath("$.data.publication.updatedAt")
                        .value("2026-07-26T03:00:01.123456Z"));
    }

    @Test
    void publicationEndpointRejectsStatusInjectionAndSerializesOnlyBoundedBlockers() throws Exception {
        var admin = user("admin").authorities(() -> "ROLE_admin");
        String version = "2026-07-26T02:59:59.123456Z";
        mockMvc.perform(patch("/api/admin/events/event-1/publication")
                        .with(admin).with(csrf()).contentType("application/json")
                        .content("""
                                {"expectedUpdatedAt":"%s","action":"publish","status":"published"}
                                """.formatted(version)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_JSON_PROPERTY"));

        when(adminEventPublicationService.update(
                anyString(), any(), nullable(UserPrincipal.class)))
                .thenThrow(new EventPublishBlockedException(List.of(
                        new AdminEventDtos.CompletenessIssue(
                                "MISSING_CORE_CONTENT", "CONTENT", "ERROR",
                                List.of("canonicalSummary")))));
        String response = mockMvc.perform(patch("/api/admin/events/event-1/publication")
                        .with(admin).with(csrf()).contentType("application/json")
                        .content("""
                                {"expectedUpdatedAt":"%s","action":"publish"}
                                """.formatted(version)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EVENT_PUBLISH_BLOCKED"))
                .andExpect(jsonPath("$.data.issues[0].code").value("MISSING_CORE_CONTENT"))
                .andExpect(jsonPath("$.data.issues[0].section").value("CONTENT"))
                .andExpect(jsonPath("$.data.issues[0].severity").value("ERROR"))
                .andExpect(jsonPath("$.data.issues[0].fields[0]").value("canonicalSummary"))
                .andReturn().getResponse().getContentAsString();
        for (String forbidden : List.of(
                "rawJson", "sourceJson", "mapData", "keyFacts", "mediaUrls",
                "provenance", "local:")) {
            org.junit.jupiter.api.Assertions.assertFalse(response.contains(forbidden), forbidden);
        }
    }

    private static AdminUserDtos.Detail userDetail(String id) {
        Instant created = Instant.parse("2026-01-01T00:00:00Z");
        return new AdminUserDtos.Detail(
                new AdminUserDtos.Account(
                        id, "Teacher", "teacher@example.test",
                        AdminUserDtos.Role.TEACHER,
                        List.of(AdminUserDtos.Role.TEACHER),
                        AdminUserDtos.Status.ACTIVE,
                        true, created, "other", "School",
                        "https://cdn.example.test/avatar.png", created,
                        "2026-01-02T00:00:00.123456Z"),
                new AdminUserDtos.SessionTracking(
                        AdminUserDtos.TrackingMode.STATELESS_JWT, false, null),
                new AdminUserDtos.Learning(
                        new AdminUserDtos.Progress(2, 1, 3, created),
                        new AdminUserDtos.AssessmentSummary(1, java.math.BigDecimal.TEN, created),
                        new AdminUserDtos.AssessmentSummary(1, java.math.BigDecimal.TEN, created)),
                new AdminUserDtos.Activity(created, List.of()),
                List.of()
        );
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {
    }
}

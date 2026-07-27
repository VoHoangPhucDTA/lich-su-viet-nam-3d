package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.infrastructure.AdminDashboardReadRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringJUnitConfig(AdminMethodSecurityTest.Config.class)
class AdminMethodSecurityTest {

    @Autowired
    AdminDashboardReadService dashboardService;

    @Autowired
    AdminDashboardReadRepository dashboardRepository;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
        reset(dashboardRepository);
    }

    @Test
    void anonymousStudentAndTeacherAreDeniedBeforeRepositoryAccess() {
        assertThrows(AuthenticationCredentialsNotFoundException.class,
                dashboardService::findRecentAudit);
        verifyNoInteractions(dashboardRepository);

        authenticate("ROLE_student");
        assertThrows(AccessDeniedException.class, dashboardService::findRecentAudit);
        verifyNoInteractions(dashboardRepository);

        authenticate("ROLE_teacher");
        assertThrows(AccessDeniedException.class, dashboardService::findRecentAudit);
        verifyNoInteractions(dashboardRepository);
    }

    @Test
    void adminCanInvokeTheProxiedFacade() {
        when(dashboardRepository.findRecentAudit(10)).thenReturn(List.of());
        authenticate("ROLE_admin");

        assertTrue(dashboardService.findRecentAudit().isEmpty());

        verify(dashboardRepository).findRecentAudit(10);
    }

    @Test
    void everyApiFacingAdminFacadeDeclaresTheSameAdminBoundary() {
        for (Class<?> facade : List.of(
                AdminDashboardReadService.class,
                AdminEventReadService.class,
                AdminEventMutationService.class,
                AdminEventMediaMutationService.class,
                AdminEventGeographyMutationService.class,
                AdminEventPublicationService.class,
                AdminUserReadService.class,
                AdminUserMutationService.class)) {
            PreAuthorize annotation = facade.getAnnotation(PreAuthorize.class);
            assertEquals("hasAuthority('ROLE_admin')", annotation.value(), facade.getName());
        }
    }

    private void authenticate(String authority) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        "principal", "credentials",
                        List.of(new SimpleGrantedAuthority(authority))));
    }

    @Configuration
    @EnableMethodSecurity
    @Import(AdminDashboardReadService.class)
    static class Config {
        @Bean
        AdminDashboardReadRepository dashboardRepository() {
            return mock(AdminDashboardReadRepository.class);
        }

        @Bean
        AdminEventReadRepository eventRepository() {
            return mock(AdminEventReadRepository.class);
        }

        @Bean
        EventCompletenessService completenessService() {
            return mock(EventCompletenessService.class);
        }
    }
}

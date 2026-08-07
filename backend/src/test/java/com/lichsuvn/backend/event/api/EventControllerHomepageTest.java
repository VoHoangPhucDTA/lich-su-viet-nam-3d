package com.lichsuvn.backend.event.api;

import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.common.config.JacksonConfig;
import com.lichsuvn.backend.common.config.SecurityConfig;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import com.lichsuvn.backend.event.api.dto.EventDetailDto;
import com.lichsuvn.backend.event.api.dto.EventRelatedEventsDto;
import com.lichsuvn.backend.event.api.dto.HomepageEventSummaryDto;
import com.lichsuvn.backend.event.api.dto.HomepageEventsResponse;
import com.lichsuvn.backend.event.application.EventReadService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(EventController.class)
@Import({
        SecurityConfig.class,
        JacksonConfig.class,
        GlobalExceptionHandler.class,
        ApiAuthenticationEntryPoint.class,
        ApiAccessDeniedHandler.class,
        EventControllerHomepageTest.EnableSecurity.class
})
class EventControllerHomepageTest {
    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private EventReadService eventReadService;

    @MockitoBean
    private AuthService authService;

    @Test
    void anonymousHomepageRequestUsesTheLiteralHandlerAndSerializesOnlyCardFields() throws Exception {
        when(eventReadService.findHomepageEvents()).thenReturn(homepageResponse());

        mockMvc.perform(get("/api/events/homepage"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.events.length()").value(6))
                .andExpect(jsonPath("$.data.events[0].slug").value("chien-thang-bach-dang-938"))
                .andExpect(jsonPath("$.data.events[5].slug")
                        .value("chien-dich-giai-phong-sai-gon-gia-dinh-chien-dich-ho-chi-minh"))
                .andExpect(jsonPath("$.data.events[0].sourceJson").doesNotExist())
                .andExpect(jsonPath("$.data.events[0].detailedNarrative").doesNotExist())
                .andExpect(jsonPath("$.data.events[0].textbookContent").doesNotExist())
                .andExpect(jsonPath("$.data.events[0].media").doesNotExist())
                .andExpect(jsonPath("$.data.events[0].relations").doesNotExist())
                .andExpect(jsonPath("$.data.events[0].relatedEvents").doesNotExist())
                .andExpect(jsonPath("$.data.events[0].externalSources").doesNotExist());

        verify(eventReadService).findHomepageEvents();
        verify(eventReadService, never()).findDetail(anyString());
    }

    @Test
    void authenticatedStudentAlsoReadsThePublicHomepageEndpoint() throws Exception {
        when(eventReadService.findHomepageEvents()).thenReturn(homepageResponse());

        mockMvc.perform(get("/api/events/homepage").with(user("student").roles("student")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.events.length()").value(6));
    }

    @Test
    void ordinaryDetailSlugStillUsesTheDetailHandlerInsteadOfTheHomepageHandler() throws Exception {
        when(eventReadService.findDetail("ordinary-detail-slug")).thenReturn(detailResponse());

        mockMvc.perform(get("/api/events/ordinary-detail-slug"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value("ordinary-detail-slug"))
                .andExpect(jsonPath("$.data.detailedNarrative").value("Full detail remains available"));

        verify(eventReadService).findDetail("ordinary-detail-slug");
        verify(eventReadService, never()).findHomepageEvents();
    }

    private HomepageEventsResponse homepageResponse() {
        return new HomepageEventsResponse(List.of(
                summary("chien-thang-bach-dang-938", 938),
                summary("ly-thai-to-doi-do-thang-long", 1010),
                summary("khang-chien-chong-quan-thanh-1789", 1789),
                summary("ho-chi-minh-cong-bo-tuyen-ngon-doc-lap", 1945),
                summary("chien-dich-dien-bien-phu-1954", 1954),
                summary("chien-dich-giai-phong-sai-gon-gia-dinh-chien-dich-ho-chi-minh", 1975)
        ));
    }

    private HomepageEventSummaryDto summary(String slug, int year) {
        return new HomepageEventSummaryDto(
                slug, slug, "Title " + year, year, "military", List.of("Vi\u1ec7t Nam"), "Card summary"
        );
    }

    private EventDetailDto detailResponse() {
        return new EventDetailDto(
                "ordinary-detail-slug",
                "ordinary-detail-slug",
                "Detail title",
                "Detail title",
                "atomic",
                "military",
                null,
                1945,
                null,
                1945,
                "1945",
                "year",
                "no_location",
                null,
                null,
                List.of(),
                List.of(),
                null,
                null,
                0,
                0,
                "Card summary",
                "Canonical summary",
                "Full detail remains available",
                "Significance",
                List.of(),
                true,
                true,
                false,
                0,
                "published",
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                EventRelatedEventsDto.empty(),
                "Textbook content",
                null,
                null
        );
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {
    }
}

package com.lichsuvn.backend.event.api;

import com.lichsuvn.backend.auth.application.AuthService;
import com.lichsuvn.backend.common.config.JacksonConfig;
import com.lichsuvn.backend.common.config.SecurityConfig;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import com.lichsuvn.backend.common.security.ApiAccessDeniedHandler;
import com.lichsuvn.backend.common.security.ApiAuthenticationEntryPoint;
import com.lichsuvn.backend.event.api.dto.EventDetailDto;
import com.lichsuvn.backend.event.api.dto.EventRelatedEventsDto;
import com.lichsuvn.backend.event.application.EventReadService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.when;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultHandlers.print;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(EventController.class)
@Import({
        SecurityConfig.class,
        JacksonConfig.class,
        GlobalExceptionHandler.class,
        ApiAuthenticationEntryPoint.class,
        ApiAccessDeniedHandler.class,
        EventDetailMapDataSerializationTest.EnableSecurity.class
})
class EventDetailMapDataSerializationTest {
    private static final List<String> JACKSON_INTROSPECTION_KEYS = List.of(
            "array", "bigDecimal", "bigInteger", "binary", "boolean", "containerNode",
            "double", "empty", "float", "floatingPointNumber", "int", "integralNumber",
            "long", "missingNode", "nodeType", "null", "number", "object", "pojo",
            "short", "textual", "valueNode"
    );

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private EventReadService eventReadService;

    @MockitoBean
    private AuthService authService;

    @Test
    void serializesMultiPointMapDataAsBusinessJsonInsteadOfJacksonIntrospection() throws Exception {
        var mapData = Map.<String, Object>of(
                "geoType", "multi_point",
                "markers", List.of(
                        marker("Bạch Đằng", 20.8833, 106.8),
                        marker("Cửa Lục", 20.95, 107.05),
                        marker("Thăng Long", 21.0285, 105.8542),
                        marker("Vân Đồn", 20.9906, 107.4069)
                )
        );
        when(eventReadService.findDetail("khang-chien-chong-quan-nguyen-1287-1288"))
                .thenReturn(detail(mapData));

        ResultActions response = mockMvc.perform(get("/api/events/khang-chien-chong-quan-nguyen-1287-1288"))
                .andDo(print())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mapData.geoType").value("multi_point"))
                .andExpect(jsonPath("$.data.mapData.markers.length()").value(4));

        assertNoJacksonIntrospection(response);
    }

    @Test
    void serializesPointMapData() throws Exception {
        when(eventReadService.findDetail("point-event")).thenReturn(detail(Map.of(
                "geoType", "point",
                "marker", marker("Điện Biên Phủ", 21.386, 103.016)
        )));

        ResultActions response = mockMvc.perform(get("/api/events/point-event"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mapData.geoType").value("point"))
                .andExpect(jsonPath("$.data.mapData.marker.name").value("Điện Biên Phủ"));

        assertNoJacksonIntrospection(response);
    }

    @Test
    void serializesMultiPolygonMapData() throws Exception {
        when(eventReadService.findDetail("multi-polygon-event")).thenReturn(detail(Map.of(
                "geoType", "multi_polygon",
                "gadmRefs", List.of("VNM.13_1", "VNM.24_1")
        )));

        ResultActions response = mockMvc.perform(get("/api/events/multi-polygon-event"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mapData.geoType").value("multi_polygon"))
                .andExpect(jsonPath("$.data.mapData.gadmRefs.length()").value(2));

        assertNoJacksonIntrospection(response);
    }

    @Test
    void serializesNoLocationMapData() throws Exception {
        when(eventReadService.findDetail("no-location-event"))
                .thenReturn(detail(Map.of("geoType", "no_location")));

        ResultActions response = mockMvc.perform(get("/api/events/no-location-event"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mapData.geoType").value("no_location"));

        assertNoJacksonIntrospection(response);
    }

    @Test
    void serializesNationwideMapData() throws Exception {
        when(eventReadService.findDetail("nationwide-event"))
                .thenReturn(detail(Map.of("geoType", "nationwide")));

        ResultActions response = mockMvc.perform(get("/api/events/nationwide-event"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mapData.geoType").value("nationwide"));

        assertNoJacksonIntrospection(response);
    }

    @Test
    void preservesNullOptionalMapData() throws Exception {
        when(eventReadService.findDetail("null-map-event")).thenReturn(detail(null));

        mockMvc.perform(get("/api/events/null-map-event"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mapData").value(nullValue()));
    }

    private void assertNoJacksonIntrospection(ResultActions response) throws Exception {
        for (String key : JACKSON_INTROSPECTION_KEYS) {
            response.andExpect(jsonPath("$.data.mapData." + key).doesNotExist());
        }
    }

    private Map<String, Object> marker(String name, double lat, double lng) {
        return Map.of("name", name, "lat", lat, "lng", lng);
    }

    private EventDetailDto detail(Map<String, Object> mapData) {
        return new EventDetailDto(
                "khang-chien-chong-quan-nguyen-1287-1288",
                "khang-chien-chong-quan-nguyen-1287-1288",
                "Kháng chiến chống quân Nguyên 1287–1288",
                "Kháng chiến chống Nguyên",
                "atomic", "military", null,
                1287, 1288, 1288, "1287–1288", "year_range",
                "multi_point", null, null, List.of(), List.of(),
                null, null, 0, 0, "Card summary", "Canonical summary",
                "Detailed narrative", "Significance", List.of(),
                true, true, false, 0, "published", List.of(), List.of(),
                List.of(), List.of(), List.of(), EventRelatedEventsDto.empty(),
                "Textbook content", mapData, null
        );
    }

    @TestConfiguration
    @EnableWebSecurity
    static class EnableSecurity {
    }
}

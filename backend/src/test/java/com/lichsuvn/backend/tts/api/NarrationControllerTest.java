package com.lichsuvn.backend.tts.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.GlobalExceptionHandler;
import com.lichsuvn.backend.common.exception.NotFoundException;
import com.lichsuvn.backend.tts.application.NarrationService;
import com.lichsuvn.backend.tts.application.TtsAudioAssetService;
import com.lichsuvn.backend.tts.application.TtsJobManager;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class NarrationControllerTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final TtsJobManager jobManager = mock(TtsJobManager.class);
    private final NarrationService narrationService = mock(NarrationService.class);
    private final TtsAudioAssetService audioAssetService = mock(TtsAudioAssetService.class);

    @Test
    void assetPostReturns503BeforeCallingAssetServiceWhenFeatureFlagDisabled() throws Exception {
        MockMvc mockMvc = mockMvc(false);

        mockMvc.perform(post("/api/tts/events/event-1/audio")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new VoiceBody("hcm-diemmy"))))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("TTS_ASSET_FLOW_DISABLED"));

        verifyNoInteractions(audioAssetService);
    }

    @Test
    void getMissingAssetReturns404ThroughReadOnlyServiceCall() throws Exception {
        when(audioAssetService.getAsset("missing"))
                .thenThrow(new NotFoundException("TTS_ASSET_NOT_FOUND", "TTS audio asset not found"));
        MockMvc mockMvc = mockMvc(true);

        mockMvc.perform(get("/api/tts/audio-assets/missing"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TTS_ASSET_NOT_FOUND"));

        verify(audioAssetService).getAsset("missing");
    }

    @Test
    void assetPostReturnsClearErrorWhenNarrationExceedsSingleRequestLimit() throws Exception {
        when(audioAssetService.requestAsset(eq("event-1"), org.mockito.ArgumentMatchers.any()))
                .thenThrow(new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "NARRATION_TOO_LONG_FOR_SINGLE_ASSET",
                        "Narration is too long for single-request TTS asset flow"
                ));
        MockMvc mockMvc = mockMvc(true);

        mockMvc.perform(post("/api/tts/events/event-1/audio")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new VoiceBody("hcm-diemmy"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("NARRATION_TOO_LONG_FOR_SINGLE_ASSET"));
    }

    @Test
    void existingGenerateEndpointKeepsAsyncJobContract() throws Exception {
        when(jobManager.createJob(eq("event-1"), eq("Xin chao"), eq("hcm-diemmy"), anyDouble()))
                .thenReturn("job-1");
        MockMvc mockMvc = mockMvc(false);

        mockMvc.perform(post("/api/tts/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "eventId": "event-1",
                                  "text": "Xin chao",
                                  "voice": "hcm-diemmy",
                                  "speed": 1.25
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.jobId").value("job-1"))
                .andExpect(jsonPath("$.data.status").value("processing"));

        verify(jobManager).createJob("event-1", "Xin chao", "hcm-diemmy", 1.25);
    }

    @Test
    void existingGenerateEndpointStillRejectsBlankText() throws Exception {
        MockMvc mockMvc = mockMvc(false);

        mockMvc.perform(post("/api/tts/generate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "eventId": "event-1",
                                  "text": "   "
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("TEXT_EMPTY"));
    }

    @Test
    void existingStatusEndpointKeepsMissingJobContract() throws Exception {
        when(jobManager.getJob("missing")).thenReturn(null);
        MockMvc mockMvc = mockMvc(false);

        mockMvc.perform(get("/api/tts/status/missing"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("JOB_NOT_FOUND"));
    }

    @Test
    void existingAudioEndpointKeepsMp3Contract() throws Exception {
        when(narrationService.getAudioFile("chunk.mp3")).thenReturn(new byte[]{1, 2, 3});
        MockMvc mockMvc = mockMvc(false);

        mockMvc.perform(get("/api/tts/audio/chunk.mp3"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.parseMediaType("audio/mpeg")))
                .andExpect(header().string("Cache-Control", containsString("max-age=3600")))
                .andExpect(content().bytes(new byte[]{1, 2, 3}));
    }

    @Test
    void existingAudioEndpointStillRejectsNonMp3AndMissingFiles() throws Exception {
        when(narrationService.getAudioFile("missing.mp3")).thenReturn(null);
        MockMvc mockMvc = mockMvc(false);

        mockMvc.perform(get("/api/tts/audio/not-audio.txt"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/tts/audio/missing.mp3"))
                .andExpect(status().isNotFound());
    }

    @Test
    void existingVoicesEndpointKeepsListContract() throws Exception {
        when(narrationService.getAvailableVoices()).thenReturn(List.of("hcm-diemmy", "hn-quynhanh"));
        MockMvc mockMvc = mockMvc(false);

        mockMvc.perform(get("/api/tts/voices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data[0]").value("hcm-diemmy"))
                .andExpect(jsonPath("$.data[1]").value("hn-quynhanh"));
    }

    private MockMvc mockMvc(boolean assetFlowEnabled) {
        NarrationController controller = new NarrationController(
                jobManager,
                narrationService,
                audioAssetService,
                assetFlowEnabled
        );
        return MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private record VoiceBody(String voice) {
    }
}

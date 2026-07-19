package com.lichsuvn.backend.tts.api;

import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.tts.api.dto.TtsAudioAssetRequest;
import com.lichsuvn.backend.tts.api.dto.TtsAudioAssetResponse;
import com.lichsuvn.backend.tts.api.dto.TtsGenerateRequest;
import com.lichsuvn.backend.tts.api.dto.TtsJobStatusResponse;
import com.lichsuvn.backend.tts.api.dto.TtsJobStatusResponse.PlaylistData;
import com.lichsuvn.backend.tts.api.dto.TtsJobStatusResponse.PlaylistItem;
import com.lichsuvn.backend.tts.application.NarrationService;
import com.lichsuvn.backend.tts.application.TtsAudioAssetService;
import com.lichsuvn.backend.tts.application.TtsJobManager;
import com.lichsuvn.backend.tts.application.TtsJobManager.TtsJob;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for AI Historical Narration.
 * <p>
 * Endpoints:
 * <ul>
 *   <li>{@code POST /api/tts/generate} — Submit text for narration (async). Returns jobId immediately.</li>
 *   <li>{@code GET /api/tts/status/{jobId}} — Poll job status. Returns playlist when ready.</li>
 *   <li>{@code GET /api/tts/audio/{filename}} — Serve cached audio files (MP3).</li>
 * </ul>
 * <p>
 * Security: These endpoints are public (no auth required) for guest access to narrations.
 */
@RestController
@RequestMapping("/api/tts")
public class NarrationController {

    private static final Logger log = LoggerFactory.getLogger(NarrationController.class);

    private final TtsJobManager jobManager;
    private final NarrationService narrationService;
    private final TtsAudioAssetService audioAssetService;
    private final boolean assetFlowEnabled;

    public NarrationController(
            TtsJobManager jobManager,
            NarrationService narrationService,
            TtsAudioAssetService audioAssetService,
            @Value("${app.tts.asset-flow-enabled:false}") boolean assetFlowEnabled) {
        this.jobManager = jobManager;
        this.narrationService = narrationService;
        this.audioAssetService = audioAssetService;
        this.assetFlowEnabled = assetFlowEnabled;
    }

    @PostMapping("/events/{eventId}/audio")
    public ResponseEntity<ApiResponse<TtsAudioAssetResponse>> requestEventAudio(
            @PathVariable String eventId,
            @RequestBody(required = false) TtsAudioAssetRequest request) {
        if (!assetFlowEnabled) {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "TTS_ASSET_FLOW_DISABLED",
                    "TTS audio asset flow is not enabled yet"
            );
        }

        TtsAudioAssetResponse response = audioAssetService.requestAsset(eventId, request);
        HttpStatus status = "pending".equals(response.status()) ? HttpStatus.ACCEPTED : HttpStatus.OK;
        return ResponseEntity.status(status).body(ApiResponse.ok(response));
    }

    @GetMapping("/audio-assets/{assetId}")
    public ResponseEntity<ApiResponse<TtsAudioAssetResponse>> getAudioAsset(@PathVariable String assetId) {
        return ResponseEntity.ok(ApiResponse.ok(audioAssetService.getAsset(assetId)));
    }

    /**
     * Submit text for AI narration generation.
     * <p>
     * Returns immediately with a jobId. The frontend should poll
     * {@code GET /api/tts/status/{jobId}} to get the audio playlist when ready.
     * <p>
     * The active TTS provider (currently Viettel AI) determines available voices.
     * See {@code /api/tts/voices} for the current list.
     * <p>
     * Speed range: 0.5 (slow) to 2.0 (fast). 1.0 = normal. 0.6–0.8 recommended for narration.
     */
    @SuppressWarnings("unchecked")
    @PostMapping("/generate")
    public ResponseEntity<ApiResponse<TtsJobStatusResponse>> generate(@RequestBody TtsGenerateRequest request) {
        // Validate
        if (request.text() == null || request.text().isBlank()) {
            return ResponseEntity.badRequest()
                    .body((ApiResponse<TtsJobStatusResponse>) (ApiResponse<?>) ApiResponse.error("TEXT_EMPTY", "Nội dung tường thuật không được để trống", null));
        }

        String voice = (request.voice() != null && !request.voice().isBlank()) ? request.voice() : null;
        double speed = (request.speed() != null) ? Math.clamp(request.speed(), 0.5, 2.0) : 1.0;

        String jobId = jobManager.createJob(request.eventId(), request.text(), voice, speed);
        log.info("TTS generate request: eventId={}, textLen={}, voice={}, speed={}, jobId={}",
                request.eventId(), request.text().length(), voice, speed, jobId);

        return ResponseEntity.ok(ApiResponse.ok(
                TtsJobStatusResponse.processing(jobId),
                "Đang tạo giọng đọc. Vui lòng đợi trong giây lát."
        ));
    }

    /**
     * Poll the status of a TTS generation job.
     * <p>
     * Returns "processing" while background generation is running,
     * "done" with the full playlist when ready,
     * or "failed" with an error message on failure.
     */
    @SuppressWarnings("unchecked")
    @GetMapping("/status/{jobId}")
    public ResponseEntity<ApiResponse<TtsJobStatusResponse>> getStatus(@PathVariable String jobId) {
        TtsJob job = jobManager.getJob(jobId);

        if (job == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body((ApiResponse<TtsJobStatusResponse>) (ApiResponse<?>) ApiResponse.error("JOB_NOT_FOUND", "Job không tồn tại hoặc đã hết hạn", null));
        }

        TtsJobStatusResponse response;
        switch (job.status) {
            case "COMPLETED" -> {
                List<PlaylistItem> orderedItems = java.util.stream.IntStream.range(0, job.chunkFilenames.size())
                        .mapToObj(i -> new PlaylistItem(i + 1, "/api/tts/audio/" + job.chunkFilenames.get(i)))
                        .toList();
                var playlistData = new PlaylistData(job.eventId, job.totalChunks, orderedItems);
                response = TtsJobStatusResponse.done(jobId, playlistData);
            }
            case "FAILED" -> {
                response = TtsJobStatusResponse.failed(jobId,
                        job.errorMessage != null ? job.errorMessage : "Lỗi không xác định khi tạo giọng đọc");
            }
            default -> {
                response = TtsJobStatusResponse.processing(jobId);
            }
        }

        return ResponseEntity.ok(ApiResponse.ok(response));
    }

    /**
     * Serve a cached audio file by filename.
     * <p>
     * Files are stored in the server's local cache directory and served as MP3.
     */
    @GetMapping("/audio/{filename:.+}")
    public ResponseEntity<byte[]> getAudio(@PathVariable String filename) {
        // Security: only allow .mp3 files
        if (!filename.endsWith(".mp3")) {
            return ResponseEntity.badRequest().build();
        }

        byte[] audioData = narrationService.getAudioFile(filename);
        if (audioData == null) {
            return ResponseEntity.notFound().build();
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("audio/mpeg"));
        headers.setContentLength(audioData.length);
        // Cache for 1 hour (browsers cache the audio so subsequent plays are instant)
        headers.setCacheControl("public, max-age=3600");

        return ResponseEntity.ok().headers(headers).body(audioData);
    }

    /**
     * List available voices from the active TTS provider.
     */
    @GetMapping("/voices")
    public ResponseEntity<ApiResponse<List<String>>> getVoices() {
        List<String> voices = narrationService.getAvailableVoices();
        return ResponseEntity.ok(ApiResponse.ok(voices));
    }
}

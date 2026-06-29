package com.lichsuvn.backend.tts.api.dto;

import java.util.List;

/**
 * Response for GET /api/tts/status/{jobId} and initial POST /api/tts/generate.
 *
 * When status is "processing", only jobId and status are present.
 * When status is "done", the full playlist with audio URLs is present.
 * When status is "failed", errorMessage is present.
 */
public record TtsJobStatusResponse(
        String jobId,
        String status,
        PlaylistData data,
        String errorMessage
) {
    /** Factory for initial creation response (processing). */
    public static TtsJobStatusResponse processing(String jobId) {
        return new TtsJobStatusResponse(jobId, "processing", null, null);
    }

    /** Factory for completed response (playlist ready). */
    public static TtsJobStatusResponse done(String jobId, PlaylistData data) {
        return new TtsJobStatusResponse(jobId, "done", data, null);
    }

    /** Factory for failed response. */
    public static TtsJobStatusResponse failed(String jobId, String errorMessage) {
        return new TtsJobStatusResponse(jobId, "failed", null, errorMessage);
    }

    public record PlaylistItem(int index, String url) {}

    public record PlaylistData(
            String eventId,
            int totalChunks,
            List<PlaylistItem> items
    ) {}
}

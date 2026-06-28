package com.lichsuvn.backend.tts.api.dto;

/**
 * Request body for POST /api/tts/generate.
 * <p>
 * Voice names are provider-specific. The active TTS provider determines
 * which voices are available. See {@code GET /api/tts/voices} for the
 * current list (or consult the provider's documentation).
 * <p>
 * Current provider: Viettel AI Vietnamese voices include:
 * {@code hcm-diemmy} (Southern female, default), {@code hn-quynhanh} (Northern female), etc.
 *
 * @param eventId ID of the event (used for caching and logging)
 * @param text    The full text content to narrate (will be chunked server-side)
 * @param voice   TTS voice name (provider-specific). If null or blank, the provider's default is used.
 * @param speed   Speaking rate: 0.5 (slow) to 2.0 (fast). 1.0 = normal speed.
 *                0.6–0.8 is recommended for historical narration. If null, 1.0 is used.
 */
public record TtsGenerateRequest(
        String eventId,
        String text,
        String voice,
        Double speed
) {
}

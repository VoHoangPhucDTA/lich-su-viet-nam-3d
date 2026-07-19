package com.lichsuvn.backend.tts.infrastructure;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CloudinaryAudioStorageServiceTest {
    private final CloudinaryAudioStorageService service = new CloudinaryAudioStorageService("", "", "");

    @Test
    void uploadOptionsUseVideoResourceAndDeterministicOverwrite() {
        var options = service.uploadOptions("history_audio/narrations/cache-key");

        assertEquals("video", options.get("resource_type"));
        assertEquals("history_audio/narrations/cache-key", options.get("public_id"));
        assertEquals(true, options.get("overwrite"));
        assertEquals(true, options.get("invalidate"));
        assertEquals(false, options.containsKey("folder"));
    }

    @Test
    void durationIsConvertedFromSecondsToMilliseconds() {
        assertEquals(1234L, service.durationMs(1.234));
        assertEquals(2500L, service.durationMs("2.5"));
    }
}

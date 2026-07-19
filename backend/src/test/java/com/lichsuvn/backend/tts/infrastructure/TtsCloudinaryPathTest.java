package com.lichsuvn.backend.tts.infrastructure;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TtsCloudinaryPathTest {
    @Test
    void buildsSinglePrefixedPublicIds() {
        var path = new TtsCloudinaryPath("narrations", "chunks");
        assertEquals("history_audio/narrations/cache", path.buildNarrationPublicId("cache"));
        assertEquals("history_audio/chunks/chunk", path.buildChunkPublicId("chunk"));
        assertFalse(path.buildNarrationPublicId("cache").contains("history_audio/history_audio"));
        assertFalse(path.buildNarrationPublicId("cache").contains("history_audio/narrations/history_audio"));
    }

    @Test
    void alwaysUsesHistoryAudioAsTheRootFolder() {
        var path = new TtsCloudinaryPath("/narrations/", "/chunks/");
        assertEquals("history_audio/narrations/key", path.buildNarrationPublicId("key"));
        assertEquals("history_audio/chunks/key", path.buildChunkPublicId("key"));
    }
}

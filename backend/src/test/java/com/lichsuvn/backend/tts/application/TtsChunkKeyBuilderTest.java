package com.lichsuvn.backend.tts.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TtsChunkKeyBuilderTest {
    private final TtsChunkKeyBuilder builder = new TtsChunkKeyBuilder(new ObjectMapper());

    @Test
    void keyIsStableAndDoesNotContainStorageFolder() {
        var first = builder.build("Nội dung tiếng Việt", "hcm-diemmy", "v1");
        var second = builder.build("Nội dung tiếng Việt", "hcm-diemmy", "v1");
        assertEquals(first.chunkKey(), second.chunkKey());
        assertEquals(first.canonicalJson(), second.canonicalJson());
        assertTrue(first.canonicalJson().contains("\"synthesisSpeed\":\"1.00\""));
        assertFalse(first.canonicalJson().contains("history_audio"));
    }

    @Test
    void changingChunkingVersionChangesKey() {
        assertNotEquals(builder.build("same", "hcm-diemmy", "v1").chunkKey(),
                builder.build("same", "hcm-diemmy", "v2").chunkKey());
    }
}

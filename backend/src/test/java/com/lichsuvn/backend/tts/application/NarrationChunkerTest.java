package com.lichsuvn.backend.tts.application;

import org.junit.jupiter.api.Test;

import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

class NarrationChunkerTest {
    private final NarrationChunker chunker = new NarrationChunker(18, 20, "v1");

    @Test
    void preservesContentAndKeepsEveryChunkWithinHardLimit() {
        String input = "Một đoạn dài. Đây là câu thứ hai, có tiếng Việt và emoji 🎧. Kết thúc.";
        var chunks = chunker.chunk(input);
        assertFalse(chunks.isEmpty());
        assertTrue(chunks.stream().allMatch(chunk -> chunk.codePointCount(0, chunk.length()) <= 20));
        assertEquals(input.replaceAll("\\s+", " ").trim(), chunks.stream().collect(Collectors.joining(" ")));
    }

    @Test
    void blankInputProducesNoChunks() {
        assertTrue(chunker.chunk("  \n  ").isEmpty());
    }
}

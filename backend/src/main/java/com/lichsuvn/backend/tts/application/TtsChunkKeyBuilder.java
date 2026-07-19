package com.lichsuvn.backend.tts.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

@Service
public class TtsChunkKeyBuilder {
    private final ObjectMapper objectMapper;

    public TtsChunkKeyBuilder(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ChunkKeyData build(String chunkText, String voice, String chunkingVersion) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("chunkText", chunkText);
        node.put("provider", TtsCacheKeyBuilder.PROVIDER);
        node.put("voice", voice);
        node.put("synthesisSpeed", TtsCacheKeyBuilder.SYNTHESIS_SPEED.toPlainString());
        node.put("audioFormat", TtsCacheKeyBuilder.AUDIO_FORMAT);
        node.put("returnOption", TtsCacheKeyBuilder.RETURN_OPTION);
        node.put("withoutFilter", TtsCacheKeyBuilder.WITHOUT_FILTER);
        node.put("textProcessingVersion", TtsCacheKeyBuilder.TEXT_PROCESSING_VERSION);
        node.put("chunkingVersion", chunkingVersion);
        try {
            String json = objectMapper.writeValueAsString(node);
            return new ChunkKeyData(json, sha256(json), sha256(chunkText));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not build TTS chunk key", ex);
        }
    }

    private String sha256(String input) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    public record ChunkKeyData(String canonicalJson, String chunkKey, String textHash) {}
}

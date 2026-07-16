package com.lichsuvn.backend.tts.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

@Service
public class TtsCacheKeyBuilder {
    public static final String PROVIDER = "viettel-ai";
    public static final BigDecimal SYNTHESIS_SPEED = new BigDecimal("1.00");
    public static final String AUDIO_FORMAT = "mp3";
    public static final int RETURN_OPTION = 3;
    public static final boolean WITHOUT_FILTER = false;
    public static final String TEXT_PROCESSING_VERSION = "v1";

    private final ObjectMapper objectMapper;

    public TtsCacheKeyBuilder(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public CacheKeyData build(String eventId, String normalizedText, String voice) {
        String canonicalSpeed = canonicalSpeed(SYNTHESIS_SPEED);
        ObjectNode node = objectMapper.createObjectNode();
        node.put("eventId", eventId);
        node.put("normalizedText", normalizedText);
        node.put("provider", PROVIDER);
        node.put("voice", voice);
        node.put("synthesisSpeed", canonicalSpeed);
        node.put("audioFormat", AUDIO_FORMAT);
        node.put("returnOption", RETURN_OPTION);
        node.put("withoutFilter", WITHOUT_FILTER);
        node.put("textProcessingVersion", TEXT_PROCESSING_VERSION);

        try {
            String canonicalJson = objectMapper.writeValueAsString(node);
            return new CacheKeyData(
                    canonicalJson,
                    sha256(canonicalJson),
                    sha256(normalizedText),
                    canonicalSpeed
            );
        } catch (Exception e) {
            throw new IllegalStateException("Could not build TTS cache key", e);
        }
    }

    public String canonicalSpeed(BigDecimal speed) {
        return speed.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    public record CacheKeyData(
            String canonicalJson,
            String cacheKey,
            String textHash,
            String canonicalSpeed
    ) {
    }
}

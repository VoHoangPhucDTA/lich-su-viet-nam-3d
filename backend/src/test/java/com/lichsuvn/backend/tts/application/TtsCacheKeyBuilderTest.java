package com.lichsuvn.backend.tts.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TtsCacheKeyBuilderTest {
    private final TtsCacheKeyBuilder builder = new TtsCacheKeyBuilder(new ObjectMapper());

    @Test
    void sameInputCreatesSameCacheKey() {
        var first = builder.build("event-1", "Noi dung", "hcm-diemmy");
        var second = builder.build("event-1", "Noi dung", "hcm-diemmy");

        assertEquals(first.cacheKey(), second.cacheKey());
        assertEquals(first.canonicalJson(), second.canonicalJson());
    }

    @Test
    void textChangeCreatesDifferentCacheKey() {
        var first = builder.build("event-1", "Noi dung A", "hcm-diemmy");
        var second = builder.build("event-1", "Noi dung B", "hcm-diemmy");

        assertNotEquals(first.cacheKey(), second.cacheKey());
    }

    @Test
    void voiceChangeCreatesDifferentCacheKey() {
        var first = builder.build("event-1", "Noi dung", "hcm-diemmy");
        var second = builder.build("event-1", "Noi dung", "hn-thanhtung");

        assertNotEquals(first.cacheKey(), second.cacheKey());
    }

    @Test
    void canonicalJsonOrderIsStable() {
        var data = builder.build("event-1", "Noi dung", "hcm-diemmy");

        assertEquals(
                "{\"eventId\":\"event-1\",\"normalizedText\":\"Noi dung\",\"provider\":\"viettel-ai\",\"voice\":\"hcm-diemmy\",\"synthesisSpeed\":\"1.00\",\"audioFormat\":\"mp3\",\"returnOption\":3,\"withoutFilter\":false,\"textProcessingVersion\":\"v1\"}",
                data.canonicalJson()
        );
    }

    @Test
    void speedCanonicalizationIsStable() {
        assertEquals("1.00", builder.canonicalSpeed(new BigDecimal("1")));
        assertEquals("1.00", builder.canonicalSpeed(new BigDecimal("1.0")));
        assertEquals("1.00", builder.canonicalSpeed(new BigDecimal("1.00")));
        assertTrue(builder.build("event", "text", "voice").canonicalJson().contains("\"synthesisSpeed\":\"1.00\""));
    }
}

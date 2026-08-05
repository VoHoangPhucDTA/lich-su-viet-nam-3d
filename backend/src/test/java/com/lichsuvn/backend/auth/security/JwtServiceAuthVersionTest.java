package com.lichsuvn.backend.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtServiceAuthVersionTest {
    private static final String SECRET = "phase-10-test-secret-with-enough-entropy";
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private JwtService service;

    @BeforeEach
    void setUp() {
        service = new JwtService(objectMapper, SECRET, 15, 7);
    }

    @Test
    void newlyMintedAccessAndRefreshTokensContainExactAuthVersion() {
        var access = service.parseAndValidate(
                service.createAccessToken("user-1", "user@example.test", List.of("teacher"), 7),
                "access");
        var refresh = service.parseAndValidate(
                service.createRefreshToken("user-1", "user@example.test", List.of("teacher"), 7),
                "refresh");

        assertEquals(7, access.authVersion());
        assertEquals(7, refresh.authVersion());
    }

    @Test
    void missingAuthVersionIsCompatibleWithVersionZero() throws Exception {
        assertEquals(0, service.parseAndValidate(tokenWithoutAuthVersion("access"), "access")
                .authVersion());
        assertEquals(0, service.parseAndValidate(tokenWithoutAuthVersion("refresh"), "refresh")
                .authVersion());
    }

    @Test
    void malformedNegativeAndOverflowAuthVersionsAreInvalid() throws Exception {
        for (String type : List.of("access", "refresh")) {
            for (Object value : List.of(
                    "1", -1, 1.5d, new java.math.BigInteger("9223372036854775808"))) {
                ApiException error = assertThrows(ApiException.class, () ->
                        service.parseAndValidate(token(type, value), type));
                assertEquals("INVALID_TOKEN", error.getCode());
            }
        }
    }

    @Test
    void genericVerClaimIsNotUsedAsCredentialVersion() throws Exception {
        Map<String, Object> payload = basePayload("access");
        payload.put("ver", 99);
        var claims = service.parseAndValidate(signed(payload), "access");
        assertEquals(0, claims.authVersion());
    }

    private String tokenWithoutAuthVersion(String type) throws Exception {
        return signed(basePayload(type));
    }

    private String token(String type, Object authVersion) throws Exception {
        Map<String, Object> payload = basePayload(type);
        payload.put("auth_ver", authVersion);
        return signed(payload);
    }

    private Map<String, Object> basePayload(String type) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sub", "user-1");
        payload.put("email", "user@example.test");
        payload.put("roles", List.of("student"));
        payload.put("typ", type);
        payload.put("iat", Instant.now().getEpochSecond());
        payload.put("exp", Instant.now().plusSeconds(300).getEpochSecond());
        return payload;
    }

    private String signed(Map<String, Object> payload) throws Exception {
        String header = encode(Map.of("alg", "HS256", "typ", "JWT"));
        String body = encode(payload);
        String signingInput = header + "." + body;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signature = ENCODER.encodeToString(
                mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8)));
        String result = signingInput + "." + signature;
        assertTrue(result.split("\\.").length == 3);
        return result;
    }

    private String encode(Object value) throws Exception {
        return ENCODER.encodeToString(objectMapper.writeValueAsBytes(value));
    }
}

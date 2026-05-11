package com.lichsuvn.backend.auth.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Service
public class JwtService {
    private static final Base64.Encoder B64_ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64_DECODER = Base64.getUrlDecoder();
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final ObjectMapper objectMapper;
    private final byte[] secret;
    private final Duration accessTtl;
    private final Duration refreshTtl;

    public JwtService(
            ObjectMapper objectMapper,
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.access-token-minutes:15}") long accessMinutes,
            @Value("${app.jwt.refresh-token-days:7}") long refreshDays
    ) {
        this.objectMapper = objectMapper;
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.accessTtl = Duration.ofMinutes(accessMinutes);
        this.refreshTtl = Duration.ofDays(refreshDays);
    }

    public String createAccessToken(String userId, String email, List<String> roles) {
        return createToken(userId, email, roles, "access", accessTtl);
    }

    public String createRefreshToken(String userId, String email, List<String> roles) {
        return createToken(userId, email, roles, "refresh", refreshTtl);
    }

    public JwtClaims parseAndValidate(String token, String expectedType) {
        // This app keeps JWT handling self-contained: base64url decode, HMAC verify, then exp/type checks.
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                throw invalidToken();
            }

            String signingInput = parts[0] + "." + parts[1];
            String expectedSignature = sign(signingInput);
            if (!constantTimeEquals(expectedSignature, parts[2])) {
                throw invalidToken();
            }

            Map<String, Object> payload = objectMapper.readValue(
                    B64_DECODER.decode(parts[1]),
                    new TypeReference<>() {
                    }
            );

            String type = stringValue(payload.get("typ"));
            if (!expectedType.equals(type)) {
                throw invalidToken();
            }

            long exp = numberValue(payload.get("exp"));
            Instant expiresAt = Instant.ofEpochSecond(exp);
            if (Instant.now().isAfter(expiresAt)) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "TOKEN_EXPIRED", "Token has expired");
            }

            Object rolesValue = payload.get("roles");
            List<String> roles = rolesValue instanceof List<?> values
                    ? values.stream().map(String::valueOf).toList()
                    : List.of();

            return new JwtClaims(
                    stringValue(payload.get("sub")),
                    stringValue(payload.get("email")),
                    roles,
                    type,
                    expiresAt
            );
        } catch (ApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw invalidToken();
        }
    }

    private String createToken(String userId, String email, List<String> roles, String type, Duration ttl) {
        try {
            // Minimal claims are enough for frontend role routing; fresh user status is still checked server-side.
            Instant now = Instant.now();
            Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
            Map<String, Object> payload = Map.of(
                    "sub", userId,
                    "email", email,
                    "roles", roles,
                    "typ", type,
                    "iat", now.getEpochSecond(),
                    "exp", now.plus(ttl).getEpochSecond()
            );
            String encodedHeader = encodeJson(header);
            String encodedPayload = encodeJson(payload);
            String signingInput = encodedHeader + "." + encodedPayload;
            return signingInput + "." + sign(signingInput);
        } catch (Exception ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "TOKEN_CREATE_FAILED", "Could not create token");
        }
    }

    private String encodeJson(Object value) throws Exception {
        return B64_ENCODER.encodeToString(objectMapper.writeValueAsBytes(value));
    }

    private String sign(String value) throws Exception {
        Mac mac = Mac.getInstance(HMAC_ALGORITHM);
        mac.init(new SecretKeySpec(secret, HMAC_ALGORITHM));
        return B64_ENCODER.encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }

    private boolean constantTimeEquals(String left, String right) {
        byte[] a = left.getBytes(StandardCharsets.UTF_8);
        byte[] b = right.getBytes(StandardCharsets.UTF_8);
        if (a.length != b.length) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        return result == 0;
    }

    private String stringValue(Object value) {
        if (value == null) {
            throw invalidToken();
        }
        return String.valueOf(value);
    }

    private long numberValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        throw invalidToken();
    }

    private ApiException invalidToken() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_TOKEN", "Invalid token");
    }
}

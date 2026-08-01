package com.lichsuvn.backend.exam.ai.application;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;

public final class AiCanarySubjectPseudonymizer {
    private static final String ALGORITHM = "HmacSHA256";

    private AiCanarySubjectPseudonymizer() {
    }

    public static String pseudonymize(String rawUserId, String secret) {
        if (rawUserId == null || rawUserId.isBlank() || secret == null || secret.isBlank()) {
            return null;
        }
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), ALGORITHM));
            byte[] digest = mac.doFinal(rawUserId.trim().getBytes(StandardCharsets.UTF_8));
            return "v1." + Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HMAC pseudonymization is unavailable", ex);
        }
    }
}

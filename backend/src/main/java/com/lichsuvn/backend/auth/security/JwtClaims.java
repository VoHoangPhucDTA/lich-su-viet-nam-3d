package com.lichsuvn.backend.auth.security;

import java.time.Instant;
import java.util.List;

public record JwtClaims(
        String subject,
        String email,
        List<String> roles,
        String tokenType,
        Instant expiresAt
) {
}

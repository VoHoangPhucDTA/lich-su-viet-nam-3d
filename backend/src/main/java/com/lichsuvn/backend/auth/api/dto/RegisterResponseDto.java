package com.lichsuvn.backend.auth.api.dto;

import java.time.Instant;

public record RegisterResponseDto(
        AuthUserDto user,
        String email,
        String status,
        Instant verificationExpiresAt,
        long verificationTtlSeconds,
        String message,
        String devVerificationUrl
) {
}

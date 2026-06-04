package com.lichsuvn.backend.auth.api.dto;

import java.time.Instant;

public record AuthUserDto(
        String id,
        String fullName,
        String email,
        String role,
        String grade,
        String school,
        String avatarUrl,
        Instant createdAt
) {
}

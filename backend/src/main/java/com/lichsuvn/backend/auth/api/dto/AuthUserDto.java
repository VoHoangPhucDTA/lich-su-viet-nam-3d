package com.lichsuvn.backend.auth.api.dto;

import java.time.Instant;
import java.util.List;

public record AuthUserDto(
        String id,
        String fullName,
        String email,
        String role,
        List<String> roles,
        List<String> permissions,
        String grade,
        String school,
        String avatarUrl,
        Instant createdAt
) {
}

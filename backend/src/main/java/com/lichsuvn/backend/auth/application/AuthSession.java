package com.lichsuvn.backend.auth.application;

import com.lichsuvn.backend.auth.api.dto.AuthResponseDto;
import com.lichsuvn.backend.auth.api.dto.AuthUserDto;

/**
 * Internal authentication result. Tokens stay inside the server-side cookie
 * boundary and are never exposed by the public response DTO.
 */
public record AuthSession(
        String accessToken,
        String refreshToken,
        AuthUserDto user
) {
    public AuthResponseDto publicResponse() {
        return new AuthResponseDto(user);
    }
}

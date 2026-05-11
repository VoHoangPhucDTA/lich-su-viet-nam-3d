package com.lichsuvn.backend.auth.api.dto;

public record AuthResponseDto(
        String accessToken,
        String refreshToken,
        AuthUserDto user
) {
}

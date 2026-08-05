package com.lichsuvn.backend.auth.api.dto;

public record CsrfTokenResponse(
        String token,
        String headerName
) {
}

package com.lichsuvn.backend.auth.api.dto;

/**
 * Returned after clicking the email verification link.
 * The first valid click includes auth data so the frontend can sign in immediately.
 */
public record VerifyEmailResponseDto(
        String message,
        AuthResponseDto auth
) {
}

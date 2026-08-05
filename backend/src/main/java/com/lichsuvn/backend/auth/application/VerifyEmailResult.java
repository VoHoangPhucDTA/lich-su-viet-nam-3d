package com.lichsuvn.backend.auth.application;

public record VerifyEmailResult(
        String message,
        AuthSession session
) {
}

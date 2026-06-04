package com.lichsuvn.backend.auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for POST /api/auth/oauth/google.
 * Frontend sends ONLY the id_token from the Google Identity Services SDK.
 * Backend verifies the token independently — no profile fields are accepted from the client.
 */
public record SocialLoginRequest(
        /** Currently only "google" is supported in P1. "facebook" will be added in P2. */
        @NotBlank
        @Pattern(regexp = "^(google|facebook)$", message = "provider must be 'google' or 'facebook'")
        String provider,

        /** id_token (JWT) from Google Identity Services. For Facebook: short-lived access_token. */
        @NotBlank
        @Size(max = 4096)
        String token
) {
}

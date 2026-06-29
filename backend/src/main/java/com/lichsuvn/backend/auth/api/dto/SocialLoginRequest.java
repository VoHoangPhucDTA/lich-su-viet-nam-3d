package com.lichsuvn.backend.auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for POST /api/auth/oauth/google and /api/auth/oauth/facebook.
 * Frontend sends ONLY the identity token from the provider SDK.
 * Backend verifies the token independently — no profile fields are accepted from the client.
 */
public record SocialLoginRequest(
        /** Provider name: "google" for Google OAuth, "facebook" for Facebook OAuth. */
        @NotBlank
        @Pattern(regexp = "^(google|facebook)$", message = "provider must be 'google' or 'facebook'")
        String provider,

        /** id_token (JWT) from Google Identity Services SDK, or short-lived access_token from Facebook Login JS SDK. */
        @NotBlank
        @Size(max = 4096)
        String token
) {
}

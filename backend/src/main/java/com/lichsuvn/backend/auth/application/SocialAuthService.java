package com.lichsuvn.backend.auth.application;

import com.lichsuvn.backend.auth.api.dto.AuthResponseDto;
import com.lichsuvn.backend.auth.domain.RoleEntity;
import com.lichsuvn.backend.auth.domain.UserEntity;
import com.lichsuvn.backend.auth.domain.UserSocialProviderEntity;
import com.lichsuvn.backend.auth.infrastructure.RoleRepository;
import com.lichsuvn.backend.auth.infrastructure.UserRepository;
import com.lichsuvn.backend.auth.infrastructure.UserSocialProviderRepository;
import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.JwtService;
import com.lichsuvn.backend.common.exception.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Handles social-login (OAuth) flows.
 *
 * Security contract:
 *  - Backend NEVER trusts profile data sent by the frontend.
 *  - All identity claims (sub, email, name, picture) are fetched from the provider's
 *    verification endpoint after the token is independently validated.
 *  - Login matrix (see inline comments):
 *      C1: New identity → create user (active, no password) + link provider → JWT
 *      C2: Email exists (local account) → link provider to existing user → JWT
 *      C3: Already linked → look up user via provider row → JWT
 *      C4: Invalid/unverified token → 400 INVALID_SOCIAL_TOKEN
 */
@Service
public class SocialAuthService {

    private static final Logger log = LoggerFactory.getLogger(SocialAuthService.class);

    /**
     * Google's tokeninfo endpoint. Accepts only id_token (JWT from GSI SDK).
     * If the token is expired or malformed, Google returns HTTP 400 automatically.
     */
    private static final String GOOGLE_TOKENINFO_URL =
            "https://oauth2.googleapis.com/tokeninfo?id_token=";

    private static final Set<String> VALID_GOOGLE_ISSUERS =
            Set.of("accounts.google.com", "https://accounts.google.com");

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserSocialProviderRepository socialRepository;
    private final JwtService jwtService;
    private final String googleClientId;
    private final String facebookAppId;
    private final String facebookAppSecret;
    private final String facebookGraphVersion;

    public SocialAuthService(
            UserRepository userRepository,
            RoleRepository roleRepository,
            UserSocialProviderRepository socialRepository,
            JwtService jwtService,
            @Value("${app.oauth.google.client-id:}") String googleClientId,
            @Value("${app.oauth.facebook.app-id:}") String facebookAppId,
            @Value("${app.oauth.facebook.app-secret:}") String facebookAppSecret,
            @Value("${app.oauth.facebook.graph-version:v21.0}") String facebookGraphVersion
    ) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.socialRepository = socialRepository;
        this.jwtService = jwtService;
        this.googleClientId = googleClientId;
        this.facebookAppId = facebookAppId;
        this.facebookAppSecret = facebookAppSecret;
        this.facebookGraphVersion = facebookGraphVersion;
    }

    /**
     * Verify Google id_token independently and return a JWT for the authenticated user.
     *
     * @param idToken the raw id_token from Google Identity Services SDK (frontend).
     * @throws ApiException 400 if the token fails verification or is missing required claims.
     * @throws ApiException 503 if the Google tokeninfo service is unreachable.
     */
    @Transactional
    public AuthResponseDto loginWithGoogle(String idToken) {
        GoogleClaims claims = verifyGoogleIdToken(idToken);
        return processOAuthLogin("google", claims.sub(), claims.email(),
                claims.name(), claims.picture());
    }

    /**
     * Verify Facebook access_token and return a JWT for the authenticated user.
     *
     * Verification flow (2-step, strict):
     *  1. Call Meta debug_token endpoint with app access token (app_id|app_secret).
     *     Validates: is_valid=true, app_id matches ours, token not expired.
     *  2. Only after verification succeeds, call Graph API /me to fetch profile.
     *     Trust only claims from this server-side call — never from frontend.
     *
     * Case D: Facebook does not return email → reject with SOCIAL_EMAIL_REQUIRED.
     * Case E: Invalid/wrong-app/expired token → reject with INVALID_SOCIAL_TOKEN.
     *
     * @param accessToken the short-lived user access_token from Facebook Login JS SDK.
     * @throws ApiException 400 INVALID_SOCIAL_TOKEN if token fails verification.
     * @throws ApiException 400 SOCIAL_EMAIL_REQUIRED if Facebook doesn't provide email.
     * @throws ApiException 503 OAUTH_NOT_CONFIGURED if Facebook credentials are not set.
     */
    @Transactional
    public AuthResponseDto loginWithFacebook(String accessToken) {
        if (facebookAppId == null || facebookAppId.isBlank() ||
                facebookAppSecret == null || facebookAppSecret.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "OAUTH_NOT_CONFIGURED",
                    "Facebook OAuth is not configured on this server. Set APP_AUTH_FACEBOOK_APP_ID and APP_AUTH_FACEBOOK_APP_SECRET.");
        }

        // Step 1: Verify the user token via Meta debug_token (strict verification)
        verifyFacebookAccessToken(accessToken);

        // Step 2: Fetch profile from Graph API (only if token is valid)
        FacebookProfile profile = fetchFacebookProfile(accessToken);

        // Case D: No email from Facebook
        if (profile.email() == null || profile.email().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "SOCIAL_EMAIL_REQUIRED",
                    "Facebook account does not provide an email address. " +
                    "Please ensure your Facebook account has a verified email, or use email/password login.");
        }

        return processOAuthLogin("facebook", profile.id(), profile.email(),
                profile.name(), profile.pictureUrl());
    }

    // ── Facebook Token Verification ───────────────────────────────────────

    /**
     * Call Meta's debug_token endpoint to verify the user access token.
     * Uses app access token (app_id|app_secret) as the verification credential.
     * Checks: is_valid, app_id match, token not expired.
     */
    @SuppressWarnings("unchecked")
    private void verifyFacebookAccessToken(String userAccessToken) {
        // App access token format: app_id|app_secret (never exposed to client)
        String appAccessToken = facebookAppId + "|" + facebookAppSecret;

        String debugUrl = UriComponentsBuilder
                .fromUriString("https://graph.facebook.com/debug_token")
                .queryParam("input_token", userAccessToken)
                .queryParam("access_token", appAccessToken)
                .toUriString();

        // Facebook debug_token returns Content-Type: text/javascript — receive as String
        // then parse manually to avoid HttpMessageConverter mismatch.
        Map<String, Object> response;
        try {
            String raw = RestClient.create()
                    .get()
                    .uri(debugUrl)
                    .retrieve()
                    .body(String.class);
            response = new ObjectMapper().readValue(raw, new TypeReference<>() {});
        } catch (RestClientException ex) {
            log.warn("Facebook debug_token call failed: {}", ex.getMessage());
            throw invalidFacebookToken();
        } catch (Exception ex) {
            log.warn("Facebook debug_token JSON parse failed: {}", ex.getMessage());
            throw invalidFacebookToken();
        }

        if (response == null) {
            throw invalidFacebookToken();
        }

        // Meta wraps debug_token response in a "data" object
        Object dataObj = response.get("data");
        if (!(dataObj instanceof Map<?, ?> rawData)) {
            throw invalidFacebookToken();
        }
        Map<String, Object> data = (Map<String, Object>) rawData;

        // Check is_valid
        Object isValid = data.get("is_valid");
        if (!Boolean.TRUE.equals(isValid)) {
            log.warn("Facebook token debug_token is_valid=false");
            throw invalidFacebookToken();
        }

        // Check app_id matches our configured app (prevents token substitution)
        String tokenAppId = String.valueOf(data.getOrDefault("app_id", ""));
        if (!facebookAppId.equals(tokenAppId)) {
            log.warn("Facebook token app_id mismatch: expected={} got={}", facebookAppId, tokenAppId);
            throw invalidFacebookToken();
        }

        // Check token expiry (expires_at is a Unix timestamp; 0 means never, which is fine for long-lived tokens)
        Object expiresAtObj = data.get("expires_at");
        if (expiresAtObj instanceof Number expiresAt) {
            long expiresAtSec = expiresAt.longValue();
            if (expiresAtSec != 0 && expiresAtSec < System.currentTimeMillis() / 1000L) {
                log.warn("Facebook token expired at {}", expiresAtSec);
                throw invalidFacebookToken();
            }
        }

        log.debug("Facebook token verified successfully via debug_token app_id={}", facebookAppId);
    }

    /**
     * Fetch basic profile from Graph API /me.
     * Only called after verifyFacebookAccessToken() succeeds.
     * We request id, name, email, and picture fields.
     */
    @SuppressWarnings("unchecked")
    private FacebookProfile fetchFacebookProfile(String userAccessToken) {
        String profileUrl = UriComponentsBuilder
                .fromUriString("https://graph.facebook.com/" + facebookGraphVersion + "/me")
                .queryParam("fields", "id,name,email,picture.type(large)")
                .queryParam("access_token", userAccessToken)
                .toUriString();

        // Graph API /me also sometimes returns text/javascript — parse as String for safety.
        Map<String, Object> data;
        try {
            String raw = RestClient.create()
                    .get()
                    .uri(profileUrl)
                    .retrieve()
                    .body(String.class);
            data = new ObjectMapper().readValue(raw, new TypeReference<>() {});
        } catch (RestClientException ex) {
            log.warn("Facebook /me call failed: {}", ex.getMessage());
            throw invalidFacebookToken();
        } catch (Exception ex) {
            log.warn("Facebook /me JSON parse failed: {}", ex.getMessage());
            throw invalidFacebookToken();
        }

        if (data == null) {
            throw invalidFacebookToken();
        }

        String id = (String) data.get("id");
        if (id == null || id.isBlank()) {
            throw invalidFacebookToken();
        }

        String name = (String) data.getOrDefault("name", null);
        String email = (String) data.getOrDefault("email", null);
        if (email != null) {
            email = email.toLowerCase().trim();
        }

        // Extract picture URL from nested structure: picture.data.url
        String pictureUrl = null;
        Object pictureObj = data.get("picture");
        if (pictureObj instanceof Map<?, ?> pictureMap) {
            Object pictureData = pictureMap.get("data");
            if (pictureData instanceof Map<?, ?> pictureDataMap) {
                Object url = pictureDataMap.get("url");
                if (url instanceof String s && !s.isBlank()) {
                    pictureUrl = s;
                }
            }
        }

        return new FacebookProfile(id, name, email, pictureUrl);
    }

    private ApiException invalidFacebookToken() {
        return new ApiException(HttpStatus.BAD_REQUEST,
                "INVALID_SOCIAL_TOKEN", "Facebook token is invalid, expired, or belongs to a different app.");
    }

    // ── Internal record for verified Facebook claims ──────────────────────

    private record FacebookProfile(String id, String name, String email, String pictureUrl) {}

    // ── Token Verification ────────────────────────────────────────────────

    /**
     * Call Google's tokeninfo endpoint to verify the id_token.
     * Validates: aud (must match configured client_id), iss, email_verified, email, sub.
     * Google rejects expired tokens automatically (HTTP 400).
     */
    @SuppressWarnings("unchecked")
    private GoogleClaims verifyGoogleIdToken(String idToken) {
        if (googleClientId == null || googleClientId.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "OAUTH_NOT_CONFIGURED",
                    "Google OAuth is not configured on this server. Set APP_AUTH_GOOGLE_CLIENT_ID.");
        }

        Map<String, Object> payload;
        try {
            payload = RestClient.create()
                    .get()
                    .uri(GOOGLE_TOKENINFO_URL + idToken)
                    .retrieve()
                    .body(Map.class);
        } catch (RestClientException ex) {
            log.warn("Google tokeninfo call failed: {}", ex.getMessage());
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "INVALID_SOCIAL_TOKEN", "Google token verification failed.");
        }

        if (payload == null) {
            throw invalidToken();
        }

        // ── Verify aud (audience) ─────────────────────────────────────────
        // Protects against token substitution: token issued for another app cannot be used here.
        String aud = stringField(payload, "aud");
        if (!googleClientId.equals(aud)) {
            log.warn("Google token aud mismatch: expected={} got={}", googleClientId, aud);
            throw invalidToken();
        }

        // ── Verify iss (issuer) ───────────────────────────────────────────
        String iss = stringField(payload, "iss");
        if (!VALID_GOOGLE_ISSUERS.contains(iss)) {
            log.warn("Google token invalid iss: {}", iss);
            throw invalidToken();
        }

        // ── Verify email_verified ─────────────────────────────────────────
        // C4: unverified email → reject (could be someone squatting a Google account with fake email)
        String emailVerified = stringField(payload, "email_verified");
        if (!"true".equalsIgnoreCase(emailVerified)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "SOCIAL_EMAIL_NOT_VERIFIED",
                    "Google account email is not verified. Please verify your Google email first.");
        }

        // ── Verify required identity claims ──────────────────────────────
        String sub = stringField(payload, "sub");
        String email = stringField(payload, "email");
        if (sub == null || sub.isBlank() || email == null || email.isBlank()) {
            throw invalidToken();
        }

        String name = (String) payload.getOrDefault("name", null);
        String picture = (String) payload.getOrDefault("picture", null);

        return new GoogleClaims(sub, email.toLowerCase().trim(), name, picture);
    }

    // ── OAuth Login Matrix ────────────────────────────────────────────────

    private AuthResponseDto processOAuthLogin(
            String provider, String providerId,
            String email, String displayName, String avatarUrl) {

        // C3: Already linked — fast path
        Optional<UserSocialProviderEntity> existingLink =
                socialRepository.findByProviderAndProviderId(provider, providerId);
        if (existingLink.isPresent()) {
            UserEntity user = existingLink.get().getUser();
            guardAccountStatus(user, provider);
            log.info("Social login C3 (already linked): provider={} userId={}", provider,
                    UuidBytes.toString(user.getId()));
            return toAuthResponse(user);
        }

        // C2: Email already registered (local account) — auto-merge
        Optional<UserEntity> existingByEmail = userRepository.findByEmail(email);
        if (existingByEmail.isPresent()) {
            UserEntity user = existingByEmail.get();
            guardAccountStatus(user, provider);
            // Case B: pending user (email not yet verified) → promote to active
            // because social provider already verified their email identity.
            if ("pending".equals(user.getStatus())) {
                user.setStatus("active");
                user.setEmailVerifiedAt(java.time.Instant.now());
                log.info("Social login C2 (pending->active via social): provider={} email={} userId={}",
                        provider, email, UuidBytes.toString(user.getId()));
            }
            linkProvider(user, provider, providerId, email, displayName, avatarUrl);
            // Update avatarUrl if the local account has none
            if ((user.getAvatarUrl() == null || user.getAvatarUrl().isBlank())
                    && avatarUrl != null && !avatarUrl.isBlank()) {
                user.setAvatarUrl(avatarUrl);
            }
            log.info("Social login C2 (email merge): provider={} email={} userId={}", provider,
                    email, UuidBytes.toString(user.getId()));
            return toAuthResponse(user);
        }

        // C1: Brand new user — create active account (no password needed)
        UserEntity newUser = createSocialUser(email, displayName, avatarUrl);
        linkProvider(newUser, provider, providerId, email, displayName, avatarUrl);
        log.info("Social login C1 (new user): provider={} email={} userId={}", provider,
                email, UuidBytes.toString(newUser.getId()));
        return toAuthResponse(newUser);
    }

    /**
     * Guard: reject disabled users before linking/merging.
     * Case B-extended: disabled accounts cannot log in via social.
     */
    private void guardAccountStatus(UserEntity user, String provider) {
        if ("disabled".equals(user.getStatus())) {
            log.warn("Social login rejected — account disabled: provider={} userId={}",
                    provider, UuidBytes.toString(user.getId()));
            throw new ApiException(HttpStatus.FORBIDDEN,
                    "ACCOUNT_DISABLED",
                    "This account has been disabled. Please contact support.");
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private UserEntity createSocialUser(String email, String displayName, String avatarUrl) {
        RoleEntity studentRole = roleRepository.findByCode("student")
                .orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "ROLE_SEED_MISSING", "Student role seed is missing"));

        UserEntity user = new UserEntity();
        user.setId(UuidBytes.fromUuid(UUID.randomUUID()));
        user.setEmail(email);
        // No password for social-only accounts; V10 allows NULL
        user.setPasswordHash(null);
        user.setFullName(resolveDisplayName(email, displayName));
        user.setAvatarUrl(avatarUrl);
        // Social accounts are immediately active — provider already verified the email
        user.setStatus("active");
        user.setRoles(Set.of(studentRole));
        return userRepository.save(user);
    }

    private void linkProvider(UserEntity user, String provider, String providerId,
                               String email, String displayName, String avatarUrl) {
        UserSocialProviderEntity link = new UserSocialProviderEntity();
        link.setUser(user);
        link.setProvider(provider);
        link.setProviderId(providerId);
        link.setEmail(email);
        link.setDisplayName(displayName);
        link.setAvatarUrl(avatarUrl);
        socialRepository.save(link);
    }

    private AuthResponseDto toAuthResponse(UserEntity user) {
        List<String> roles = user.getRoles().stream()
                .map(r -> r.getCode())
                .sorted()
                .toList();
        return new AuthResponseDto(
                jwtService.createAccessToken(UuidBytes.toString(user.getId()), user.getEmail(), roles),
                jwtService.createRefreshToken(UuidBytes.toString(user.getId()), user.getEmail(), roles),
                user.toDto()
        );
    }

    private String resolveDisplayName(String email, String displayName) {
        if (displayName != null && !displayName.isBlank()) {
            return displayName.trim();
        }
        int at = email.indexOf('@');
        return at > 0 ? email.substring(0, at) : "student";
    }

    private String stringField(Map<String, Object> map, String key) {
        Object val = map.get(key);
        return val instanceof String s ? s : null;
    }

    private ApiException invalidToken() {
        return new ApiException(HttpStatus.BAD_REQUEST,
                "INVALID_SOCIAL_TOKEN", "Social token is invalid or has expired.");
    }

    // ── Internal record for verified Google claims ────────────────────────

    private record GoogleClaims(String sub, String email, String name, String picture) {}

    // ── processOAuthLogin account-status guard ────────────────────────────
    // Case B-extended: if user is disabled/locked, reject before linking
    // Note: processOAuthLogin already handles C1/C2/C3 merge logic.
    // The guard below extends Case B to reject disabled users.
}

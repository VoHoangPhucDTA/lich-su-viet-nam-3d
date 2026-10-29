package com.lichsuvn.backend.auth.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AuthCookiePolicyTest {

    @Test
    void localDevelopmentKeepsLaxNonSecureCookies() {
        AuthCookiePolicy policy = AuthCookiePolicy.resolve(
                "http://localhost:5173,http://127.0.0.1:5173", "", "");

        assertEquals("Lax", policy.sameSite());
        assertFalse(policy.secure());
        assertFalse(policy.crossSiteDeployment());
    }

    @Test
    void httpsAllowedOriginDerivesNoneSecureCookies() {
        AuthCookiePolicy policy = AuthCookiePolicy.resolve(
                "https://relaxed-torte-7d1eca.netlify.app", "", "");

        assertEquals("None", policy.sameSite());
        assertTrue(policy.secure());
        assertTrue(policy.crossSiteDeployment());
    }

    @Test
    void anyHttpsOriginMarksTheDeploymentCrossSite() {
        AuthCookiePolicy policy = AuthCookiePolicy.resolve(
                "http://localhost:5173, https://relaxed-torte-7d1eca.netlify.app", "", "");

        assertTrue(policy.crossSiteDeployment());
        assertEquals("None", policy.sameSite());
        assertTrue(policy.secure());
    }

    @Test
    void explicitSameSiteWinsOverTheDerivedValue() {
        AuthCookiePolicy strict = AuthCookiePolicy.resolve(
                "https://relaxed-torte-7d1eca.netlify.app", "", "Strict");
        assertEquals("Strict", strict.sameSite());
        assertFalse(strict.secure());

        AuthCookiePolicy lax = AuthCookiePolicy.resolve(
                "http://localhost:5173", "", "lax");
        assertEquals("Lax", lax.sameSite());
    }

    @Test
    void explicitSecureWinsOverTheDerivedValue() {
        AuthCookiePolicy policy = AuthCookiePolicy.resolve("http://localhost:5173", "true", "");

        assertTrue(policy.secure());
        assertEquals("Lax", policy.sameSite());
    }

    @Test
    void explicitNoneWithoutSecureSettingStillGetsSecure() {
        AuthCookiePolicy policy = AuthCookiePolicy.resolve("http://localhost:5173", "", "None");

        assertEquals("None", policy.sameSite());
        assertTrue(policy.secure());
    }

    @Test
    void sameSiteNoneWithExplicitInsecureFailsFast() {
        // Browsers drop SameSite=None cookies that are not Secure, which is
        // exactly the silent cross-site login/CSRF failure we must not ship.
        assertThrows(IllegalStateException.class, () -> AuthCookiePolicy.resolve(
                "https://relaxed-torte-7d1eca.netlify.app", "false", "None"));
    }

    @Test
    void unsupportedSameSiteValueIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> AuthCookiePolicy.resolve(
                "http://localhost:5173", "", "SameSite"));
    }

    @Test
    void wildcardOriginIsNeverTreatedAsAnHttpsOrigin() {
        // A wildcard can only appear with credentials when CORS itself rejects
        // it (SecurityConfig), and it must not silently flip the cookie policy.
        AuthCookiePolicy policy = AuthCookiePolicy.resolve("*", "", "");

        assertEquals("Lax", policy.sameSite());
        assertFalse(policy.secure());
        assertFalse(policy.crossSiteDeployment());
    }

    @Test
    void blankConfigurationIsTreatedAsAuto() {
        AuthCookiePolicy policy = AuthCookiePolicy.resolve(null, null, null);

        assertEquals("Lax", policy.sameSite());
        assertFalse(policy.secure());
    }
}

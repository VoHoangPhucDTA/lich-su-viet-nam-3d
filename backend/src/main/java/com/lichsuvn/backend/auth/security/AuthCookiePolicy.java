package com.lichsuvn.backend.auth.security;

import java.util.Arrays;
import java.util.List;

/**
 * SameSite/Secure policy shared by every cookie the SPA has to receive:
 * the {@code CSRF-TOKEN} double-submit cookie, {@code access_token} and
 * {@code refresh_token}.
 *
 * <p>Production serves the SPA from {@code https://relaxed-torte-7d1eca.netlify.app}
 * and the API from {@code https://lich-su-viet-nam-3d.onrender.com}: two different
 * sites. A cookie issued with {@code SameSite=Lax} is <em>not</em> attached to the
 * cross-site {@code fetch()} the SPA issues, so Spring Security's
 * {@code CookieCsrfTokenRepository.loadToken()} finds no cookie, returns {@code null}
 * and every state-changing request fails with {@code CSRF token is missing or invalid}.
 * CORS never changes that — CORS decides what the browser may <em>read</em>, SameSite
 * decides what the browser may <em>send</em>.</p>
 *
 * <p>Resolution rules:</p>
 * <ul>
 *   <li>{@code app.cookie.same-site} set explicitly ({@code Lax}/{@code Strict}/{@code None}) wins.</li>
 *   <li>Otherwise, when at least one origin in {@code app.allowed-origins} is HTTPS —
 *       i.e. the SPA is deployed as its own site — cookies are issued
 *       {@code SameSite=None; Secure}, which browsers do send cross-site.</li>
 *   <li>Otherwise (local development through the Vite proxy, same site) cookies stay
 *       {@code SameSite=Lax; Secure=false}.</li>
 *   <li>{@code app.cookie.secure} set explicitly wins over the derived value.</li>
 * </ul>
 *
 * <p>{@code SameSite=None} without {@code Secure} is rejected at startup: browsers drop
 * such cookies, which is exactly the failure this class exists to prevent.</p>
 */
public final class AuthCookiePolicy {

    /** Value that means "derive the attribute instead of forcing one". */
    public static final String AUTO = "auto";

    private final boolean secure;
    private final String sameSite;
    private final boolean crossSiteDeployment;

    private AuthCookiePolicy(boolean secure, String sameSite, boolean crossSiteDeployment) {
        this.secure = secure;
        this.sameSite = sameSite;
        this.crossSiteDeployment = crossSiteDeployment;
    }

    /**
     * @param allowedOriginsRaw comma separated {@code app.allowed-origins} value
     * @param secureSetting     {@code app.cookie.secure}: blank/{@code auto} to derive, otherwise {@code true}/{@code false}
     * @param sameSiteSetting   {@code app.cookie.same-site}: blank/{@code auto} to derive, otherwise {@code Lax}/{@code Strict}/{@code None}
     * @throws IllegalStateException if {@code SameSite=None} is combined with {@code Secure=false}
     * @throws IllegalArgumentException if an explicit attribute value is not supported
     */
    public static AuthCookiePolicy resolve(String allowedOriginsRaw, String secureSetting, String sameSiteSetting) {
        boolean crossSiteDeployment = hasHttpsOrigin(allowedOriginsRaw);

        String sameSite = normalizeSameSite(sameSiteSetting);
        if (sameSite == null) {
            sameSite = crossSiteDeployment ? "None" : "Lax";
        }

        boolean secure;
        if (isAuto(secureSetting)) {
            // Browsers refuse SameSite=None cookies that are not Secure, so the
            // cross-site deployment must always be paired with Secure.
            secure = "None".equalsIgnoreCase(sameSite);
        } else {
            secure = Boolean.parseBoolean(secureSetting.trim());
        }

        if ("None".equalsIgnoreCase(sameSite) && !secure) {
            throw new IllegalStateException(
                    "app.cookie.secure must be true when app.cookie.same-site is None: "
                            + "browsers drop SameSite=None cookies that are not Secure");
        }

        return new AuthCookiePolicy(secure, sameSite, crossSiteDeployment);
    }

    /** Whether cookies must be marked {@code Secure} (HTTPS-only). */
    public boolean secure() {
        return secure;
    }

    /** {@code Lax}, {@code Strict} or {@code None}. */
    public String sameSite() {
        return sameSite;
    }

    /** True when the SPA is deployed on its own HTTPS site (cross-site API calls). */
    public boolean crossSiteDeployment() {
        return crossSiteDeployment;
    }

    private static boolean hasHttpsOrigin(String allowedOriginsRaw) {
        if (allowedOriginsRaw == null || allowedOriginsRaw.isBlank()) {
            return false;
        }
        List<String> origins = Arrays.stream(allowedOriginsRaw.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
        return origins.stream().anyMatch(origin -> origin.regionMatches(true, 0, "https://", 0, 8));
    }

    private static String normalizeSameSite(String setting) {
        if (isAuto(setting)) {
            return null;
        }
        String value = setting.trim();
        if ("lax".equalsIgnoreCase(value) || "strict".equalsIgnoreCase(value) || "none".equalsIgnoreCase(value)) {
            return canonicalSameSite(value);
        }
        throw new IllegalArgumentException(
                "app.cookie.same-site must be one of Lax, Strict, None or " + AUTO + " but was: " + setting);
    }

    private static String canonicalSameSite(String value) {
        if ("strict".equalsIgnoreCase(value)) {
            return "Strict";
        }
        if ("none".equalsIgnoreCase(value)) {
            return "None";
        }
        return "Lax";
    }

    private static boolean isAuto(String setting) {
        return setting == null || setting.isBlank() || AUTO.equalsIgnoreCase(setting.trim());
    }
}

package com.lichsuvn.backend.common.storage;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.cloudinary.utils.ObjectUtils;
import com.lichsuvn.backend.common.exception.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;

/**
 * Single source of truth for Cloudinary avatar operations.
 * <p>
 * All user avatars — whether from Google/Facebook OAuth, email registration,
 * or manual profile upload — pass through this service before being stored
 * in the database as Cloudinary secure_url references.
 */
@Service
public class CloudinaryService {

    private static final Logger log = LoggerFactory.getLogger(CloudinaryService.class);

    private static final String AVATAR_FOLDER = "avatars";
    private static final String DEFAULT_AVATAR_PUBLIC_ID = "avatars/default_avatar";

    private final Cloudinary cloudinary;
    private final boolean cloudinaryConfigured;
    private final String defaultAvatarUrl;

    public CloudinaryService(
            @Value("${app.cloudinary.cloud-name:}") String cloudName,
            @Value("${app.cloudinary.api-key:}") String apiKey,
            @Value("${app.cloudinary.api-secret:}") String apiSecret,
            @Value("${app.cloudinary.default-avatar:}") String defaultAvatarUrl) {

        boolean configured = !cloudName.isBlank() && !apiKey.isBlank() && !apiSecret.isBlank();
        this.cloudinaryConfigured = configured;
        this.defaultAvatarUrl = defaultAvatarUrl;

        if (configured) {
            this.cloudinary = new Cloudinary(ObjectUtils.asMap(
                    "cloud_name", cloudName,
                    "api_key", apiKey,
                    "api_secret", apiSecret,
                    "secure", true
            ));
            log.info("Cloudinary storage initialized");
        } else {
            this.cloudinary = null;
            log.warn("Cloudinary not configured — avatar uploads will be skipped");
        }
    }

    public boolean isConfigured() {
        return cloudinaryConfigured;
    }

    /**
     * Get the default avatar URL — either a configured Cloudinary-hosted default, or empty string.
     * Returns empty string (not a broken 404 URL) when no default is configured,
     * allowing callers to decide fallback behavior.
     */
    public String getDefaultAvatarUrl() {
        if (defaultAvatarUrl != null && !defaultAvatarUrl.isBlank()) {
            return defaultAvatarUrl;
        }
        return "";
    }

    /**
     * Upload an avatar image from an external URL (Google/Facebook) to Cloudinary.
     *
     * @param sourceUrl  The source image URL to download and upload.
     * @param userEmail  Used as part of the public_id for uniqueness.
     * @return The secure Cloudinary URL, or the original sourceUrl if Cloudinary is not configured.
     */
    public String uploadFromUrl(String sourceUrl, String userEmail) {
        if (!cloudinaryConfigured || sourceUrl == null || sourceUrl.isBlank()) {
            return sourceUrl;
        }

        try {
            String publicId = AVATAR_FOLDER + "/" + sanitizePublicId(userEmail) + "_" + System.currentTimeMillis();

            Uploader uploader = cloudinary.uploader();
            Map<?, ?> result = uploader.upload(sourceUrl, ObjectUtils.asMap(
                    "public_id", publicId,
                    "folder", AVATAR_FOLDER,
                    "overwrite", true,
                    "resource_type", "image",
                    "transformation", "c_fill,g_face,w_256,h_256"
            ));

            String secureUrl = (String) result.get("secure_url");
            log.info("Avatar upload completed");
            return secureUrl;

        } catch (IOException e) {
            log.error("Avatar URL upload failed errorType={}", e.getClass().getSimpleName());
            return sourceUrl; // Fallback to original URL
        }
    }

    /**
     * Upload an avatar image from raw byte data (e.g., from file upload).
     *
     * @param imageData Raw image bytes to upload.
     * @param userEmail Used as part of the public_id for uniqueness.
     * @return The secure Cloudinary URL.
     * @throws ApiException if Cloudinary upload fails.
     */
    public String uploadFromBytes(byte[] imageData, String userEmail) {
        if (!cloudinaryConfigured) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "CLOUDINARY_NOT_CONFIGURED",
                    "Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.");
        }

        try {
            String publicId = AVATAR_FOLDER + "/" + sanitizePublicId(userEmail) + "_" + System.currentTimeMillis();

            Uploader uploader = cloudinary.uploader();
            Map<?, ?> result = uploader.upload(imageData, ObjectUtils.asMap(
                    "public_id", publicId,
                    "folder", AVATAR_FOLDER,
                    "overwrite", true,
                    "resource_type", "image",
                    "transformation", "c_fill,g_face,w_256,h_256"
            ));

            String secureUrl = (String) result.get("secure_url");
            log.info("Avatar byte upload completed");
            return secureUrl;

        } catch (IOException e) {
            log.error("Avatar byte upload failed errorType={}", e.getClass().getSimpleName());
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "AVATAR_UPLOAD_FAILED",
                    "Could not upload avatar image. Please try again.");
        }
    }

    /**
     * Delete an existing avatar from Cloudinary.
     *
     * @param cloudinaryUrl The secure_url to delete (extracts public_id).
     */
    public void deleteAvatar(String cloudinaryUrl) {
        if (!cloudinaryConfigured || cloudinaryUrl == null || cloudinaryUrl.isBlank()) {
            return;
        }
        // Only delete if it's a Cloudinary URL
        if (!cloudinaryUrl.contains("cloudinary.com")) {
            return;
        }

        try {
            // Extract public_id from URL
            // Format: https://res.cloudinary.com/.../image/upload/v1234567/avatars/xxx.jpg
            String publicId = extractPublicId(cloudinaryUrl);
            if (publicId == null) return;

            Uploader uploader = cloudinary.uploader();
            uploader.destroy(publicId, ObjectUtils.emptyMap());
            log.info("Avatar deletion completed");
        } catch (IOException e) {
            log.warn("Avatar deletion failed errorType={}", e.getClass().getSimpleName());
        }
    }

    /**
     * Check if a URL is a Cloudinary URL.
     */
    public boolean isCloudinaryUrl(String url) {
        return url != null && url.contains("cloudinary.com");
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private String sanitizePublicId(String email) {
        return email.replaceAll("[^a-zA-Z0-9_-]", "_").toLowerCase();
    }

    private String extractPublicId(String cloudinaryUrl) {
        try {
            // Format: .../upload/v1234567/avatars/filename
            String uploadMarker = "/upload/";
            int uploadIdx = cloudinaryUrl.indexOf(uploadMarker);
            if (uploadIdx < 0) return null;

            String afterUpload = cloudinaryUrl.substring(uploadIdx + uploadMarker.length());
            // Skip version prefix like v1234567/
            int versionEnd = afterUpload.indexOf('/');
            if (versionEnd < 0) return null;

            String publicIdWithExt = afterUpload.substring(versionEnd + 1);
            // Remove file extension
            int extDot = publicIdWithExt.lastIndexOf('.');
            return extDot > 0 ? publicIdWithExt.substring(0, extDot) : publicIdWithExt;
        } catch (Exception e) {
            log.warn("Cloudinary public ID extraction failed errorType={}",
                    e.getClass().getSimpleName());
            return null;
        }
    }
}

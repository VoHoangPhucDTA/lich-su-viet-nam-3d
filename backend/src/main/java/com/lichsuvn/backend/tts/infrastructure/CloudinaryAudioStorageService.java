package com.lichsuvn.backend.tts.infrastructure;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.cloudinary.utils.ObjectUtils;
import com.lichsuvn.backend.tts.application.AudioStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

@Service
public class CloudinaryAudioStorageService implements AudioStorageService {
    private static final Logger log = LoggerFactory.getLogger(CloudinaryAudioStorageService.class);

    private final Cloudinary cloudinary;
    private final boolean configured;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public CloudinaryAudioStorageService(
            @Value("${app.cloudinary.cloud-name:}") String cloudName,
            @Value("${app.cloudinary.api-key:}") String apiKey,
            @Value("${app.cloudinary.api-secret:}") String apiSecret
    ) {
        this.configured = cloudName != null && !cloudName.isBlank()
                && apiKey != null && !apiKey.isBlank()
                && apiSecret != null && !apiSecret.isBlank();
        this.cloudinary = configured
                ? new Cloudinary(ObjectUtils.asMap(
                        "cloud_name", cloudName,
                        "api_key", apiKey,
                        "api_secret", apiSecret,
                        "secure", true
                ))
                : null;
        if (configured) {
            log.info("Cloudinary audio storage initialized with cloud_name={}", cloudName);
        } else {
            log.warn("Cloudinary audio storage is not configured");
        }
    }

    @Override
    public boolean isConfigured() {
        return configured;
    }

    @Override
    public StoredAudio upload(byte[] audioBytes, String publicId, String mimeType) throws Exception {
        if (!configured) {
            throw new IllegalStateException("Cloudinary audio storage is not configured");
        }
        Uploader uploader = cloudinary.uploader();
        Map<?, ?> result = uploader.upload(audioBytes, uploadOptions(publicId));

        String secureUrl = stringValue(result.get("secure_url"));
        String storedPublicId = stringValue(result.get("public_id"));
        Long fileSize = longValue(result.get("bytes"));
        Long durationMs = durationMs(result.get("duration"));

        return new StoredAudio(
                "cloudinary",
                storedPublicId == null || storedPublicId.isBlank() ? publicId : storedPublicId,
                secureUrl,
                mimeType,
                fileSize,
                durationMs
        );
    }

    @Override
    public byte[] download(String audioUrl) throws Exception {
        if (audioUrl == null || audioUrl.isBlank()) {
            throw new IllegalArgumentException("Audio URL is blank");
        }
        HttpResponse<byte[]> response = httpClient.send(
                HttpRequest.newBuilder(URI.create(audioUrl)).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Audio download failed with HTTP " + response.statusCode());
        }
        return response.body();
    }

    @Override
    public void delete(String publicId) throws Exception {
        if (!configured) {
            throw new IllegalStateException("Cloudinary audio storage is not configured");
        }
        cloudinary.uploader().destroy(publicId, ObjectUtils.asMap(
                "resource_type", "video",
                "invalidate", true
        ));
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> uploadOptions(String publicId) {
        return (Map<String, Object>) ObjectUtils.asMap(
                "resource_type", "video",
                "public_id", publicId,
                "overwrite", true,
                "invalidate", true
        );
    }

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    Long durationMs(Object value) {
        if (value instanceof Number number) {
            return Math.round(number.doubleValue() * 1000);
        }
        if (value == null) {
            return null;
        }
        try {
            return Math.round(Double.parseDouble(String.valueOf(value)) * 1000);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}

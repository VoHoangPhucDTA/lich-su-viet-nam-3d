package com.lichsuvn.backend.admin.infrastructure;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.cloudinary.strategies.AbstractUploaderStrategy;
import com.cloudinary.utils.ObjectUtils;
import com.lichsuvn.backend.admin.application.EventImageStorage;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.entity.mime.ByteArrayBody;
import org.apache.hc.client5.http.entity.mime.HttpMultipartMode;
import org.apache.hc.client5.http.entity.mime.MultipartEntityBuilder;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.CloseableHttpResponse;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.io.entity.EntityUtils;
import org.apache.hc.core5.util.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Component
@Profile("!admin-e2e")
public class CloudinaryEventImageStorage implements EventImageStorage {
    private static final String PROVIDER = "cloudinary";

    private final boolean configured;
    private final String cloudName;
    private final Operations operations;

    @Autowired
    public CloudinaryEventImageStorage(
            @Value("${app.cloudinary.cloud-name:}") String cloudName,
            @Value("${app.cloudinary.api-key:}") String apiKey,
            @Value("${app.cloudinary.api-secret:}") String apiSecret,
            @Value("${app.event-image-upload.timeout-ms:30000}") int timeoutMillis
    ) {
        this(cloudName, apiKey, apiSecret, timeoutMillis, null);
    }

    CloudinaryEventImageStorage(
            String cloudName,
            String apiKey,
            String apiSecret,
            int timeoutMillis,
            Operations injected
    ) {
        this.cloudName = cloudName == null ? "" : cloudName.trim();
        this.configured = StringUtils.hasText(this.cloudName)
                && StringUtils.hasText(apiKey)
                && StringUtils.hasText(apiSecret);
        if (injected != null) {
            this.operations = injected;
        } else if (configured) {
            Map<String, Object> config = new LinkedHashMap<>();
            config.put("cloud_name", this.cloudName);
            config.put("api_key", apiKey);
            config.put("api_secret", apiSecret);
            config.put("secure", true);
            Cloudinary cloudinary = new Cloudinary(config);
            Uploader uploader = new Uploader(
                    cloudinary,
                    new BoundedUploaderStrategy(
                            Math.max(1_000, Math.min(timeoutMillis, 60_000))));
            this.operations = new Operations(
                    (bytes, options) -> uploader.upload(bytes, options),
                    (publicId, options) -> uploader.destroy(publicId, options));
        } else {
            this.operations = null;
        }
    }

    @Override
    public boolean available() {
        return configured && operations != null;
    }

    @Override
    public StoredImage upload(UploadCommand command) {
        requireAvailable();
        try {
            Map<String, Object> result = operations.upload.apply(command.bytes(), uploadOptions(command.publicId()));
            rejectProviderError(result, "EVENT_IMAGE_PROVIDER_UPLOAD_FAILED");
            String publicId = string(result, "public_id");
            String assetId = string(result, "asset_id");
            String originalUrl = string(result, "secure_url");
            String resourceType = string(result, "resource_type");
            String format = canonicalFormat(string(result, "format"));
            long version = number(result, "version").longValue();
            long bytes = number(result, "bytes").longValue();
            int width = number(result, "width").intValue();
            int height = number(result, "height").intValue();
            String expectedFormat = switch (command.mimeType()) {
                case "image/jpeg" -> "jpeg";
                case "image/png" -> "png";
                default -> null;
            };
            if (!Objects.equals(command.publicId(), publicId)
                    || !"image".equals(resourceType)
                    || !Objects.equals(expectedFormat, format)
                    || !originalUrl.startsWith("https://")
                    || version <= 0 || bytes <= 0 || width <= 0 || height <= 0
                    || !StringUtils.hasText(assetId) || !StringUtils.hasText(format)) {
                throw invalidResponse();
            }
            return new StoredImage(
                    publicId, assetId, version, originalUrl, command.mimeType(),
                    format, bytes, width, height);
        } catch (EventImageStorageException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new EventImageStorageException("EVENT_IMAGE_PROVIDER_UPLOAD_FAILED", true, exception);
        } catch (RuntimeException exception) {
            throw invalidResponse();
        }
    }

    @Override
    public DeleteResult delete(DeleteCommand command) {
        requireAvailable();
        try {
            Map<String, Object> result = operations.delete.apply(
                    command.publicId(),
                    ObjectUtils.asMap("resource_type", "image", "invalidate", true));
            rejectProviderError(result, "EVENT_IMAGE_PROVIDER_DELETE_FAILED");
            String outcome = string(result, "result");
            if ("ok".equalsIgnoreCase(outcome)) {
                return new DeleteResult(DeleteOutcome.DELETED);
            }
            if ("not found".equalsIgnoreCase(outcome)) {
                return new DeleteResult(DeleteOutcome.NOT_FOUND);
            }
            throw invalidResponse();
        } catch (EventImageStorageException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new EventImageStorageException("EVENT_IMAGE_PROVIDER_DELETE_FAILED", true, exception);
        } catch (RuntimeException exception) {
            throw invalidResponse();
        }
    }

    @Override
    public String deliveryUrl(DeliveryCommand command) {
        if (!StringUtils.hasText(cloudName)
                || command == null
                || !command.publicId().matches("events/[a-z0-9-]+/(thumbnail|media)/[0-9a-f-]{36}")) {
            return null;
        }
        int limit = command.kind() == DeliveryKind.THUMBNAIL ? 1600 : 2400;
        String version = command.providerVersion() == null
                ? "" : "v" + command.providerVersion() + "/";
        return "https://res.cloudinary.com/" + cloudName
                + "/image/upload/c_limit,w_" + limit + ",h_" + limit
                + "/f_auto,q_auto/" + version + command.publicId();
    }

    static Map<String, Object> uploadOptions(String publicId) {
        return ObjectUtils.asMap(
                "public_id", publicId,
                "resource_type", "image",
                "type", "upload",
                "overwrite", false,
                "unique_filename", false,
                "transformation", "fl_force_strip");
    }

    private void requireAvailable() {
        if (!available()) {
            throw new EventImageStorageException("EVENT_IMAGE_UPLOAD_UNAVAILABLE", false);
        }
    }

    private String string(Map<String, Object> value, String key) {
        Object raw = value == null ? null : value.get(key);
        if (raw == null) {
            throw invalidResponse();
        }
        return String.valueOf(raw);
    }

    private Number number(Map<String, Object> value, String key) {
        Object raw = value == null ? null : value.get(key);
        if (raw instanceof Number number) {
            return number;
        }
        throw invalidResponse();
    }

    private void rejectProviderError(Map<String, Object> result, String code) {
        Object errorValue = result == null ? null : result.get("error");
        if (!(errorValue instanceof Map<?, ?> error)) {
            return;
        }
        Object statusValue = error.get("http_code");
        int status = statusValue instanceof Number number ? number.intValue() : 0;
        boolean retryable = status == 408 || status == 425 || status == 429 || status >= 500;
        throw new EventImageStorageException(code, retryable);
    }

    private String canonicalFormat(String value) {
        return switch (value.toLowerCase(Locale.ROOT)) {
            case "jpg", "jpeg" -> "jpeg";
            case "png" -> "png";
            default -> throw invalidResponse();
        };
    }

    private EventImageStorageException invalidResponse() {
        return new EventImageStorageException("EVENT_IMAGE_PROVIDER_RESPONSE_INVALID", false);
    }

    @FunctionalInterface
    interface UploadOperation {
        Map<String, Object> apply(byte[] bytes, Map<String, Object> options) throws IOException;
    }

    @FunctionalInterface
    interface DeleteOperation {
        Map<String, Object> apply(String publicId, Map<String, Object> options) throws IOException;
    }

    record Operations(UploadOperation upload, DeleteOperation delete) {
    }

    /**
     * Cloudinary's HTTP5 uploader does not apply API request timeout options to multipart
     * uploads. This small strategy keeps the official signing/response handling while
     * providing explicit bounded HTTP behavior and no automatic request replay.
     */
    static final class BoundedUploaderStrategy extends AbstractUploaderStrategy {
        private final CloseableHttpClient client;

        BoundedUploaderStrategy(int timeoutMillis) {
            Timeout timeout = Timeout.ofMilliseconds(timeoutMillis);
            RequestConfig requestConfig = RequestConfig.custom()
                    .setConnectTimeout(timeout)
                    .setConnectionRequestTimeout(timeout)
                    .setResponseTimeout(timeout)
                    .build();
            this.client = HttpClients.custom()
                    .disableAutomaticRetries()
                    .setDefaultRequestConfig(requestConfig)
                    .build();
        }

        @Override
        public Map callApi(
                String action,
                Map<String, Object> params,
                Map options,
                Object file,
                com.cloudinary.ProgressCallback progressCallback
        ) throws IOException {
            if (progressCallback != null) {
                throw new IllegalArgumentException("Progress callback is not supported");
            }
            Map safeOptions = options == null ? ObjectUtils.emptyMap() : options;
            if (requiresSigning(action, safeOptions)) {
                uploader.signRequestParams(params, safeOptions);
            } else {
                com.cloudinary.Util.clearEmpty(params);
            }
            HttpPost request = new HttpPost(buildUploadUrl(action, safeOptions));
            MultipartEntityBuilder multipart = MultipartEntityBuilder.create()
                    .setCharset(StandardCharsets.UTF_8)
                    .setMode(HttpMultipartMode.LEGACY);
            for (Map.Entry<String, Object> entry : params.entrySet()) {
                addParameter(multipart, entry.getKey(), entry.getValue());
            }
            if (file instanceof byte[] bytes) {
                multipart.addPart(
                        "file",
                        new ByteArrayBody(
                                bytes,
                                ContentType.APPLICATION_OCTET_STREAM,
                                "file"));
            } else if (file != null) {
                throw new IOException("Unsupported Cloudinary upload body");
            }
            request.setEntity(multipart.build());
            try (CloseableHttpResponse response = client.execute(request)) {
                String body;
                try {
                    body = EntityUtils.toString(response.getEntity());
                } catch (org.apache.hc.core5.http.ParseException exception) {
                    throw new IOException("Invalid Cloudinary response", exception);
                }
                return processResponse(true, response.getCode(), body);
            }
        }

        private void addParameter(
                MultipartEntityBuilder multipart,
                String key,
                Object value
        ) {
            if (value == null) {
                return;
            }
            if (value instanceof Collection<?> values) {
                for (Object item : values) {
                    addParameter(multipart, key + "[]", item);
                }
                return;
            }
            multipart.addTextBody(
                    key,
                    String.valueOf(value),
                    ContentType.TEXT_PLAIN.withCharset(StandardCharsets.UTF_8));
        }
    }
}

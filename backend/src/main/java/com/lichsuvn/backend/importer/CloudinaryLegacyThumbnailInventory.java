package com.lichsuvn.backend.importer;

import com.cloudinary.Cloudinary;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.CloudinaryAsset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;

/**
 * Read-only Cloudinary SDK wrapper that lists image assets under the three legacy
 * thumbnail folders with bounded pagination, deterministic ordering, and bounded retry
 * for transient API errors.
 *
 * <p>Strictly read-only: never invokes {@code upload}, {@code destroy}, {@code rename},
 * {@code update}, {@code explicit}, or any tag/context mutation.
 *
 * <p>The exposed surface uses the same {@link Cloudinary} configuration as
 * {@code com.lichsuvn.backend.admin.infrastructure.CloudinaryEventImageStorage} but
 * does not call its {@code upload}/{@code delete} APIs; it only calls
 * {@code Cloudinary.api().resources(...)} via the SDK.
 */
@Component
@Profile("backfill-event-thumbnails")
public class CloudinaryLegacyThumbnailInventory {

    private static final Logger log = LoggerFactory.getLogger(CloudinaryLegacyThumbnailInventory.class);

    /** Bounded Cloudinary API page size; matches V42 inventory convention. */
    public static final int DEFAULT_PAGE_SIZE = 100;

    /** Hard cap on total assets listed per prefix; protects against runaway results. */
    public static final int DEFAULT_MAX_ASSETS_PER_PREFIX = 5000;

    /** Hard cap on pages listed per prefix; even with small page size this keeps us finite. */
    public static final int DEFAULT_MAX_PAGES_PER_PREFIX = 100;

    static final int MAX_TRANSIENT_RETRIES = 3;
    static final int TRANSIENT_BACKOFF_MILLIS = 250;

    private final InventoryClient client;
    private final int pageSize;
    private final int maxAssetsPerPrefix;
    private final int maxPagesPerPrefix;

    @Autowired
    public CloudinaryLegacyThumbnailInventory(
            @Value("${app.cloudinary.cloud-name:}") String cloudName,
            @Value("${app.cloudinary.api-key:}") String apiKey,
            @Value("${app.cloudinary.api-secret:}") String apiSecret,
            @Value("${app.backfill.cloudinary.page-size:" + DEFAULT_PAGE_SIZE + "}") int pageSize,
            @Value("${app.backfill.cloudinary.max-assets-per-prefix:" + DEFAULT_MAX_ASSETS_PER_PREFIX + "}") int maxAssetsPerPrefix,
            @Value("${app.backfill.cloudinary.max-pages-per-prefix:" + DEFAULT_MAX_PAGES_PER_PREFIX + "}") int maxPagesPerPrefix
    ) {
        this(new CloudinaryInventoryClient(buildCloudinary(cloudName, apiKey, apiSecret)),
                pageSize,
                maxAssetsPerPrefix,
                maxPagesPerPrefix);
    }

    CloudinaryLegacyThumbnailInventory(
            InventoryClient client,
            int pageSize,
            int maxAssetsPerPrefix,
            int maxPagesPerPrefix
    ) {
        this.client = client;
        this.pageSize = boundedPositive(pageSize, 1, DEFAULT_PAGE_SIZE);
        this.maxAssetsPerPrefix = boundedPositive(maxAssetsPerPrefix, 1, DEFAULT_MAX_ASSETS_PER_PREFIX);
        this.maxPagesPerPrefix = boundedPositive(maxPagesPerPrefix, 1, DEFAULT_MAX_PAGES_PER_PREFIX);
    }

    /** True if the SDK has the cloud name + key + secret required to call Cloudinary Admin API. */
    public boolean configured() {
        return client.configured();
    }

    /**
     * List assets under each legacy folder using {@code public_id} prefix. Returns a
     * deterministic mapping sorted by {@code public_id}.
     */
    public TreeMap<String, List<CloudinaryAsset>> listByPrefix(List<String> prefixes) {
        TreeMap<String, List<CloudinaryAsset>> result = new TreeMap<>();
        for (String prefix : prefixes) {
            result.put(prefix, listByPrefix(prefix));
        }
        return result;
    }

    /**
     * List assets under a single legacy folder using {@code public_id} prefix. Returns
     * a deterministic, {@code public_id}-sorted list.
     *
     * <p>Cloudinary Admin API uses opaque string {@code next_cursor} tokens for
     * pagination. The first call passes an empty cursor; subsequent calls pass the
     * previous response's {@code next_cursor} verbatim. Pagination terminates when
     * {@code next_cursor} is missing or blank.
     */
    public List<CloudinaryAsset> listByPrefix(String prefix) {
        Objects.requireNonNull(prefix, "prefix");
        if (!client.configured()) {
            throw new InventoryException("Cloudinary Admin API is not configured for backfill inventory");
        }
        List<CloudinaryAsset> all = new ArrayList<>();
        final String[] cursorHolder = new String[]{""};
        for (int page = 0; page < maxPagesPerPrefix; page++) {
            final String cursorForCall = cursorHolder[0];
            Map<String, Object> response = callWithTransientRetry(prefix, cursorForCall);
            List<Map<String, Object>> resources = extractResources(response);
            for (Map<String, Object> raw : resources) {
                CloudinaryAsset asset = mapAsset(raw, prefix);
                if (asset != null) {
                    all.add(asset);
                }
            }
            Object cursorValue = response.get("next_cursor");
            boolean hasMore = cursorValue instanceof String text && !text.isBlank();
            if (!hasMore || resources.isEmpty()) {
                break;
            }
            String cursorText = ((String) cursorValue).trim();
            if (cursorText.equals(cursorHolder[0])) {
                throw new InventoryException(
                        "Cloudinary cursor did not advance for prefix " + prefix + ": " + cursorText);
            }
            cursorHolder[0] = cursorText;
            if (all.size() >= maxAssetsPerPrefix) {
                throw new InventoryException(
                        "Cloudinary inventory exceeded max assets per prefix: " + maxAssetsPerPrefix);
            }
        }
        all.sort((left, right) -> left.publicId().compareTo(right.publicId()));
        return Collections.unmodifiableList(all);
    }

    private Map<String, Object> callWithTransientRetry(String prefix, String cursor) {
        try {
            return callWithTransientRetry(() -> client.listByPublicIdPrefix(prefix, cursor, pageSize));
        } catch (InventoryException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new InventoryException(
                    "Cloudinary inventory failed: " + exception.getMessage(), exception);
        }
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> callWithTransientRetry(InventoryCall call) {
        IOException last = null;
        for (int attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
            try {
                Map response = call.execute();
                return (Map<String, Object>) response;
            } catch (IOException retryable) {
                last = retryable;
                if (attempt == MAX_TRANSIENT_RETRIES) {
                    break;
                }
                try {
                    Thread.sleep(TRANSIENT_BACKOFF_MILLIS * attempt);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new InventoryException("Cloudinary inventory was interrupted", interrupted);
                }
                log.warn("Cloudinary inventory transient error attempt={} ms={}: {}",
                        attempt, TRANSIENT_BACKOFF_MILLIS * attempt, retryable.getMessage());
            }
        }
        throw new InventoryException(
                "Cloudinary inventory failed after " + MAX_TRANSIENT_RETRIES + " attempts", last);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> extractResources(Map<String, Object> response) {
        Object raw = response == null ? null : response.get("resources");
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> cast = new ArrayList<>(list.size());
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                cast.add((Map<String, Object>) map);
            }
        }
        return cast;
    }

    @SuppressWarnings("unchecked")
    private static CloudinaryAsset mapAsset(Map<String, Object> raw, String prefix) {
        Object publicIdValue = raw.get("public_id");
        if (!(publicIdValue instanceof String text) || text.isBlank()) {
            return null;
        }
        Object assetIdValue = raw.get("asset_id");
        String assetId = assetIdValue instanceof String asset ? asset : null;
        Object secureUrlValue = raw.get("secure_url");
        String secureUrl = secureUrlValue instanceof String url ? url : null;
        Object versionValue = raw.get("version");
        long version = versionValue instanceof Number number ? number.longValue() : 0L;
        Object formatValue = raw.get("format");
        String format = formatValue instanceof String fmt && !fmt.isBlank() ? fmt.toLowerCase() : null;
        Object resourceTypeValue = raw.get("resource_type");
        String resourceType = resourceTypeValue instanceof String rt ? rt : null;
        Object widthValue = raw.get("width");
        int width = widthValue instanceof Number number ? number.intValue() : 0;
        Object heightValue = raw.get("height");
        int height = heightValue instanceof Number number ? number.intValue() : 0;
        Object bytesValue = raw.get("bytes");
        long bytes = bytesValue instanceof Number number ? number.longValue() : 0L;
        Object createdValue = raw.get("created_at");
        Instant createdAt = parseInstant(createdValue);
        String folder = folderFromPublicId(text, prefix);
        return new CloudinaryAsset(
                text,
                assetId,
                secureUrl,
                version,
                format,
                resourceType,
                width,
                height,
                bytes,
                createdAt == null ? null : createdAt.toString(),
                folder);
    }

    private static Instant parseInstant(Object value) {
        if (!(value instanceof String text) || text.isBlank()) {
            return null;
        }
        String trimmed = text.trim();
        if (trimmed.matches("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$")) {
            try {
                return Instant.parse(trimmed);
            } catch (Exception ignored) {
                return null;
            }
        }
        if (trimmed.matches("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}$")) {
            try {
                return DateTimeFormatter.ISO_LOCAL_DATE_TIME
                        .parse(trimmed, java.time.LocalDateTime::from)
                        .toInstant(ZoneOffset.UTC);
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }

    private static String folderFromPublicId(String publicId, String fallbackPrefix) {
        int slash = publicId.indexOf('/');
        return slash < 0 ? fallbackPrefix : publicId.substring(0, slash);
    }

    private static int boundedPositive(int candidate, int min, int fallback) {
        if (candidate < min) {
            return fallback;
        }
        return candidate;
    }

    private static Cloudinary buildCloudinary(String cloudName, String apiKey, String apiSecret) {
        boolean configured = cloudName != null && !cloudName.isBlank()
                && apiKey != null && !apiKey.isBlank()
                && apiSecret != null && !apiSecret.isBlank();
        if (!configured) {
            return null;
        }
        Map<String, Object> config = new java.util.LinkedHashMap<>();
        config.put("cloud_name", cloudName.trim());
        config.put("api_key", apiKey);
        config.put("api_secret", apiSecret);
        config.put("secure", true);
        return new Cloudinary(config);
    }

    /**
     * Adapter boundary so tests can swap a recording fake without touching the SDK.
     * Always wraps the caller-provided SDK; never invokes mutating SDK methods.
     *
     * <p>{@code cursor} is the opaque {@code next_cursor} value returned by Cloudinary.
     * The first call uses an empty string; subsequent calls pass the previous response's
     * {@code next_cursor} verbatim.
     */
    public interface InventoryClient {
        boolean configured();

        Map<String, Object> listByPublicIdPrefix(String prefix, String cursor, int pageSize) throws IOException;
    }

    /** Real implementation that delegates to {@code Cloudinary.api().resources(...)}. */
    public static final class CloudinaryInventoryClient implements InventoryClient {
        private final Cloudinary cloudinary;

        public CloudinaryInventoryClient(Cloudinary cloudinary) {
            this.cloudinary = cloudinary;
        }

        @Override
        public boolean configured() {
            return cloudinary != null;
        }

        @Override
        @SuppressWarnings({"rawtypes", "unchecked"})
        public Map<String, Object> listByPublicIdPrefix(String prefix, String cursor, int pageSize) throws IOException {
            if (cloudinary == null) {
                throw new IOException("Cloudinary client not configured");
            }
            Map options = com.cloudinary.utils.ObjectUtils.asMap(
                    "type", "upload",
                    "prefix", prefix,
                    "resource_type", "image",
                    "max_results", pageSize,
                    "next_cursor", cursor == null || cursor.isBlank() ? "" : cursor,
                    "direction", "asc"
            );
            Map response;
            try {
                response = cloudinary.api().resources(options);
            } catch (Exception exception) {
                IOException wrapped = exception instanceof IOException io
                        ? io
                        : new IOException("Cloudinary resources call failed", exception);
                throw wrapped;
            }
            return response;
        }
    }

    @FunctionalInterface
    interface InventoryCall {
        Map<String, Object> execute() throws IOException;
    }

    public static final class InventoryException extends RuntimeException {
        public InventoryException(String message) {
            super(message);
        }

        public InventoryException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** Set of folders we will inventory and the precedence used elsewhere. */
    public static List<String> legacyFolders() {
        return List.copyOf(LegacyThumbnailBackfillPlan.FOLDER_PRECEDENCE);
    }

    /** Helper used by tests + the runner to detect duplicate public ids across prefixes. */
    public static Set<String> uniquePublicIds(List<CloudinaryAsset> all) {
        Set<String> ids = new HashSet<>();
        for (CloudinaryAsset asset : all) {
            ids.add(asset.publicId());
        }
        return ids;
    }
}

package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.CloudinaryAsset;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.DatabaseState;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Read-only SELECT helpers used by the legacy thumbnail backfill plus a single,
 * idempotent batch INSERT that respects V42 unique indexes. This repository does not
 * mutate any V42 upload/replace code; it shares the {@code event_media} table only to
 * append new rows that the existing public Admin read policies already understand.
 */
@Repository
@Profile("backfill-event-thumbnails")
public class LegacyEventThumbnailBackfillRepository {

    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final NamedParameterJdbcTemplate jdbc;
    private final TransactionTemplate batchTransaction;
    private final ObjectMapper objectMapper;

    public LegacyEventThumbnailBackfillRepository(
            NamedParameterJdbcTemplate jdbc,
            PlatformTransactionManager transactionManager,
            ObjectMapper objectMapper
    ) {
        this.jdbc = jdbc;
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.batchTransaction = template;
        this.objectMapper = objectMapper;
    }

    /**
     * Snapshot of the relevant {@code event_media} storage identity columns; used for
     * conflict classes {@code STORAGE_IDENTITY_CONFLICT} and
     * {@code PROVIDER_ASSET_CONFLICT}.
     * Kept as a typed alias so callers can use either form.
     */

    /**
     * Snapshot of the current canonical thumbnail for every {@code historical_events.id}.
     * The query is bounded by {@code pagedCount + pagedOffset} so callers can stream.
     */
    public List<DatabaseState> loadDatabaseState(int limit, int offset) {
        if (limit <= 0 || offset < 0) {
            throw new IllegalArgumentException("limit must be positive and offset non-negative");
        }
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("limit", limit)
                .addValue("offset", offset);
        return jdbc.query("""
                SELECT
                    e.id AS event_id,
                    e.slug AS event_slug,
                    e.title AS event_title,
                    COALESCE((
                        SELECT thumb.id FROM event_media thumb
                        WHERE thumb.event_id = e.id AND thumb.status = 'active'
                          AND (
                            thumb.storage_state='UNMANAGED'
                            OR (
                              thumb.storage_state='READY'
                              AND thumb.storage_provider='cloudinary'
                              AND TRIM(thumb.storage_public_id)<>''
                            )
                          )
                          AND thumb.is_thumbnail = TRUE AND thumb.media_type = 'image'
                          AND TRIM(thumb.url) <> ''
                          AND LOWER(TRIM(thumb.url)) NOT LIKE 'local:%%'
                        ORDER BY thumb.sort_order, thumb.id LIMIT 1
                    ), 0) AS active_thumbnail_media_id,
                    (
                        SELECT thumb.storage_public_id FROM event_media thumb
                        WHERE thumb.event_id = e.id AND thumb.status = 'active'
                          AND (
                            thumb.storage_state='UNMANAGED'
                            OR (
                              thumb.storage_state='READY'
                              AND thumb.storage_provider='cloudinary'
                              AND TRIM(thumb.storage_public_id)<>''
                            )
                          )
                          AND thumb.is_thumbnail = TRUE AND thumb.media_type = 'image'
                          AND TRIM(thumb.url) <> ''
                          AND LOWER(TRIM(thumb.url)) NOT LIKE 'local:%%'
                        ORDER BY thumb.sort_order, thumb.id LIMIT 1
                    ) AS active_thumbnail_public_id,
                    (
                        SELECT thumb.storage_state FROM event_media thumb
                        WHERE thumb.event_id = e.id AND thumb.status = 'active'
                          AND (
                            thumb.storage_state='UNMANAGED'
                            OR (
                              thumb.storage_state='READY'
                              AND thumb.storage_provider='cloudinary'
                              AND TRIM(thumb.storage_public_id)<>''
                            )
                          )
                          AND thumb.is_thumbnail = TRUE AND thumb.media_type = 'image'
                          AND TRIM(thumb.url) <> ''
                          AND LOWER(TRIM(thumb.url)) NOT LIKE 'local:%%'
                        ORDER BY thumb.sort_order, thumb.id LIMIT 1
                    ) AS active_thumbnail_state
                FROM historical_events e
                ORDER BY e.id
                LIMIT :limit OFFSET :offset
                """, params, (rs, rowNum) -> new DatabaseState(
                rs.getString("event_id"),
                rs.getString("event_slug"),
                rs.getString("event_title"),
                rs.getLong("active_thumbnail_media_id"),
                rs.getString("active_thumbnail_public_id"),
                rs.getString("active_thumbnail_state")));
    }

    /**
     * Snapshot every {@code (storage_provider, storage_public_id)} and
     * {@code (managed_asset_id)} that already exists in {@code event_media}. Used to
     * classify {@code STORAGE_IDENTITY_CONFLICT} and {@code PROVIDER_ASSET_CONFLICT}.
     */
    public Map<String, LegacyThumbnailBackfillPlan.StorageIdentityRow> loadExistingStorageIdentities(Set<String> publicIds, Set<String> providerAssetIds) {
        Map<String, LegacyThumbnailBackfillPlan.StorageIdentityRow> result = new HashMap<>();
        if (publicIds != null && !publicIds.isEmpty()) {
            MapSqlParameterSource params = new MapSqlParameterSource("publicIds", publicIds);
            jdbc.query("""
                    SELECT id, storage_provider, storage_public_id,
                           managed_asset_id, storage_asset_id
                    FROM event_media
                    WHERE storage_provider='cloudinary'
                      AND storage_public_id IN (:publicIds)
                    """, params, rs -> {
                String publicId = rs.getString("storage_public_id");
                result.put("publicId:" + publicId, new LegacyThumbnailBackfillPlan.StorageIdentityRow(
                        publicId,
                        rs.getString("storage_provider"),
                        rs.getString("managed_asset_id"),
                        rs.getString("storage_asset_id"),
                        rs.getLong("id")));
            });
        }
        if (providerAssetIds != null && !providerAssetIds.isEmpty()) {
            MapSqlParameterSource params = new MapSqlParameterSource("assetIds", providerAssetIds);
            jdbc.query("""
                    SELECT id, storage_provider, storage_public_id,
                           managed_asset_id, storage_asset_id
                    FROM event_media
                    WHERE storage_provider='cloudinary'
                      AND storage_asset_id IN (:assetIds)
                    """, params, rs -> {
                String providerAssetId = rs.getString("storage_asset_id");
                result.put("assetId:" + providerAssetId, new LegacyThumbnailBackfillPlan.StorageIdentityRow(
                        rs.getString("storage_public_id"),
                        rs.getString("storage_provider"),
                        rs.getString("managed_asset_id"),
                        providerAssetId,
                        rs.getLong("id")));
            });
        }
        return result;
    }

    /** Number of {@code historical_events} rows (used by the apply gate baseline). */
    public long countHistoricalEvents() {
        Long value = jdbc.queryForObject(
                "SELECT COUNT(*) FROM historical_events", new MapSqlParameterSource(), Long.class);
        return value == null ? 0L : value;
    }

    /** Number of {@code event_media} rows already present (used by the apply gate baseline). */
    public long countEventMedia() {
        Long value = jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media", new MapSqlParameterSource(), Long.class);
        return value == null ? 0L : value;
    }

    /** Number of {@code event_media_storage_cleanup_tasks} rows; expected zero right after apply. */
    public long countCleanupTasks() {
        Long value = jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media_storage_cleanup_tasks",
                new MapSqlParameterSource(), Long.class);
        return value == null ? 0L : value;
    }

    /** A snapshot of the most recently applied Flyway version, ignoring repair entries. */
    public String topFlywayVersion() {
        List<String> rows = jdbc.queryForList("""
                SELECT version
                FROM flyway_schema_history
                WHERE success = 1
                  AND version IS NOT NULL
                ORDER BY installed_rank DESC
                LIMIT 1
                """, new MapSqlParameterSource(), String.class);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    /**
     * Insert every row in {@code rows} inside a single batch transaction. The expected
     * pre-state (no existing thumbnail for the event) is checked before each insert and
     * captured in the rollback snapshot. The whole batch rolls back atomically on any
     * failure: no partial inserts, no compensation queue, no Cloudinary mutation.
     */
    /**
     * Public overload accepting the plan-level shared {@link LegacyThumbnailBackfillPlan.EligibleInsert}
     * record so the orchestrator never has to know about this repository. The runner
     * constructs the records via {@link LegacyEventThumbnailBackfillService#buildEligibleInsert}.
     */
    public BatchOutcome applyInsertBatch(List<LegacyThumbnailBackfillPlan.EligibleInsert> rows) {
        if (rows == null || rows.isEmpty()) {
            return new BatchOutcome(List.of(), 0L);
        }
        List<Long> insertedIds = new ArrayList<>();
        Long totalAffected = batchTransaction.execute(transactionStatus -> {
            long affected = 0L;
            Set<String> alreadyInsertedPublicIds = new HashSet<>();
            for (LegacyThumbnailBackfillPlan.EligibleInsert insert : rows) {
                if (!alreadyInsertedPublicIds.add(insert.assetRow().publicId())) {
                    throw new IllegalStateException(
                            "Duplicate planned public id in batch: " + insert.assetRow().publicId());
                }
                if (countActiveThumbnailFor(insert.eventId()) > 0) {
                    throw new IllegalStateException(
                            "Event already has canonical thumbnail: " + insert.eventId());
                }
                int updated = jdbc.update("""
                        INSERT INTO event_media(
                            event_id, media_type, url, caption, alt_text, source_name, license,
                            storage_type, is_thumbnail, sort_order, status,
                            managed_asset_id, storage_provider, storage_public_id,
                            storage_asset_id, storage_original_url, storage_version,
                            storage_mime_type, storage_format, storage_byte_size,
                            storage_width, storage_height,
                            storage_state, uploaded_at
                        ) VALUES (
                            :eventId, 'image', :url, NULL, NULL, NULL, NULL,
                            'object_storage', TRUE, 0, 'active',
                            :managedAssetId, 'cloudinary', :publicId,
                            :providerAssetId, :originalUrl, :providerVersion,
                            :mimeType, :format, :byteSize,
                            :width, :height,
                            'READY', :uploadedAt
                        )
                        """, buildInsertParams(insert));
                if (updated != 1) {
                    throw new IllegalStateException(
                            "Insert affected " + updated + " rows for managed asset "
                                    + insert.managedAssetId());
                }
                affected += updated;
                insertedIds.add(retrieveLastInsertId(insert.managedAssetId()));
            }
            return affected;
        });
        return new BatchOutcome(List.copyOf(insertedIds), totalAffected == null ? 0L : totalAffected);
    }

    private long countActiveThumbnailFor(String eventId) {
        Long value = jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media
                WHERE event_id = :eventId
                  AND status = 'active'
                  AND is_thumbnail = TRUE
                  AND media_type = 'image'
                """, new MapSqlParameterSource("eventId", eventId), Long.class);
        return value == null ? 0L : value;
    }

    private long retrieveLastInsertId(String managedAssetId) {
        List<Long> ids = jdbc.queryForList("""
                SELECT id FROM event_media WHERE managed_asset_id = :managedAssetId
                """, new MapSqlParameterSource("managedAssetId", managedAssetId), Long.class);
        if (ids.isEmpty()) {
            throw new IllegalStateException(
                    "Insert succeeded but row not found by managed asset id: " + managedAssetId);
        }
        return ids.getFirst();
    }

    private MapSqlParameterSource buildInsertParams(LegacyThumbnailBackfillPlan.EligibleInsert insert) {
        LegacyCloudinaryDeliveryUrl.Kind kind = insert.kind();
        return new MapSqlParameterSource()
                .addValue("eventId", insert.eventId())
                .addValue("url", insert.deliveryUrl())
                .addValue("managedAssetId", insert.managedAssetId())
                .addValue("publicId", insert.assetRow().publicId())
                .addValue("providerAssetId", insert.assetRow().assetId())
                .addValue("originalUrl", insert.assetRow().secureUrl())
                .addValue("providerVersion", insert.assetRow().version())
                .addValue("mimeType", mimeTypeForFormat(insert.assetRow().format()))
                .addValue("format", insert.assetRow().format())
                .addValue("byteSize", insert.assetRow().bytes())
                .addValue("width", insert.assetRow().width())
                .addValue("height", insert.assetRow().height())
                .addValue("uploadedAt", Timestamp.valueOf(eventTimestamp(insert)));
    }

    private static LocalDateTime eventTimestamp(LegacyThumbnailBackfillPlan.EligibleInsert insert) {
        String value = insert.assetRow().createdAt();
        if (value != null && !value.isBlank()) {
            try {
                return LocalDateTime.ofInstant(java.time.Instant.parse(value), DATABASE_ZONE);
            } catch (RuntimeException ignored) {
                // fall through to now()
            }
        }
        return LocalDateTime.now(DATABASE_ZONE);
    }

    private static String mimeTypeForFormat(String format) {
        return switch (format == null ? "" : format.toLowerCase(Locale.ROOT)) {
            case "jpeg", "jpg" -> "image/jpeg";
            case "png" -> "image/png";
            case "webp" -> "image/webp";
            default -> "image/jpeg";
        };
    }

    /** Result of a single-batch apply: list of inserted media ids and total affected rows. */
    public record BatchOutcome(List<Long> insertedMediaIds, long totalAffected) {
    }

    /**
     * Compact JSON view of one backfilled asset used in dry-run artifacts. Mirrors
     * {@link CloudinaryAsset} but without the live {@link Instant} types so Jackson has
     * a stable on-disk shape.
     */
    public static String toJson(CloudinaryAsset asset, ObjectMapper mapper) {
        try {
            return mapper.writeValueAsString(new AssetJson(asset));
        } catch (Exception exception) {
            throw new IllegalStateException("Backfill asset serialization failed", exception);
        }
    }

    /** Public so the service layer can serialize rows without leaking the asset record. */
    public record AssetJson(
            String publicId,
            String assetId,
            String secureUrl,
            long version,
            String format,
            String resourceType,
            int width,
            int height,
            long bytes,
            String createdAt,
            String folder
    ) {
        public AssetJson(CloudinaryAsset asset) {
            this(
                    asset.publicId(),
                    asset.assetId(),
                    asset.secureUrl(),
                    asset.version(),
                    asset.format(),
                    asset.resourceType(),
                    asset.width(),
                    asset.height(),
                    asset.bytes(),
                    asset.createdAt() == null ? null : asset.createdAt().toString(),
                    asset.folder());
        }
    }

    /** Sanity sample used by the dry-run artifact writer. */
    byte[] sampleBytesEmpty() {
        return "".getBytes(StandardCharsets.UTF_8);
    }
}

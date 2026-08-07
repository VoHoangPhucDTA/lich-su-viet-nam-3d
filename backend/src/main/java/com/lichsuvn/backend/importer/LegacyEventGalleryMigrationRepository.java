package com.lichsuvn.backend.importer;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

/**
 * Read-only inventory + per-row finalize SQL for the local-gallery → managed
 * Cloudinary migration. The runner calls into this class via
 * {@link LegacyEventGalleryMigrationService} only.
 */
@Repository
@Profile("backfill-gallery-images")
public class LegacyEventGalleryMigrationRepository {

    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final NamedParameterJdbcTemplate jdbc;

    public LegacyEventGalleryMigrationRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Snapshot of every legacy local gallery row that the migration is allowed to
     * promote. The runner streams this list rather than building a single batch
     * because administrators may pause/resume the migration between rows.
     */
    public List<GalleryRow> loadLegacyGalleryRows() {
        return jdbc.query("""
                SELECT id, event_id, media_type, url, caption, alt_text,
                       source_name, license, sort_order, status, is_thumbnail,
                       storage_type, storage_state, storage_provider,
                       storage_public_id, storage_asset_id
                FROM event_media
                WHERE media_type = 'image'
                  AND is_thumbnail = FALSE
                  AND storage_state = 'UNMANAGED'
                  AND storage_type = 'local'
                  AND LOWER(TRIM(url)) LIKE '/media/event-images/%'
                ORDER BY sort_order, id
                """, new MapSqlParameterSource(), (rs, rowNum) -> new GalleryRow(
                rs.getLong("id"),
                rs.getString("event_id"),
                rs.getString("media_type"),
                rs.getString("url"),
                rs.getString("caption"),
                rs.getString("alt_text"),
                rs.getString("source_name"),
                rs.getString("license"),
                rs.getInt("sort_order"),
                rs.getString("status"),
                rs.getBoolean("is_thumbnail"),
                rs.getString("storage_type"),
                rs.getString("storage_state"),
                rs.getString("storage_provider"),
                rs.getString("storage_public_id"),
                rs.getString("storage_asset_id")));
    }

    /**
     * Re-read one row to support the apply-phase CAS check. Used to detect
     * conflicts where the underlying row drifted between plan and apply.
     */
    public GalleryRow lockGalleryRow(long mediaId) {
        List<GalleryRow> rows = jdbc.query("""
                SELECT id, event_id, media_type, url, caption, alt_text,
                       source_name, license, sort_order, status, is_thumbnail,
                       storage_type, storage_state, storage_provider,
                       storage_public_id, storage_asset_id
                FROM event_media
                WHERE id = :mediaId
                FOR UPDATE
                """, new MapSqlParameterSource("mediaId", mediaId), (rs, rowNum) ->
                new GalleryRow(
                        rs.getLong("id"),
                        rs.getString("event_id"),
                        rs.getString("media_type"),
                        rs.getString("url"),
                        rs.getString("caption"),
                        rs.getString("alt_text"),
                        rs.getString("source_name"),
                        rs.getString("license"),
                        rs.getInt("sort_order"),
                        rs.getString("status"),
                        rs.getBoolean("is_thumbnail"),
                        rs.getString("storage_type"),
                        rs.getString("storage_state"),
                        rs.getString("storage_provider"),
                        rs.getString("storage_public_id"),
                        rs.getString("storage_asset_id")));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    /**
     * CAS UPDATE on a single {code event_media} row. Returns affected count:
     * 1 on success, 0 on CAS miss. The runner checks affected == 1 to
     * confirm idempotent plan invariants before treating the row finalised.
     */
    public int finalizeRow(FinalizeCommand command) {
        return jdbc.update("""
                UPDATE event_media
                SET storage_type = 'object_storage',
                    storage_state = 'READY',
                    storage_provider = 'cloudinary',
                    storage_public_id = :publicId,
                    storage_asset_id = :providerAssetId,
                    storage_original_url = :originalUrl,
                    storage_version = :providerVersion,
                    storage_mime_type = :mimeType,
                    storage_format = :format,
                    storage_byte_size = :byteSize,
                    storage_sha256 = :sha256,
                    storage_width = :width,
                    storage_height = :height,
                    managed_asset_id = :managedAssetId,
                    url = :deliveryUrl,
                    uploaded_at = :uploadedAt
                WHERE id = :mediaId
                  AND event_id = :eventId
                  AND storage_state = 'UNMANAGED'
                  AND storage_type = 'local'
                  AND managed_asset_id IS NULL
                  AND LOWER(TRIM(url)) LIKE '/media/event-images/%%'
                """, new MapSqlParameterSource()
                .addValue("publicId", command.plannedPublicId)
                .addValue("providerAssetId", command.providerAssetId)
                .addValue("originalUrl", command.originalUrl)
                .addValue("providerVersion", command.providerVersion)
                .addValue("mimeType", command.mimeType)
                .addValue("format", command.format)
                .addValue("byteSize", command.byteSize)
                .addValue("sha256", command.sha256)
                .addValue("width", command.width)
                .addValue("height", command.height)
                .addValue("managedAssetId", command.managedAssetId)
                .addValue("deliveryUrl", command.deliveryUrl)
                .addValue("uploadedAt", command.uploadedAt == null ? null
                        : Timestamp.valueOf(command.uploadedAt))
                .addValue("mediaId", command.mediaId)
                .addValue("eventId", command.eventId));
    }

    /**
     * Apply an orphan cleanup hint to a Cloudinary asset the runner just uploaded
     * but failed to finalise. Delegates to {@code AdminEventImageRepository}'s
     * {@code armCleanup} only when needed.
     *
     * <p>This method is a thin SQL mirror to avoid pulling in the full admin
     * repository; the runner's compensation path uses it directly.
     */
    public void armCleanup(String publicId, String providerAssetId, LocalDateTime notBefore) {
        jdbc.update("""
                INSERT INTO event_media_storage_cleanup_tasks(
                    provider, public_id, provider_asset_id,
                    operation, task_status, attempts,
                    next_attempt_at, claim_token, claim_expires_at,
                    last_error_code
                ) VALUES (
                    'cloudinary', :publicId, :providerAssetId,
                    'DELETE', 'PENDING', 0,
                    :notBefore, NULL, NULL,
                    'release-g-unfinalized'
                )
                ON DUPLICATE KEY UPDATE
                    provider_asset_id = COALESCE(VALUES(provider_asset_id), provider_asset_id),
                    task_status = 'PENDING',
                    next_attempt_at = :notBefore,
                    claim_token = NULL,
                    claim_expires_at = NULL,
                    attempts = 0,
                    last_error_code = 'release-g-unfinalized'
                """, new MapSqlParameterSource()
                .addValue("publicId", publicId)
                .addValue("providerAssetId", providerAssetId)
                .addValue("notBefore", Timestamp.valueOf(notBefore)));
    }

    public long countHistoricalEvents() {
        Long value = jdbc.queryForObject(
                "SELECT COUNT(*) FROM historical_events",
                new MapSqlParameterSource(), Long.class);
        return value == null ? 0L : value;
    }

    public long countEventMedia() {
        Long value = jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media",
                new MapSqlParameterSource(), Long.class);
        return value == null ? 0L : value;
    }

    public long countCanonicalManagedThumbnails() {
        Long value = jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media
                WHERE media_type = 'image'
                  AND is_thumbnail = TRUE
                  AND status = 'active'
                  AND storage_state = 'READY'
                  AND storage_provider = 'cloudinary'
                  """, new MapSqlParameterSource(), Long.class);
        return value == null ? 0L : value;
    }

    public long countLocalGalleryRows() {
        Long value = jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media
                WHERE media_type = 'image'
                  AND is_thumbnail = FALSE
                  AND storage_state = 'UNMANAGED'
                  AND storage_type = 'local'
                  AND LOWER(TRIM(url)) LIKE '/media/event-images/%%'
                """, new MapSqlParameterSource(), Long.class);
        return value == null ? 0L : value;
    }

    public long countManagedGalleryRows() {
        Long value = jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media
                WHERE media_type = 'image'
                  AND is_thumbnail = FALSE
                  AND storage_state = 'READY'
                  AND storage_provider = 'cloudinary'
                  AND storage_type = 'object_storage'
                """, new MapSqlParameterSource(), Long.class);
        return value == null ? 0L : value;
    }

    public long countActiveLocalUrls() {
        Long value = jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media
                WHERE LOWER(TRIM(url)) LIKE '/media/event-images/%%'
                  AND status = 'active'
                """, new MapSqlParameterSource(), Long.class);
        return value == null ? 0L : value;
    }

    public long countCleanupTasks() {
        Long value = jdbc.queryForObject(
                "SELECT COUNT(*) FROM event_media_storage_cleanup_tasks",
                new MapSqlParameterSource(), Long.class);
        return value == null ? 0L : value;
    }

    public long countManagedAssetIdentityConflict() {
        Long value = jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media
                WHERE storage_provider = 'cloudinary'
                  AND storage_public_id IS NOT NULL
                  AND managed_asset_id IS NOT NULL
                GROUP BY storage_provider, storage_public_id, managed_asset_id
                HAVING COUNT(*) > 1
                """, new MapSqlParameterSource(), Long.class);
        return value == null ? 0L : value;
    }

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

    public record GalleryRow(
            long id,
            String eventId,
            String mediaType,
            String url,
            String caption,
            String altText,
            String sourceName,
            String license,
            int sortOrder,
            String status,
            boolean isThumbnail,
            String storageType,
            String storageState,
            String storageProvider,
            String storagePublicId,
            String storageAssetId
    ) {
    }

    public record FinalizeCommand(
            long mediaId,
            String eventId,
            String plannedPublicId,
            String managedAssetId,
            String providerAssetId,
            String originalUrl,
            long providerVersion,
            String mimeType,
            String format,
            long byteSize,
            String sha256,
            int width,
            int height,
            String deliveryUrl,
            LocalDateTime uploadedAt
    ) {
    }
}

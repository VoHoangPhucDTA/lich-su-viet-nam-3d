package com.lichsuvn.backend.admin.infrastructure;

import com.lichsuvn.backend.admin.application.EventImageStorage;
import com.lichsuvn.backend.admin.application.EventImageValidator;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public class AdminEventImageRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public AdminEventImageRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public EventLock lockEvent(String eventId) {
        List<EventLock> rows = jdbc.query("""
                SELECT id, status, updated_at
                FROM historical_events
                WHERE id=:eventId
                FOR UPDATE
                """, params("eventId", eventId), (rs, row) ->
                new EventLock(
                        rs.getString("id"),
                        rs.getString("status"),
                        rs.getTimestamp("updated_at").toLocalDateTime()));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public int countMediaAndReservations(String eventId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media
                WHERE event_id=:eventId
                  AND storage_state IN ('UNMANAGED','UPLOADING','READY')
                """, params("eventId", eventId), Integer.class);
        return count == null ? 0 : count;
    }

    public int countActiveReservations(String eventId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media
                WHERE event_id=:eventId AND storage_state='UPLOADING'
                  AND upload_expires_at>CURRENT_TIMESTAMP(6)
                """, params("eventId", eventId), Integer.class);
        return count == null ? 0 : count;
    }

    public int nextSortOrder(String eventId) {
        Integer value = jdbc.queryForObject("""
                SELECT COALESCE(MAX(sort_order),-1)+1 FROM event_media
                WHERE event_id=:eventId
                  AND storage_state IN ('UNMANAGED','READY')
                """, params("eventId", eventId), Integer.class);
        return value == null ? 0 : value;
    }

    public long insertReservation(Reservation command) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
                INSERT INTO event_media(
                    event_id,media_type,url,caption,alt_text,source_name,license,
                    storage_type,is_thumbnail,sort_order,status,
                    managed_asset_id,storage_provider,storage_public_id,
                    storage_mime_type,storage_format,storage_byte_size,storage_sha256,
                    storage_width,storage_height,uploaded_by,storage_state,
                    upload_token,upload_started_at,upload_expires_at
                ) VALUES(
                    :eventId,'image','',:caption,:altText,:sourceName,:license,
                    'object_storage',FALSE,:sortOrder,'hidden',
                    :assetId,'cloudinary',:publicId,
                    :mimeType,:format,:byteSize,:sha256,:width,:height,:actorId,
                    'UPLOADING',:uploadToken,:startedAt,:expiresAt
                )
                """, new MapSqlParameterSource()
                .addValue("eventId", command.eventId())
                .addValue("caption", command.image().caption())
                .addValue("altText", command.image().altText())
                .addValue("sourceName", command.image().sourceName())
                .addValue("license", command.image().license())
                .addValue("sortOrder", command.sortOrder())
                .addValue("assetId", command.assetId())
                .addValue("publicId", command.publicId())
                .addValue("mimeType", command.image().mimeType())
                .addValue("format", command.image().format())
                .addValue("byteSize", command.image().byteSize())
                .addValue("sha256", command.image().sha256())
                .addValue("width", command.image().width())
                .addValue("height", command.image().height())
                .addValue("actorId", command.actorId())
                .addValue("uploadToken", command.uploadToken())
                .addValue("startedAt", command.startedAt())
                .addValue("expiresAt", command.expiresAt()),
                keyHolder, new String[]{"id"});
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Missing event image reservation ID");
        }
        return key.longValue();
    }

    public void armCleanup(String publicId, LocalDateTime nextAttemptAt) {
        armCleanup(publicId, null, nextAttemptAt);
    }

    public void armCleanup(String publicId, String providerAssetId, LocalDateTime nextAttemptAt) {
        jdbc.update("""
                INSERT INTO event_media_storage_cleanup_tasks(
                    provider,public_id,provider_asset_id,operation,task_status,attempts,next_attempt_at
                ) VALUES('cloudinary',:publicId,:providerAssetId,'DELETE','PENDING',0,:nextAttemptAt)
                ON DUPLICATE KEY UPDATE
                    provider_asset_id=COALESCE(VALUES(provider_asset_id),provider_asset_id),
                    task_status='PENDING',
                    attempts=0,
                    next_attempt_at=:nextAttemptAt,
                    claim_token=NULL,
                    claim_expires_at=NULL,
                    last_error_code=NULL
                """, new MapSqlParameterSource()
                .addValue("publicId", publicId)
                .addValue("providerAssetId", providerAssetId)
                .addValue("nextAttemptAt", nextAttemptAt));
    }

    public ReservationRow lockReservation(long mediaId) {
        List<ReservationRow> rows = jdbc.query("""
                SELECT id,event_id,managed_asset_id,storage_public_id,storage_state,
                       upload_token,upload_expires_at,is_thumbnail,status
                FROM event_media WHERE id=:mediaId FOR UPDATE
                """, params("mediaId", mediaId), (rs, row) -> new ReservationRow(
                rs.getLong("id"),
                rs.getString("event_id"),
                rs.getString("managed_asset_id"),
                rs.getString("storage_public_id"),
                rs.getString("storage_state"),
                rs.getString("upload_token"),
                local(rs.getTimestamp("upload_expires_at")),
                rs.getBoolean("is_thumbnail"),
                rs.getString("status")));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public boolean bumpEventVersion(String eventId, LocalDateTime expected) {
        return jdbc.update("""
                UPDATE historical_events
                SET updated_at=GREATEST(CURRENT_TIMESTAMP(6),updated_at+INTERVAL 1 MICROSECOND)
                WHERE id=:eventId AND updated_at=:expected
                """, new MapSqlParameterSource()
                .addValue("eventId", eventId)
                .addValue("expected", expected)) == 1;
    }

    public void finalizeReservation(
            long mediaId,
            EventImageStorage.StoredImage stored,
            String deliveryUrl,
            boolean thumbnail,
            int sortOrder
    ) {
        jdbc.update("""
                UPDATE event_media
                SET url=:deliveryUrl,
                    storage_original_url=:originalUrl,
                    storage_asset_id=:providerAssetId,
                    storage_version=:providerVersion,
                    storage_mime_type=:mimeType,
                    storage_format=:format,
                    storage_width=:width,
                    storage_height=:height,
                    uploaded_at=CURRENT_TIMESTAMP(6),
                    storage_state='READY',
                    upload_token=NULL,
                    upload_expires_at=NULL,
                    status='active',
                    is_thumbnail=:thumbnail,
                    sort_order=:sortOrder
                WHERE id=:mediaId AND storage_state='UPLOADING'
                """, new MapSqlParameterSource()
                .addValue("mediaId", mediaId)
                .addValue("deliveryUrl", deliveryUrl)
                .addValue("originalUrl", stored.originalUrl())
                .addValue("providerAssetId", stored.providerAssetId())
                .addValue("providerVersion", stored.providerVersion())
                .addValue("mimeType", stored.mimeType())
                .addValue("format", stored.format())
                .addValue("width", stored.width())
                .addValue("height", stored.height())
                .addValue("thumbnail", thumbnail)
                .addValue("sortOrder", sortOrder));
    }

    public void clearThumbnails(String eventId) {
        jdbc.update("""
                UPDATE event_media SET is_thumbnail=FALSE
                WHERE event_id=:eventId
                  AND storage_state IN ('UNMANAGED','READY')
                """, params("eventId", eventId));
    }

    public void completeCleanup(String publicId) {
        jdbc.update("""
                UPDATE event_media_storage_cleanup_tasks
                SET task_status='COMPLETED',claim_token=NULL,claim_expires_at=NULL,
                    last_error_code=NULL
                WHERE provider='cloudinary' AND public_id=:publicId AND operation='DELETE'
                """, params("publicId", publicId));
    }

    public ManagedMedia findManagedMedia(long mediaId) {
        List<ManagedMedia> rows = jdbc.query("""
                SELECT id,event_id,storage_public_id,storage_asset_id,storage_state,
                       is_thumbnail,status
                FROM event_media
                WHERE id=:mediaId AND storage_state<>'UNMANAGED'
                """, params("mediaId", mediaId), (rs, row) -> new ManagedMedia(
                rs.getLong("id"),
                rs.getString("event_id"),
                rs.getString("storage_public_id"),
                rs.getString("storage_asset_id"),
                rs.getString("storage_state"),
                rs.getBoolean("is_thumbnail"),
                rs.getString("status")));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public ReplacementMedia lockReplacementMedia(long mediaId) {
        List<ReplacementMedia> rows = jdbc.query("""
                SELECT id,event_id,managed_asset_id,storage_provider,storage_public_id,
                       storage_asset_id,storage_state,is_thumbnail,status,sort_order,
                       caption,alt_text,source_name,license
                FROM event_media
                WHERE id=:mediaId
                FOR UPDATE
                """, params("mediaId", mediaId), (rs, row) -> new ReplacementMedia(
                rs.getLong("id"),
                rs.getString("event_id"),
                rs.getString("managed_asset_id"),
                rs.getString("storage_provider"),
                rs.getString("storage_public_id"),
                rs.getString("storage_asset_id"),
                rs.getString("storage_state"),
                rs.getBoolean("is_thumbnail"),
                rs.getString("status"),
                rs.getInt("sort_order"),
                rs.getString("caption"),
                rs.getString("alt_text"),
                rs.getString("source_name"),
                rs.getString("license")));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void replaceManagedStorage(
            ReplacementMedia existing,
            String newAssetId,
            EventImageStorage.StoredImage stored,
            String deliveryUrl,
            EventImageValidator.ValidatedEventImage image,
            byte[] actorId,
            ReplacementMetadata metadata
    ) {
        int updated = jdbc.update("""
                UPDATE event_media
                SET managed_asset_id=:newAssetId,
                    storage_provider='cloudinary',
                    storage_public_id=:publicId,
                    storage_asset_id=:providerAssetId,
                    storage_original_url=:originalUrl,
                    storage_version=:providerVersion,
                    storage_mime_type=:mimeType,
                    storage_format=:format,
                    storage_byte_size=:byteSize,
                    storage_sha256=:sha256,
                    storage_width=:width,
                    storage_height=:height,
                    uploaded_by=:actorId,
                    uploaded_at=CURRENT_TIMESTAMP(6),
                    storage_state='READY',
                    upload_token=NULL,
                    upload_started_at=NULL,
                    upload_expires_at=NULL,
                    url=:deliveryUrl,
                    caption=:caption,
                    alt_text=:altText,
                    source_name=:sourceName,
                    license=:license
                WHERE id=:mediaId
                  AND storage_state='READY'
                  AND managed_asset_id=:oldAssetId
                  AND storage_public_id=:oldPublicId
                """, new MapSqlParameterSource()
                .addValue("mediaId", existing.id())
                .addValue("oldAssetId", existing.managedAssetId())
                .addValue("oldPublicId", existing.publicId())
                .addValue("newAssetId", newAssetId)
                .addValue("publicId", stored.publicId())
                .addValue("providerAssetId", stored.providerAssetId())
                .addValue("originalUrl", stored.originalUrl())
                .addValue("providerVersion", stored.providerVersion())
                .addValue("mimeType", stored.mimeType())
                .addValue("format", stored.format())
                .addValue("byteSize", stored.byteSize())
                .addValue("sha256", image.sha256())
                .addValue("width", stored.width())
                .addValue("height", stored.height())
                .addValue("actorId", actorId)
                .addValue("deliveryUrl", deliveryUrl)
                .addValue("caption", metadata.caption())
                .addValue("altText", metadata.altText())
                .addValue("sourceName", metadata.sourceName())
                .addValue("license", metadata.license()));
        if (updated != 1) {
            throw new IllegalStateException("Managed image replacement target changed");
        }
    }

    public void markDeletePending(long mediaId) {
        jdbc.update("""
                UPDATE event_media
                SET storage_state='DELETE_PENDING',status='hidden',is_thumbnail=FALSE
                WHERE id=:mediaId AND storage_state='READY'
                """, params("mediaId", mediaId));
    }

    public List<Long> visibleMediaIds(String eventId) {
        return jdbc.queryForList("""
                SELECT id FROM event_media
                WHERE event_id=:eventId
                  AND storage_state IN ('UNMANAGED','READY')
                ORDER BY is_thumbnail DESC,sort_order,id
                """, params("eventId", eventId), Long.class);
    }

    public void updateOrder(long mediaId, int order) {
        jdbc.update("UPDATE event_media SET sort_order=:sortOrder WHERE id=:mediaId",
                new MapSqlParameterSource()
                        .addValue("mediaId", mediaId)
                        .addValue("sortOrder", order));
    }

    public CleanupClaim claimCleanup(
            LocalDateTime now,
            LocalDateTime leaseUntil,
            String claimToken,
            int maxAttempts
    ) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("claimToken", claimToken)
                .addValue("leaseUntil", leaseUntil)
                .addValue("maxAttempts", maxAttempts)
                .addValue("now", now);
        List<Long> candidates = jdbc.queryForList("""
                SELECT id FROM event_media_storage_cleanup_tasks
                WHERE operation='DELETE'
                  AND attempts<:maxAttempts
                  AND next_attempt_at<=:now
                  AND (
                    task_status='PENDING'
                    OR (task_status='CLAIMED' AND claim_expires_at<:now)
                  )
                ORDER BY next_attempt_at,id
                LIMIT 1
                FOR UPDATE SKIP LOCKED
                """, parameters, Long.class);
        if (candidates.isEmpty()) {
            return null;
        }
        parameters.addValue("taskId", candidates.getFirst());
        int claimed = jdbc.update("""
                UPDATE event_media_storage_cleanup_tasks
                SET task_status='CLAIMED',claim_token=:claimToken,
                    claim_expires_at=:leaseUntil,attempts=attempts+1
                WHERE id=:taskId
                  AND operation='DELETE'
                  AND attempts<:maxAttempts
                  AND next_attempt_at<=:now
                  AND (
                    task_status='PENDING'
                    OR (task_status='CLAIMED' AND claim_expires_at<:now)
                  )
                """, parameters);
        if (claimed != 1) {
            return null;
        }
        List<CleanupClaim> rows = jdbc.query("""
                SELECT id,provider,public_id,provider_asset_id,attempts
                FROM event_media_storage_cleanup_tasks
                WHERE claim_token=:claimToken AND task_status='CLAIMED'
                """, params("claimToken", claimToken), (rs, row) -> new CleanupClaim(
                rs.getLong("id"),
                rs.getString("provider"),
                rs.getString("public_id"),
                rs.getString("provider_asset_id"),
                rs.getInt("attempts")));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public CleanupDecision cleanupDecision(String publicId, LocalDateTime now) {
        List<CleanupDecision> rows = jdbc.query("""
                SELECT storage_state,upload_expires_at
                FROM event_media
                WHERE storage_provider='cloudinary' AND storage_public_id=:publicId
                """, params("publicId", publicId), (rs, row) -> new CleanupDecision(
                rs.getString("storage_state"),
                local(rs.getTimestamp("upload_expires_at"))));
        if (rows.isEmpty()) {
            return new CleanupDecision("ABSENT", null);
        }
        CleanupDecision decision = rows.getFirst();
        if ("UPLOADING".equals(decision.storageState())
                && decision.uploadExpiresAt() != null
                && decision.uploadExpiresAt().isAfter(now)) {
            return decision;
        }
        return decision;
    }

    public void releaseCleanup(long taskId, String claimToken, LocalDateTime nextAttempt, String errorCode) {
        jdbc.update("""
                UPDATE event_media_storage_cleanup_tasks
                SET task_status='PENDING',next_attempt_at=:nextAttempt,
                    claim_token=NULL,claim_expires_at=NULL,last_error_code=:errorCode
                WHERE id=:taskId AND claim_token=:claimToken AND task_status='CLAIMED'
                """, new MapSqlParameterSource()
                .addValue("taskId", taskId)
                .addValue("claimToken", claimToken)
                .addValue("nextAttempt", nextAttempt)
                .addValue("errorCode", errorCode));
    }

    public void failCleanup(long taskId, String claimToken, String errorCode) {
        jdbc.update("""
                UPDATE event_media_storage_cleanup_tasks
                SET task_status='FAILED',claim_token=NULL,claim_expires_at=NULL,
                    last_error_code=:errorCode
                WHERE id=:taskId AND claim_token=:claimToken AND task_status='CLAIMED'
                """, new MapSqlParameterSource()
                .addValue("taskId", taskId)
                .addValue("claimToken", claimToken)
                .addValue("errorCode", errorCode));
        jdbc.update("""
                UPDATE event_media SET storage_state='DELETE_FAILED',status='hidden',
                    is_thumbnail=FALSE
                WHERE storage_provider='cloudinary'
                  AND storage_public_id=(
                    SELECT public_id FROM event_media_storage_cleanup_tasks WHERE id=:taskId
                  )
                  AND storage_state IN ('UPLOADING','DELETE_PENDING')
                """, params("taskId", taskId));
    }

    public void finishCleanup(long taskId, String claimToken, String publicId) {
        jdbc.update("""
                DELETE FROM event_media
                WHERE storage_provider='cloudinary' AND storage_public_id=:publicId
                  AND storage_state IN ('UPLOADING','DELETE_PENDING','DELETE_FAILED')
                """, params("publicId", publicId));
        jdbc.update("""
                UPDATE event_media_storage_cleanup_tasks
                SET task_status='COMPLETED',claim_token=NULL,claim_expires_at=NULL,
                    last_error_code=NULL
                WHERE id=:taskId AND claim_token=:claimToken AND task_status='CLAIMED'
                """, new MapSqlParameterSource()
                .addValue("taskId", taskId)
                .addValue("claimToken", claimToken));
    }

    public CleanupSummary cleanupSummary() {
        List<CleanupStatusCount> rows = jdbc.query("""
                SELECT task_status, COUNT(*) AS task_count
                FROM event_media_storage_cleanup_tasks
                GROUP BY task_status
                """, (rs, row) -> new CleanupStatusCount(
                rs.getString("task_status"), rs.getLong("task_count")));
        long pending = 0, claimed = 0, failed = 0, completed = 0;
        for (CleanupStatusCount row : rows) {
            switch (row.status()) {
                case "PENDING" -> pending = row.count();
                case "CLAIMED" -> claimed = row.count();
                case "FAILED" -> failed = row.count();
                case "COMPLETED" -> completed = row.count();
                default -> throw new IllegalStateException("Unexpected cleanup status");
            }
        }
        return new CleanupSummary(pending, claimed, failed, completed);
    }

    public long countCleanup(CleanupQuery query) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM event_media_storage_cleanup_tasks task "
                + query.where(), query.parameters(), Long.class);
    }

    /**
     * Counts PENDING tasks whose {@code next_attempt_at} is already in the
     * past. Used by the Admin cleanup page to surface "Quá hạn xử lý" badges
     * even when the worker has not yet drained them, so operators have a
     * stable signal when a deploy leaves tasks stranded.
     */
    public long countOverduePending(LocalDateTime now) {
        Long count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_media_storage_cleanup_tasks
                WHERE task_status='PENDING' AND next_attempt_at<=:now
                """, params("now", now), Long.class);
        return count == null ? 0L : count;
    }

    public List<CleanupListItem> findCleanup(CleanupQuery query) {
        MapSqlParameterSource parameters = query.parameters()
                .addValue("limit", query.limit())
                .addValue("offset", query.offset());
        return jdbc.query("""
                SELECT task.id,task.provider,task.public_id,task.provider_asset_id,
                       task.operation,task.task_status,task.attempts,task.next_attempt_at,
                       task.claim_expires_at,task.last_error_code,task.created_at,task.updated_at,
                       media.id AS media_id,media.event_id,media.managed_asset_id
                FROM event_media_storage_cleanup_tasks task
                LEFT JOIN event_media media
                  ON media.storage_provider=task.provider
                 AND media.storage_public_id=task.public_id
                %s
                ORDER BY %s
                LIMIT :limit OFFSET :offset
                """.formatted(query.where(), query.orderBy()), parameters, (rs, row) ->
                new CleanupListItem(
                        rs.getLong("id"),
                        rs.getString("provider"),
                        rs.getString("public_id"),
                        rs.getString("provider_asset_id"),
                        rs.getString("operation"),
                        rs.getString("task_status"),
                        rs.getInt("attempts"),
                        local(rs.getTimestamp("next_attempt_at")),
                        local(rs.getTimestamp("claim_expires_at")),
                        rs.getString("last_error_code"),
                        local(rs.getTimestamp("created_at")),
                        local(rs.getTimestamp("updated_at")),
                        rs.getObject("media_id") == null ? null : rs.getLong("media_id"),
                        rs.getString("event_id"),
                        rs.getString("managed_asset_id")));
    }

    private MapSqlParameterSource params(String name, Object value) {
        return new MapSqlParameterSource(name, value);
    }

    private LocalDateTime local(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toLocalDateTime();
    }

    public record EventLock(String id, String status, LocalDateTime updatedAt) {
    }

    public record Reservation(
            String eventId,
            String assetId,
            String publicId,
            String uploadToken,
            byte[] actorId,
            int sortOrder,
            LocalDateTime startedAt,
            LocalDateTime expiresAt,
            EventImageValidator.ValidatedEventImage image
    ) {
    }

    public record ReservationRow(
            long id,
            String eventId,
            String assetId,
            String publicId,
            String storageState,
            String uploadToken,
            LocalDateTime uploadExpiresAt,
            boolean thumbnail,
            String status
    ) {
    }

    public record ManagedMedia(
            long id,
            String eventId,
            String publicId,
            String providerAssetId,
            String storageState,
            boolean thumbnail,
            String status
    ) {
    }

    public record ReplacementMedia(
            long id,
            String eventId,
            String managedAssetId,
            String provider,
            String publicId,
            String providerAssetId,
            String storageState,
            boolean thumbnail,
            String status,
            int sortOrder,
            String caption,
            String altText,
            String sourceName,
            String license
    ) {
    }

    public record ReplacementMetadata(String caption, String altText, String sourceName, String license) {
    }

    public record CleanupClaim(
            long id,
            String provider,
            String publicId,
            String providerAssetId,
            int attempts
    ) {
    }

    public record CleanupDecision(String storageState, LocalDateTime uploadExpiresAt) {
    }

    public record CleanupSummary(long pending, long claimed, long failed, long completed) {
    }

    private record CleanupStatusCount(String status, long count) {
    }

    public record CleanupListItem(
            long id,
            String provider,
            String publicId,
            String providerAssetId,
            String operation,
            String status,
            int attempts,
            LocalDateTime nextAttemptAt,
            LocalDateTime claimExpiresAt,
            String lastErrorCode,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            Long mediaId,
            String eventId,
            String managedAssetId
    ) {
    }

    public record CleanupQuery(String where, MapSqlParameterSource parameters, String orderBy, int limit, int offset) {
    }
}

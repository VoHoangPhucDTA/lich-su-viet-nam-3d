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
        jdbc.update("""
                INSERT INTO event_media_storage_cleanup_tasks(
                    provider,public_id,operation,task_status,attempts,next_attempt_at
                ) VALUES('cloudinary',:publicId,'DELETE','PENDING',0,:nextAttemptAt)
                ON DUPLICATE KEY UPDATE
                    provider_asset_id=NULL,
                    task_status='PENDING',
                    attempts=0,
                    next_attempt_at=:nextAttemptAt,
                    claim_token=NULL,
                    claim_expires_at=NULL,
                    last_error_code=NULL
                """, new MapSqlParameterSource()
                .addValue("publicId", publicId)
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
}

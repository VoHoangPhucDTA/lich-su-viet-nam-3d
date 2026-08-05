package com.lichsuvn.backend.admin.infrastructure;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Repository
public class AdminEventMediaMutationRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public AdminEventMediaMutationRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean existsEvent(String eventId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM historical_events WHERE id=:id)",
                new MapSqlParameterSource("id", eventId), Boolean.class));
    }

    public boolean claimVersion(String eventId, LocalDateTime expected) {
        return jdbc.update("""
                UPDATE historical_events
                SET updated_at=GREATEST(CURRENT_TIMESTAMP(6),
                    updated_at + INTERVAL 1 MICROSECOND)
                WHERE id=:id AND updated_at=:expected
                """, new MapSqlParameterSource().addValue("id", eventId).addValue("expected", expected)) == 1;
    }

    public List<Map<String, Object>> lockMedia(String eventId) {
        return jdbc.queryForList("""
                SELECT id, event_id, media_type, url, caption, alt_text, source_name, license,
                       storage_type, is_thumbnail, sort_order, status, created_at, storage_state
                FROM event_media WHERE event_id=:eventId
                  AND storage_state IN ('UNMANAGED','READY')
                ORDER BY id FOR UPDATE
                """, new MapSqlParameterSource("eventId", eventId));
    }

    public List<Map<String, Object>> findMedia(String eventId) {
        return jdbc.queryForList("""
                SELECT id, event_id, media_type, url, caption, alt_text, source_name, license,
                       storage_type, is_thumbnail, sort_order, status, created_at, storage_state
                FROM event_media WHERE event_id=:eventId
                  AND storage_state IN ('UNMANAGED','READY')
                ORDER BY id
                """, new MapSqlParameterSource("eventId", eventId));
    }

    public Map<String, Object> lockMedia(String eventId, long mediaId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, event_id, media_type, url, caption, alt_text, source_name, license,
                       storage_type, is_thumbnail, sort_order, status, created_at, storage_state
                FROM event_media WHERE id=:mediaId FOR UPDATE
                """, new MapSqlParameterSource().addValue("eventId", eventId).addValue("mediaId", mediaId));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public Map<String, Object> findMedia(long mediaId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT id, event_id, media_type, url, caption, alt_text, source_name, license,
                       storage_type, is_thumbnail, sort_order, status, created_at, storage_state
                FROM event_media WHERE id=:mediaId
                """, new MapSqlParameterSource("mediaId", mediaId));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public int countMedia(String eventId) {
        Integer count = jdbc.queryForObject(
                """
                SELECT COUNT(*) FROM event_media WHERE event_id=:eventId
                  AND storage_state IN ('UNMANAGED','UPLOADING','READY')
                """,
                new MapSqlParameterSource("eventId", eventId), Integer.class);
        return count == null ? 0 : count;
    }

    public long insert(String eventId, String mediaType, String url, String caption, String altText,
                       String sourceName, String license, String status, int sortOrder) {
        var params = new MapSqlParameterSource()
                .addValue("eventId", eventId).addValue("mediaType", mediaType).addValue("url", url)
                .addValue("caption", caption).addValue("altText", altText)
                .addValue("sourceName", sourceName).addValue("license", license)
                .addValue("status", status).addValue("sortOrder", sortOrder);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
                INSERT INTO event_media
                    (event_id, media_type, url, caption, alt_text, source_name, license,
                     storage_type, is_thumbnail, sort_order, status)
                VALUES (:eventId, :mediaType, :url, :caption, :altText, :sourceName, :license,
                        'external', FALSE, :sortOrder, :status)
                """, params, keyHolder, new String[]{"id"});
        Number key = keyHolder.getKey();
        if (key == null) throw new IllegalStateException("Missing generated event media ID");
        return key.longValue();
    }

    public int update(long mediaId, String mediaType, String url, String caption, String altText,
                      String sourceName, String license, String status, boolean thumbnail) {
        return jdbc.update("""
                UPDATE event_media
                SET media_type=:mediaType, url=:url, caption=:caption, alt_text=:altText,
                    source_name=:sourceName, license=:license, status=:status,
                    is_thumbnail=:thumbnail
                WHERE id=:mediaId
                  AND storage_state='UNMANAGED'
                """, new MapSqlParameterSource()
                .addValue("mediaId", mediaId).addValue("mediaType", mediaType).addValue("url", url)
                .addValue("caption", caption).addValue("altText", altText)
                .addValue("sourceName", sourceName).addValue("license", license)
                .addValue("status", status).addValue("thumbnail", thumbnail));
    }

    public int updateManaged(
            long mediaId,
            String caption,
            String altText,
            String sourceName,
            String license,
            String status,
            boolean thumbnail
    ) {
        return jdbc.update("""
                UPDATE event_media
                SET caption=:caption,alt_text=:altText,source_name=:sourceName,
                    license=:license,status=:status,is_thumbnail=:thumbnail
                WHERE id=:mediaId AND storage_state='READY'
                """, new MapSqlParameterSource()
                .addValue("mediaId", mediaId)
                .addValue("caption", caption)
                .addValue("altText", altText)
                .addValue("sourceName", sourceName)
                .addValue("license", license)
                .addValue("status", status)
                .addValue("thumbnail", thumbnail));
    }

    public void clearThumbnails(String eventId) {
        jdbc.update("""
                UPDATE event_media SET is_thumbnail=FALSE WHERE event_id=:eventId
                  AND storage_state IN ('UNMANAGED','READY')
                """,
                new MapSqlParameterSource("eventId", eventId));
    }

    public void setThumbnail(long mediaId) {
        jdbc.update("""
                UPDATE event_media SET is_thumbnail=TRUE, sort_order=0 WHERE id=:mediaId
                  AND storage_state IN ('UNMANAGED','READY')
                """,
                new MapSqlParameterSource("mediaId", mediaId));
    }

    public void delete(long mediaId) {
        jdbc.update("DELETE FROM event_media WHERE id=:mediaId AND storage_state='UNMANAGED'",
                new MapSqlParameterSource("mediaId", mediaId));
    }

    public void updateOrder(long mediaId, int sortOrder, boolean thumbnail) {
        jdbc.update("""
                UPDATE event_media SET sort_order=:sortOrder, is_thumbnail=:thumbnail
                WHERE id=:mediaId
                  AND storage_state IN ('UNMANAGED','READY')
                """, new MapSqlParameterSource().addValue("mediaId", mediaId)
                .addValue("sortOrder", sortOrder).addValue("thumbnail", thumbnail));
    }
}

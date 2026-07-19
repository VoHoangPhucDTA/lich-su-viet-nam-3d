package com.lichsuvn.backend.tts.infrastructure;

import com.lichsuvn.backend.tts.domain.TtsAudioAsset;
import com.lichsuvn.backend.tts.domain.TtsAudioAssetClaimResult;
import com.lichsuvn.backend.tts.domain.TtsAudioAssetStatus;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.LocalDateTime;

@Repository
public class TtsAudioAssetRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public TtsAudioAssetRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public TtsAudioAssetClaimResult claimPending(NewAssetCommand command) {
        String id = UUID.randomUUID().toString();
        try {
            insertPending(id, command);
            TtsAudioAsset asset = findById(id)
                    .orElseThrow(() -> new IllegalStateException("Inserted TTS asset could not be read back"));
            return new TtsAudioAssetClaimResult(TtsAudioAssetClaimResult.Kind.CLAIMED_NEW, asset);
        } catch (DuplicateKeyException duplicate) {
            TtsAudioAsset existing = findByCacheKey(command.cacheKey())
                    .orElseThrow(() -> new IllegalStateException(
                            "Duplicate key while inserting TTS asset, but no existing cache_key record was found",
                            duplicate
                    ));
            return new TtsAudioAssetClaimResult(kindFor(existing.status()), existing);
        }
    }

    public Optional<TtsAudioAsset> findById(String id) {
        String sql = """
                SELECT *
                FROM tts_audio_assets
                WHERE id = :id
                LIMIT 1
                """;
        List<TtsAudioAsset> results = jdbc.query(sql, new MapSqlParameterSource("id", id), mapper());
        return results.stream().findFirst();
    }

    public Optional<TtsAudioAsset> findByCacheKey(String cacheKey) {
        String sql = """
                SELECT *
                FROM tts_audio_assets
                WHERE cache_key = :cacheKey
                LIMIT 1
                """;
        List<TtsAudioAsset> results = jdbc.query(sql, new MapSqlParameterSource("cacheKey", cacheKey), mapper());
        return results.stream().findFirst();
    }

    public int countByCacheKey(String cacheKey) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM tts_audio_assets WHERE cache_key = :cacheKey",
                new MapSqlParameterSource("cacheKey", cacheKey),
                Integer.class
        );
        return count == null ? 0 : count;
    }

    public Optional<TtsAudioAsset> claimPendingForSynthesis(String id, LocalDateTime claimExpiresAt, int maxAttempts) {
        String claimToken = UUID.randomUUID().toString();
        int updated = jdbc.update("""
                UPDATE tts_audio_assets
                SET status = :status,
                    claim_token = :claimToken,
                    claim_expires_at = :claimExpiresAt,
                    claimed_at = CURRENT_TIMESTAMP,
                    last_attempt_at = CURRENT_TIMESTAMP,
                    attempt_count = attempt_count + 1,
                    error_code = NULL,
                    error_message = NULL
                WHERE id = :id
                  AND status = :pending
                  AND attempt_count < :maxAttempts
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("status", TtsAudioAssetStatus.SYNTHESIZING.value())
                .addValue("claimToken", claimToken)
                .addValue("claimExpiresAt", claimExpiresAt)
                .addValue("pending", TtsAudioAssetStatus.PENDING.value())
                .addValue("maxAttempts", maxAttempts));
        return updated == 1 ? findById(id).filter(asset -> claimToken.equals(asset.claimToken())) : Optional.empty();
    }

    public Optional<TtsAudioAsset> claimFailedForSynthesis(
            String id,
            LocalDateTime retryBefore,
            LocalDateTime claimExpiresAt,
            int maxAttempts
    ) {
        String claimToken = UUID.randomUUID().toString();
        int updated = jdbc.update("""
                UPDATE tts_audio_assets
                SET status = :status,
                    claim_token = :claimToken,
                    claim_expires_at = :claimExpiresAt,
                    claimed_at = CURRENT_TIMESTAMP,
                    last_attempt_at = CURRENT_TIMESTAMP,
                    attempt_count = attempt_count + 1,
                    error_code = NULL,
                    error_message = NULL
                WHERE id = :id
                  AND status = :failed
                  AND attempt_count < :maxAttempts
                  AND updated_at < :retryBefore
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("status", TtsAudioAssetStatus.SYNTHESIZING.value())
                .addValue("claimToken", claimToken)
                .addValue("claimExpiresAt", claimExpiresAt)
                .addValue("failed", TtsAudioAssetStatus.FAILED.value())
                .addValue("maxAttempts", maxAttempts)
                .addValue("retryBefore", retryBefore));
        return updated == 1 ? findById(id).filter(asset -> claimToken.equals(asset.claimToken())) : Optional.empty();
    }

    public Optional<TtsAudioAsset> claimStaleForSynthesis(String id, LocalDateTime staleBefore, LocalDateTime claimExpiresAt, int maxAttempts) {
        String claimToken = UUID.randomUUID().toString();
        int updated = jdbc.update("""
                UPDATE tts_audio_assets
                SET status = :status,
                    claim_token = :claimToken,
                    claim_expires_at = :claimExpiresAt,
                    claimed_at = CURRENT_TIMESTAMP,
                    last_attempt_at = CURRENT_TIMESTAMP,
                    attempt_count = attempt_count + 1,
                    error_code = NULL,
                    error_message = NULL
                WHERE id = :id
                  AND status IN (:recoverableStatuses)
                  AND claim_expires_at < :staleBefore
                  AND attempt_count < :maxAttempts
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("status", TtsAudioAssetStatus.SYNTHESIZING.value())
                .addValue("claimToken", claimToken)
                .addValue("claimExpiresAt", claimExpiresAt)
                .addValue("recoverableStatuses", List.of(
                        TtsAudioAssetStatus.SYNTHESIZING.value(),
                        TtsAudioAssetStatus.UPLOADING.value()
                ))
                .addValue("staleBefore", staleBefore)
                .addValue("maxAttempts", maxAttempts));
        return updated == 1 ? findById(id).filter(asset -> claimToken.equals(asset.claimToken())) : Optional.empty();
    }

    public List<String> findStaleClaimIds(LocalDateTime staleBefore, int maxAttempts, int limit) {
        return jdbc.queryForList("""
                SELECT id
                FROM tts_audio_assets
                WHERE status IN (:recoverableStatuses)
                  AND claim_expires_at < :staleBefore
                  AND attempt_count < :maxAttempts
                ORDER BY claim_expires_at ASC
                LIMIT :limit
                """, new MapSqlParameterSource()
                .addValue("recoverableStatuses", List.of(
                        TtsAudioAssetStatus.SYNTHESIZING.value(),
                        TtsAudioAssetStatus.UPLOADING.value()
                ))
                .addValue("staleBefore", staleBefore)
                .addValue("maxAttempts", maxAttempts)
                .addValue("limit", limit), String.class);
    }

    public boolean markUploading(String id, String claimToken, LocalDateTime claimExpiresAt) {
        return jdbc.update("""
                UPDATE tts_audio_assets
                SET status = :status,
                    claim_expires_at = :claimExpiresAt
                WHERE id = :id
                  AND claim_token = :claimToken
                  AND status = :synthesizing
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("claimToken", claimToken)
                .addValue("claimExpiresAt", claimExpiresAt)
                .addValue("status", TtsAudioAssetStatus.UPLOADING.value())
                .addValue("uploading", TtsAudioAssetStatus.UPLOADING.value())
                .addValue("synthesizing", TtsAudioAssetStatus.SYNTHESIZING.value())) == 1;
    }

    public boolean extendClaimLease(String id, String claimToken, LocalDateTime claimExpiresAt) {
        return jdbc.update("""
                UPDATE tts_audio_assets
                SET claim_expires_at = :claimExpiresAt
                WHERE id = :id
                  AND claim_token = :claimToken
                  AND status IN (:claimStatuses)
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("claimToken", claimToken)
                .addValue("claimExpiresAt", claimExpiresAt)
                .addValue("claimStatuses", List.of(
                        TtsAudioAssetStatus.SYNTHESIZING.value(),
                        TtsAudioAssetStatus.UPLOADING.value()
                ))) == 1;
    }

    public boolean markReady(String id, String claimToken, StoredAudioCommand audio) {
        return jdbc.update("""
                UPDATE tts_audio_assets
                SET status = :status,
                    storage_provider = :storageProvider,
                    storage_public_id = :storagePublicId,
                    audio_url = :audioUrl,
                    mime_type = :mimeType,
                    file_size = :fileSize,
                    duration_ms = :durationMs,
                    claim_token = NULL,
                    claim_expires_at = NULL,
                    error_code = NULL,
                    error_message = NULL
                WHERE id = :id
                  AND claim_token = :claimToken
                  AND status = :uploading
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("claimToken", claimToken)
                .addValue("status", TtsAudioAssetStatus.READY.value())
                .addValue("uploading", TtsAudioAssetStatus.UPLOADING.value())
                .addValue("storageProvider", audio.storageProvider())
                .addValue("storagePublicId", audio.storagePublicId())
                .addValue("audioUrl", audio.audioUrl())
                .addValue("mimeType", audio.mimeType())
                .addValue("fileSize", audio.fileSize())
                .addValue("durationMs", audio.durationMs())) == 1;
    }

    public boolean markFailed(String id, String claimToken, String errorCode, String errorMessage) {
        return jdbc.update("""
                UPDATE tts_audio_assets
                SET status = :status,
                    claim_token = NULL,
                    claim_expires_at = NULL,
                    error_code = :errorCode,
                    error_message = :errorMessage
                WHERE id = :id
                  AND claim_token = :claimToken
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("claimToken", claimToken)
                .addValue("status", TtsAudioAssetStatus.FAILED.value())
                .addValue("errorCode", errorCode)
                .addValue("errorMessage", errorMessage)) == 1;
    }

    public boolean markPendingFailed(String id, String errorCode, String errorMessage) {
        return jdbc.update("""
                UPDATE tts_audio_assets
                SET status = :status,
                    error_code = :errorCode,
                    error_message = :errorMessage
                WHERE id = :id
                  AND status = :pending
                  AND claim_token IS NULL
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("status", TtsAudioAssetStatus.FAILED.value())
                .addValue("pending", TtsAudioAssetStatus.PENDING.value())
                .addValue("errorCode", errorCode)
                .addValue("errorMessage", errorMessage)) == 1;
    }

    private void insertPending(String id, NewAssetCommand command) {
        String sql = """
                INSERT INTO tts_audio_assets (
                    id, cache_key, event_id, text_hash, provider, voice, synthesis_speed,
                    audio_format, return_option, without_filter, text_processing_version,
                    status, attempt_count
                ) VALUES (
                    :id, :cacheKey, :eventId, :textHash, :provider, :voice, :synthesisSpeed,
                    :audioFormat, :returnOption, :withoutFilter, :textProcessingVersion,
                    :status, 0
                )
                """;
        jdbc.update(sql, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("cacheKey", command.cacheKey())
                .addValue("eventId", command.eventId())
                .addValue("textHash", command.textHash())
                .addValue("provider", command.provider())
                .addValue("voice", command.voice())
                .addValue("synthesisSpeed", command.synthesisSpeed())
                .addValue("audioFormat", command.audioFormat())
                .addValue("returnOption", command.returnOption())
                .addValue("withoutFilter", command.withoutFilter())
                .addValue("textProcessingVersion", command.textProcessingVersion())
                .addValue("status", TtsAudioAssetStatus.PENDING.value()));
    }

    private TtsAudioAssetClaimResult.Kind kindFor(TtsAudioAssetStatus status) {
        return switch (status) {
            case PENDING -> TtsAudioAssetClaimResult.Kind.EXISTING_PENDING;
            case SYNTHESIZING, UPLOADING -> TtsAudioAssetClaimResult.Kind.EXISTING_PENDING;
            case READY -> TtsAudioAssetClaimResult.Kind.EXISTING_READY;
            case FAILED -> TtsAudioAssetClaimResult.Kind.EXISTING_FAILED;
        };
    }

    private RowMapper<TtsAudioAsset> mapper() {
        return (rs, rowNum) -> mapAsset(rs);
    }

    private TtsAudioAsset mapAsset(ResultSet rs) throws SQLException {
        return new TtsAudioAsset(
                rs.getString("id"),
                rs.getString("cache_key"),
                rs.getString("event_id"),
                rs.getString("text_hash"),
                rs.getString("provider"),
                rs.getString("voice"),
                rs.getBigDecimal("synthesis_speed"),
                rs.getString("audio_format"),
                rs.getInt("return_option"),
                rs.getBoolean("without_filter"),
                rs.getString("text_processing_version"),
                rs.getString("storage_provider"),
                rs.getString("storage_public_id"),
                rs.getString("audio_url"),
                rs.getString("mime_type"),
                getLong(rs, "file_size"),
                getLong(rs, "duration_ms"),
                TtsAudioAssetStatus.fromValue(rs.getString("status")),
                columnExists(rs, "claim_token") ? rs.getString("claim_token") : null,
                timestampOrNull(rs, "claim_expires_at"),
                rs.getTimestamp("claimed_at") == null ? null : rs.getTimestamp("claimed_at").toLocalDateTime(),
                rs.getTimestamp("last_attempt_at") == null ? null : rs.getTimestamp("last_attempt_at").toLocalDateTime(),
                rs.getInt("attempt_count"),
                rs.getString("error_code"),
                rs.getString("error_message"),
                rs.getTimestamp("created_at").toLocalDateTime(),
                rs.getTimestamp("updated_at").toLocalDateTime()
        );
    }

    private Long getLong(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    private LocalDateTime timestampOrNull(ResultSet rs, String column) throws SQLException {
        if (!columnExists(rs, column) || rs.getTimestamp(column) == null) {
            return null;
        }
        return rs.getTimestamp(column).toLocalDateTime();
    }

    private boolean columnExists(ResultSet rs, String column) throws SQLException {
        for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++) {
            if (column.equalsIgnoreCase(rs.getMetaData().getColumnName(i))) {
                return true;
            }
        }
        return false;
    }

    public record NewAssetCommand(
            String cacheKey,
            String eventId,
            String textHash,
            String provider,
            String voice,
            BigDecimal synthesisSpeed,
            String audioFormat,
            int returnOption,
            boolean withoutFilter,
            String textProcessingVersion
    ) {
    }

    public record StoredAudioCommand(
            String storageProvider,
            String storagePublicId,
            String audioUrl,
            String mimeType,
            Long fileSize,
            Long durationMs
    ) {
    }
}

package com.lichsuvn.backend.tts.infrastructure;

import com.lichsuvn.backend.tts.domain.TtsAudioAssetStatus;
import com.lichsuvn.backend.tts.domain.TtsAudioChunk;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class TtsAudioChunkRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public TtsAudioChunkRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ClaimResult claimOrGet(NewChunkCommand command) {
        String id = UUID.randomUUID().toString();
        try {
            jdbc.update("""
                    INSERT INTO tts_audio_chunks (
                        id, chunk_key, chunk_text, text_hash, provider, voice,
                        synthesis_speed, audio_format, return_option, without_filter,
                        text_processing_version, chunking_version, status, attempt_count
                    ) VALUES (:id, :chunkKey, :chunkText, :textHash, :provider, :voice,
                        :speed, :format, :returnOption, :withoutFilter,
                        :textVersion, :chunkingVersion, :status, 0)
                    """, new MapSqlParameterSource()
                    .addValue("id", id).addValue("chunkKey", command.chunkKey())
                    .addValue("chunkText", command.chunkText()).addValue("textHash", command.textHash())
                    .addValue("provider", command.provider()).addValue("voice", command.voice())
                    .addValue("speed", command.synthesisSpeed()).addValue("format", command.audioFormat())
                    .addValue("returnOption", command.returnOption()).addValue("withoutFilter", command.withoutFilter())
                    .addValue("textVersion", command.textProcessingVersion())
                    .addValue("chunkingVersion", command.chunkingVersion())
                    .addValue("status", TtsAudioAssetStatus.PENDING.value()));
            return new ClaimResult(ClaimKind.CLAIMED_NEW, findById(id).orElseThrow());
        } catch (DuplicateKeyException ex) {
            return findByChunkKey(command.chunkKey())
                    .map(chunk -> new ClaimResult(kindFor(chunk.status()), chunk))
                    .orElseThrow(() -> new IllegalStateException("Chunk duplicate was not readable", ex));
        }
    }

    public Optional<TtsAudioChunk> claimPendingForSynthesis(String id, LocalDateTime expiresAt, int maxAttempts) {
        String token = UUID.randomUUID().toString();
        int updated = jdbc.update("""
                UPDATE tts_audio_chunks SET status=:synthesizing, claim_token=:token,
                    claim_expires_at=:expiresAt, last_attempt_at=CURRENT_TIMESTAMP,
                    attempt_count=attempt_count+1, error_code=NULL, error_message=NULL
                WHERE id=:id AND status=:pending AND attempt_count < :maxAttempts
                """, new MapSqlParameterSource().addValue("id", id).addValue("token", token)
                .addValue("expiresAt", expiresAt).addValue("synthesizing", TtsAudioAssetStatus.SYNTHESIZING.value())
                .addValue("pending", TtsAudioAssetStatus.PENDING.value()).addValue("maxAttempts", maxAttempts));
        return updated == 1 ? findById(id).filter(c -> token.equals(c.claimToken())) : Optional.empty();
    }

    public Optional<TtsAudioChunk> claimFailedForSynthesis(String id, LocalDateTime retryBefore,
                                                            LocalDateTime expiresAt, int maxAttempts) {
        return claimRetryable(id, "status=:failed AND updated_at < :retryBefore", retryBefore, expiresAt, maxAttempts,
                TtsAudioAssetStatus.FAILED.value());
    }

    public Optional<TtsAudioChunk> claimStaleForSynthesis(String id, LocalDateTime staleBefore,
                                                           LocalDateTime expiresAt, int maxAttempts) {
        String token = UUID.randomUUID().toString();
        int updated = jdbc.update("""
                UPDATE tts_audio_chunks SET status=:synthesizing, claim_token=:token,
                    claim_expires_at=:expiresAt, last_attempt_at=CURRENT_TIMESTAMP,
                    attempt_count=attempt_count+1, error_code=NULL, error_message=NULL
                WHERE id=:id AND status IN (:statuses) AND claim_expires_at < :staleBefore
                  AND attempt_count < :maxAttempts
                """, new MapSqlParameterSource().addValue("id", id).addValue("token", token)
                .addValue("expiresAt", expiresAt).addValue("staleBefore", staleBefore)
                .addValue("maxAttempts", maxAttempts).addValue("synthesizing", TtsAudioAssetStatus.SYNTHESIZING.value())
                .addValue("statuses", List.of(TtsAudioAssetStatus.SYNTHESIZING.value(), TtsAudioAssetStatus.UPLOADING.value())));
        return updated == 1 ? findById(id).filter(c -> token.equals(c.claimToken())) : Optional.empty();
    }

    private Optional<TtsAudioChunk> claimRetryable(String id, String predicate, LocalDateTime retryBefore,
                                                    LocalDateTime expiresAt, int maxAttempts, String failed) {
        String token = UUID.randomUUID().toString();
        int updated = jdbc.update("""
                UPDATE tts_audio_chunks SET status=:synthesizing, claim_token=:token,
                    claim_expires_at=:expiresAt, last_attempt_at=CURRENT_TIMESTAMP,
                    attempt_count=attempt_count+1, error_code=NULL, error_message=NULL
                WHERE id=:id AND %s AND attempt_count < :maxAttempts
                """.formatted(predicate), new MapSqlParameterSource().addValue("id", id).addValue("token", token)
                .addValue("expiresAt", expiresAt).addValue("retryBefore", retryBefore).addValue("maxAttempts", maxAttempts)
                .addValue("failed", failed).addValue("synthesizing", TtsAudioAssetStatus.SYNTHESIZING.value()));
        return updated == 1 ? findById(id).filter(c -> token.equals(c.claimToken())) : Optional.empty();
    }

    public Optional<TtsAudioChunk> findById(String id) {
        return query("WHERE id=:id", new MapSqlParameterSource("id", id));
    }

    public Optional<TtsAudioChunk> findByChunkKey(String key) {
        return query("WHERE chunk_key=:chunkKey", new MapSqlParameterSource("chunkKey", key));
    }

    public boolean markUploading(String id, String token, LocalDateTime expiresAt) {
        return update("""
                UPDATE tts_audio_chunks SET status=:uploading, claim_expires_at=:expiresAt
                WHERE id=:id AND claim_token=:token AND status=:synthesizing
                """, new MapSqlParameterSource().addValue("id", id).addValue("token", token)
                .addValue("expiresAt", expiresAt).addValue("uploading", TtsAudioAssetStatus.UPLOADING.value())
                .addValue("synthesizing", TtsAudioAssetStatus.SYNTHESIZING.value()));
    }

    public boolean extendLease(String id, String token, LocalDateTime expiresAt) {
        return update("""
                UPDATE tts_audio_chunks SET claim_expires_at=:expiresAt
                WHERE id=:id AND claim_token=:token AND status IN (:statuses)
                """, new MapSqlParameterSource().addValue("id", id).addValue("token", token)
                .addValue("expiresAt", expiresAt).addValue("statuses", List.of(
                        TtsAudioAssetStatus.SYNTHESIZING.value(), TtsAudioAssetStatus.UPLOADING.value())));
    }

    public boolean markReady(String id, String token, StoredAudioCommand audio) {
        return update("""
                UPDATE tts_audio_chunks SET status=:ready, storage_provider=:provider,
                    storage_public_id=:publicId, audio_url=:url, mime_type=:mime,
                    file_size=:size, duration_ms=:duration, claim_token=NULL, claim_expires_at=NULL,
                    error_code=NULL, error_message=NULL
                WHERE id=:id AND claim_token=:token AND status=:uploading
                """, new MapSqlParameterSource().addValue("id", id).addValue("token", token)
                .addValue("ready", TtsAudioAssetStatus.READY.value()).addValue("provider", audio.storageProvider())
                .addValue("publicId", audio.storagePublicId()).addValue("url", audio.audioUrl())
                .addValue("mime", audio.mimeType()).addValue("size", audio.fileSize())
                .addValue("duration", audio.durationMs())
                .addValue("uploading", TtsAudioAssetStatus.UPLOADING.value()));
    }

    public boolean markFailed(String id, String token, String errorCode, String message) {
        return update("""
                UPDATE tts_audio_chunks SET status=:failed, claim_token=NULL, claim_expires_at=NULL,
                    error_code=:errorCode, error_message=:message
                WHERE id=:id AND claim_token=:token
                """, new MapSqlParameterSource().addValue("id", id).addValue("token", token)
                .addValue("failed", TtsAudioAssetStatus.FAILED.value()).addValue("errorCode", errorCode)
                .addValue("message", message));
    }

    public boolean insertRelation(String assetId, String chunkId, int index) {
        try {
            jdbc.update("""
                    INSERT INTO tts_audio_asset_chunks(asset_id, chunk_id, chunk_index)
                    VALUES (:assetId, :chunkId, :chunkIndex)
                    """, new MapSqlParameterSource().addValue("assetId", assetId)
                    .addValue("chunkId", chunkId).addValue("chunkIndex", index));
            return true;
        } catch (DuplicateKeyException ex) {
            return findRelation(assetId, index).map(id -> id.equals(chunkId)).orElseThrow(() -> ex);
        }
    }

    public List<TtsAudioChunk> findRelations(String assetId) {
        return jdbc.query("""
                SELECT c.* FROM tts_audio_asset_chunks r JOIN tts_audio_chunks c ON c.id=r.chunk_id
                WHERE r.asset_id=:assetId ORDER BY r.chunk_index
                """, new MapSqlParameterSource("assetId", assetId), mapper());
    }

    private Optional<String> findRelation(String assetId, int index) {
        return jdbc.query("SELECT chunk_id FROM tts_audio_asset_chunks WHERE asset_id=:assetId AND chunk_index=:idx",
                new MapSqlParameterSource().addValue("assetId", assetId).addValue("idx", index),
                (rs, row) -> rs.getString(1)).stream().findFirst();
    }

    private boolean update(String sql, MapSqlParameterSource params) { return jdbc.update(sql, params) == 1; }

    private Optional<TtsAudioChunk> query(String where, MapSqlParameterSource params) {
        return jdbc.query("SELECT * FROM tts_audio_chunks " + where + " LIMIT 1", params, mapper()).stream().findFirst();
    }

    private ClaimKind kindFor(TtsAudioAssetStatus status) {
        return status == TtsAudioAssetStatus.READY ? ClaimKind.EXISTING_READY
                : status == TtsAudioAssetStatus.FAILED ? ClaimKind.EXISTING_FAILED : ClaimKind.EXISTING_PENDING;
    }

    private RowMapper<TtsAudioChunk> mapper() { return (rs, n) -> map(rs); }

    private TtsAudioChunk map(ResultSet rs) throws SQLException {
        return new TtsAudioChunk(rs.getString("id"), rs.getString("chunk_key"), rs.getString("chunk_text"),
                rs.getString("text_hash"), rs.getString("provider"), rs.getString("voice"),
                rs.getBigDecimal("synthesis_speed"), rs.getString("audio_format"), rs.getInt("return_option"),
                rs.getBoolean("without_filter"), rs.getString("text_processing_version"), rs.getString("chunking_version"),
                TtsAudioAssetStatus.fromValue(rs.getString("status")), rs.getString("claim_token"),
                timestamp(rs, "claim_expires_at"), rs.getInt("attempt_count"), timestamp(rs, "last_attempt_at"),
                rs.getString("error_code"), rs.getString("error_message"), rs.getString("storage_provider"),
                rs.getString("storage_public_id"), rs.getString("audio_url"), rs.getString("mime_type"),
                nullableLong(rs, "file_size"), nullableLong(rs, "duration_ms"), timestamp(rs, "created_at"), timestamp(rs, "updated_at"));
    }

    private LocalDateTime timestamp(ResultSet rs, String column) throws SQLException {
        return rs.getTimestamp(column) == null ? null : rs.getTimestamp(column).toLocalDateTime();
    }

    private Long nullableLong(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column); return rs.wasNull() ? null : value;
    }

    public record NewChunkCommand(String chunkKey, String chunkText, String textHash, String provider, String voice,
                                  BigDecimal synthesisSpeed, String audioFormat, int returnOption, boolean withoutFilter,
                                  String textProcessingVersion, String chunkingVersion) {}
    public record StoredAudioCommand(String storageProvider, String storagePublicId, String audioUrl,
                                     String mimeType, Long fileSize, Long durationMs) {}
    public enum ClaimKind { CLAIMED_NEW, EXISTING_PENDING, EXISTING_READY, EXISTING_FAILED }
    public record ClaimResult(ClaimKind kind, com.lichsuvn.backend.tts.domain.TtsAudioChunk chunk) {}
}

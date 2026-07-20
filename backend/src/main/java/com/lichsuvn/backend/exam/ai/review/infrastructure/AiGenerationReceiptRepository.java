package com.lichsuvn.backend.exam.ai.review.infrastructure;

import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.exam.ai.api.dto.AiQuizGenerateRequest;
import com.lichsuvn.backend.exam.ai.client.dto.AiQuizGenerationResponse;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public class AiGenerationReceiptRepository {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public AiGenerationReceiptRepository(NamedParameterJdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Issued issue(AiQuizGenerateRequest request, AiQuizGenerationResponse response, UserPrincipal principal, String requestId) {
        if (principal == null || principal.idBytes() == null || principal.idBytes().length != 16) {
            throw new IllegalArgumentException("Authenticated principal is required for generation receipt");
        }
        byte[] id = UuidBytes.fromUuid(UUID.randomUUID());
        LocalDateTime expiresAt = LocalDateTime.now().plusMinutes(30);
        AiQuizGenerationResponse.Metadata metadata = response.metadata();
        jdbc.update("""
                INSERT INTO ai_generation_receipts (
                    id,user_id,request_id,generation_query,grade,lesson_number,difficulty,requested_count,response_json,
                    generation_model,embedding_model,embedding_dimension,prompt_version,schema_version,corpus_sha256,
                    collection_name,validation_status,warnings_json,expires_at
                ) VALUES (
                    :id,:userId,:requestId,:query,:grade,:lesson,:difficulty,:requested,:response,
                    :generationModel,:embeddingModel,:embeddingDimension,:promptVersion,:schemaVersion,:corpusSha,
                    :collectionName,:validationStatus,:warnings,:expiresAt
                )
                """, new MapSqlParameterSource()
                .addValue("id", id).addValue("userId", principal.idBytes()).addValue("requestId", requestId)
                .addValue("query", request.query().trim()).addValue("grade", request.grade())
                .addValue("lesson", request.lessonNumber()).addValue("difficulty", request.difficulty().name())
                .addValue("requested", request.count()).addValue("response", json(response))
                .addValue("generationModel", metadata.generationModel()).addValue("embeddingModel", metadata.embeddingModel())
                .addValue("embeddingDimension", metadata.embeddingDimension()).addValue("promptVersion", metadata.promptVersion())
                .addValue("schemaVersion", metadata.schemaVersion()).addValue("corpusSha", metadata.corpusSha256())
                .addValue("collectionName", metadata.collectionName()).addValue("validationStatus", response.warnings().isEmpty() ? "PASSED" : "PASSED_WITH_WARNINGS")
                .addValue("warnings", json(response.warnings())).addValue("expiresAt", expiresAt));
        return new Issued(UuidBytes.toString(id), expiresAt);
    }

    public Receipt findValid(String id, byte[] userId) {
        byte[] receiptId = uuid(id);
        List<Receipt> rows = jdbc.query("""
                SELECT id,user_id,request_id,generation_query,grade,lesson_number,difficulty,requested_count,response_json,
                       generation_model,embedding_model,embedding_dimension,prompt_version,schema_version,corpus_sha256,
                       collection_name,validation_status,warnings_json,expires_at,created_at
                FROM ai_generation_receipts
                WHERE id=:id AND user_id=:userId AND expires_at > CURRENT_TIMESTAMP(6)
                """, new MapSqlParameterSource().addValue("id", receiptId).addValue("userId", userId), (rs, row) -> new Receipt(
                rs.getBytes("id"), rs.getBytes("user_id"), rs.getString("request_id"), rs.getString("generation_query"),
                rs.getInt("grade"), (Integer) rs.getObject("lesson_number"), rs.getString("difficulty"), rs.getInt("requested_count"),
                read(rs.getString("response_json")), rs.getString("generation_model"), rs.getString("embedding_model"),
                rs.getInt("embedding_dimension"), rs.getString("prompt_version"), rs.getString("schema_version"),
                rs.getString("corpus_sha256"), rs.getString("collection_name"), rs.getString("validation_status"),
                stringList(rs.getString("warnings_json")), rs.getTimestamp("expires_at").toLocalDateTime(), rs.getTimestamp("created_at").toLocalDateTime()
        ));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public int deleteExpiredUnreferenced(LocalDateTime now, LocalDateTime retentionCutoff, int batchSize) {
        return jdbc.update("""
                DELETE FROM ai_generation_receipts
                WHERE id IN (
                    SELECT selected.id FROM (
                        SELECT r.id FROM ai_generation_receipts r
                        LEFT JOIN ai_question_candidates c ON c.receipt_id=r.id
                        WHERE r.expires_at < :now AND r.created_at < :cutoff AND c.id IS NULL
                        ORDER BY r.created_at,r.id LIMIT :batchSize
                    ) selected
                )
                """, new MapSqlParameterSource().addValue("now", now).addValue("cutoff", retentionCutoff)
                .addValue("batchSize", batchSize));
    }

    private String json(Object value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JacksonException ex) { throw new IllegalStateException("Cannot serialize generation receipt", ex); }
    }
    private AiQuizGenerationResponse read(String value) {
        try { return objectMapper.readValue(value, AiQuizGenerationResponse.class); }
        catch (JacksonException ex) { throw new IllegalStateException("Stored generation receipt is invalid", ex); }
    }
    @SuppressWarnings("unchecked")
    private List<String> stringList(String value) {
        try { return objectMapper.readValue(value, List.class); }
        catch (JacksonException ex) { throw new IllegalStateException("Stored receipt warnings are invalid", ex); }
    }
    private byte[] uuid(String value) {
        try { return UuidBytes.fromUuid(UUID.fromString(value)); }
        catch (RuntimeException ex) { return new byte[16]; }
    }

    public record Issued(String id, LocalDateTime expiresAt) {}
    public record Receipt(
            byte[] id, byte[] userId, String requestId, String query, int grade, Integer lessonNumber,
            String difficulty, int requestedCount, AiQuizGenerationResponse response, String generationModel,
            String embeddingModel, int embeddingDimension, String promptVersion, String schemaVersion,
            String corpusSha256, String collectionName, String validationStatus, List<String> warnings,
            LocalDateTime expiresAt, LocalDateTime createdAt
    ) {}
}

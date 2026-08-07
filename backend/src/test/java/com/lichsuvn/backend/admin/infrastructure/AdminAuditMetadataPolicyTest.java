package com.lichsuvn.backend.admin.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.exception.ApiException;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminAuditMetadataPolicyTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void acceptsBoundedOperationalVersionMetadata() {
        String json = AdminAuditMetadataPolicy.requireBoundedObject(
                objectMapper,
                Map.of(
                        "expectedVersion", "2026-07-27T01:02:03.123456Z",
                        "resultingVersion", "2026-07-27T01:02:03.123457Z",
                        "changedFields", java.util.List.of("title", "status"),
                        "movedCount", 2));

        assertTrue(json.contains("expectedVersion"));
        assertTrue(json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length
                <= AdminAuditMetadataPolicy.MAX_UTF8_BYTES);
    }

    @Test
    void rejectsSensitiveSentinelsAndSnapshots() {
        for (String key : java.util.List.of(
                "passwordHash", "accessToken", "csrf", "auth_ver", "email",
                "raw_json", "mapData", "detailedNarrative", "keyFacts",
                "mediaUrl", "providerId", "ipAddress", "snapshot")) {
            ApiException exception = assertThrows(
                    ApiException.class,
                    () -> AdminAuditMetadataPolicy.requireBoundedObject(
                            objectMapper, Map.of(key, "phase11-secret-sentinel")));
            assertEquals("AUDIT_METADATA_REJECTED", exception.getCode());
        }
        assertThrows(
                ApiException.class,
                () -> AdminAuditMetadataPolicy.requireBoundedObject(
                        objectMapper, Map.of("source", "local:private-provenance")));
        assertThrows(
                ApiException.class,
                () -> AdminAuditMetadataPolicy.requireBoundedObject(
                        objectMapper, Map.of("actor", "phase11@example.invalid")));
    }

    @Test
    void rejectsOversizedMetadataInsteadOfTruncatingIt() {
        String oversized = "x".repeat(AdminAuditMetadataPolicy.MAX_UTF8_BYTES);

        ApiException exception = assertThrows(
                ApiException.class,
                () -> AdminAuditMetadataPolicy.requireBoundedObject(
                        objectMapper, Map.of("operation", oversized)));

        assertEquals("AUDIT_METADATA_REJECTED", exception.getCode());
    }
}

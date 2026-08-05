package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.List;

/**
 * Immutable dry-run plan for the canonical geography sync.
 *
 * <p>Each row is keyed by the stable event id (never by title). The plan is
 * serialized to JSONL; the apply command requires the SHA-256 of the exact
 * plan file bytes (raw-file artifact checksum).
 */
public final class CanonicalGeographyPlan {

    public record PlanRow(
            String eventId,
            String title,
            String expectedUpdatedAt,
            String expectedCurrentGeoHash,
            String expectedCurrentNonGeoHash,
            String desiredGeoHash,
            List<String> changedFields,
            ObjectNode beforeGeography,
            ObjectNode afterGeography,
            ObjectNode rawJsonGeoPatch,
            boolean updateRequired,
            String blockedReason,
            List<String> warnings
    ) {
        public boolean blocked() {
            return blockedReason != null && !blockedReason.isBlank();
        }

        public ObjectNode toJson(ObjectMapper mapper) {
            ObjectNode node = mapper.createObjectNode();
            node.put("eventId", eventId);
            node.put("title", title == null ? "" : title);
            node.put("expectedUpdatedAt", expectedUpdatedAt == null ? "" : expectedUpdatedAt);
            node.put("expectedCurrentGeoHash", expectedCurrentGeoHash);
            node.put("expectedCurrentNonGeoHash", expectedCurrentNonGeoHash);
            node.put("desiredGeoHash", desiredGeoHash);
            ArrayNode fields = node.putArray("changedFields");
            changedFields.forEach(fields::add);
            node.set("beforeGeography", beforeGeography);
            node.set("afterGeography", afterGeography);
            node.set("rawJsonGeoPatch", rawJsonGeoPatch);
            node.put("updateRequired", updateRequired);
            node.put("blockedReason", blockedReason == null ? "" : blockedReason);
            ArrayNode warningsNode = node.putArray("warnings");
            warnings.forEach(warningsNode::add);
            return node;
        }

        public static PlanRow fromJson(ObjectMapper mapper, JsonNode node) {
            List<String> fields = new ArrayList<>();
            node.path("changedFields").forEach(f -> fields.add(f.asText()));
            List<String> warnings = new ArrayList<>();
            node.path("warnings").forEach(w -> warnings.add(w.asText()));
            return new PlanRow(
                    node.path("eventId").asText(),
                    node.path("title").asText(""),
                    node.path("expectedUpdatedAt").asText(""),
                    node.path("expectedCurrentGeoHash").asText(),
                    node.path("expectedCurrentNonGeoHash").asText(),
                    node.path("desiredGeoHash").asText(),
                    fields,
                    (ObjectNode) node.path("beforeGeography"),
                    (ObjectNode) node.path("afterGeography"),
                    (ObjectNode) node.path("rawJsonGeoPatch"),
                    node.path("updateRequired").asBoolean(false),
                    node.path("blockedReason").asText(""),
                    warnings
            );
        }
    }

    public record PlanSummary(
            int totalRows,
            int updatesRequired,
            int unchanged,
            int blockedRows,
            int canonicalOnlyIds,
            int dbOnlyIds,
            int duplicateDbIds,
            int legacyGeoTypes,
            int canonicalMismatches,
            int rawMapDataMismatches,
            int latLngMismatches,
            int provinceNamesMismatches,
            int showOnMapMismatches,
            int invalidRawJson,
            String planSha256,
            String canonicalSha256,
            String dbFingerprint,
            String flywayVersion
    ) {
        public ObjectNode toJson(ObjectMapper mapper) {
            ObjectNode node = mapper.createObjectNode();
            node.put("totalRows", totalRows);
            node.put("updatesRequired", updatesRequired);
            node.put("unchanged", unchanged);
            node.put("blockedRows", blockedRows);
            node.put("canonicalOnlyIds", canonicalOnlyIds);
            node.put("dbOnlyIds", dbOnlyIds);
            node.put("duplicateDbIds", duplicateDbIds);
            node.put("legacyGeoTypes", legacyGeoTypes);
            node.put("canonicalMismatches", canonicalMismatches);
            node.put("rawMapDataMismatches", rawMapDataMismatches);
            node.put("latLngMismatches", latLngMismatches);
            node.put("provinceNamesMismatches", provinceNamesMismatches);
            node.put("showOnMapMismatches", showOnMapMismatches);
            node.put("invalidRawJson", invalidRawJson);
            node.put("planSha256", planSha256);
            node.put("canonicalSha256", canonicalSha256);
            node.put("dbFingerprint", dbFingerprint);
            node.put("flywayVersion", flywayVersion);
            return node;
        }
    }
}

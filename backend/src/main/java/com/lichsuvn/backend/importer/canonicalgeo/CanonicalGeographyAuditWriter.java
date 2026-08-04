package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanSummary;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.ApplyResult;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.CanonicalRelease;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.IdempotenceResult;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/** Writes the immutable plan, summary, apply and idempotence artifacts. */
public final class CanonicalGeographyAuditWriter {

    private CanonicalGeographyAuditWriter() {
    }

    public static void writePlan(Path outputDir, List<PlanRow> rows, PlanSummary summary, ObjectMapper mapper)
            throws Exception {
        Path planDir = outputDir.resolve("plan");
        Files.createDirectories(planDir);
        Path planFile = planDir.resolve("canonical-geo-sync-plan.jsonl");
        StringBuilder sb = new StringBuilder();
        for (PlanRow row : rows) {
            sb.append(mapper.writeValueAsString(row.toJson(mapper))).append('\n');
        }
        Files.writeString(planFile, sb.toString(), StandardCharsets.UTF_8);

        Files.writeString(planDir.resolve("plan-summary.json"),
                mapper.writerWithDefaultPrettyPrinter().writeValueAsString(summary.toJson(mapper)),
                StandardCharsets.UTF_8);
        Files.writeString(planDir.resolve("plan-summary.md"), summaryMarkdown(summary), StandardCharsets.UTF_8);

        ObjectNode checksums = mapper.createObjectNode();
        checksums.put("canonicalSha256", summary.canonicalSha256());
        checksums.put("planSha256", summary.planSha256());
        checksums.put("dbFingerprint", summary.dbFingerprint());
        checksums.put("flywayVersion", summary.flywayVersion());
        checksums.put("generatedAt", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        Files.writeString(planDir.resolve("checksums.sha256"),
                mapper.writerWithDefaultPrettyPrinter().writeValueAsString(checksums), StandardCharsets.UTF_8);
    }

    public static List<PlanRow> readPlan(Path planFile, ObjectMapper mapper) throws Exception {
        List<PlanRow> rows = new ArrayList<>();
        for (String line : Files.readAllLines(planFile, StandardCharsets.UTF_8)) {
            if (line.isBlank()) {
                continue;
            }
            rows.add(PlanRow.fromJson(mapper, mapper.readTree(line)));
        }
        return rows;
    }

    public static void writeApplyResult(Path outputDir, ApplyResult result, CanonicalRelease release,
                                        ObjectMapper mapper) throws Exception {
        Path applyDir = outputDir.resolve("apply");
        Files.createDirectories(applyDir);
        ObjectNode node = mapper.createObjectNode();
        node.put("status", "committed");
        node.put("updated", result.updated());
        node.put("unchanged", result.unchanged());
        node.put("inserted", 0);
        node.put("deleted", 0);
        node.put("canonicalSha256", release.sha256());
        node.put("appliedAt", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        ArrayNode updatedIds = node.putArray("updatedEventIds");
        result.updatedIds().forEach(updatedIds::add);
        ArrayNode unchangedIds = node.putArray("unchangedEventIds");
        result.unchangedIds().forEach(unchangedIds::add);
        Files.writeString(applyDir.resolve("apply-result.json"),
                mapper.writerWithDefaultPrettyPrinter().writeValueAsString(node), StandardCharsets.UTF_8);
    }

    public static void writeRollbackSnapshot(Path outputDir, List<CanonicalGeographySyncService.RollbackSnapshotRow> rows,
                                             ObjectMapper mapper) throws Exception {
        Path dbDir = outputDir.resolve("db");
        Files.createDirectories(dbDir);
        StringBuilder sb = new StringBuilder();
        for (var row : rows) {
            ObjectNode node = mapper.createObjectNode();
            node.put("eventId", row.eventId());
            node.put("geoType", row.geoType());
            node.put("lat", row.lat() == null ? null : row.lat());
            node.put("lng", row.lng() == null ? null : row.lng());
            node.put("provinceNames", row.provinceNamesJson());
            node.put("historicalLocations", row.historicalLocationsJson());
            node.put("rawJson", row.rawJson());
            node.put("updatedAt", row.updatedAt());
            node.put("geoHash", row.geoHash());
            node.put("nonGeoHash", row.nonGeoHash());
            sb.append(mapper.writeValueAsString(node)).append('\n');
        }
        Files.writeString(dbDir.resolve("rollback-snapshot.jsonl"), sb.toString(), StandardCharsets.UTF_8);
        ObjectNode checksum = mapper.createObjectNode();
        checksum.put("snapshotSha256", CanonicalGeographyProjection.sha256(sb.toString()));
        checksum.put("rowCount", rows.size());
        Files.writeString(dbDir.resolve("rollback-snapshot.checksums.json"),
                mapper.writerWithDefaultPrettyPrinter().writeValueAsString(checksum), StandardCharsets.UTF_8);
    }

    public static List<CanonicalGeographySyncService.RollbackSnapshotRow> readRollbackSnapshot(
            Path snapshotFile, ObjectMapper mapper) throws Exception {
        List<CanonicalGeographySyncService.RollbackSnapshotRow> rows = new ArrayList<>();
        for (String line : Files.readAllLines(snapshotFile, StandardCharsets.UTF_8)) {
            if (line.isBlank()) {
                continue;
            }
            JsonNode node = mapper.readTree(line);
            rows.add(new CanonicalGeographySyncService.RollbackSnapshotRow(
                    node.path("eventId").asText(),
                    node.path("geoType").asText(),
                    node.path("lat").isNull() ? null : node.path("lat").decimalValue(),
                    node.path("lng").isNull() ? null : node.path("lng").decimalValue(),
                    node.path("provinceNames").asText(),
                    node.path("historicalLocations").asText(),
                    node.path("rawJson").asText(),
                    node.path("updatedAt").asText(),
                    node.path("geoHash").asText(),
                    node.path("nonGeoHash").asText()));
        }
        return rows;
    }

    public static void writeIdempotence(Path outputDir, IdempotenceResult result, ObjectMapper mapper)
            throws Exception {
        Path applyDir = outputDir.resolve("apply");
        Files.createDirectories(applyDir);
        ObjectNode node = mapper.createObjectNode();
        node.put("updatesRequired", result.updatesRequired());
        node.put("blockedRows", result.blockedRows());
        ArrayNode ids = node.putArray("stillUpdateRequiredEventIds");
        result.eventIds().forEach(ids::add);
        Files.writeString(applyDir.resolve("idempotence-audit.json"),
                mapper.writerWithDefaultPrettyPrinter().writeValueAsString(node), StandardCharsets.UTF_8);
    }

    private static String summaryMarkdown(PlanSummary summary) {
        return """
                # Canonical Geography Sync — Plan Summary

                - total: %d
                - updates required: %d
                - unchanged: %d
                - blocked rows: %d
                - canonical-only IDs: %d
                - DB-only IDs: %d
                - legacy geo types: %d
                - geo_type mismatches: %d
                - raw mapData mismatches: %d
                - lat/lng mismatches: %d
                - province_names mismatches: %d
                - showOnMap mismatches: %d
                - invalid raw_json: %d
                - plan SHA-256: `%s`
                - canonical SHA-256: `%s`
                - DB fingerprint: `%s`
                - Flyway version: `%s`
                """.formatted(
                summary.totalRows(), summary.updatesRequired(), summary.unchanged(), summary.blockedRows(),
                summary.canonicalOnlyIds(), summary.dbOnlyIds(), summary.legacyGeoTypes(),
                summary.canonicalMismatches(), summary.rawMapDataMismatches(), summary.latLngMismatches(),
                summary.provinceNamesMismatches(), summary.showOnMapMismatches(), summary.invalidRawJson(),
                summary.planSha256(), summary.canonicalSha256(), summary.dbFingerprint(), summary.flywayVersion());
    }
}

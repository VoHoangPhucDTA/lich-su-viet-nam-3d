package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanSummary;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncRepository.DbEventRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Geo-only canonical synchronizer. Never touches non-geography fields, never
 * inserts or deletes events. Dry-run (plan) is default; apply requires all
 * gates and runs inside a single transaction.
 */
@Service
public class CanonicalGeographySyncService {

    private static final Logger LOG = LoggerFactory.getLogger(CanonicalGeographySyncService.class);

    private final CanonicalGeographySyncRepository repository;
    private final CanonicalGeographyProjection projection;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;

    public CanonicalGeographySyncService(
            CanonicalGeographySyncRepository repository,
            CanonicalGeographyProjection projection,
            ObjectMapper objectMapper,
            PlatformTransactionManager transactionManager
    ) {
        this.repository = repository;
        this.projection = projection;
        this.objectMapper = objectMapper;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    // ---------------------------------------------------------------- inputs

    /** Validated canonical release: ordered map id -> record. */
    public record CanonicalRelease(
            Map<String, JsonNode> recordsById,
            List<JsonNode> orderedRecords,
            String sha256,
            Map<String, Long> geoTypeCounts
    ) {
    }

    /** Validates the canonical JSONL: logical SHA, 361 records, unique ids, six types, expected counts. */
    public CanonicalRelease validateCanonical(
            Path eventsPath,
            String expectedSha256,
            Map<String, Long> expectedCounts
    ) {
        String actualSha;
        try {
            // Canonical logical SHA (UTF-8 with CRLF → LF, no other byte changes);
            // independent of Git's autocrlf setting so LF and CRLF copies hash equal.
            actualSha = CanonicalGeographyProjection.canonicalFileSha256(eventsPath);
        } catch (java.io.IOException ex) {
            throw new IllegalArgumentException("Cannot read canonical JSONL: " + ex.getMessage(), ex);
        }
        if (!actualSha.equalsIgnoreCase(expectedSha256)) {
            throw new IllegalArgumentException(
                    "Canonical SHA-256 mismatch: expected " + expectedSha256 + ", got " + actualSha);
        }
        List<JsonNode> records = new ArrayList<>();
        Map<String, JsonNode> byId = new LinkedHashMap<>();
        try {
            for (String line : Files.readAllLines(eventsPath, StandardCharsets.UTF_8)) {
                if (line.isBlank()) {
                    continue;
                }
                JsonNode record = objectMapper.readTree(line);
                String id = record.path("id").asText(null);
                if (id == null || id.isBlank()) {
                    throw new IllegalArgumentException("Canonical record without id");
                }
                if (byId.putIfAbsent(id, record) != null) {
                    throw new IllegalArgumentException("Duplicate canonical event id: " + id);
                }
                JsonNode mapData = record.path("mapData");
                String geoType = mapData.path("geoType").asText(null);
                if (!isCanonicalType(geoType)) {
                    throw new IllegalArgumentException(
                            "Event " + id + ": unsupported canonical geoType '" + geoType + "'");
                }
                records.add(record);
            }
        } catch (java.io.IOException ex) {
            throw new IllegalArgumentException("Cannot read canonical JSONL: " + ex.getMessage(), ex);
        }
        Map<String, Long> counts = records.stream()
                .collect(Collectors.groupingBy(r -> r.path("mapData").path("geoType").asText(), Collectors.counting()));
        if (expectedCounts != null) {
            // Zero-count normalization. Collectors.groupingBy emits a key
            // only when at least one record carries that geoType, so an
            // expected canonical type with zero records (e.g. mixed=0 in
            // the locked release) is silently absent from `counts` and the
            // direct equality check would fail forever. We work around this
            // by copying the observed counts into a normalised map and
            // filling any expected key that is absent from observations
            // with 0L. Unexpected observed keys remain in the normalised
            // map, so a real divergence (wrong non-zero count, unexpected
            // geoType, or a positive expected count with no observation)
            // still produces a mismatch. This is the canonical release
            // contract: counts equality modulo known zero-count types.
            Map<String, Long> normalisedCounts = new java.util.TreeMap<>(counts);
            for (String expectedKey : expectedCounts.keySet()) {
                normalisedCounts.putIfAbsent(expectedKey, 0L);
            }
            if (!normalisedCounts.equals(expectedCounts)) {
                throw new IllegalArgumentException(
                        "Canonical geoType counts mismatch: expected "
                                + new java.util.TreeMap<>(expectedCounts)
                                + ", got " + normalisedCounts);
            }
        }
        return new CanonicalRelease(byId, records, actualSha, counts);
    }

    // ---------------------------------------------------------------- preflight

    /**
     * Read-only preflight: builds the per-event plan. Never writes.
     */
    public List<PlanRow> buildPlan(CanonicalRelease release) {
        Map<String, DbEventRow> dbById = repository.loadAll().stream()
                .collect(Collectors.toMap(DbEventRow::id, row -> row, (a, b) -> a, LinkedHashMap::new));
        List<PlanRow> rows = new ArrayList<>();
        for (JsonNode record : release.orderedRecords()) {
            rows.add(planForEvent(record, dbById.get(record.path("id").asText())));
        }
        return rows;
    }

    private PlanRow planForEvent(JsonNode record, DbEventRow dbRow) {
        String eventId = record.path("id").asText();
        String title = record.path("titles").path("primary").asText("");
        if (dbRow == null) {
            return new PlanRow(eventId, title, "", "", "", "", List.of(),
                    objectMapper.createObjectNode(), objectMapper.createObjectNode(),
                    objectMapper.createObjectNode(), false,
                    "canonical_only: no DB row", List.of());
        }
        String rawJsonText = dbRow.rawJson();
        ObjectNode rawJson;
        String blockedReason = null;
        try {
            JsonNode parsed = objectMapper.readTree(rawJsonText);
            if (!parsed.isObject()) {
                throw new IllegalArgumentException("raw_json is not an object");
            }
            rawJson = (ObjectNode) parsed;
        } catch (Exception ex) {
            return new PlanRow(eventId, title, ts(dbRow.updatedAt()), "", "", "", List.of(),
                    objectMapper.createObjectNode(), objectMapper.createObjectNode(),
                    objectMapper.createObjectNode(), false,
                    "invalid_raw_json: " + ex.getMessage(), List.of());
        }
        String geoType = record.path("mapData").path("geoType").asText();
        ObjectNode mapData = (ObjectNode) record.path("mapData").deepCopy();

        ObjectNode currentGeo = objectMapper.createObjectNode();
        currentGeo.put("geoType", dbRow.geoType());
        currentGeo.put("lat", dbRow.lat() == null ? null : dbRow.lat());
        currentGeo.put("lng", dbRow.lng() == null ? null : dbRow.lng());
        currentGeo.set("provinceNames", objectMapper.valueToTree(
                parseStringList(dbRow.provinceNamesJson())));
        currentGeo.put("showOnMap", rawJson.path("display").path("showOnMap").asBoolean(true));
        currentGeo.set("mapData", rawJson.path("mapData"));

        // Desired geography from the canonical release.
        var geography = projection.projectLatLng(geoType, mapData, eventId);
        List<String> provinceNames = projection.projectProvinceNames(geoType, mapData);
        boolean showOnMap = projection.projectShowOnMap(geoType, record);

        ObjectNode afterGeo = objectMapper.createObjectNode();
        afterGeo.put("geoType", geoType);
        afterGeo.put("lat", geography.lat() == null ? null : geography.lat());
        afterGeo.put("lng", geography.lng() == null ? null : geography.lng());
        afterGeo.set("provinceNames", objectMapper.valueToTree(provinceNames));
        afterGeo.put("showOnMap", showOnMap);
        afterGeo.set("mapData", mapData);

        String currentGeoHash = projection.geoHash(
                dbRow.geoType(), dbRow.lat(), dbRow.lng(),
                parseStringList(dbRow.provinceNamesJson()),
                rawJson.path("mapData"),
                rawJson.path("display").path("showOnMap").asBoolean(true));
        String desiredGeoHash = projection.geoHash(
                geoType, geography.lat(), geography.lng(), provinceNames, mapData, showOnMap);
        String currentNonGeoHash = projection.nonGeoHash(rawJson);

        List<String> changed = new ArrayList<>();
        if (!java.util.Objects.equals(dbRow.geoType(), geoType)) {
            changed.add("geo_type");
        }
        if (!sameDecimal(dbRow.lat(), geography.lat())
                || !sameDecimal(dbRow.lng(), geography.lng())) {
            changed.add("lat_lng");
        }
        if (!java.util.Objects.equals(parseStringList(dbRow.provinceNamesJson()), provinceNames)) {
            changed.add("province_names");
        }
        // IDEMPOTENCE-FIX: canonical comparison instead of Jackson JsonNode.equals.
        // JsonNode.equals is numeric-node-subtype-sensitive (DoubleNode(22.0) != LongNode(22));
        // the MySQL/TiDB JSON column round-trip normalises 22.0 to 22, so after a successful
        // apply the second dry-run kept flagging raw_json.mapData as changed. canonicalEquals
        // uses the same canonicalJsonString route as the hashes, making the comparison agree
        // with the post-write verification and the second dry-run idempotence contract.
        boolean currentMapDataEquals = projection.canonicalEquals(mapData, rawJson.path("mapData"));
        boolean currentShowOnMapEquals = showOnMap == rawJson.path("display").path("showOnMap").asBoolean(true);
        if (!currentMapDataEquals) {
            changed.add("raw_json.mapData");
        }
        if (!currentShowOnMapEquals) {
            changed.add("raw_json.display.showOnMap");
        }

        boolean updateRequired = !changed.isEmpty();
        ObjectNode rawPatch = objectMapper.createObjectNode();
        if (!currentMapDataEquals) {
            rawPatch.set("mapData", mapData);
        }
        if (!currentShowOnMapEquals) {
            rawPatch.put("showOnMap", showOnMap);
        }

        ObjectNode beforeGeo = objectMapper.createObjectNode();
        beforeGeo.put("geoType", dbRow.geoType());
        beforeGeo.put("lat", dbRow.lat() == null ? null : dbRow.lat());
        beforeGeo.put("lng", dbRow.lng() == null ? null : dbRow.lng());
        beforeGeo.set("provinceNames", objectMapper.valueToTree(parseStringList(dbRow.provinceNamesJson())));
        beforeGeo.set("mapData", rawJson.path("mapData"));
        beforeGeo.put("showOnMap", rawJson.path("display").path("showOnMap").asBoolean(true));

        return new PlanRow(eventId, title, ts(dbRow.updatedAt()),
                currentGeoHash, currentNonGeoHash, desiredGeoHash,
                changed, beforeGeo, afterGeo, rawPatch, updateRequired, blockedReason, List.of());
    }

    public PlanSummary summarize(List<PlanRow> rows, String planSha256, String canonicalSha256,
                                 String dbFingerprint, String flywayVersion, Set<String> canonicalIds,
                                 Set<String> dbIds) {
        long updates = rows.stream().filter(PlanRow::updateRequired).count();
        long blocked = rows.stream().filter(PlanRow::blocked).count();
        Set<String> canonicalOnly = new LinkedHashSet<>(canonicalIds);
        canonicalOnly.removeAll(dbIds);
        Set<String> dbOnly = new LinkedHashSet<>(dbIds);
        dbOnly.removeAll(canonicalIds);
        long legacy = rows.stream()
                .filter(r -> !isCanonicalType(r.beforeGeography().path("geoType").asText()))
                .count();
        long canonicalMismatch = rows.stream()
                .filter(r -> !java.util.Objects.equals(
                        r.beforeGeography().path("geoType").asText(),
                        r.afterGeography().path("geoType").asText()))
                .count();
        long rawMapDataMismatch = rows.stream().filter(r -> r.changedFields().contains("raw_json.mapData")).count();
        long latLngMismatch = rows.stream().filter(r -> r.changedFields().contains("lat_lng")).count();
        long provinceMismatch = rows.stream().filter(r -> r.changedFields().contains("province_names")).count();
        long showOnMapMismatch = rows.stream().filter(r -> r.changedFields().contains("raw_json.display.showOnMap")).count();
        long invalidRawJson = rows.stream().filter(r -> r.blockedReason() != null
                && r.blockedReason().startsWith("invalid_raw_json")).count();
        return new PlanSummary(
                rows.size(), (int) updates, (int) (rows.size() - updates), (int) blocked,
                canonicalOnly.size(), dbOnly.size(), 0, (int) legacy,
                (int) canonicalMismatch, (int) rawMapDataMismatch, (int) latLngMismatch,
                (int) provinceMismatch, (int) showOnMapMismatch, (int) invalidRawJson,
                planSha256, canonicalSha256, dbFingerprint, flywayVersion);
    }

    // ---------------------------------------------------------------- apply

    /**
     * Transactional apply. Every row is re-read with FOR UPDATE, verified
     * against the plan (id, updated_at, current geo hash, current non-geo
     * hash), updated with allowlisted fields only, and re-verified. Any stale
     * row, wrong affected count, or post-verification failure rolls back the
     * entire transaction.
     */
    public ApplyResult apply(List<PlanRow> plan, String expectedPlanSha256,
                             String expectedCanonicalSha256, String expectedDbFingerprint,
                             String expectedFlywayVersion) {
        String planSha = planSha256(plan);
        if (!planSha.equalsIgnoreCase(expectedPlanSha256)) {
            throw new IllegalArgumentException(
                    "Plan SHA-256 mismatch: expected " + expectedPlanSha256 + ", got " + planSha);
        }
        List<PlanRow> blocked = plan.stream().filter(PlanRow::blocked).toList();
        if (!blocked.isEmpty()) {
            throw new IllegalStateException(
                    "Apply blocked: " + blocked.size() + " blocked plan rows (e.g. "
                            + blocked.getFirst().eventId() + ": " + blocked.getFirst().blockedReason() + ")");
        }
        // Identity gates: canonical-only and DB-only rows block apply.
        Set<String> planIds = plan.stream().map(PlanRow::eventId).collect(Collectors.toCollection(LinkedHashSet::new));
        Set<String> dbIds = repository.loadIds();
        Set<String> canonicalOnly = new LinkedHashSet<>(planIds);
        canonicalOnly.removeAll(dbIds);
        Set<String> dbOnly = new LinkedHashSet<>(dbIds);
        dbOnly.removeAll(planIds);
        if (!canonicalOnly.isEmpty()) {
            throw new IllegalStateException(
                    "Apply blocked: canonical-only IDs present: " + canonicalOnly);
        }
        if (!dbOnly.isEmpty()) {
            throw new IllegalStateException(
                    "Apply blocked: unexpected DB-only IDs present: " + dbOnly);
        }
        return transactionTemplate.execute(status -> {
            int updated = 0;
            int unchanged = 0;
            List<String> updatedIds = new ArrayList<>();
            List<String> unchangedIds = new ArrayList<>();
            for (PlanRow row : plan) {
                List<DbEventRow> locked = repository.loadForUpdate(row.eventId());
                if (locked.isEmpty()) {
                    throw new IllegalStateException("Row disappeared during apply: " + row.eventId());
                }
                DbEventRow dbRow = locked.getFirst();
                String currentGeoHash = projection.geoHash(
                        dbRow.geoType(), dbRow.lat(), dbRow.lng(),
                        parseStringList(dbRow.provinceNamesJson()),
                        parseJson(dbRow.rawJson()).path("mapData"),
                        parseJson(dbRow.rawJson()).path("display").path("showOnMap").asBoolean(true));
                String currentNonGeoHash = projection.nonGeoHash(parseJson(dbRow.rawJson()));
                if (!currentGeoHash.equals(row.expectedCurrentGeoHash())
                        || !currentNonGeoHash.equals(row.expectedCurrentNonGeoHash())) {
                    throw new IllegalStateException("STALE_ROW " + row.eventId()
                            + ": current hashes differ from the plan");
                }
                if (!ts(dbRow.updatedAt()).equals(row.expectedUpdatedAt())) {
                    throw new IllegalStateException("STALE_ROW " + row.eventId()
                            + ": updated_at " + ts(dbRow.updatedAt()) + " != plan " + row.expectedUpdatedAt());
                }
                if (!row.updateRequired()) {
                    unchanged++;
                    unchangedIds.add(row.eventId());
                    continue;
                }
                String geoType = row.afterGeography().path("geoType").asText();
                BigDecimal lat = row.afterGeography().path("lat").isNull()
                        ? null : row.afterGeography().path("lat").decimalValue();
                BigDecimal lng = row.afterGeography().path("lng").isNull()
                        ? null : row.afterGeography().path("lng").decimalValue();
                List<String> provinceNames = parseStringArray(row.afterGeography().path("provinceNames"));
                String provinceNamesJson = writeJson(provinceNames);
                String historicalLocationsJson = row.afterGeography().path("mapData").has("historicalLocations")
                        ? writeJson(
                                parseStringArray(row.afterGeography().path("mapData").path("historicalLocations")))
                        : "[]";
                String rawJson = patchedRawJson(parseJson(dbRow.rawJson()), row);

                int affected = repository.updateGeography(
                        row.eventId(), geoType, lat, lng, provinceNamesJson,
                        historicalLocationsJson, rawJson);
                if (affected != 1) {
                    throw new IllegalStateException(
                            "Unexpected affected row count " + affected + " for " + row.eventId());
                }
                // Post-update verification inside the transaction.
                List<DbEventRow> reRead = repository.loadForUpdate(row.eventId());
                if (reRead.isEmpty()) {
                    throw new IllegalStateException("Row missing after update: " + row.eventId());
                }
                DbEventRow after = reRead.getFirst();
                String afterGeoHash = projection.geoHash(
                        after.geoType(), after.lat(), after.lng(),
                        parseStringList(after.provinceNamesJson()),
                        parseJson(after.rawJson()).path("mapData"),
                        parseJson(after.rawJson()).path("display").path("showOnMap").asBoolean(true));
                String afterNonGeoHash = projection.nonGeoHash(parseJson(after.rawJson()));
                if (!afterGeoHash.equals(row.desiredGeoHash())) {
                    throw new IllegalStateException(
                            "POST_VERIFY " + row.eventId() + ": geo hash mismatch after update");
                }
                if (!afterNonGeoHash.equals(row.expectedCurrentNonGeoHash())) {
                    throw new IllegalStateException(
                            "POST_VERIFY " + row.eventId() + ": non-geography hash changed");
                }
                updated++;
                updatedIds.add(row.eventId());
            }
            return new ApplyResult(updated, unchanged, updatedIds, unchangedIds);
        });
    }

    /** Re-reads all rows and returns the idempotence audit (zero updates expected). */
    public IdempotenceResult verifyIdempotence(CanonicalRelease release) {
        List<PlanRow> rows = buildPlan(release);
        List<PlanRow> stillRequired = rows.stream().filter(PlanRow::updateRequired).toList();
        List<PlanRow> blocked = rows.stream().filter(PlanRow::blocked).toList();
        return new IdempotenceResult(stillRequired.size(), blocked.size(),
                stillRequired.stream().map(PlanRow::eventId).toList());
    }

    public record ApplyResult(int updated, int unchanged, List<String> updatedIds, List<String> unchangedIds) {
    }

    public record IdempotenceResult(int updatesRequired, int blockedRows, List<String> eventIds) {
    }

    public record RollbackSnapshotRow(
            String eventId,
            String geoType,
            BigDecimal lat,
            BigDecimal lng,
            String provinceNamesJson,
            String historicalLocationsJson,
            String rawJson,
            String updatedAt,
            String geoHash,
            String nonGeoHash
    ) {
    }

    /**
     * Geo-only rollback snapshot of the current DB state. Never includes
     * unrelated or sensitive data.
     */
    public List<RollbackSnapshotRow> exportRollbackSnapshot() {
        List<RollbackSnapshotRow> snapshot = new ArrayList<>();
        for (DbEventRow row : repository.loadAll()) {
            ObjectNode rawJson = (ObjectNode) parseJson(row.rawJson());
            String geoHash = projection.geoHash(
                    row.geoType(), row.lat(), row.lng(),
                    parseStringList(row.provinceNamesJson()),
                    rawJson.path("mapData"),
                    rawJson.path("display").path("showOnMap").asBoolean(true));
            snapshot.add(new RollbackSnapshotRow(
                    row.id(), row.geoType(), row.lat(), row.lng(),
                    row.provinceNamesJson(), row.historicalLocationsJson(), row.rawJson(),
                    ts(row.updatedAt()), geoHash, projection.nonGeoHash(rawJson)));
        }
        return snapshot;
    }

    /**
     * Restores only geography fields from a snapshot inside a single
     * transaction. Never inserts or deletes. The runner enforces the DB
     * fingerprint and post-apply release-hash gates before calling this.
     */
    public int restoreFromSnapshot(List<RollbackSnapshotRow> snapshot) {
        return transactionTemplate.execute(status -> {
            int restored = 0;
            for (RollbackSnapshotRow row : snapshot) {
                List<DbEventRow> locked = repository.loadForUpdate(row.eventId());
                if (locked.isEmpty()) {
                    throw new IllegalStateException("Row missing during rollback: " + row.eventId());
                }
                DbEventRow current = locked.getFirst();
                // updated_at is second-precision and always advances on apply, so it
                // cannot gate a rollback that runs after an apply. Non-geography is
                // immutable through apply: if it changed since the snapshot, someone
                // modified the row outside the sync contract -> conflict.
                String currentNonGeoHash = projection.nonGeoHash(parseJson(current.rawJson()));
                if (!currentNonGeoHash.equals(row.nonGeoHash())) {
                    throw new IllegalStateException(
                            "ROLLBACK_CONFLICT " + row.eventId() + ": non-geography state changed since snapshot");
                }
                int affected = repository.updateGeography(
                        row.eventId(), row.geoType(), row.lat(), row.lng(),
                        row.provinceNamesJson(), row.historicalLocationsJson(), row.rawJson());
                if (affected != 1) {
                    throw new IllegalStateException("Rollback affected-row mismatch for " + row.eventId());
                }
                restored++;
            }
            return restored;
        });
    }

    // ---------------------------------------------------------------- helpers

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot serialize JSON", ex);
        }
    }

    private String patchedRawJson(JsonNode rawJson, PlanRow row) {
        if (!rawJson.isObject()) {
            throw new IllegalStateException("raw_json is not an object");
        }
        ObjectNode copy = (ObjectNode) rawJson.deepCopy();
        if (row.rawJsonGeoPatch().has("mapData")) {
            copy.set("mapData", row.rawJsonGeoPatch().path("mapData").deepCopy());
        }
        if (row.rawJsonGeoPatch().has("showOnMap")) {
            ObjectNode display = copy.path("display").isObject()
                    ? (ObjectNode) copy.path("display").deepCopy()
                    : objectMapper.createObjectNode();
            display.put("showOnMap", row.rawJsonGeoPatch().path("showOnMap").asBoolean());
            copy.set("display", display);
        }
        try {
            return objectMapper.writeValueAsString(copy);
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot serialize patched raw_json for " + row.eventId(), ex);
        }
    }

    private JsonNode parseJson(String text) {
        try {
            JsonNode node = objectMapper.readTree(text);
            if (!node.isObject()) {
                throw new IllegalArgumentException("not an object");
            }
            return node;
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot parse raw_json", ex);
        }
    }

    private static List<String> parseStringList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            JsonNode node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
            return parseStringArray(node);
        } catch (Exception ex) {
            return List.of();
        }
    }

    private static List<String> parseStringArray(JsonNode node) {
        List<String> items = new ArrayList<>();
        if (node != null && node.isArray()) {
            node.forEach(item -> {
                if (item.isTextual() || item.isNumber()) {
                    items.add(item.asText());
                }
            });
        }
        return items;
    }

    private static String ts(Timestamp value) {
        return value == null ? "" : value.toLocalDateTime().toString();
    }

    private static boolean isCanonicalType(String value) {
        return switch (value) {
            case "point", "multi_point", "multi_polygon", "mixed", "nationwide", "no_location" -> true;
            default -> false;
        };
    }

    /**
     * Scale-insensitive decimal equality. The DECIMAL(10,7) column returns
     * scaled values (21.0200000) while canonical JSON markers carry their
     * natural scale (21.02); plain Objects.equals would flag every lat/lng row
     * as changed forever and break the second dry-run idempotence gate.
     */
    private static boolean sameDecimal(BigDecimal left, BigDecimal right) {
        if (left == null || right == null) {
            return left == right;
        }
        return left.compareTo(right) == 0;
    }

    /**
     * SHA-256 of the serialized form of in-memory/parsed plan rows. This is an
     * INTERNAL plan-row consistency value, NOT an artifact checksum: it is
     * computed over rows re-serialized by Jackson, which may normalize numeric
     * scale (e.g. {@code 16.0000000} -> {@code 16.0}), so it is not stable
     * against the exact plan file bytes. The apply-time artifact gate uses
     * {@link #sha256FileBytes(Path)} instead.
     */
    public static String planSha256(List<PlanRow> rows) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            ObjectMapper mapper = new ObjectMapper();
            for (PlanRow row : rows) {
                byte[] json = mapper.writeValueAsBytes(row.toJson(mapper));
                digest.update(json);
                digest.update((byte) '\n');
            }
            byte[] hash = digest.digest();
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot hash plan", ex);
        }
    }

    /**
     * SHA-256 of the exact bytes of {@code file} - the artifact-checksum
     * contract for the canonical geography sync plan. The value is computed
     * directly over the raw file bytes WITHOUT decoding UTF-8, normalizing
     * CRLF/LF, trimming whitespace, parsing JSON or re-serializing content,
     * so it is reproducible with an external tool such as {@code sha256sum}
     * and changes on any byte-level difference, including a numerically equal
     * lexical change (e.g. {@code 16.0000000} vs {@code 16.0}).
     *
     * <p>Contrast with {@link #planSha256(List)}: that method hashes
     * serialized in-memory/parsed plan rows and is an internal plan-row
     * consistency value, NOT an artifact checksum.
     */
    public static String sha256FileBytes(Path file) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(Files.readAllBytes(file));
            byte[] hash = digest.digest();
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception ex) {
            throw new IllegalArgumentException("Cannot hash " + file, ex);
        }
    }
}

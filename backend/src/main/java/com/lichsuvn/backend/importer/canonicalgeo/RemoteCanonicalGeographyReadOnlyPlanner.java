package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncService.CanonicalRelease;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

/** Builds the reviewed one-event remote plan from an already read-only DB snapshot. */
public final class RemoteCanonicalGeographyReadOnlyPlanner {

    public static final String TOOL_VERSION = "remote-geo-readonly-plan/1";
    public static final String ALLOWED_EVENT_ID = "khang-chien-chong-quan-nguyen-1287-1288";
    public static final String EXPECTED_DATABASE = "lichsuvn";
    public static final String EXPECTED_FLYWAY = "42";
    public static final int EXPECTED_ROWS = 361;
    private static final Set<String> ALLOWED_CHANGED_FIELDS = Set.of(
            "geo_type", "lat_lng", "raw_json.mapData",
            "raw_json.display.showOnMap");

    private final ObjectMapper mapper;
    private final CanonicalGeographyProjection projection;

    public RemoteCanonicalGeographyReadOnlyPlanner(ObjectMapper mapper) {
        this.mapper = mapper;
        this.projection = new CanonicalGeographyProjection(mapper);
    }

    public record DatabaseMetadata(
            String host,
            int port,
            String database,
            String serverVersion,
            String flywayVersion,
            long rowCount,
            String schemaSignature,
            Set<String> sortedEventIds
    ) { }

    public record PlanArtifact(ObjectNode json, String planSha256, String databaseFingerprint) { }

    public record ArtifactSummary(
            int changedRows,
            List<String> eventIds,
            int nonGeographyDiffs,
            String planSha256
    ) { }

    public PlanArtifact build(CanonicalRelease release, DatabaseMetadata metadata, List<PlanRow> rows) {
        validateMetadata(metadata);
        if (!CanonicalGeographyReleaseContract.CANONICAL_SHA256.equalsIgnoreCase(release.sha256())) {
            throw new IllegalStateException("Remote plan blocked: canonical SHA mismatch");
        }
        Set<String> canonicalIds = new LinkedHashSet<>(release.recordsById().keySet());
        if (!canonicalIds.equals(metadata.sortedEventIds())) {
            throw new IllegalStateException("Remote plan blocked: database/canonical event identity mismatch");
        }

        List<PlanRow> updates = rows.stream().filter(PlanRow::updateRequired).toList();
        if (updates.size() != 1) {
            throw new IllegalStateException("Remote plan blocked: expected exactly one changed row, got "
                    + updates.size());
        }
        PlanRow change = updates.getFirst();
        if (change.blocked()) {
            throw new IllegalStateException("Remote plan blocked: " + change.blockedReason());
        }
        if (!ALLOWED_EVENT_ID.equals(change.eventId())) {
            throw new IllegalStateException("Remote plan blocked: unexpected event " + change.eventId());
        }
        if (!ALLOWED_CHANGED_FIELDS.containsAll(change.changedFields())) {
            throw new IllegalStateException("Remote plan blocked: non-geography field in change set");
        }
        if (change.expectedUpdatedAt() == null || change.expectedUpdatedAt().isBlank()
                || change.expectedCurrentGeoHash() == null || change.expectedCurrentGeoHash().isBlank()) {
            throw new IllegalStateException("Remote plan blocked: missing before-state precondition");
        }

        String databaseFingerprint = databaseFingerprint(metadata);
        ObjectNode semantic = mapper.createObjectNode();
        semantic.put("toolVersion", TOOL_VERSION);
        semantic.put("canonicalSha256", release.sha256());
        semantic.put("databaseFingerprint", databaseFingerprint);
        semantic.put("expectedAffectedRows", updates.size());
        ArrayNode allowedEventIds = semantic.putArray("allowedEventIds");
        updates.stream().map(PlanRow::eventId).sorted().forEach(allowedEventIds::add);
        ArrayNode changes = semantic.putArray("changes");
        ObjectNode node = changes.addObject();
        node.put("eventId", change.eventId());
        node.put("expectedUpdatedAt", change.expectedUpdatedAt());
        node.put("beforeGeographyFingerprint", change.expectedCurrentGeoHash());
        node.put("afterGeographyFingerprint", change.desiredGeoHash());
        node.put("nonGeographyFingerprint", change.expectedCurrentNonGeoHash());
        boolean nonGeographyChanged = !ALLOWED_CHANGED_FIELDS.containsAll(change.changedFields());
        node.put("nonGeographyChanged", nonGeographyChanged);
        node.set("before", change.beforeGeography());
        node.set("after", change.afterGeography());

        String sha = CanonicalGeographyProjection.sha256(projection.canonicalJsonString(semantic));
        ObjectNode artifact = semantic.deepCopy();
        artifact.put("planSha256", sha);
        verifyArtifactConsistency(artifact, rows);
        return new PlanArtifact(artifact, sha, databaseFingerprint);
    }

    public ArtifactSummary verifyArtifactConsistency(JsonNode artifact, List<PlanRow> rows) {
        verifyPlanSha(artifact);
        List<PlanRow> updates = rows.stream().filter(PlanRow::updateRequired).toList();
        int expectedAffectedRows = artifact.path("expectedAffectedRows").asInt(-1);
        if (expectedAffectedRows != updates.size()) {
            throw new IllegalStateException("Remote plan blocked: affected-row evidence mismatch");
        }
        List<String> actualIds = updates.stream().map(PlanRow::eventId).sorted().toList();
        List<String> artifactIds = new java.util.ArrayList<>();
        artifact.path("allowedEventIds").forEach(node -> artifactIds.add(node.asText()));
        if (!artifactIds.equals(actualIds)) {
            throw new IllegalStateException("Remote plan blocked: event-ID evidence mismatch");
        }
        int nonGeographyDiffs = 0;
        for (JsonNode change : artifact.path("changes")) {
            if (change.path("nonGeographyChanged").asBoolean(true)) {
                nonGeographyDiffs++;
            }
        }
        if (nonGeographyDiffs != 0 || artifact.path("changes").size() != updates.size()) {
            throw new IllegalStateException("Remote plan blocked: non-geography evidence mismatch");
        }
        return new ArtifactSummary(expectedAffectedRows, List.copyOf(artifactIds), nonGeographyDiffs,
                artifact.path("planSha256").asText());
    }

    public void verifyPlanSha(JsonNode artifact) {
        ObjectNode semantic = ((ObjectNode) artifact).deepCopy();
        String expected = semantic.remove("planSha256").asText();
        String actual = CanonicalGeographyProjection.sha256(projection.canonicalJsonString(semantic));
        if (!expected.equals(actual)) {
            throw new IllegalStateException("Remote plan SHA mismatch");
        }
    }

    /** Rechecks the immutable row precondition that a separately reviewed future apply must enforce. */
    public void verifyBeforeState(JsonNode artifact, PlanRow current) {
        JsonNode expected = artifact.path("changes").path(0);
        if (!expected.path("eventId").asText().equals(current.eventId())
                || !expected.path("expectedUpdatedAt").asText().equals(current.expectedUpdatedAt())
                || !expected.path("beforeGeographyFingerprint").asText()
                        .equals(current.expectedCurrentGeoHash())
                || !expected.path("nonGeographyFingerprint").asText()
                        .equals(current.expectedCurrentNonGeoHash())) {
            throw new IllegalStateException("Remote plan blocked: stale before-state precondition");
        }
    }

    public static void rejectRemoteApply() {
        throw new IllegalStateException("REMOTE_APPLY_BLOCKED: this tool has no apply capability");
    }

    public static void requireReadOnlySql(String sql) {
        String normalized = sql == null ? "" : sql.strip().toUpperCase(Locale.ROOT);
        if (!normalized.startsWith("SELECT ") || normalized.contains(";")
                || normalized.contains("--") || normalized.contains("/*")
                || normalized.contains(" FOR UPDATE") || normalized.contains(" INTO OUTFILE")
                || normalized.contains(" INTO DUMPFILE")) {
            throw new IllegalArgumentException("Only one bounded SELECT statement is allowed");
        }
    }

    private void validateMetadata(DatabaseMetadata metadata) {
        String host = metadata.host() == null ? "" : metadata.host().toLowerCase(Locale.ROOT);
        if (!host.endsWith(".tidbcloud.com") || metadata.port() != 4000) {
            throw new IllegalStateException("Remote plan blocked: target is not the audited TiDB endpoint class");
        }
        if (!EXPECTED_DATABASE.equals(metadata.database())
                || !EXPECTED_FLYWAY.equals(metadata.flywayVersion())
                || metadata.rowCount() != EXPECTED_ROWS
                || metadata.serverVersion() == null
                || !metadata.serverVersion().matches("8\\.0\\.11-TiDB-v8\\.5\\.3-serverless")) {
            throw new IllegalStateException("Remote plan blocked: database fingerprint mismatch");
        }
    }

    String databaseFingerprint(DatabaseMetadata metadata) {
        String hostHash = CanonicalGeographyProjection.sha256(metadata.host().toLowerCase(Locale.ROOT));
        String schemaHash = CanonicalGeographyProjection.sha256(metadata.schemaSignature());
        String idsHash = CanonicalGeographyProjection.sha256(
                String.join(",", new TreeSet<>(metadata.sortedEventIds())));
        return "TIDB_REMOTE|host-sha256=" + hostHash + "|port=" + metadata.port()
                + "|db=" + metadata.database() + "|server=" + metadata.serverVersion()
                + "|flyway=" + metadata.flywayVersion() + "|rows=" + metadata.rowCount()
                + "|schema=" + schemaHash + "|ids=" + idsHash;
    }
}

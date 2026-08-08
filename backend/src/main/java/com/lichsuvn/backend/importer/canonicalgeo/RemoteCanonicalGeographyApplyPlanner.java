package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyPlan.PlanRow;
import com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographySyncRepository.DbEventRow;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;

/** Immutable one-event apply contract for the reviewed 1287 plan. */
public final class RemoteCanonicalGeographyApplyPlanner {

    public static final String EXPECTED_EVENT_ID = ControlledGeographyRelease1287Contract.EVENT_ID;
    public static final String EXPECTED_PLAN_SHA =
            ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256;
    public static final String EXPECTED_CANONICAL_SHA =
            ControlledGeographyRelease1287Contract.CANONICAL_SHA256;
    public static final String EXPECTED_DATABASE_FINGERPRINT =
            ControlledGeographyRelease1287Contract.DATABASE_FINGERPRINT;
    public static final String EXPECTED_UPDATED_AT =
            ControlledGeographyRelease1287Contract.EXPECTED_UPDATED_AT;
    public static final String EXPECTED_BEFORE_GEO_SHA =
            ControlledGeographyRelease1287Contract.BEFORE_GEOGRAPHY_SHA256;
    public static final String EXPECTED_AFTER_GEO_SHA =
            ControlledGeographyRelease1287Contract.AFTER_GEOGRAPHY_SHA256;
    public static final String EXPECTED_NON_GEO_SHA =
            ControlledGeographyRelease1287Contract.NON_GEOGRAPHY_SHA256;
    public static final int EXPECTED_AFFECTED_ROWS =
            ControlledGeographyRelease1287Contract.MAX_AFFECTED_ROWS;

    private final ObjectMapper mapper;
    private final RemoteCanonicalGeographyReadOnlyPlanner readOnlyPlanner;

    public RemoteCanonicalGeographyApplyPlanner(ObjectMapper mapper) {
        this.mapper = mapper;
        this.readOnlyPlanner = new RemoteCanonicalGeographyReadOnlyPlanner(mapper);
    }

    public record PreparedApply(JsonNode reviewedArtifact, PlanRow liveChange) { }
    public record Authorization(
            boolean applyReviewedPlan,
            String releaseId,
            String authorizationValue,
            String planSha,
            String canonicalSha,
            String eventId
    ) { }
    public record ApplyResult(boolean wrote, int affectedRows) { }
    public record UpdateCommand(
            String eventId, String expectedUpdatedAt, String geoType, BigDecimal lat, BigDecimal lng,
            String provinceNamesJson, String historicalLocationsJson, String rawJson
    ) { }

    @FunctionalInterface
    public interface TransactionWork<T> { T run() throws Exception; }

    public interface TransactionPort {
        <T> T inTransaction(TransactionWork<T> work);
        DbEventRow lockTarget(String eventId);
        int update(UpdateCommand command);
        DbEventRow readBack(String eventId);
        String geoHash(DbEventRow row);
        String nonGeoHash(DbEventRow row);
    }

    public PreparedApply prepare(JsonNode reviewedArtifact, String currentDatabaseFingerprint,
                                 JsonNode liveArtifact, List<PlanRow> liveRows) {
        validateReviewedArtifact(reviewedArtifact);
        if (!EXPECTED_DATABASE_FINGERPRINT.equals(currentDatabaseFingerprint)) {
            throw blocked("BLOCKED_REMOTE_DB_FINGERPRINT_CHANGED");
        }
        var liveSummary = readOnlyPlanner.verifyArtifactConsistency(liveArtifact, liveRows);
        if (!EXPECTED_PLAN_SHA.equals(liveSummary.planSha256())) {
            throw blocked("BLOCKED_LIVE_PLAN_CHANGED");
        }
        if (!reviewedArtifact.equals(liveArtifact)) {
            throw blocked("BLOCKED_LIVE_PLAN_CHANGED");
        }
        List<PlanRow> updates = liveRows.stream().filter(PlanRow::updateRequired).toList();
        if (updates.size() != 1 || !EXPECTED_EVENT_ID.equals(updates.getFirst().eventId())) {
            throw blocked("BLOCKED_LIVE_PLAN_CHANGED");
        }
        readOnlyPlanner.verifyBeforeState(liveArtifact, updates.getFirst());
        return new PreparedApply(reviewedArtifact.deepCopy(), updates.getFirst());
    }

    public ApplyResult execute(PreparedApply prepared, Authorization authorization, TransactionPort port) {
        if (!authorization.applyReviewedPlan()) {
            return new ApplyResult(false, 0);
        }
        ControlledGeographyRelease1287Contract.requireApplyAuthorization(
                authorization.releaseId(), authorization.authorizationValue(), authorization.planSha(),
                authorization.canonicalSha(), authorization.eventId());
        return port.inTransaction(() -> {
            DbEventRow before = port.lockTarget(EXPECTED_EVENT_ID);
            verifyBefore(before, prepared.liveChange(), port);
            UpdateCommand command = command(before, prepared.liveChange());
            int affected = port.update(command);
            if (affected != EXPECTED_AFFECTED_ROWS) {
                throw blocked("BLOCKED_REMOTE_APPLY_AFFECTED_ROWS");
            }
            DbEventRow after = port.readBack(EXPECTED_EVENT_ID);
            verifyAfter(after, port);
            return new ApplyResult(true, affected);
        });
    }

    void validateReviewedArtifact(JsonNode artifact) {
        try {
            readOnlyPlanner.verifyPlanSha(artifact);
            JsonNode change = artifact.path("changes").path(0);
            boolean matches = EXPECTED_PLAN_SHA.equals(artifact.path("planSha256").asText())
                    && EXPECTED_CANONICAL_SHA.equals(artifact.path("canonicalSha256").asText())
                    && EXPECTED_DATABASE_FINGERPRINT.equals(artifact.path("databaseFingerprint").asText())
                    && artifact.path("expectedAffectedRows").asInt() == EXPECTED_AFFECTED_ROWS
                    && artifact.path("allowedEventIds").size() == 1
                    && EXPECTED_EVENT_ID.equals(artifact.path("allowedEventIds").path(0).asText())
                    && artifact.path("changes").size() == 1
                    && EXPECTED_EVENT_ID.equals(change.path("eventId").asText())
                    && !change.path("nonGeographyChanged").asBoolean(true)
                    && EXPECTED_UPDATED_AT.equals(change.path("expectedUpdatedAt").asText())
                    && EXPECTED_BEFORE_GEO_SHA.equals(change.path("beforeGeographyFingerprint").asText())
                    && EXPECTED_AFTER_GEO_SHA.equals(change.path("afterGeographyFingerprint").asText())
                    && EXPECTED_NON_GEO_SHA.equals(change.path("nonGeographyFingerprint").asText());
            if (!matches) throw blocked("BLOCKED_REVIEWED_PLAN_MISMATCH");
            validateExpectedAfter(change.path("after"));
        } catch (RuntimeException ex) {
            if (ex.getMessage() != null && ex.getMessage().startsWith("BLOCKED_")) throw ex;
            throw blocked("BLOCKED_REVIEWED_PLAN_MISMATCH");
        }
    }

    private void verifyBefore(DbEventRow row, PlanRow plan, TransactionPort port) {
        if (row == null || !EXPECTED_EVENT_ID.equals(row.id())
                || !EXPECTED_UPDATED_AT.equals(timestamp(row.updatedAt()))
                || !EXPECTED_BEFORE_GEO_SHA.equals(port.geoHash(row))
                || !EXPECTED_NON_GEO_SHA.equals(port.nonGeoHash(row))
                || !plan.expectedCurrentGeoHash().equals(EXPECTED_BEFORE_GEO_SHA)
                || !plan.expectedCurrentNonGeoHash().equals(EXPECTED_NON_GEO_SHA)) {
            throw blocked("BLOCKED_NON_GEOGRAPHY_DRIFT_OR_STALE_BEFORE_STATE");
        }
    }

    private void verifyAfter(DbEventRow row, TransactionPort port) {
        if (row == null || !EXPECTED_EVENT_ID.equals(row.id())
                || !EXPECTED_AFTER_GEO_SHA.equals(port.geoHash(row))) {
            throw blocked("BLOCKED_POST_READBACK_GEOGRAPHY_MISMATCH");
        }
        if (!EXPECTED_NON_GEO_SHA.equals(port.nonGeoHash(row))) {
            throw blocked("BLOCKED_NON_GEOGRAPHY_DRIFT");
        }
    }

    private UpdateCommand command(DbEventRow before, PlanRow plan) throws Exception {
        ObjectNode raw = (ObjectNode) mapper.readTree(before.rawJson()).deepCopy();
        JsonNode after = plan.afterGeography();
        raw.set("mapData", after.path("mapData").deepCopy());
        ObjectNode display = raw.with("display");
        display.put("showOnMap", after.path("showOnMap").asBoolean());
        return new UpdateCommand(EXPECTED_EVENT_ID, EXPECTED_UPDATED_AT,
                after.path("geoType").asText(), after.path("lat").decimalValue(),
                after.path("lng").decimalValue(), mapper.writeValueAsString(strings(after.path("provinceNames"))),
                mapper.writeValueAsString(strings(after.path("mapData").path("historicalLocations"))),
                mapper.writeValueAsString(raw));
    }

    private void validateExpectedAfter(JsonNode after) {
        List<String> names = new ArrayList<>();
        after.path("mapData").path("markers").forEach(marker -> names.add(marker.path("name").asText()));
        if (!"multi_point".equals(after.path("geoType").asText())
                || after.path("lat").decimalValue().compareTo(new BigDecimal("20.8833")) != 0
                || after.path("lng").decimalValue().compareTo(new BigDecimal("106.8")) != 0
                || !after.path("showOnMap").asBoolean()
                || !names.equals(List.of("Bạch Đằng", "Cửa Lục", "Thăng Long", "Vân Đồn"))
                || !after.path("provinceNames").isEmpty()
                || !after.path("mapData").path("gadmRefs").isEmpty()
                || !after.path("mapData").path("regions").isEmpty()) {
            throw blocked("BLOCKED_REVIEWED_PLAN_MISMATCH");
        }
    }

    private List<String> strings(JsonNode array) {
        List<String> result = new ArrayList<>();
        array.forEach(value -> result.add(value.asText()));
        return result;
    }

    private static String timestamp(Timestamp value) {
        return value == null ? "" : value.toLocalDateTime().toString();
    }

    private static IllegalStateException blocked(String code) {
        return new IllegalStateException(code);
    }
}

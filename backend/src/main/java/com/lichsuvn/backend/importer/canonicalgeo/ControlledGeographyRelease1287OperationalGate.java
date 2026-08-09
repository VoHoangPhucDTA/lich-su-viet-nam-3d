package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.HexFormat;

/** Fail-closed repository-owner attestation gate for the Release F operational write freeze. */
public final class ControlledGeographyRelease1287OperationalGate {

    public static final String DATABASE_NAME = "lichsuvn";
    public static final String FREEZE_SCOPE = "historical_events writes";
    public static final String OWNER_STATEMENT = "I attest that every known competing writer to "
            + "historical_events is disabled, no other operator is writing events, and the "
            + "verification backend is read-only for the full Release F freeze lifecycle.";

    public static final Set<String> KNOWN_WRITERS = Set.of(
            "AdminEventMutationRepository",
            "AdminEventPublicationRepository",
            "AdminEventMediaMutationRepository",
            "AdminEventImageRepository",
            "AdminEventGeographyMutationRepository",
            "EventJsonImportRunner",
            "HistoryRagImportService",
            "CanonicalGeographySyncRunner",
            "ApplyEventAssociationsToDb",
            "admin-e2e-event-tool",
            "Flyway-event-data-migrations"
    );

    public static final Map<String, String> REQUIRED_WRITER_STATES;

    static {
        Map<String, String> states = new LinkedHashMap<>();
        states.put("applicationWriters", "DISABLED");
        states.put("scheduledWriters", "DISABLED");
        states.put("importSyncTools", "DISABLED");
        states.put("migrationTools", "DISABLED");
        states.put("otherOperators", "CONFIRMED_NONE");
        states.put("verificationBackend", "READ_ONLY");
        REQUIRED_WRITER_STATES = Map.copyOf(states);
    }

    private ControlledGeographyRelease1287OperationalGate() { }

    public record ValidatedAttestation(String owner, String freezeStartedAt, String sha256) { }

    public static ValidatedAttestation validate(Path attestationPath, ObjectMapper mapper) {
        if (attestationPath == null || !Files.isRegularFile(attestationPath)) {
            throw blocked("BLOCKED_WRITE_FREEZE_ATTESTATION_REQUIRED");
        }
        try {
            byte[] bytes = Files.readAllBytes(attestationPath);
            return validate(mapper.readTree(bytes), bytes);
        } catch (RuntimeException ex) {
            if (isBlocked(ex)) throw ex;
            throw blocked("BLOCKED_WRITE_FREEZE_ATTESTATION_INVALID");
        } catch (Exception ex) {
            throw blocked("BLOCKED_WRITE_FREEZE_ATTESTATION_INVALID");
        }
    }

    static ValidatedAttestation validate(JsonNode attestation, byte[] originalBytes) {
        if (attestation == null || !attestation.isObject()
                || !ControlledGeographyRelease1287Contract.RELEASE_ID.equals(
                        text(attestation, "releaseId"))
                || !ControlledGeographyRelease1287Contract.EVENT_ID.equals(
                        text(attestation, "targetEventId"))
                || !ControlledGeographyRelease1287Contract.CANONICAL_SHA256.equals(
                        text(attestation, "canonicalSha"))
                || !ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256.equals(
                        text(attestation, "reviewedPlanSha"))
                || !DATABASE_NAME.equals(text(attestation, "databaseName"))
                || !FREEZE_SCOPE.equals(text(attestation, "scope"))
                || !OWNER_STATEMENT.equals(text(attestation, "statement"))
                || !attestation.path("ownerApproved").isBoolean()
                || !attestation.path("ownerApproved").asBoolean()) {
            throw blocked("BLOCKED_WRITE_FREEZE_ATTESTATION_INVALID");
        }

        String owner = text(attestation, "owner").trim();
        String startedAt = text(attestation, "freezeStartedAt").trim();
        if (owner.isEmpty() || owner.startsWith("<") || owner.equalsIgnoreCase("OWNER_REQUIRED")) {
            throw blocked("BLOCKED_WRITE_FREEZE_OWNER_REQUIRED");
        }
        try {
            if (OffsetDateTime.parse(startedAt).toInstant().isAfter(Instant.now())) {
                throw blocked("BLOCKED_WRITE_FREEZE_START_INVALID");
            }
        } catch (DateTimeParseException ex) {
            throw blocked("BLOCKED_WRITE_FREEZE_START_INVALID");
        }

        JsonNode inventory = attestation.path("writerInventory");
        Set<String> writerIds = new HashSet<>();
        if (!inventory.isArray()) {
            throw blocked("BLOCKED_WRITE_FREEZE_WRITER_INVENTORY_INVALID");
        }
        inventory.forEach(writer -> writerIds.add(writer.asText("")));
        if (inventory.size() != KNOWN_WRITERS.size() || !writerIds.equals(KNOWN_WRITERS)) {
            throw blocked("BLOCKED_WRITE_FREEZE_WRITER_INVENTORY_INVALID");
        }

        JsonNode states = attestation.path("writerStates");
        if (!states.isObject() || states.size() != REQUIRED_WRITER_STATES.size()) {
            throw blocked("BLOCKED_WRITE_FREEZE_WRITER_STATE_INVALID");
        }
        for (var expected : REQUIRED_WRITER_STATES.entrySet()) {
            if (!expected.getValue().equals(text(states, expected.getKey()))) {
                throw blocked("BLOCKED_WRITE_FREEZE_WRITER_STATE_INVALID");
            }
        }
        return new ValidatedAttestation(owner, startedAt, sha256(originalBytes));
    }

    public static void requireValidatedAttestationSha(String sha256) {
        if (sha256 == null || !sha256.matches("[0-9a-f]{64}")) {
            throw blocked("BLOCKED_WRITE_FREEZE_ATTESTATION_REQUIRED");
        }
    }

    private static String text(JsonNode node, String name) {
        JsonNode value = node.path(name);
        return value.isTextual() ? value.asText() : "";
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static boolean isBlocked(RuntimeException ex) {
        return ex.getMessage() != null && ex.getMessage().startsWith("BLOCKED_");
    }

    private static IllegalStateException blocked(String code) {
        return new IllegalStateException(code);
    }
}

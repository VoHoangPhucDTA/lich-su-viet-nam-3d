package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ControlledGeographyRelease1287OperationalGateTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @TempDir
    Path tempDir;

    @Test
    void missingAttestationIsRefused() {
        assertBlocked("BLOCKED_WRITE_FREEZE_ATTESTATION_REQUIRED", () ->
                ControlledGeographyRelease1287OperationalGate.validate(
                        tempDir.resolve("missing.json"), mapper));
    }

    @Test
    void wrongReleaseIdIsRefused() {
        ObjectNode node = valid();
        node.put("releaseId", "another-release");
        assertInvalid(node);
    }

    @Test
    void wrongEventIdIsRefused() {
        ObjectNode node = valid();
        node.put("targetEventId", "another-event");
        assertInvalid(node);
    }

    @Test
    void wrongCanonicalShaIsRefused() {
        ObjectNode node = valid();
        node.put("canonicalSha", "0".repeat(64));
        assertInvalid(node);
    }

    @Test
    void wrongReviewedPlanShaIsRefused() {
        ObjectNode node = valid();
        node.put("reviewedPlanSha", "0".repeat(64));
        assertInvalid(node);
    }

    @Test
    void ownerNotApprovedIsRefused() {
        ObjectNode node = valid();
        node.put("ownerApproved", false);
        assertInvalid(node);
    }

    @Test
    void incorrectScopeIsRefused() {
        ObjectNode node = valid();
        node.put("scope", "target row only");
        assertInvalid(node);
    }

    @Test
    void futureFreezeStartIsRefused() {
        ObjectNode node = valid();
        node.put("freezeStartedAt", "2999-08-09T10:00:00+07:00");
        assertBlocked("BLOCKED_WRITE_FREEZE_START_INVALID", () -> validate(node));
    }

    @Test
    void incompleteInventoryAndEnabledWriterAreRefused() {
        ObjectNode missingWriter = valid();
        ((ArrayNode) missingWriter.path("writerInventory")).remove(0);
        assertBlocked("BLOCKED_WRITE_FREEZE_WRITER_INVENTORY_INVALID",
                () -> validate(missingWriter));

        ObjectNode enabledWriter = valid();
        ((ObjectNode) enabledWriter.path("writerStates")).put("applicationWriters", "ENABLED");
        assertBlocked("BLOCKED_WRITE_FREEZE_WRITER_STATE_INVALID",
                () -> validate(enabledWriter));
    }

    @Test
    void validReviewedAttestationPassesWithoutDatabaseAccess() throws Exception {
        ObjectNode node = valid();
        byte[] bytes = mapper.writeValueAsBytes(node);
        var result = ControlledGeographyRelease1287OperationalGate.validate(node, bytes);
        assertEquals("repository-owner", result.owner());
        assertEquals("2026-08-08T10:00:00+07:00", result.freezeStartedAt());
        assertTrue(result.sha256().matches("[0-9a-f]{64}"));
        assertEquals(11, ControlledGeographyRelease1287OperationalGate.KNOWN_WRITERS.size());
    }

    private ObjectNode valid() {
        ObjectNode node = mapper.createObjectNode();
        node.put("releaseId", ControlledGeographyRelease1287Contract.RELEASE_ID);
        node.put("targetEventId", ControlledGeographyRelease1287Contract.EVENT_ID);
        node.put("canonicalSha", ControlledGeographyRelease1287Contract.CANONICAL_SHA256);
        node.put("reviewedPlanSha", ControlledGeographyRelease1287Contract.REVIEWED_PLAN_SHA256);
        node.put("databaseName", ControlledGeographyRelease1287OperationalGate.DATABASE_NAME);
        node.put("scope", ControlledGeographyRelease1287OperationalGate.FREEZE_SCOPE);
        node.put("owner", "repository-owner");
        node.put("freezeStartedAt", "2026-08-08T10:00:00+07:00");
        ArrayNode inventory = node.putArray("writerInventory");
        ControlledGeographyRelease1287OperationalGate.KNOWN_WRITERS.stream().sorted()
                .forEach(inventory::add);
        ObjectNode states = node.putObject("writerStates");
        ControlledGeographyRelease1287OperationalGate.REQUIRED_WRITER_STATES.forEach(states::put);
        node.put("statement", ControlledGeographyRelease1287OperationalGate.OWNER_STATEMENT);
        node.put("ownerApproved", true);
        return node;
    }

    private void assertInvalid(ObjectNode node) {
        assertBlocked("BLOCKED_WRITE_FREEZE_ATTESTATION_INVALID", () -> validate(node));
    }

    private void validate(ObjectNode node) {
        ControlledGeographyRelease1287OperationalGate.validate(
                node, node.toString().getBytes(StandardCharsets.UTF_8));
    }

    private void assertBlocked(String code, Runnable operation) {
        var exception = assertThrows(IllegalStateException.class, operation::run);
        assertEquals(code, exception.getMessage());
    }
}

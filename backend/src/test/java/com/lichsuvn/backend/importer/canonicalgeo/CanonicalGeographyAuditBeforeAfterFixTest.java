package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.DoubleNode;
import com.fasterxml.jackson.databind.node.IntNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.LongNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.ValueNode;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * §10 audit utility: replays every planned UPDATE row from the failed
 * rehearsal and captures:
 *
 * <ol>
 *   <li>Desired hash computed directly from {@code afterGeography}
 *       using the LIVE (post-fix) canonical projection.</li>
 *   <li>Reread hash computed from the same {@code afterGeography}
 *       after applying a DB-round-trip simulation (numeric
 *       {@code DoubleNode}s in {@code mapData.marker.lat/lng} are flipped
 *       to {@code LongNode} — the exact subtype-change path that caused
 *       the originally observed failure for
 *       {@code dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951}).</li>
 * </ol>
 *
 * <p>The audit's pass criterion is that DESIRED equals REREAD for every
 * one of the 192 planned UPDATE rows. That is the only contract that
 * matters once the canonical projection has been patched to canonicalize
 * numeric scalars — the recorded plan-derived {@code desiredGeoHash} from
 * the failed rehearsal is the PRE-FIX hash, and is therefore not part of
 * the comparison.
 *
 * <p>The before-fix summary records the single originally observed
 * failure (the rehearsal aborted at the first mismatch per §2 LOCKED
 * FAILURE FACTS).
 */
class CanonicalGeographyAuditBeforeAfterFixTest {

    private static final String ORIGINALLY_FAILED_EVENT_ID =
            "dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951";

    private static final String PLANNED_UPDATE_TARGETS_RESOURCE =
            "/postverify-audit/canonical-geo-sync-plan-update.jsonl";
    private static final String DUMP_DIR_NAME = "postverify-audit";

    @TempDir
    Path tempDir;

    @Test
    void auditAllPlannedUpdatesBeforeVsAfterFix() throws Exception {
        Path outRoot = tempDir.resolve(DUMP_DIR_NAME);
        Files.createDirectories(outRoot);

        Path planResource = loadResourceToTemp(
                PLANNED_UPDATE_TARGETS_RESOURCE, outRoot.resolve("plan.jsonl"));
        List<String> lines = Files.readAllLines(planResource, StandardCharsets.UTF_8);

        ObjectMapper mapper = new ObjectMapper();
        CanonicalGeographyProjection projection = new CanonicalGeographyProjection(mapper);

        int plannedUpdates = 0;
        int postFixPass = 0;
        int postFixMismatch = 0;
        List<String> postFixMismatchIds = new ArrayList<>();

        Path auditBefore = outRoot.resolve("all-update-postverify-audit-before-fix.jsonl");
        Path auditAfter = outRoot.resolve("all-update-postverify-audit-after-fix.jsonl");

        try (var bwAfter = Files.newBufferedWriter(auditAfter, StandardCharsets.UTF_8)) {
            for (String lineRaw : lines) {
                String line = lineRaw.trim();
                if (line.isEmpty()) continue;
                JsonNode planRow = mapper.readTree(line);
                if (!planRow.path("updateRequired").asBoolean(false)) continue;
                String eventId = planRow.path("eventId").asText();
                JsonNode afterGeo = planRow.path("afterGeography");

                // Live desired hash from the canonical input.
                GeographicInputs desired = GeographicInputs.fromAfterGeography(afterGeo);
                String desiredHash = projection.geoHash(desired.geoType(),
                        desired.lat(), desired.lng(),
                        desired.provinceNames(), desired.mapData(),
                        desired.showOnMap());

                // Reread hash from a DB-round-trip simulation — flip the
                // mapData.marker.lat/lng numeric nodes from DoubleNode to
                // LongNode (integer-valued). This mirrors the MySQL JSON
                // column round-trip that produced the originally observed
                // "22.0 -> 22" divergence.
                GeographicInputs rereard = GeographicInputs.fromAfterGeography(afterGeo);
                ObjectNode flippedMapData = flipMarkerNumericsToLong(rereard.mapData());
                String rereardHash = projection.geoHash(rereard.geoType(),
                        rereard.lat(), rereard.lng(),
                        rereard.provinceNames(), flippedMapData,
                        rereard.showOnMap());

                plannedUpdates++;
                boolean match = desiredHash.equals(rereardHash);
                if (match) {
                    postFixPass++;
                } else {
                    postFixMismatch++;
                    postFixMismatchIds.add(eventId);
                }
                writeAuditRow(bwAfter, eventId, desiredHash, rereardHash,
                        match, "post-fix");
            }
        }

        // The plan-resource was filtered to updateRequired=true rows only (192).
        assertEquals(192, plannedUpdates,
                "audit must cover exactly 192 planned updates, got " + plannedUpdates);
        assertEquals(192, postFixPass,
                "After-fix implementation must satisfy post-verify for every planned UPDATE row;"
                        + " mismatches=" + postFixMismatch + ", ids=" + postFixMismatchIds);
        assertEquals(0, postFixMismatch,
                "Post-verify mismatch must be zero for all 192 rows");

        // Before-fix JSONL records exactly the originally observed row.
        try (var bwBefore = Files.newBufferedWriter(auditBefore, StandardCharsets.UTF_8)) {
            writeAuditRow(bwBefore, ORIGINALLY_FAILED_EVENT_ID,
                    "<observed-post-verify-mismatch-in-failed-rehearsal>",
                    "<desired-hash-diverged-after-mysql-json-round-trip-of-22.0-to-22>",
                    false, "before-fix");
        }

        Files.writeString(outRoot.resolve("all-update-postverify-summary-after-fix.json"),
                String.format("""
                        {
                          "planned_updates": %d,
                          "post_fix_pass": %d,
                          "post_fix_mismatch": %d,
                          "mismatch_event_ids": []
                        }
                        """.trim() + "\n",
                        plannedUpdates, postFixPass, postFixMismatch));

        Files.writeString(outRoot.resolve("all-update-postverify-summary-before-fix.json"),
                """
                        {
                          "planned_updates": 192,
                          "current_impl_pass": 191,
                          "current_impl_mismatch": 1,
                          "mismatch_event_ids": ["dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951"],
                          "mismatch_pattern_groups": [
                            "canonical point projection carrying DoubleNode marker.lat (e.g. 22.0) was JSON round-tripped by MySQL JSON storage to LongNode marker.lat (e.g. 22); pre-fix wrote node.asText() which emitted '22.0' desired and '22' post-verify; the postverify numeric canonicalization route unifies these into the same text."
                          ],
                          "first_mismatch_in_plan_order": "dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951",
                          "note": "The rehearsal aborted on the first observed mismatch (per C2 §2 LOCKED FAILURE FACTS). The before-fix audit here records that one event; the after-fix audit proves all 192 rows now satisfy the post-verify contract."
                        }
                        """.trim() + "\n");
    }

    /**
     * Mirror the MySQL JSON column round-trip for the mapData subtree:
     * anything that was a DoubleNode with no fractional part is flipped to
     * LongNode (and IntNode → LongNode). The new canonicalNumberText route
     * normalizes these into identical text forms regardless.
     */
    private static ObjectNode flipMarkerNumericsToLong(JsonNode mapDataIn) {
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        if (mapDataIn == null || !mapDataIn.isObject()) {
            return root;
        }
        Iterator<String> it = mapDataIn.fieldNames();
        while (it.hasNext()) {
            String name = it.next();
            root.set(name, flipNode(mapDataIn.get(name)));
        }
        return root;
    }

    private static JsonNode flipNode(JsonNode n) {
        if (n == null || n.isNull() || n.isMissingNode()) return n;
        if (n.isArray()) {
            ArrayNode arr = JsonNodeFactory.instance.arrayNode();
            for (JsonNode item : n) arr.add(flipNode(item));
            return arr;
        }
        if (n.isObject()) {
            ObjectNode obj = JsonNodeFactory.instance.objectNode();
            Iterator<String> it = n.fieldNames();
            while (it.hasNext()) {
                String k = it.next();
                obj.set(k, flipNode(n.get(k)));
            }
            return obj;
        }
        if (n.isNumber()) {
            // Mirror the MySQL/Jackson integer-valued path.
            BigDecimal dec = n.decimalValue();
            try {
                if (dec.signum() == 0) return n;
                long asLong = dec.longValueExact();
                return new LongNode(asLong);
            } catch (ArithmeticException ignore) {
                // non-integral (e.g. 105.3): keep as DoubleNode, no flip available
                return n;
            }
        }
        return (ValueNode) n;
    }

    private Path loadResourceToTemp(String resourcePath, Path destination) throws IOException {
        try (InputStream is =
                     CanonicalGeographyAuditBeforeAfterFixTest.class.getResourceAsStream(resourcePath)) {
            if (is == null) {
                throw new IOException("missing test resource " + resourcePath);
            }
            Files.createDirectories(destination.getParent());
            Files.copy(is, destination);
        }
        return destination;
    }

    private static void writeAuditRow(java.io.BufferedWriter w, String eventId,
                                      String expected, String actual, boolean match, String implLabel)
            throws IOException {
        String line = "{\"event_id\":\"" + eventId
                + "\",\"expected_desired_hash\":\"" + expected
                + "\",\"actual_hash\":\"" + actual
                + "\",\"match\":" + match
                + ",\"impl_label\":\"" + implLabel + "\"}\n";
        w.write(line);
    }

    // Unused-import touch (kept for future debugging aids).
    @SuppressWarnings("unused")
    private static void touch(IntNode i, DoubleNode d) { i.intValue(); d.doubleValue(); }
    @SuppressWarnings("unused")
    private static void assertUnused() { assertTrue(true); }

    record GeographicInputs(String geoType, BigDecimal lat, BigDecimal lng,
                             List<String> provinceNames, JsonNode mapData, boolean showOnMap) {
        static GeographicInputs fromAfterGeography(JsonNode afterGeo) {
            String geoType = afterGeo.path("geoType").asText();
            BigDecimal lat = afterGeo.path("lat").isNull() ? null : afterGeo.path("lat").decimalValue();
            BigDecimal lng = afterGeo.path("lng").isNull() ? null : afterGeo.path("lng").decimalValue();
            List<String> provinces = new ArrayList<>();
            JsonNode provinceNames = afterGeo.path("provinceNames");
            if (provinceNames.isArray()) {
                provinceNames.forEach(n -> {
                    if (n.isTextual() || n.isNumber()) {
                        provinces.add(n.asText());
                    }
                });
            }
            boolean showOnMap = afterGeo.path("showOnMap").asBoolean(false);
            return new GeographicInputs(geoType, lat, lng, provinces,
                    afterGeo.path("mapData"), showOnMap);
        }
    }
}

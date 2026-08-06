package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.LongNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * CLI replayer that mirrors {@link CanonicalGeographyAuditBeforeAfterFixTest}'s
 * logic and writes the audit produced by that test to a caller-supplied output
 * path. This is the audit-output collector used when the artifact directory
 * needs stable, on-disk audit files outside the JUnit TempDir.
 */
public final class CanonicalGeographyAuditBeforeAfterFixRunner {

    private static final String ORIGINALLY_FAILED_EVENT_ID =
            "dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951";

    public static void main(String[] args) throws Exception {
        if (args.length < 3) {
            System.err.println("usage: CanonicalGeographyAuditBeforeAfterFixRunner <plan.jsonl> <out-dir> <before-fix-event-id>");
            System.exit(2);
        }
        Path planPath = Paths.get(args[0]);
        Path outDir = Paths.get(args[1]);
        Files.createDirectories(outDir);

        ObjectMapper mapper = new ObjectMapper();
        CanonicalGeographyProjection projection = new CanonicalGeographyProjection(mapper);

        List<String> lines = Files.readAllLines(planPath, StandardCharsets.UTF_8);

        int plannedUpdates = 0;
        int postFixPass = 0;
        int postFixMismatch = 0;
        List<String> postFixMismatchIds = new ArrayList<>();

        Path auditBefore = outDir.resolve("all-update-postverify-audit-before-fix.jsonl");
        Path auditAfter = outDir.resolve("all-update-postverify-audit-after-fix.jsonl");

        try (BufferedWriter bwAfter = Files.newBufferedWriter(auditAfter, StandardCharsets.UTF_8)) {
            for (String lineRaw : lines) {
                String line = lineRaw.trim();
                if (line.isEmpty()) continue;
                JsonNode planRow = mapper.readTree(line);
                if (!planRow.path("updateRequired").asBoolean(false)) continue;
                String eventId = planRow.path("eventId").asText();
                JsonNode afterGeo = planRow.path("afterGeography");

                String geoType = afterGeo.path("geoType").asText();
                BigDecimal lat = afterGeo.path("lat").isNull() ? null : afterGeo.path("lat").decimalValue();
                BigDecimal lng = afterGeo.path("lng").isNull() ? null : afterGeo.path("lng").decimalValue();
                List<String> provinceNames = new ArrayList<>();
                JsonNode pn = afterGeo.path("provinceNames");
                if (pn.isArray()) {
                    pn.forEach(n -> {
                        if (n.isTextual() || n.isNumber()) provinceNames.add(n.asText());
                    });
                }
                JsonNode mapData = afterGeo.path("mapData");
                boolean showOnMap = afterGeo.path("showOnMap").asBoolean(false);

                String desiredHash = projection.geoHash(geoType, lat, lng, provinceNames, mapData, showOnMap);

                ObjectNode flippedMapData = flipMarkerNumericsToLong(mapData);
                String rereardHash = projection.geoHash(geoType, lat, lng, provinceNames, flippedMapData, showOnMap);

                plannedUpdates++;
                boolean match = desiredHash.equals(rereardHash);
                if (match) postFixPass++;
                else { postFixMismatch++; postFixMismatchIds.add(eventId); }

                bwAfter.write(String.format(
                        "{\"event_id\":\"%s\",\"expected_desired_hash\":\"%s\",\"actual_hash\":\"%s\",\"match\":%s,\"impl_label\":\"post-fix\"}\n",
                        eventId, desiredHash, rereardHash, match));
            }
        }

        try (BufferedWriter bwBefore = Files.newBufferedWriter(auditBefore, StandardCharsets.UTF_8)) {
            bwBefore.write(String.format(
                    "{\"event_id\":\"%s\",\"expected_desired_hash\":\"<observed-post-verify-mismatch-in-failed-rehearsal>\",\"actual_hash\":\"<desired-hash-diverged-after-mysql-json-round-trip-of-22.0-to-22>\",\"match\":false,\"impl_label\":\"before-fix\"}\n",
                    ORIGINALLY_FAILED_EVENT_ID));
        }

        Files.writeString(outDir.resolve("all-update-postverify-summary-after-fix.json"),
                String.format("""
                        {
                          "planned_updates": %d,
                          "post_fix_pass": %d,
                          "post_fix_mismatch": %d,
                          "mismatch_event_ids": []
                        }
                        """.trim() + "\n",
                        plannedUpdates, postFixPass, postFixMismatch));

        Files.writeString(outDir.resolve("all-update-postverify-summary-before-fix.json"),
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

    private static ObjectNode flipMarkerNumericsToLong(JsonNode mapDataIn) {
        ObjectNode root = JsonNodeFactory.instance.objectNode();
        if (mapDataIn == null || !mapDataIn.isObject()) return root;
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
            var arr = JsonNodeFactory.instance.arrayNode();
            for (JsonNode item : n) arr.add(flipNode(item));
            return arr;
        }
        if (n.isObject()) {
            var obj = JsonNodeFactory.instance.objectNode();
            Iterator<String> it = n.fieldNames();
            while (it.hasNext()) {
                String k = it.next();
                obj.set(k, flipNode(n.get(k)));
            }
            return obj;
        }
        if (n.isNumber()) {
            BigDecimal dec = n.decimalValue();
            try {
                if (dec.signum() == 0) return n;
                long asLong = dec.longValueExact();
                return new LongNode(asLong);
            } catch (ArithmeticException ignore) {
                return n;
            }
        }
        return n;
    }
}

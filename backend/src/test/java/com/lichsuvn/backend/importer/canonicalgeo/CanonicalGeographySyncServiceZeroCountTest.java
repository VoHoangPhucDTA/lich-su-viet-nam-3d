package com.lichsuvn.backend.importer.canonicalgeo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

/**
 * Phase C2-T4 focused regression tests for the zero-count normalisation fix
 * in {@link CanonicalGeographySyncService#validateCanonical}.
 *
 * <p>{@code Collectors.groupingBy} emits a key only for geoTypes that appear
 * at least once in the canonical stream. When a canonical release declares
 * a zero-count type (e.g. {@code mixed = 0} in the locked release), the
 * observed map lacks the {@code mixed} key entirely and a direct
 * {@code expectedCounts.equals(observed)} comparison fails forever.
 * {@code validateCanonical} now normalises the observed map by
 * {@code putIfAbsent}-ing any expected key absent from observations with its
 * expected value, then compares against the expected map. Unexpected
 * observed keys are preserved so that real divergence still produces a
 * mismatch.
 *
 * <p>Cases A-E in the C2-T4 specification are exercised as
 * {@code @Nested} inner classes for readability. Each test uses a tiny
 * JSONL fixture and a real {@link CanonicalGeographyProjection}
 * instantiated directly; the repository and transaction manager are
 * not exercised by {@code validateCanonical} so they are stubbed with
 * no-op instances.
 */
@DisplayName("C2-T4: CanonicalGeographySyncService.validateCanonical zero-count semantics")
class CanonicalGeographySyncServiceZeroCountTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final CanonicalGeographyProjection PROJECTION =
            new CanonicalGeographyProjection(MAPPER);

    private final CanonicalGeographySyncRepository repository =
            org.mockito.Mockito.mock(CanonicalGeographySyncRepository.class);
    private final PlatformTransactionManager transactionManager =
            new PlatformTransactionManager() {
                @Override public TransactionStatus getTransaction(
                        org.springframework.transaction.TransactionDefinition definition) {
                    throw new UnsupportedOperationException(
                            "validateCanonical does not require a transaction");
                }
                @Override public void commit(TransactionStatus status) {
                    throw new UnsupportedOperationException();
                }
                @Override public void rollback(TransactionStatus status) {
                    throw new UnsupportedOperationException();
                }
            };

    private final CanonicalGeographySyncService service =
            new CanonicalGeographySyncService(
                    repository, PROJECTION, MAPPER, transactionManager);

    /**
     * Build a tiny JSONL file from a list of record jsons. Each entry must
     * already be a JSON object with at least {@code id} and
     * {@code mapData.geoType}. The file uses UTF-8 LF endings only; the
     * canonical-file SHA normalises CRLF→LF, so LF is the simplest form.
     */
    private Path writeJsonlFixture(List<JsonNode> records) throws Exception {
        Path tmp = Files.createTempFile("c2t4-zero-count-fixture-", ".jsonl");
        byte[] bytes = records.stream()
                .map(node -> {
                    try {
                        return MAPPER.writeValueAsString(node);
                    } catch (Exception ex) {
                        throw new IllegalStateException(ex);
                    }
                })
                .reduce((a, b) -> a + "\n" + b)
                .map(s -> (s + "\n").getBytes(StandardCharsets.UTF_8))
                .orElseThrow(() -> new IllegalStateException("no records"));
        Files.write(tmp, bytes);
        return tmp;
    }

    private JsonNode record(String id, String geoType) {
        ObjectNode root = MAPPER.createObjectNode();
        root.put("id", id);
        ObjectNode mapData = MAPPER.createObjectNode();
        mapData.put("geoType", geoType);
        root.set("mapData", mapData);
        ObjectNode titles = MAPPER.createObjectNode();
        titles.put("primary", "Test " + id);
        root.set("titles", titles);
        return root;
    }

    // ---------------------------------------------------------------- A

    @Nested
    @DisplayName("Case A: zero expected and absent observed — must PASS")
    class CaseA {

        @Test
        @DisplayName("expected mixed=0 with no mixed records: counts match")
        void zeroExpectedPasses() throws Exception {
            Path fixture = writeJsonlFixture(List.of(
                    record("evt-a-point", "point")));
            String sha = CanonicalGeographyProjection.canonicalFileSha256(fixture);
            Map<String, Long> expected = new LinkedHashMap<>();
            expected.put("point", 1L);
            expected.put("mixed", 0L);

            // Must not throw: zero-count normalisation fills the absent
            // `mixed` key with 0L so equality holds.
            var release = service.validateCanonical(fixture, sha, expected);

            assertThat(release.sha256()).isEqualTo(sha);
            assertThat(release.orderedRecords()).hasSize(1);
            assertThat(release.geoTypeCounts()).containsEntry("point", 1L);
        }
    }

    // ---------------------------------------------------------------- B

    @Nested
    @DisplayName("Case B: positive expected but absent observed — must FAIL")
    class CaseB {

        @Test
        @DisplayName("expected mixed=1 with no mixed records: counts mismatch")
        void positiveExpectedFailsWhenAbsent() throws Exception {
            Path fixture = writeJsonlFixture(List.of(
                    record("evt-b-point", "point")));
            String sha = CanonicalGeographyProjection.canonicalFileSha256(fixture);
            Map<String, Long> expected = new LinkedHashMap<>();
            expected.put("point", 1L);
            expected.put("mixed", 1L);

            // Must FAIL because the normalised observed map has `mixed=0`,
            // not the expected `mixed=1`.
            assertThatThrownBy(() ->
                    service.validateCanonical(fixture, sha, expected))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Canonical geoType counts mismatch")
                .hasMessageContaining("mixed");
        }
    }

    // ---------------------------------------------------------------- C

    @Nested
    @DisplayName("Case C: wrong non-zero count — must FAIL")
    class CaseC {

        @Test
        @DisplayName("expected point=2 but actual point=1: counts mismatch")
        void wrongCountFails() throws Exception {
            Path fixture = writeJsonlFixture(List.of(
                    record("evt-c-1", "point")));
            String sha = CanonicalGeographyProjection.canonicalFileSha256(fixture);
            Map<String, Long> expected = new LinkedHashMap<>();
            expected.put("point", 2L);

            // Must FAIL because the observed map has `point=1` vs expected=2.
            assertThatThrownBy(() ->
                    service.validateCanonical(fixture, sha, expected))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Canonical geoType counts mismatch");
        }

        @Test
        @DisplayName("expected point=1 but actual point=2: counts mismatch")
        void wrongCountFailsReverse() throws Exception {
            Path fixture = writeJsonlFixture(List.of(
                    record("evt-c-1", "point"),
                    record("evt-c-2", "point")));
            String sha = CanonicalGeographyProjection.canonicalFileSha256(fixture);
            Map<String, Long> expected = new LinkedHashMap<>();
            expected.put("point", 1L);

            assertThatThrownBy(() ->
                    service.validateCanonical(fixture, sha, expected))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Canonical geoType counts mismatch");
        }
    }

    // ---------------------------------------------------------------- D

    @Nested
    @DisplayName("Case D: unexpected observed geoType — covered at the rejection layer")
    class CaseD {

        @Test
        @DisplayName("non-canonical geoType is rejected before count validation runs")
        void rejectsUnknownGeoTypeBeforeCountCheck() throws Exception {
            // `legacy_polygon` is not in the six canonical geoTypes, so the
            // rejection layer in validateCanonical fires before the counts
            // map is built. This is the documented behaviour: the count
            // validator never sees unexpected observed types.
            Path fixture = writeJsonlFixture(List.of(
                    record("evt-d-1", "point"),
                    record("evt-d-2", "legacy_polygon")));
            String sha = CanonicalGeographyProjection.canonicalFileSha256(fixture);
            Map<String, Long> expected = new LinkedHashMap<>();
            expected.put("point", 1L);
            expected.put("legacy_polygon", 1L);

            assertThatThrownBy(() ->
                    service.validateCanonical(fixture, sha, expected))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("unsupported canonical geoType")
                .hasMessageContaining("legacy_polygon")
                // The count-validator message MUST NOT appear because the
                // rejection layer cuts the request short before counts
                // map is built.
                .hasMessageNotContaining("Canonical geoType counts mismatch");
        }

        @Test
        @DisplayName("any geoType outside the six canonical ones is rejected")
        void rejectsBrandNewGeoType() throws Exception {
            Path fixture = writeJsonlFixture(List.of(
                    record("evt-d-bogus", "maritime_route")));
            String sha = CanonicalGeographyProjection.canonicalFileSha256(fixture);
            Map<String, Long> expected = new LinkedHashMap<>();
            expected.put("maritime_route", 1L);

            assertThatThrownBy(() ->
                    service.validateCanonical(fixture, sha, expected))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("unsupported canonical geoType");
        }
    }

    // ---------------------------------------------------------------- E

    @Nested
    @DisplayName("Case E: full canonical release with mixed=0 — must PASS")
    class CaseE {

        @Test
        @DisplayName("six canonical types including mixed=0: counts match exactly")
        void fullCanonicalReleasePasses() throws Exception {
            // Mirrors the locked release shape: point/multi_point/
            // multi_polygon/nationwide/no_location each have ≥1 record and
            // mixed has zero records. Exactly one of each type is enough
            // to exercise the normalisation path.
            Path fixture = writeJsonlFixture(List.of(
                    record("evt-e-point", "point"),
                    record("evt-e-multi-point", "multi_point"),
                    record("evt-e-multi-polygon", "multi_polygon"),
                    record("evt-e-nationwide", "nationwide"),
                    record("evt-e-no-location", "no_location")));
            String sha = CanonicalGeographyProjection.canonicalFileSha256(fixture);
            Map<String, Long> expected = new LinkedHashMap<>();
            expected.put("point", 1L);
            expected.put("multi_point", 1L);
            expected.put("multi_polygon", 1L);
            expected.put("mixed", 0L);
            expected.put("nationwide", 1L);
            expected.put("no_location", 1L);

            var release = service.validateCanonical(fixture, sha, expected);

            assertThat(release.sha256()).isEqualTo(sha);
            assertThat(release.orderedRecords()).hasSize(5);
            // The map returned to callers keeps the actually-observed
            // geoTypeCounts; the normalised Map is internal. mixed must
            // therefore be absent in the returned counts (as it was before
            // C2-T4 and remains — we only change the validity check).
            assertThat(release.geoTypeCounts()).doesNotContainKey("mixed");
            assertThat(release.geoTypeCounts()).containsEntry("point", 1L);
            assertThat(release.geoTypeCounts()).containsEntry("multi_polygon", 1L);
        }

        @Test
        @DisplayName("locked release fingerprint shape (361-event distribution) — must PASS")
        void lockedReleaseFingerprintShape() throws Exception {
            // Reuse the exact distribution of the locked canonical release
            // (point=46, multi_point=19, multi_polygon=24, mixed=0,
            // nationwide=18, no_location=254) but elide to the bare minimum
            // for a check: 46 point records, 19 multi_point, 24
            // multi_polygon, 0 mixed, 18 nationwide, 254 no_location.
            // Total 361 entries — same as the locked release.
            java.util.List<JsonNode> all = new java.util.ArrayList<>();
            for (int i = 0; i < 46; i++) {
                all.add(record(String.format("evt-e-p-%03d", i), "point"));
            }
            for (int i = 0; i < 19; i++) {
                all.add(record(String.format("evt-e-mp-%03d", i), "multi_point"));
            }
            for (int i = 0; i < 24; i++) {
                all.add(record(String.format("evt-e-mpg-%03d", i), "multi_polygon"));
            }
            for (int i = 0; i < 18; i++) {
                all.add(record(String.format("evt-e-nw-%03d", i), "nationwide"));
            }
            for (int i = 0; i < 254; i++) {
                all.add(record(String.format("evt-e-nl-%03d", i), "no_location"));
            }
            // Confirm fixture size.
            assertThat(all).hasSize(361);

            Path fixture = writeJsonlFixture(all);
            String sha = CanonicalGeographyProjection.canonicalFileSha256(fixture);
            Map<String, Long> expected = new LinkedHashMap<>();
            expected.put("point", 46L);
            expected.put("multi_point", 19L);
            expected.put("multi_polygon", 24L);
            expected.put("mixed", 0L);
            expected.put("nationwide", 18L);
            expected.put("no_location", 254L);

            var release = service.validateCanonical(fixture, sha, expected);

            assertThat(release.sha256()).isEqualTo(sha);
            assertThat(release.orderedRecords()).hasSize(361);
            assertThat(release.geoTypeCounts()).containsEntry("point", 46L);
            assertThat(release.geoTypeCounts()).containsEntry("multi_point", 19L);
            assertThat(release.geoTypeCounts()).containsEntry("multi_polygon", 24L);
            assertThat(release.geoTypeCounts()).containsEntry("nationwide", 18L);
            assertThat(release.geoTypeCounts()).containsEntry("no_location", 254L);
            // The 0-count mixed stays absent in the observed map but the
            // validator accepts the expected release.
            assertThat(release.geoTypeCounts()).doesNotContainKey("mixed");
        }
    }

    // ---------------------------------------------------------------- extras

    @Test
    @DisplayName("null expectedCounts bypasses count validation entirely")
    void nullExpectedCountsSkipsCheck() throws Exception {
        Path fixture = writeJsonlFixture(List.of(
                record("evt-x", "point")));
        String sha = CanonicalGeographyProjection.canonicalFileSha256(fixture);

        // No assertion throws — passing null means the validator is
        // reduced to SHA and uniqueness checks; counts are not enforced.
        var release = service.validateCanonical(fixture, sha, null);
        assertThat(release.geoTypeCounts()).containsEntry("point", 1L);
    }

    @Test
    @DisplayName("deterministic: same fixture, run twice → same observed counts")
    void deterministicAcrossRuns() throws Exception {
        Path fixture = writeJsonlFixture(List.of(
                record("evt-d-1", "point"),
                record("evt-d-2", "nationwide")));
        String sha = CanonicalGeographyProjection.canonicalFileSha256(fixture);
        Map<String, Long> expected = new LinkedHashMap<>();
        expected.put("point", 1L);
        expected.put("nationwide", 1L);
        expected.put("mixed", 0L); // exercise zero-count normalisation

        var run1 = service.validateCanonical(fixture, sha, expected);
        var run2 = service.validateCanonical(fixture, sha, expected);

        assertThat(run1.geoTypeCounts()).isEqualTo(run2.geoTypeCounts());
        assertThat(run1.geoTypeCounts())
                .containsEntry("point", 1L)
                .containsEntry("nationwide", 1L)
                .doesNotContainKey("mixed");
    }
}

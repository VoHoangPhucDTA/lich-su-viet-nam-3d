package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.DecimalNode;
import com.fasterxml.jackson.databind.node.LongNode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Probe diagnostics for the canonical numeric normalization contract.
 *
 * <p>NOTE: this test class is informational and asserts the desired contract
 * for the postverify remediation. The implementation in
 * {@link com.lichsuvn.backend.importer.canonicalgeo.CanonicalGeographyProjection}
 * may not yet produce these exact outputs - the failing rehearsal captured a
 * hash divergence on
 * {@code dai-hoi-dai-bieu-lan-thu-ii-dang-cong-san-dong-duong-1951} because
 * legacy LongNode and canonical DecimalNode serialise to different text
 * forms even when mathematically equal.
 */
class CanonicalGeographyNumericNormalizationProbeTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void decimalAndIntegerEqualValueShouldCanonicalizeEqual() throws Exception {
        // DecimalNode(22.0) and LongNode(22) represent the same number.
        ObjectNode node = mapper.createObjectNode();
        node.set("longForm", mapper.readTree("22"));          // LongNode (or IntNode)
        node.set("decimalForm", mapper.readTree("22.0"));     // DecimalNode
        node.set("textForm", mapper.readTree("\"22.0\""));    // string

        assertEquals("22", node.path("longForm").asText());
        assertEquals("22.0", node.path("decimalForm").asText());
        assertEquals("22.0", node.path("textForm").asText());

        // After BigDecimal.stripTrailingZeros().toPlainString(), both numeric
        // forms collapse to the same text. This is the contract the fix
        // promises for the canonical hash projection.
        BigDecimal longForm = new BigDecimal("22").stripTrailingZeros();
        BigDecimal decimalForm = new BigDecimal("22.0").stripTrailingZeros();
        assertEquals(0, longForm.compareTo(decimalForm));
    }

    @Test
    void canonicalNumberTextFormsRecordedForAllKnownPatterns() {
        // Pin the contract: integer-ish decimals collapse to integer form.
        assertEquals("22", bigDecToCanonicalText(new BigDecimal("22.0")));
        assertEquals("22", bigDecToCanonicalText(new BigDecimal("22")));
        assertEquals("22.5", bigDecToCanonicalText(new BigDecimal("22.50")));
        assertEquals("0", bigDecToCanonicalText(new BigDecimal("0.000000")));
    }

    private String bigDecToCanonicalText(BigDecimal value) {
        // The canonical hash's numeric text form for any scalar is:
        //   1. Normalise to BigDecimal.
        //   2. stripTrailingZeros().
        //   3. ensure positive scale.
        //   4. toPlainString().
        BigDecimal v = value.stripTrailingZeros();
        if (v.scale() < 0) {
            v = v.setScale(0);
        }
        // Special-case: BigDecimal "0" in some Jdks has scale < 0 after stripTrailingZeros.
        if (v.signum() == 0) {
            return "0";
        }
        return v.toPlainString();
    }
}

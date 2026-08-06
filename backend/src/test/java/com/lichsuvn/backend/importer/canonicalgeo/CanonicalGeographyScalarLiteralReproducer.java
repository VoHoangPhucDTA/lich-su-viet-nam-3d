package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Auxiliary diagnostic - records what Jackson emits/spawns for the
 * canonical mapData scalar "lat" values, both for the original canonical
 * record and the simulated post-write reformatting. The recorded invariant
 * contracts the production hasher relies on.
 */
class CanonicalGeographyScalarLiteralReproducer {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void decimalLiteralRoundTrip_isStable() throws Exception {
        // Canonical record (deep copy of mapData.marker)
        ObjectNode canonical = mapper.createObjectNode();
        canonical.put("name", "Chi\u00eam Ho\u00e1 (Tuy\u00ean Quang)");
        canonical.put("lat", 22.0);
        canonical.put("lng", 105.3);
        canonical.put("confidence", "high");

        String before = mapper.writeValueAsString(canonical);
        JsonNode reread = mapper.readTree(mapper.writeValueAsString(canonical));

        // Jackson serialises DecimalNode(22.0) as "22.0" (with trailing
        // decimal); this is the canonical literal we want to lock.
        assertEquals("{\"confidence\":\"high\",\"lat\":22.0,\"lng\":105.3,"
                + "\"name\":\"Chi\u00eam Ho\u00e1 (Tuy\u00ean Quang)\"}", before);

        assertEquals("22.0", reread.path("lat").asText());
        assertEquals("105.3", reread.path("lng").asText());
    }

    @Test
    void integerLiteralRoundTrip_emitsNoDecimalPoint_isStable() throws Exception {
        ObjectNode legacy = mapper.createObjectNode();
        legacy.put("name", "Chi\u00eam Ho\u00e1 (Tuy\u00ean Quang)");
        legacy.put("lat", 22);   // LongNode
        legacy.put("lng", 105.3); // DecimalNode
        legacy.put("confidence", "high");

        String before = mapper.writeValueAsString(legacy);
        assertEquals("{\"confidence\":\"high\",\"lat\":22,\"lng\":105.3,"
                + "\"name\":\"Chi\u00eam Ho\u00e1 (Tuy\u00ean Quang)\"}", before);
    }

    @Test
    void emptyArraysAreStable() throws Exception {
        ObjectNode mapData = mapper.createObjectNode();
        mapData.put("geoType", "point");
        mapData.putArray("markers").add(mapper.createObjectNode());
        mapData.putArray("provinceNames");

        String text = mapper.writeValueAsString(mapData);
        // Canonical serializer emits deterministic-key-order JSON for empty
        // arrays and references the same object shape through a round trip.
        assertEquals(
                "{\"geoType\":\"point\",\"markers\":[{}],\"provinceNames\":[]}",
                text);
    }
}

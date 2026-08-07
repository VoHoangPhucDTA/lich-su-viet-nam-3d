package com.lichsuvn.backend.importer.canonicalgeo;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * Regression test for C2-P §4 — canonical logical SHA must be line-ending
 * insensitive (LF vs CRLF hash equal) while altered JSON content still
 * changes the hash. Exercises {@link CanonicalGeographyProjection#canonicalFileSha256(Path)}.
 */
class CanonicalGeographyCanonicalShaTest {

    @Test
    void lfAndCrlfCopiesProduceSameLogicalCanonicalSha(@TempDir Path tmp) throws Exception {
        String content = "{\"id\":\"a\"}\n{\"id\":\"b\"}\n{\"id\":\"c\"}\n";
        Path lf = tmp.resolve("canonical-lf.jsonl");
        Path crlf = tmp.resolve("canonical-crlf.jsonl");
        Files.writeString(lf, content, StandardCharsets.UTF_8);
        Files.writeString(crlf, content.replace("\n", "\r\n"), StandardCharsets.UTF_8);

        String lfSha = CanonicalGeographyProjection.canonicalFileSha256(lf);
        String crlfSha = CanonicalGeographyProjection.canonicalFileSha256(crlf);

        assertEquals(lfSha, crlfSha,
                "LF and CRLF canonical copies must hash to the same logical SHA");
        assertEquals(64, lfSha.length(), "SHA-256 hex digest must be 64 chars");
    }

    @Test
    void alteredJsonContentProducesDifferentCanonicalSha(@TempDir Path tmp) throws Exception {
        String base = "{\"id\":\"a\",\"mapData\":{\"geoType\":\"point\"}}\n{\"id\":\"b\"}\n";
        Path original = tmp.resolve("original.jsonl");
        Path altered = tmp.resolve("altered.jsonl");
        Files.writeString(original, base, StandardCharsets.UTF_8);
        Files.writeString(altered, base.replace("point", "multi_point"), StandardCharsets.UTF_8);

        String originalSha = CanonicalGeographyProjection.canonicalFileSha256(original);
        String alteredSha = CanonicalGeographyProjection.canonicalFileSha256(altered);

        assertNotEquals(originalSha, alteredSha,
                "Different canonical content must produce a different logical SHA");
    }

    @Test
    void mixedLineEndingsAcrossRecordsAlsoNormalize(@TempDir Path tmp) throws Exception {
        // Simulate a file with mixed CRLF / LF (still rare but allowed by the spec).
        String mixed = "{\"id\":\"a\"}\r\n{\"id\":\"b\"}\n{\"id\":\"c\"}\r\n";
        Path mixedFile = tmp.resolve("mixed.jsonl");
        Path lfFile = tmp.resolve("lf-only.jsonl");
        Files.writeString(mixedFile, mixed, StandardCharsets.UTF_8);
        Files.writeString(lfFile, "{\"id\":\"a\"}\n{\"id\":\"b\"}\n{\"id\":\"c\"}\n", StandardCharsets.UTF_8);

        String mixedSha = CanonicalGeographyProjection.canonicalFileSha256(mixedFile);
        String lfSha = CanonicalGeographyProjection.canonicalFileSha256(lfFile);
        assertEquals(lfSha, mixedSha,
                "Mixed CRLF/LF must normalize to the LF logical canonical SHA");
    }
}

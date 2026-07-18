package com.lichsuvn.backend.exam.dataset;

import org.junit.jupiter.api.Test;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ExamDatasetCanonicalizationTest {
    private final JsonMapper strictMapper = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .build();

    @Test
    void sharedRfc8785VectorsMatchNodeExpectedBytesAndHashes() throws Exception {
        JsonNode fixture = strictMapper.readTree(Files.readString(fixturePath()));
        for (JsonNode vector : fixture.path("vectors")) {
            JsonNode input = strictMapper.readTree(vector.path("input").asText());
            String name = vector.path("name").asText();
            assertEquals(vector.path("expectedCanonical").asText(), ExamDatasetHashing.canonicalText(input), name);
            assertEquals(vector.path("expectedSha256").asText(), ExamDatasetHashing.canonicalSha256(input), name);
        }
    }

    @Test
    void strictJacksonRejectsDuplicatePropertyBeforeBinding() throws Exception {
        JsonNode fixture = strictMapper.readTree(Files.readString(fixturePath()));
        for (JsonNode invalid : fixture.path("invalid")) {
            assertThrows(Exception.class, () -> strictMapper.readTree(invalid.path("input").asText()));
        }
    }

    private Path fixturePath() {
        return Path.of("..", "data", "exam-build-fixtures", "rfc8785-vectors.json")
                .toAbsolutePath()
                .normalize();
    }
}

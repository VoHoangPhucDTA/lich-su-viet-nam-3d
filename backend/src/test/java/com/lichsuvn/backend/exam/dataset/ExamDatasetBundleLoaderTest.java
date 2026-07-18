package com.lichsuvn.backend.exam.dataset;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExamDatasetBundleLoaderTest {
    private final ExamDatasetBundleLoader loader = new ExamDatasetBundleLoader();

    @Test
    void loadsAndAuditsCurrentDataset() {
        Path root = repositoryRoot();
        ExamDatasetBundle bundle = loader.load(
                root,
                root.resolve("data/exams"),
                root.resolve("frontend/public/data/exams")
        );

        assertEquals(38, bundle.exams().size());
        assertEquals(76, bundle.sectionCount());
        assertEquals(1064, bundle.questionCount());
        assertEquals(32, bundle.topicIndex().size());
        assertEquals(1092, bundle.taggingCount());
        assertEquals(bundle.buildMetadata().path("aggregateHash").asText(), bundle.aggregateHash());
    }

    @Test
    void rejectsTamperedArtifactWithoutChangingSources(@TempDir Path temporaryRoot) throws IOException {
        copyDataset(repositoryRoot(), temporaryRoot);
        Path manifest = temporaryRoot.resolve("frontend/public/data/exams/exams-manifest.json");
        Files.writeString(manifest, "[]");

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> loader.load(
                temporaryRoot,
                temporaryRoot.resolve("data/exams"),
                temporaryRoot.resolve("frontend/public/data/exams")
        ));
        assertTrue(error.getMessage().contains("hash mismatch"));
    }

    @Test
    void rejectsRawDuplicatePropertyBeforeHashComparison(@TempDir Path temporaryRoot) throws IOException {
        copyDataset(repositoryRoot(), temporaryRoot);
        Path firstSource = Files.list(temporaryRoot.resolve("data/exams"))
                .filter(path -> path.getFileName().toString().endsWith(".json"))
                .findFirst()
                .orElseThrow();
        Files.writeString(firstSource, "{\"examId\":\"one\",\"examId\":\"two\"}");

        assertThrows(IllegalArgumentException.class, () -> loader.load(
                temporaryRoot,
                temporaryRoot.resolve("data/exams"),
                temporaryRoot.resolve("frontend/public/data/exams")
        ));
    }

    private void copyDataset(Path sourceRoot, Path targetRoot) throws IOException {
        copyDirectory(sourceRoot.resolve("data/exams"), targetRoot.resolve("data/exams"));
        copyDirectory(
                sourceRoot.resolve("frontend/public/data/exams"),
                targetRoot.resolve("frontend/public/data/exams")
        );
    }

    private void copyDirectory(Path source, Path target) throws IOException {
        Files.createDirectories(target);
        try (var stream = Files.list(source)) {
            for (Path file : stream.filter(Files::isRegularFile).toList()) {
                Files.copy(file, target.resolve(file.getFileName()));
            }
        }
    }

    private Path repositoryRoot() {
        return Path.of("..").toAbsolutePath().normalize();
    }
}

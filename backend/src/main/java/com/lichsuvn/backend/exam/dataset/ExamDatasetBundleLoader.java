package com.lichsuvn.backend.exam.dataset;

import org.springframework.stereotype.Component;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class ExamDatasetBundleLoader {
    private static final List<String> ARTIFACT_NAMES = List.of(
            "exams-manifest.json",
            "topic-index.json",
            "topic-raw-mapping.json"
    );

    private final JsonMapper strictMapper = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .build();

    public ExamDatasetBundle load(Path repositoryRoot, Path sourceDirectory, Path artifactDirectory) {
        Path repo = repositoryRoot.toAbsolutePath().normalize();
        Path sources = sourceDirectory.toAbsolutePath().normalize();
        Path artifacts = artifactDirectory.toAbsolutePath().normalize();
        requireDirectory(sources, "exam source directory");
        requireDirectory(artifacts, "exam artifact directory");

        JsonNode metadata = readStrict(artifacts.resolve("exam-dataset-build.json"));
        validateMetadataHeader(metadata);

        Map<String, JsonNode> artifactValues = new LinkedHashMap<>();
        for (String artifactName : ARTIFACT_NAMES) {
            Path artifactPath = artifacts.resolve(artifactName);
            JsonNode value = readStrict(artifactPath);
            String expected = requiredText(metadata.path("artifacts").path(artifactName), "sha256");
            requireHash(expected, ExamDatasetHashing.canonicalSha256(value), artifactName);
            artifactValues.put(artifactName, value);
        }

        List<Path> actualSourceFiles;
        try (var stream = Files.list(sources)) {
            actualSourceFiles = stream
                    .filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                    .toList();
        } catch (IOException ex) {
            throw new IllegalArgumentException("Cannot list exam source directory", ex);
        }

        JsonNode sourceMetadata = metadata.path("sources");
        if (!sourceMetadata.isArray() || sourceMetadata.size() != actualSourceFiles.size()) {
            throw new IllegalArgumentException("Build metadata source list does not match data/exams");
        }

        Map<String, Path> actualByRelativePath = new HashMap<>();
        for (Path file : actualSourceFiles) {
            actualByRelativePath.put(normalizeRelative(repo.relativize(file)), file);
        }

        List<ExamDatasetBundle.SourceExam> examSources = new ArrayList<>();
        List<String> sourceOrder = new ArrayList<>();
        Set<String> examIds = new HashSet<>();
        Set<String> questionIds = new HashSet<>();
        Map<String, String> questionExam = new HashMap<>();
        int sectionCount = 0;
        int questionCount = 0;

        for (JsonNode sourceEntry : sourceMetadata) {
            String relativePath = requiredText(sourceEntry, "path");
            Path sourcePath = actualByRelativePath.remove(relativePath);
            if (sourcePath == null || !sourcePath.startsWith(sources)) {
                throw new IllegalArgumentException("Unknown or unsafe source path in build metadata: " + relativePath);
            }
            JsonNode exam = readStrict(sourcePath);
            String sourceHash = ExamDatasetHashing.canonicalSha256(exam);
            requireHash(requiredText(sourceEntry, "sha256"), sourceHash, relativePath);
            String examId = requiredText(exam, "examId");
            if (!examIds.add(examId)) {
                throw new IllegalArgumentException("Duplicate examId in dataset: " + examId);
            }
            JsonNode sections = exam.path("sections");
            if (!sections.isArray()) {
                throw new IllegalArgumentException(relativePath + ": sections must be an array");
            }
            for (JsonNode section : sections) {
                sectionCount++;
                JsonNode questions = section.path("questions");
                if (!questions.isArray()) {
                    throw new IllegalArgumentException(relativePath + ": section questions must be an array");
                }
                for (JsonNode question : questions) {
                    questionCount++;
                    String questionId = requiredText(question, "id");
                    if (!questionIds.add(questionId)) {
                        throw new IllegalArgumentException("Duplicate questionId in dataset: " + questionId);
                    }
                    questionExam.put(questionId, examId);
                }
            }
            sourceOrder.add(relativePath);
            examSources.add(new ExamDatasetBundle.SourceExam(relativePath, sourceHash, exam));
        }
        if (!actualByRelativePath.isEmpty()) {
            throw new IllegalArgumentException("Build metadata omits source files: " + actualByRelativePath.keySet());
        }
        List<String> sortedOrder = sourceOrder.stream().sorted().toList();
        if (!sourceOrder.equals(sortedOrder)) {
            throw new IllegalArgumentException("Build metadata sources must be sorted by normalized relative path");
        }

        JsonNode manifest = artifactValues.get("exams-manifest.json");
        validateManifest(manifest, examSources);
        JsonNode topicIndex = artifactValues.get("topic-index.json");
        JsonNode rawMapping = artifactValues.get("topic-raw-mapping.json");
        int taggingCount = validateTopicArtifacts(topicIndex, rawMapping, questionExam);
        verifyAggregateHash(metadata);

        return new ExamDatasetBundle(
                repo,
                metadata,
                requiredText(metadata, "aggregateHash"),
                requiredText(metadata, "buildId"),
                requiredInt(metadata, "hashSchemaVersion"),
                requiredInt(metadata, "buildAlgorithmVersion"),
                List.copyOf(examSources),
                manifest,
                topicIndex,
                rawMapping,
                sectionCount,
                questionCount,
                taggingCount
        );
    }

    private void validateMetadataHeader(JsonNode metadata) {
        if (!"SHA-256".equals(requiredText(metadata, "hashAlgorithm"))) {
            throw new IllegalArgumentException("Unsupported dataset hash algorithm");
        }
        if (!"RFC8785".equals(requiredText(metadata, "canonicalization"))) {
            throw new IllegalArgumentException("Unsupported dataset canonicalization");
        }
        if (requiredInt(metadata, "hashSchemaVersion") != 1 || requiredInt(metadata, "buildAlgorithmVersion") != 1) {
            throw new IllegalArgumentException("Unsupported dataset build schema or algorithm version");
        }
        String hash = requiredText(metadata, "aggregateHash");
        if (!hash.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("aggregateHash must be lowercase SHA-256 hex");
        }
    }

    private void verifyAggregateHash(JsonNode metadata) {
        ObjectNode aggregate = strictMapper.createObjectNode();
        aggregate.put("hashSchemaVersion", requiredInt(metadata, "hashSchemaVersion"));
        aggregate.put("buildAlgorithmVersion", requiredInt(metadata, "buildAlgorithmVersion"));

        ArrayNode sources = aggregate.putArray("sources");
        for (JsonNode source : metadata.path("sources")) {
            ObjectNode entry = sources.addObject();
            entry.put("path", requiredText(source, "path"));
            entry.put("sha256", requiredText(source, "sha256"));
        }

        ObjectNode artifacts = aggregate.putObject("artifacts");
        for (String name : ARTIFACT_NAMES) {
            ObjectNode entry = artifacts.putObject(name);
            entry.put("sha256", requiredText(metadata.path("artifacts").path(name), "sha256"));
        }
        requireHash(requiredText(metadata, "aggregateHash"), ExamDatasetHashing.canonicalSha256(aggregate), "aggregate input");
    }

    private void validateManifest(JsonNode manifest, List<ExamDatasetBundle.SourceExam> exams) {
        if (!manifest.isArray() || manifest.size() != exams.size()) {
            throw new IllegalArgumentException("Manifest exam count does not match source count");
        }
        Set<String> sourceExamIds = exams.stream()
                .map(source -> requiredText(source.value(), "examId"))
                .collect(java.util.stream.Collectors.toSet());
        Set<String> manifestExamIds = new HashSet<>();
        for (JsonNode entry : manifest) {
            String examId = requiredText(entry, "examId");
            if (!manifestExamIds.add(examId)) {
                throw new IllegalArgumentException("Manifest contains duplicate examId: " + examId);
            }
        }
        if (!sourceExamIds.equals(manifestExamIds)) {
            throw new IllegalArgumentException("Manifest exam IDs do not match source exams");
        }
    }

    private int validateTopicArtifacts(JsonNode topicIndex, JsonNode rawMapping, Map<String, String> questionExam) {
        if (!topicIndex.isObject() || !rawMapping.isObject()) {
            throw new IllegalArgumentException("Topic artifacts must be JSON objects");
        }
        int taggings = 0;
        var fields = topicIndex.properties().iterator();
        while (fields.hasNext()) {
            var field = fields.next();
            String topic = field.getKey();
            JsonNode refs = field.getValue();
            JsonNode mapping = rawMapping.path(topic);
            if (!refs.isArray() || !mapping.isObject() || !mapping.path("rawTopics").isArray()) {
                throw new IllegalArgumentException("Topic mapping is incomplete for: " + topic);
            }
            if (mapping.path("questionCount").asInt(-1) != refs.size()) {
                throw new IllegalArgumentException("Topic questionCount mismatch for: " + topic);
            }
            Set<String> seenRefs = new HashSet<>();
            for (JsonNode ref : refs) {
                String examId = requiredText(ref, "examId");
                String questionId = requiredText(ref, "questionId");
                if (!examId.equals(questionExam.get(questionId))) {
                    throw new IllegalArgumentException("Topic ref does not match question ownership: " + questionId);
                }
                if (!seenRefs.add(examId + ':' + questionId)) {
                    throw new IllegalArgumentException("Duplicate topic ref for " + topic + ": " + questionId);
                }
                taggings++;
            }
        }
        if (rawMapping.size() != topicIndex.size()) {
            throw new IllegalArgumentException("topic-raw-mapping keys do not match topic-index keys");
        }
        return taggings;
    }

    private JsonNode readStrict(Path file) {
        if (!Files.isRegularFile(file)) {
            throw new IllegalArgumentException("Required dataset file is missing: " + file);
        }
        try {
            byte[] bytes = Files.readAllBytes(file);
            if (bytes.length >= 3 && bytes[0] == (byte) 0xef && bytes[1] == (byte) 0xbb && bytes[2] == (byte) 0xbf) {
                throw new IllegalArgumentException(file + ": UTF-8 BOM is not allowed");
            }
            String raw = new String(bytes, StandardCharsets.UTF_8);
            return strictMapper.readTree(raw);
        } catch (IOException | RuntimeException ex) {
            if (ex instanceof IllegalArgumentException illegal) {
                throw illegal;
            }
            throw new IllegalArgumentException("Invalid JSON in " + file + ": " + ex.getMessage(), ex);
        }
    }

    private void requireDirectory(Path path, String label) {
        if (!Files.isDirectory(path)) {
            throw new IllegalArgumentException(label + " does not exist: " + path);
        }
    }

    private String requiredText(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isString() || value.asText().isBlank()) {
            throw new IllegalArgumentException("Missing non-empty text field: " + field);
        }
        return value.asText();
    }

    private int requiredInt(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isIntegralNumber()) {
            throw new IllegalArgumentException("Missing integer field: " + field);
        }
        return value.asInt();
    }

    private void requireHash(String expected, String actual, String label) {
        if (!expected.equals(actual)) {
            throw new IllegalArgumentException(label + " hash mismatch: expected " + expected + ", got " + actual);
        }
    }

    private String normalizeRelative(Path path) {
        return path.toString().replace('\\', '/');
    }
}

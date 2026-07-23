package com.lichsuvn.backend.exam.application;

import com.lichsuvn.backend.exam.application.model.DashboardAttemptRecord;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Component
public class DashboardSnapshotV2Parser {
    private static final Set<String> COGNITIVE_LEVELS =
            Set.of("knowledge", "comprehension", "application");
    private static final Set<String> COMPLETION_STATES =
            Set.of("BLANK", "PARTIAL", "COMPLETE");
    private static final double SCORE_TOLERANCE = 0.005001d;

    private final ObjectMapper objectMapper;

    public DashboardSnapshotV2Parser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public enum DetailStatus {
        FULL,
        UNSUPPORTED,
        MALFORMED
    }

    public record ParseResult(DetailStatus status, ParsedSnapshot snapshot) {
        public static ParseResult full(ParsedSnapshot snapshot) {
            return new ParseResult(DetailStatus.FULL, snapshot);
        }

        public static ParseResult unsupported() {
            return new ParseResult(DetailStatus.UNSUPPORTED, null);
        }

        public static ParseResult malformed() {
            return new ParseResult(DetailStatus.MALFORMED, null);
        }
    }

    public record ParsedSnapshot(List<ParsedQuestion> questions) {
        public ParsedSnapshot {
            questions = List.copyOf(questions);
        }
    }

    public record ParsedQuestion(
            String questionType,
            String cognitiveLevel,
            String completionState,
            long correctUnits,
            long answeredUnits,
            long blankUnits,
            long totalUnits,
            List<TopicRef> topicRefs
    ) {
        public ParsedQuestion {
            topicRefs = List.copyOf(topicRefs);
        }
    }

    public record TopicRef(
            String slug,
            String title,
            String periodSlug,
            String periodTitle
    ) {}

    public ParseResult parse(DashboardAttemptRecord attempt) {
        if (attempt.snapshotSchemaVersion() == null || attempt.snapshotSchemaVersion() != 2) {
            return ParseResult.unsupported();
        }
        if (!StringUtils.hasText(attempt.resultJson())) {
            return ParseResult.malformed();
        }

        try {
            JsonNode root = objectMapper.readTree(attempt.resultJson());
            if (!validRoot(root, attempt)) return ParseResult.malformed();
            List<ParsedQuestion> questions = new ArrayList<>();
            for (JsonNode question : root.path("questions")) {
                ParsedQuestion parsed = parseQuestion(question);
                if (parsed == null) return ParseResult.malformed();
                questions.add(parsed);
            }
            int snapshotTotalQuestions = root.path("summary").path("totalQuestions").asInt(-1);
            if (snapshotTotalQuestions != questions.size()
                    || snapshotTotalQuestions != attempt.totalQuestions()) {
                return ParseResult.malformed();
            }
            return ParseResult.full(new ParsedSnapshot(questions));
        } catch (RuntimeException ignored) {
            // Deliberately return only a category. Never attach or log raw persisted JSON.
            return ParseResult.malformed();
        }
    }

    private boolean validRoot(JsonNode root, DashboardAttemptRecord attempt) {
        if (root == null || !root.isObject()
                || root.path("snapshotSchemaVersion").asInt(-1) != 2
                || !textEquals(root.get("sessionId"), attempt.sessionId())
                || !textEquals(root.get("mode"), attempt.mode())
                || !textEquals(root.get("scoreAuthority"), attempt.scoreAuthority())
                || !textEquals(root.get("timingAuthority"), attempt.timingAuthority())
                || !textEquals(root.get("submissionOrigin"), attempt.submissionOrigin())
                || !textEquals(root.get("scoringVersion"), attempt.scoringVersion())
                || !textEquals(root.get("datasetVersion"), attempt.datasetVersion())
                || !nullableTextEquals(root.get("examContentHash"), attempt.examContentHash())
                || !root.path("title").isTextual()
                || !StringUtils.hasText(root.path("title").asText())
                || !validSummaryShape(root.path("summary"))
                || !root.path("questions").isArray()) {
            return false;
        }
        JsonNode totalScore = root.path("summary").get("totalScore");
        JsonNode totalQuestions = root.path("summary").get("totalQuestions");
        return totalScore != null
                && totalScore.isNumber()
                && Double.isFinite(totalScore.asDouble())
                && attempt.totalScore() != null
                && Math.abs(totalScore.asDouble() - attempt.totalScore().doubleValue()) <= SCORE_TOLERANCE
                && totalQuestions != null
                && totalQuestions.isIntegralNumber()
                && totalQuestions.asInt(-1) >= 0;
    }

    private boolean validSummaryShape(JsonNode summary) {
        if (!summary.isObject()
                || !finiteNumber(summary.get("totalScore"))
                || !finiteNumber(summary.get("mcqScore"))
                || !finiteNumber(summary.get("tfScore"))
                || !nonNegativeInteger(summary.get("totalQuestions"))
                || !nonNegativeInteger(summary.get("correctMCQ"))
                || !nonNegativeInteger(summary.get("wrongMCQ"))
                || !nonNegativeInteger(summary.get("blankMCQ"))
                || !summary.path("tfBreakdown").isArray()
                || summary.path("tfBreakdown").size() != 5) {
            return false;
        }
        for (JsonNode count : summary.path("tfBreakdown")) {
            if (!nonNegativeInteger(count)) return false;
        }
        return true;
    }

    private ParsedQuestion parseQuestion(JsonNode item) {
        if (item == null || !item.isObject()
                || !hasText(item, "publicQuestionId")
                || !hasText(item, "questionInstanceId")
                || !hasText(item, "questionType")
                || !item.path("question").isObject()
                || !item.path("question").path("questionText").isTextual()
                || !item.path("topicRefs").isArray()
                || !item.path("correctness").isBoolean()
                || !hasText(item, "completionState")) {
            return null;
        }

        String type = item.path("questionType").asText();
        JsonNode safeQuestion = item.path("question");
        if (!type.equals(safeQuestion.path("questionType").asText())) return null;
        String completion = item.path("completionState").asText();
        if (!COMPLETION_STATES.contains(completion)) return null;

        String cognitive = parseCognitive(safeQuestion.get("cognitiveLevel"));
        if (cognitive == INVALID_COGNITIVE) return null;
        List<TopicRef> topics = parseTopics(item.path("topicRefs"));
        if (topics == null) return null;

        if ("mcq".equals(type)) {
            return parseMcq(item, safeQuestion, cognitive, completion, topics);
        }
        if ("true_false".equals(type)) {
            return parseTrueFalse(item, safeQuestion, cognitive, completion, topics);
        }
        return null;
    }

    private ParsedQuestion parseMcq(
            JsonNode item,
            JsonNode safeQuestion,
            String cognitive,
            String completion,
            List<TopicRef> topics
    ) {
        JsonNode options = safeQuestion.path("options");
        if (!options.isArray() || options.isEmpty()) return null;
        Set<String> optionIds = new HashSet<>();
        for (JsonNode option : options) {
            if (!option.isObject() || !hasText(option, "id") || !option.path("text").isTextual()
                    || !optionIds.add(option.path("id").asText())) {
                return null;
            }
        }
        JsonNode correct = item.get("correctAnswer");
        JsonNode user = item.get("userAnswer");
        if (correct == null || !correct.isTextual() || !optionIds.contains(correct.asText())) return null;
        boolean blank = user == null || user.isNull();
        if (!blank && (!user.isTextual() || !optionIds.contains(user.asText()))) return null;
        if ((blank && !"BLANK".equals(completion)) || (!blank && !"COMPLETE".equals(completion))) {
            return null;
        }
        boolean derivedCorrectness = !blank && user.asText().equals(correct.asText());
        if (item.path("correctness").asBoolean() != derivedCorrectness) return null;
        return new ParsedQuestion(
                "mcq",
                cognitive,
                completion,
                item.path("correctness").asBoolean() ? 1 : 0,
                blank ? 0 : 1,
                blank ? 1 : 0,
                1,
                topics
        );
    }

    private ParsedQuestion parseTrueFalse(
            JsonNode item,
            JsonNode safeQuestion,
            String cognitive,
            String completion,
            List<TopicRef> topics
    ) {
        JsonNode statements = safeQuestion.path("statements");
        JsonNode user = item.get("userAnswer");
        JsonNode correct = item.get("correctAnswer");
        if (!statements.isArray() || statements.isEmpty()
                || user == null || !user.isObject()
                || correct == null || !correct.isObject()) {
            return null;
        }

        List<String> keys = new ArrayList<>();
        Set<String> unique = new HashSet<>();
        for (JsonNode statement : statements) {
            if (!statement.isObject() || !hasText(statement, "id")
                    || !statement.path("text").isTextual()
                    || !unique.add(statement.path("id").asText())) {
                return null;
            }
            keys.add(statement.path("id").asText());
        }
        if (user.size() != keys.size() || correct.size() != keys.size()) return null;

        long answered = 0;
        long correctUnits = 0;
        for (String key : keys) {
            JsonNode selected = user.get(key);
            JsonNode expected = correct.get(key);
            if (selected == null || (!selected.isNull() && !selected.isBoolean())
                    || expected == null || !expected.isBoolean()) {
                return null;
            }
            if (!selected.isNull()) {
                answered++;
                if (selected.asBoolean() == expected.asBoolean()) correctUnits++;
            }
        }
        long total = keys.size();
        String derivedCompletion = answered == 0 ? "BLANK" : answered == total ? "COMPLETE" : "PARTIAL";
        if (!derivedCompletion.equals(completion)) return null;
        return new ParsedQuestion(
                "true_false",
                cognitive,
                completion,
                correctUnits,
                answered,
                total - answered,
                total,
                topics
        );
    }

    private List<TopicRef> parseTopics(JsonNode topicRefs) {
        LinkedHashMap<String, TopicRef> bySlug = new LinkedHashMap<>();
        for (JsonNode topic : topicRefs) {
            if (!topic.isObject() || !hasText(topic, "slug") || !hasText(topic, "title")
                    || !nullableText(topic.get("periodSlug"))
                    || !nullableText(topic.get("periodTitle"))) {
                return null;
            }
            String slug = topic.path("slug").asText();
            bySlug.putIfAbsent(slug, new TopicRef(
                    slug,
                    topic.path("title").asText(),
                    nullableTextValue(topic.get("periodSlug")),
                    nullableTextValue(topic.get("periodTitle"))
            ));
        }
        return List.copyOf(bySlug.values());
    }

    private static final String INVALID_COGNITIVE = new String("invalid");

    private String parseCognitive(JsonNode value) {
        if (value == null || value.isNull()) return null;
        if (!value.isTextual()) return INVALID_COGNITIVE;
        String cognitive = value.asText();
        return COGNITIVE_LEVELS.contains(cognitive) ? cognitive : null;
    }

    private boolean hasText(JsonNode value, String field) {
        return value.has(field) && value.path(field).isTextual()
                && StringUtils.hasText(value.path(field).asText());
    }

    private boolean textEquals(JsonNode value, String expected) {
        return value != null && value.isTextual() && expected != null && expected.equals(value.asText());
    }

    private boolean nullableTextEquals(JsonNode value, String expected) {
        if (value == null || value.isNull()) return expected == null;
        return value.isTextual() && Objects.equals(value.asText(), expected);
    }

    private boolean nullableText(JsonNode value) {
        return value == null || value.isNull() || value.isTextual();
    }

    private String nullableTextValue(JsonNode value) {
        return value == null || value.isNull() ? null : value.asText();
    }

    private boolean finiteNumber(JsonNode value) {
        return value != null && value.isNumber() && Double.isFinite(value.asDouble());
    }

    private boolean nonNegativeInteger(JsonNode value) {
        return value != null && value.isIntegralNumber() && value.asLong(-1) >= 0;
    }
}

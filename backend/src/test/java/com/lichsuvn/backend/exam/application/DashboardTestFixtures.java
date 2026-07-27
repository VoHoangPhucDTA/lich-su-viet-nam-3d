package com.lichsuvn.backend.exam.application;

import com.lichsuvn.backend.exam.application.model.DashboardAttemptRecord;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.math.BigDecimal;
import java.time.Instant;

final class DashboardTestFixtures {
    static final JsonMapper JSON = JsonMapper.builder().build();

    private DashboardTestFixtures() {}

    static DashboardAttemptRecord official(String sessionId, Instant submittedAt, double score, ObjectNode snapshot) {
        return attempt(
                sessionId, "TIMED_ORIGINAL", submittedAt, score, 1200, 2,
                2, "BACKEND", "SERVER", "SERVER_ON_TIME", snapshot
        );
    }

    static DashboardAttemptRecord attempt(
            String sessionId,
            String mode,
            Instant submittedAt,
            double score,
            Integer duration,
            int totalQuestions,
            Integer schemaVersion,
            String scoreAuthority,
            String timingAuthority,
            String submissionOrigin,
            ObjectNode snapshot
    ) {
        return new DashboardAttemptRecord(
                sessionId,
                mode,
                "Đề " + sessionId,
                BigDecimal.valueOf(score),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                totalQuestions,
                duration,
                submittedAt,
                submittedAt.minusSeconds(60),
                schemaVersion,
                scoreAuthority,
                timingAuthority,
                submissionOrigin,
                "thpt_2025_v1",
                "dataset-v1",
                "content-hash",
                snapshot == null ? "{}" : JSON.writeValueAsString(snapshot)
        );
    }

    static ObjectNode validSnapshot(String sessionId, double score) {
        ObjectNode root = JSON.createObjectNode();
        root.put("snapshotSchemaVersion", 2);
        root.put("sessionId", sessionId);
        root.put("mode", "TIMED_ORIGINAL");
        root.put("title", "Đề " + sessionId);
        root.put("datasetVersion", "dataset-v1");
        root.put("examContentHash", "content-hash");
        root.put("scoringVersion", "thpt_2025_v1");
        root.put("scoreAuthority", "BACKEND");
        root.put("timingAuthority", "SERVER");
        root.put("submissionOrigin", "SERVER_ON_TIME");
        root.put("startedAtServer", 1);
        root.put("submittedAtServer", 2);
        ObjectNode summary = root.putObject("summary");
        summary.put("totalScore", score);
        summary.put("mcqScore", 0);
        summary.put("tfScore", 0);
        summary.put("totalQuestions", 2);
        summary.put("correctMCQ", 1);
        summary.put("wrongMCQ", 0);
        summary.put("blankMCQ", 0);
        summary.putArray("tfBreakdown").add(0).add(0).add(0).add(0).add(1);
        ArrayNode questions = root.putArray("questions");
        questions.add(mcq("mcq-1", "knowledge", "A", "A", "COMPLETE", true, true));
        questions.add(trueFalse(
                "tf-1", "application", values(true, false, null, null),
                values(true, true, false, false), "PARTIAL", true
        ));
        return root;
    }

    static ObjectNode mcq(
            String id,
            String cognitive,
            String userAnswer,
            String correctAnswer,
            String completion,
            boolean correctness,
            boolean duplicateTopic
    ) {
        ObjectNode item = JSON.createObjectNode();
        item.put("publicQuestionId", "public-" + id);
        item.put("questionInstanceId", id);
        item.put("questionType", "mcq");
        ObjectNode question = item.putObject("question");
        question.put("questionType", "mcq");
        question.put("questionText", "Synthetic MCQ");
        question.putNull("difficulty");
        if (cognitive == null) question.putNull("cognitiveLevel"); else question.put("cognitiveLevel", cognitive);
        ArrayNode options = question.putArray("options");
        options.addObject().put("id", "A").put("text", "A");
        options.addObject().put("id", "B").put("text", "B");
        if (userAnswer == null) item.putNull("userAnswer"); else item.put("userAnswer", userAnswer);
        item.put("correctAnswer", correctAnswer);
        item.put("correctness", correctness);
        item.put("points", correctness ? 1 : 0);
        item.put("completionState", completion);
        item.putNull("explanation");
        item.putArray("sources");
        ArrayNode topics = item.putArray("topicRefs");
        topic(topics, "topic-a", "Nhãn mới");
        if (duplicateTopic) topic(topics, "topic-a", "Nhãn trùng");
        return item;
    }

    static ObjectNode trueFalse(
            String id,
            String cognitive,
            ObjectNode userAnswer,
            ObjectNode correctAnswer,
            String completion,
            boolean correctness
    ) {
        ObjectNode item = JSON.createObjectNode();
        item.put("publicQuestionId", "public-" + id);
        item.put("questionInstanceId", id);
        item.put("questionType", "true_false");
        ObjectNode question = item.putObject("question");
        question.put("questionType", "true_false");
        question.put("questionText", "Synthetic T/F");
        question.putNull("difficulty");
        if (cognitive == null) question.putNull("cognitiveLevel"); else question.put("cognitiveLevel", cognitive);
        ArrayNode statements = question.putArray("statements");
        for (String key : new String[]{"a", "b", "c", "d"}) {
            statements.addObject().put("id", key).put("text", key);
        }
        item.set("userAnswer", userAnswer);
        item.set("correctAnswer", correctAnswer);
        item.put("correctness", correctness);
        item.put("points", correctness ? 1 : 0);
        item.put("completionState", completion);
        item.putNull("explanation");
        item.putArray("sources");
        ArrayNode topics = item.putArray("topicRefs");
        topic(topics, "topic-a", "Nhãn mới");
        topic(topics, "topic-b", "Chủ đề B");
        return item;
    }

    static ObjectNode values(Boolean a, Boolean b, Boolean c, Boolean d) {
        ObjectNode values = JSON.createObjectNode();
        put(values, "a", a);
        put(values, "b", b);
        put(values, "c", c);
        put(values, "d", d);
        return values;
    }

    static DashboardAttemptRecord withSnapshot(DashboardAttemptRecord attempt, JsonNode snapshot) {
        return new DashboardAttemptRecord(
                attempt.sessionId(), attempt.mode(), attempt.title(), attempt.totalScore(),
                attempt.mcqScore(), attempt.tfScore(), attempt.totalQuestions(), attempt.durationSeconds(),
                attempt.submittedAt(), attempt.createdAt(), attempt.snapshotSchemaVersion(),
                attempt.scoreAuthority(), attempt.timingAuthority(), attempt.submissionOrigin(),
                attempt.scoringVersion(), attempt.datasetVersion(), attempt.examContentHash(),
                snapshot == null ? null : JSON.writeValueAsString(snapshot)
        );
    }

    private static void topic(ArrayNode topics, String slug, String title) {
        topics.addObject()
                .put("slug", slug)
                .put("title", title)
                .put("periodSlug", "period")
                .put("periodTitle", "Giai đoạn");
    }

    private static void put(ObjectNode object, String key, Boolean value) {
        if (value == null) object.putNull(key); else object.put(key, value);
    }
}

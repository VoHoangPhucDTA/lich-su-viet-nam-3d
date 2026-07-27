package com.lichsuvn.backend.exam.application;

import com.lichsuvn.backend.exam.application.DashboardSnapshotV2Parser.DetailStatus;
import com.lichsuvn.backend.exam.application.model.DashboardAttemptRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

class DashboardSnapshotV2ParserTest {
    private DashboardSnapshotV2Parser parser;

    @BeforeEach
    void setUp() {
        parser = new DashboardSnapshotV2Parser(DashboardTestFixtures.JSON);
    }

    @Test
    void parsesValidMcqTfPartialTopicsAndCognitiveUnits() {
        var result = parser.parse(validAttempt());
        assertEquals(DetailStatus.FULL, result.status());
        assertEquals(2, result.snapshot().questions().size());
        var mcq = result.snapshot().questions().getFirst();
        assertEquals("mcq", mcq.questionType());
        assertEquals("knowledge", mcq.cognitiveLevel());
        assertEquals(1, mcq.correctUnits());
        assertEquals(1, mcq.totalUnits());
        assertEquals(1, mcq.topicRefs().size(), "duplicate topic slug must be deduplicated");

        var tf = result.snapshot().questions().getLast();
        assertEquals("true_false", tf.questionType());
        assertEquals("PARTIAL", tf.completionState());
        assertEquals(1, tf.correctUnits());
        assertEquals(2, tf.answeredUnits());
        assertEquals(2, tf.blankUnits());
        assertEquals(4, tf.totalUnits());
        assertEquals(2, tf.topicRefs().size());
    }

    @Test
    void parsesCompleteTrueFalseByImmutableStatements() {
        ObjectNode root = singleQuestionSnapshot("tf-complete", 7);
        questions(root).add(DashboardTestFixtures.trueFalse(
                "tf-complete", "comprehension",
                DashboardTestFixtures.values(true, false, false, true),
                DashboardTestFixtures.values(true, true, false, false),
                "COMPLETE", false
        ));
        DashboardAttemptRecord attempt = attempt(root, "tf-complete", 7, 1);
        var question = parser.parse(attempt).snapshot().questions().getFirst();
        assertEquals(2, question.correctUnits());
        assertEquals(4, question.answeredUnits());
        assertEquals(0, question.blankUnits());
    }

    @Test
    void acceptsBlankQuestionAndUnknownOrMissingCognitiveWithoutInventingGroup() {
        ObjectNode root = singleQuestionSnapshot("blank", 4);
        ObjectNode mcq = DashboardTestFixtures.mcq(
                "blank", "future-level", null, "A", "BLANK", false, false
        );
        questions(root).add(mcq);
        var result = parser.parse(attempt(root, "blank", 4, 1));
        assertEquals(DetailStatus.FULL, result.status());
        assertNull(result.snapshot().questions().getFirst().cognitiveLevel());
        assertEquals(1, result.snapshot().questions().getFirst().blankUnits());

        ((ObjectNode) mcq.path("question")).putNull("cognitiveLevel");
        assertEquals(DetailStatus.FULL, parser.parse(attempt(root, "blank", 4, 1)).status());
    }

    @Test
    void distinguishesUnsupportedSchemaFromMalformedV2() {
        DashboardAttemptRecord unsupported = DashboardTestFixtures.attempt(
                "legacy", "TIMED_ORIGINAL", Instant.EPOCH, 5, 100, 1,
                1, null, null, null, null
        );
        assertEquals(DetailStatus.UNSUPPORTED, parser.parse(unsupported).status());

        DashboardAttemptRecord malformed = new DashboardAttemptRecord(
                "bad-json", "TIMED_ORIGINAL", "Bad", java.math.BigDecimal.valueOf(5),
                null, null, 1, 1, Instant.EPOCH, Instant.EPOCH,
                2, "BACKEND", "SERVER", "SERVER_ON_TIME",
                "thpt_2025_v1", "dataset-v1", "content-hash", "{\"answers\":["
        );
        var result = parser.parse(malformed);
        assertEquals(DetailStatus.MALFORMED, result.status());
        assertFalse(result.toString().contains("answers"), "error category must not expose raw JSON");
    }

    @Test
    void rejectsWrongQuestionOrCompletionEnums() {
        ObjectNode root = DashboardTestFixtures.validSnapshot("enum", 5);
        ((ObjectNode) questions(root).get(0)).put("questionType", "essay");
        assertEquals(DetailStatus.MALFORMED, parser.parse(attempt(root, "enum", 5, 2)).status());

        root = DashboardTestFixtures.validSnapshot("completion", 5);
        ((ObjectNode) questions(root).get(0)).put("completionState", "SKIPPED");
        assertEquals(DetailStatus.MALFORMED, parser.parse(attempt(root, "completion", 5, 2)).status());
    }

    @Test
    void rejectsMissingExtraOrInvalidTrueFalseStatementKeys() {
        ObjectNode missing = DashboardTestFixtures.validSnapshot("missing", 5);
        ((ObjectNode) questions(missing).get(1).path("userAnswer")).remove("d");
        assertEquals(DetailStatus.MALFORMED, parser.parse(attempt(missing, "missing", 5, 2)).status());

        ObjectNode extra = DashboardTestFixtures.validSnapshot("extra", 5);
        ((ObjectNode) questions(extra).get(1).path("userAnswer")).put("e", true);
        assertEquals(DetailStatus.MALFORMED, parser.parse(attempt(extra, "extra", 5, 2)).status());

        ObjectNode invalid = DashboardTestFixtures.validSnapshot("invalid", 5);
        ((ObjectNode) questions(invalid).get(1).path("userAnswer")).put("a", "yes");
        assertEquals(DetailStatus.MALFORMED, parser.parse(attempt(invalid, "invalid", 5, 2)).status());
    }

    @Test
    void rejectsColumnRootAuthorityAndScoreMismatch() {
        ObjectNode authority = DashboardTestFixtures.validSnapshot("authority-mismatch", 5);
        authority.put("timingAuthority", "CLIENT_UNVERIFIED");
        assertEquals(
                DetailStatus.MALFORMED,
                parser.parse(attempt(authority, "authority-mismatch", 5, 2)).status()
        );

        ObjectNode score = DashboardTestFixtures.validSnapshot("score-mismatch", 5);
        ((ObjectNode) score.path("summary")).put("totalScore", 5.02);
        assertEquals(
                DetailStatus.MALFORMED,
                parser.parse(attempt(score, "score-mismatch", 5, 2)).status()
        );
    }

    @Test
    void rejectsMalformedTopicReferenceShape() {
        ObjectNode root = DashboardTestFixtures.validSnapshot("topic", 5);
        ((ObjectNode) questions(root).get(0).path("topicRefs").get(0)).remove("slug");
        assertEquals(DetailStatus.MALFORMED, parser.parse(attempt(root, "topic", 5, 2)).status());
    }

    private DashboardAttemptRecord validAttempt() {
        ObjectNode root = DashboardTestFixtures.validSnapshot("valid", 5);
        return attempt(root, "valid", 5, 2);
    }

    private DashboardAttemptRecord attempt(ObjectNode root, String sessionId, double score, int totalQuestions) {
        return DashboardTestFixtures.attempt(
                sessionId, "TIMED_ORIGINAL", Instant.parse("2026-07-20T00:00:00Z"), score,
                100, totalQuestions, 2, "BACKEND", "SERVER", "SERVER_ON_TIME", root
        );
    }

    private ObjectNode singleQuestionSnapshot(String sessionId, double score) {
        ObjectNode root = DashboardTestFixtures.validSnapshot(sessionId, score);
        questions(root).removeAll();
        ((ObjectNode) root.path("summary")).put("totalQuestions", 1);
        return root;
    }

    private ArrayNode questions(ObjectNode root) {
        return (ArrayNode) root.path("questions");
    }
}

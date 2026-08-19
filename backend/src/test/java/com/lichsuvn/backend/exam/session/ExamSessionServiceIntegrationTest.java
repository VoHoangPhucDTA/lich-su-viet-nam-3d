package com.lichsuvn.backend.exam.session;

import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.dataset.ExamDatasetBundleLoader;
import com.lichsuvn.backend.exam.dataset.ExamDatasetImportService;
import com.lichsuvn.backend.exam.dataset.ExamH2TestDatabase;
import com.lichsuvn.backend.exam.session.api.dto.CheckQuestionRequest;
import com.lichsuvn.backend.exam.session.api.dto.CreateExamSessionRequest;
import com.lichsuvn.backend.exam.session.api.dto.ExamSessionResponse;
import com.lichsuvn.backend.exam.session.api.dto.RecoverExamSubmissionRequest;
import com.lichsuvn.backend.exam.session.api.dto.SubmitExamSessionRequest;
import com.lichsuvn.backend.exam.session.application.ExamSessionService;
import com.lichsuvn.backend.exam.session.infrastructure.ExamSessionRepository;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExamSessionServiceIntegrationTest {
    private static final String CLIENT_A = "00000000-0000-4000-8000-000000000001";
    private static final String CLIENT_B = "00000000-0000-4000-8000-000000000002";
    private static final String CLIENT_C = "00000000-0000-4000-8000-000000000003";
    private static final String CLIENT_AUTH = "00000000-0000-4000-8000-000000000004";
    private JsonMapper mapper;
    private NamedParameterJdbcTemplate jdbc;
    private ExamSessionService service;

    @BeforeEach
    void setUp() throws Exception {
        JdbcDataSource dataSource = ExamH2TestDatabase.create();
        mapper = JsonMapper.builder().build();
        jdbc = new NamedParameterJdbcTemplate(dataSource);
        new ExamDatasetImportService(jdbc, mapper, new ExamDatasetBundleLoader(), new DataSourceTransactionManager(dataSource))
                .run(root(), root().resolve("data/exams"), root().resolve("frontend/public/data/exams"), false, "test");
        service = new ExamSessionService(new ExamSessionRepository(jdbc), mapper, new DataSourceTransactionManager(dataSource), 10);
    }

    @Test
    void anonymousPracticeUsesTokenReturnsSafeQuestionsAndCompletesWithoutAttempt() throws Exception {
        var created = service.create(new CreateExamSessionRequest("FREE_PRACTICE", cleanExamId(), null, null, null, null, null, null, null, null), null);
        assertNotNull(created.anonymousSessionToken());
        String payload = mapper.writeValueAsString(created.questions());
        assertFalse(payload.contains("correctOptionId"));
        assertFalse(payload.contains("isTrue"));
        assertFalse(payload.contains("explanation"));
        assertThrows(ApiException.class, () -> service.resume(created.sessionId(), null, null));
        assertThrows(ApiException.class, () -> service.resume(created.sessionId(), created.anonymousSessionToken() + "invalid", null));
        assertEquals(created.questions().size(), service.resume(created.sessionId(), created.anonymousSessionToken(), null).questions().size());

        var first = created.questions().get(0);
        JsonNode answer = correctAnswer(first.questionInstanceId());
        var checked = service.check(created.sessionId(), first.questionInstanceId(), new CheckQuestionRequest(first.question().path("questionType").asText(), answer), created.anonymousSessionToken(), null);
        assertTrue(checked.correct());
        assertEquals(checked.points(), service.check(created.sessionId(), first.questionInstanceId(), new CheckQuestionRequest(first.question().path("questionType").asText(), answer), created.anonymousSessionToken(), null).points());
        assertThrows(ApiException.class, () -> service.check(created.sessionId(), first.questionInstanceId(), new CheckQuestionRequest(first.question().path("questionType").asText(), differentAnswer(first.questionInstanceId())), created.anonymousSessionToken(), null));
        var summary = service.complete(created.sessionId(), created.anonymousSessionToken(), null);
        assertEquals(1, summary.checkedQuestions());
        assertEquals(created.questions().size() - 1, summary.untouchedQuestions());
        assertEquals(0, count("exam_v2_attempts"));
        assertThrows(ApiException.class, () -> service.check(created.sessionId(), created.questions().get(1).questionInstanceId(), new CheckQuestionRequest(created.questions().get(1).question().path("questionType").asText(), correctAnswer(created.questions().get(1).questionInstanceId())), created.anonymousSessionToken(), null));
    }

    @Test
    void practiceAutoCompletesAndRejectsPartialTrueFalseChecks() {
        var auto = service.create(new CreateExamSessionRequest("CUSTOM_PRACTICE", null, activeDatasetVersion(), 1, "mcq", "all", "all", "all", null, null), null);
        var only = auto.questions().getFirst();
        service.check(auto.sessionId(), only.questionInstanceId(), new CheckQuestionRequest("mcq", correctAnswer(only.questionInstanceId())), auto.anonymousSessionToken(), null);
        assertEquals("COMPLETED", service.resume(auto.sessionId(), auto.anonymousSessionToken(), null).status());
        assertEquals(1, service.complete(auto.sessionId(), auto.anonymousSessionToken(), null).checkedQuestions());

        var withTf = service.create(new CreateExamSessionRequest("FREE_PRACTICE", cleanExamId(), null, null, null, null, null, null, null, null), null);
        var tf = withTf.questions().stream().filter(question -> question.question().path("questionType").asText().equals("true_false")).findFirst().orElseThrow();
        var partial = mapper.createObjectNode(); partial.put("a", true); partial.putNull("b"); partial.putNull("c"); partial.putNull("d");
        assertThrows(ApiException.class, () -> service.check(withTf.sessionId(), tf.questionInstanceId(), new CheckQuestionRequest("true_false", partial), withTf.anonymousSessionToken(), null));
    }

    @Test
    void timedAnonymousSubmitAllowsBlankAndPartialThenIsIdempotent() {
        var created = service.create(new CreateExamSessionRequest("TIMED_ORIGINAL", cleanExamId(), null, null, null, null, null, null, null, null), null);
        assertNoPreSubmitAnswerKeys(mapper.writeValueAsString(created));
        assertNoPreSubmitAnswerKeys(mapper.writeValueAsString(service.resume(created.sessionId(), created.anonymousSessionToken(), null)));
        List<SubmitExamSessionRequest.AnswerItem> answers = answersFor(created, true);
        var first = service.submit(created.sessionId(), new SubmitExamSessionRequest(CLIENT_A, answers), created.anonymousSessionToken(), null);
        assertEquals("SUCCESS", first.receiptStatus());
        assertEquals(2, first.result().path("snapshotSchemaVersion").asInt());
        assertTrue(mapper.writeValueAsString(first.result()).contains("\"completionState\":\"BLANK\""));
        assertTrue(mapper.writeValueAsString(first.result()).contains("\"completionState\":\"PARTIAL\""));
        assertEquals(0, count("exam_v2_attempts"));
        assertNotNull(jdbc.getJdbcTemplate().queryForObject("SELECT result_json FROM exam_sessions WHERE public_session_id=?", String.class, created.sessionId()));
        var replay = service.submit(created.sessionId(), new SubmitExamSessionRequest(CLIENT_B, answers), created.anonymousSessionToken(), null);
        assertEquals("SUCCESS", replay.receiptStatus());
        assertEquals(1, count("exam_submission_receipts"));
        List<SubmitExamSessionRequest.AnswerItem> changed = answersFor(created, false);
        assertThrows(ApiException.class, () -> service.submit(created.sessionId(), new SubmitExamSessionRequest(CLIENT_C, changed), created.anonymousSessionToken(), null));
    }

    @Test
    void authenticatedTimedSubmitWritesAttemptAndSuccessSlotAllowsOnlyOneSuccess() {
        byte[] userId = UuidBytes.fromUuid(UUID.randomUUID());
        jdbc.getJdbcTemplate().update("INSERT INTO users (id) VALUES (?)", userId);
        UserPrincipal principal = new UserPrincipal(UUID.randomUUID().toString(), userId, "user@example.test", List.of("USER"));
        var created = service.create(new CreateExamSessionRequest("TIMED_ORIGINAL", cleanExamId(), null, null, null, null, null, null, null, null), principal);
        service.submit(created.sessionId(), new SubmitExamSessionRequest(CLIENT_AUTH, answersFor(created, false)), null, principal);
        assertEquals(1, count("exam_v2_attempts"));
        assertNull(jdbc.getJdbcTemplate().queryForObject("SELECT result_json FROM exam_sessions WHERE public_session_id=?", String.class, created.sessionId()));
        assertEquals("BACKEND", jdbc.getJdbcTemplate().queryForObject("SELECT score_authority FROM exam_v2_attempts", String.class));
        byte[] sessionId = jdbc.getJdbcTemplate().queryForObject("SELECT id FROM exam_sessions WHERE public_session_id=?", (rs, row) -> rs.getBytes(1), created.sessionId());
        jdbc.getJdbcTemplate().update("INSERT INTO exam_submission_receipts (id,session_id,client_submission_id,submission_hash,status) VALUES (?,?,?,?, 'FAILED_RETRYABLE')", UuidBytes.fromUuid(UUID.randomUUID()), sessionId, "null-slot-a", "a".repeat(64));
        jdbc.getJdbcTemplate().update("INSERT INTO exam_submission_receipts (id,session_id,client_submission_id,submission_hash,status) VALUES (?,?,?,?, 'FAILED_RETRYABLE')", UuidBytes.fromUuid(UUID.randomUUID()), sessionId, "null-slot-b", "b".repeat(64));
        assertThrows(Exception.class, () -> jdbc.getJdbcTemplate().update("INSERT INTO exam_submission_receipts (id,session_id,client_submission_id,submission_hash,status,success_slot) VALUES (?,?,?,?, 'SUCCESS', 1)", UuidBytes.fromUuid(UUID.randomUUID()), sessionId, "second-success", "c".repeat(64)));
    }

    @Test
    void authenticatedLateRecoveryRescoresPinnedSessionAndKeepsUnverifiedTimingAuthority() {
        byte[] userId = UuidBytes.fromUuid(UUID.randomUUID());
        jdbc.getJdbcTemplate().update("INSERT INTO users (id) VALUES (?)", userId);
        UserPrincipal principal = new UserPrincipal(UUID.randomUUID().toString(), userId, "recover@example.test", List.of("USER"));
        var created = service.create(new CreateExamSessionRequest("TIMED_ORIGINAL", cleanExamId(), null, null, null, null, null, null, null, null), principal);
        jdbc.getJdbcTemplate().update("UPDATE exam_sessions SET deadline_at=DATEADD('SECOND', -20, CURRENT_TIMESTAMP(6)) WHERE public_session_id=?", created.sessionId());
        List<SubmitExamSessionRequest.AnswerItem> answers = answersFor(created, false);
        var refs = created.questions().stream().map(question -> new RecoverExamSubmissionRequest.QuestionRef(question.questionInstanceId(), question.publicQuestionId())).toList();
        var recovered = service.recover(new RecoverExamSubmissionRequest("00000000-0000-4000-8000-000000000009", created.sessionId(), null, "TIMED_ORIGINAL", activeDatasetVersion(), cleanExamId(), created.examContentHash(), "client-hash", new RecoverExamSubmissionRequest.ClientTiming(System.currentTimeMillis() - 1_000, System.currentTimeMillis()), refs, answers), principal);
        assertEquals("BACKEND", recovered.scoreAuthority());
        assertEquals("CLIENT_UNVERIFIED", recovered.timingAuthority());
        assertEquals("SERVER_ISSUED_LATE", recovered.submissionOrigin());
        assertEquals("CLIENT_UNVERIFIED", jdbc.getJdbcTemplate().queryForObject("SELECT timing_authority FROM exam_v2_attempts", String.class));
        assertEquals(1, count("exam_submission_receipts"));
    }

    @Test
    void authenticatedStaticRecoveryUsesPinnedH1AndIsIdempotent() {
        byte[] userId = UuidBytes.fromUuid(UUID.randomUUID());
        jdbc.getJdbcTemplate().update("INSERT INTO users (id) VALUES (?)", userId);
        UserPrincipal principal = new UserPrincipal(UUID.randomUUID().toString(), userId, "static@example.test", List.of("USER"));
        var issued = service.create(new CreateExamSessionRequest("TIMED_ORIGINAL", cleanExamId(), null, null, null, null, null, null, null, null), null);
        var refs = issued.questions().stream().map(question -> new RecoverExamSubmissionRequest.QuestionRef(question.questionInstanceId(), question.publicQuestionId())).toList();
        var request = new RecoverExamSubmissionRequest("00000000-0000-4000-8000-000000000010", null, "local-static-1", "TIMED_ORIGINAL",
                activeDatasetVersion(), cleanExamId(), issued.examContentHash(), "client-hash", new RecoverExamSubmissionRequest.ClientTiming(1L, 2L), refs, answersFor(issued, false));

        var recovered = service.recover(request, principal);
        assertEquals("BACKEND", recovered.scoreAuthority());
        assertEquals("CLIENT_UNVERIFIED", recovered.timingAuthority());
        assertEquals("CLIENT_FALLBACK", recovered.submissionOrigin());
        assertEquals(1, count("exam_v2_attempts"));
        assertEquals(recovered.sessionId(), service.recover(request, principal).sessionId());
        assertEquals(1, count("exam_v2_attempts"));
    }

    @Test
    void recoveryRejectsMissingHistoricalDatasetAndWrongOwner() {
        byte[] ownerId = UuidBytes.fromUuid(UUID.randomUUID());
        byte[] strangerId = UuidBytes.fromUuid(UUID.randomUUID());
        jdbc.getJdbcTemplate().update("INSERT INTO users (id) VALUES (?), (?)", ownerId, strangerId);
        UserPrincipal owner = new UserPrincipal(UUID.randomUUID().toString(), ownerId, "owner@example.test", List.of("USER"));
        UserPrincipal stranger = new UserPrincipal(UUID.randomUUID().toString(), strangerId, "stranger@example.test", List.of("USER"));
        var created = service.create(new CreateExamSessionRequest("TIMED_ORIGINAL", cleanExamId(), null, null, null, null, null, null, null, null), owner);
        var refs = created.questions().stream().map(question -> new RecoverExamSubmissionRequest.QuestionRef(question.questionInstanceId(), question.publicQuestionId())).toList();
        var serverRequest = new RecoverExamSubmissionRequest("00000000-0000-4000-8000-000000000011", created.sessionId(), null, "TIMED_ORIGINAL",
                activeDatasetVersion(), cleanExamId(), created.examContentHash(), "client-hash", new RecoverExamSubmissionRequest.ClientTiming(1L, 2L), refs, answersFor(created, false));
        assertThrows(ApiException.class, () -> service.recover(serverRequest, stranger));
        var missingH1 = new RecoverExamSubmissionRequest("00000000-0000-4000-8000-000000000012", null, "local-missing", "TIMED_ORIGINAL",
                "not-a-retained-dataset", cleanExamId(), created.examContentHash(), "client-hash", new RecoverExamSubmissionRequest.ClientTiming(1L, 2L), refs, answersFor(created, false));
        assertThrows(ApiException.class, () -> service.recover(missingH1, owner));
        assertEquals(0, count("exam_v2_attempts"));
    }

    @Test
    void customMockAllCorrectMatchesFrontendTenPointNormalizationAndMalformedReceiptPersists() {
        var custom = service.create(new CreateExamSessionRequest("CUSTOM_MOCK", null, activeDatasetVersion(), 10, "all", "all", "all", "all", null, null), null);
        var result = service.submit(custom.sessionId(), new SubmitExamSessionRequest("00000000-0000-4000-8000-000000000005", answersFor(custom, false)), custom.anonymousSessionToken(), null);
        assertEquals(10d, result.result().path("summary").path("totalScore").asDouble());

        var malformed = service.create(new CreateExamSessionRequest("TIMED_ORIGINAL", cleanExamId(), null, null, null, null, null, null, null, null), null);
        var one = answersFor(malformed, false).subList(0, 1);
        assertThrows(ApiException.class, () -> service.submit(malformed.sessionId(), new SubmitExamSessionRequest("00000000-0000-4000-8000-000000000006", one), malformed.anonymousSessionToken(), null));
        assertEquals("FAILED_PERMANENT", jdbc.getJdbcTemplate().queryForObject("SELECT status FROM exam_submission_receipts WHERE client_submission_id=?", String.class, "00000000-0000-4000-8000-000000000006"));
    }

    @Test
    void submitRejectsDuplicateAndUnknownInstancesBeforeScoring() {
        var duplicateSession = service.create(new CreateExamSessionRequest("TIMED_ORIGINAL", cleanExamId(), null, null, null, null, null, null, null, null), null);
        var duplicate = new ArrayList<>(answersFor(duplicateSession, false));
        duplicate.add(duplicate.getFirst());
        assertThrows(ApiException.class, () -> service.submit(duplicateSession.sessionId(), new SubmitExamSessionRequest("00000000-0000-4000-8000-000000000007", duplicate), duplicateSession.anonymousSessionToken(), null));

        var unknownSession = service.create(new CreateExamSessionRequest("TIMED_ORIGINAL", cleanExamId(), null, null, null, null, null, null, null, null), null);
        var unknown = new ArrayList<>(answersFor(unknownSession, false));
        unknown.set(0, new SubmitExamSessionRequest.AnswerItem("qi_not_issued", "mcq", mapper.getNodeFactory().textNode("A")));
        assertThrows(ApiException.class, () -> service.submit(unknownSession.sessionId(), new SubmitExamSessionRequest("00000000-0000-4000-8000-000000000008", unknown), unknownSession.anonymousSessionToken(), null));
    }

    @Test
    void concurrentDifferentClientIdsProduceOneSuccessfulReceiptAndOneResult() throws Exception {
        var created = service.create(new CreateExamSessionRequest("TIMED_ORIGINAL", cleanExamId(), null, null, null, null, null, null, null, null), null);
        var answers = answersFor(created, false);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = executor.submit(() -> submitAfterBarrier(start, ready, created, CLIENT_A, answers));
            Future<?> second = executor.submit(() -> submitAfterBarrier(start, ready, created, CLIENT_B, answers));
            ready.await(); start.countDown(); first.get(); second.get();
        } finally {
            executor.shutdownNow();
        }
        assertEquals(1, jdbc.getJdbcTemplate().queryForObject("SELECT COUNT(*) FROM exam_submission_receipts WHERE status='SUCCESS'", Integer.class));
        assertEquals(1, jdbc.getJdbcTemplate().queryForObject("SELECT COUNT(*) FROM exam_submission_receipts WHERE success_slot=1", Integer.class));
        assertEquals(0, count("exam_v2_attempts"));
    }

    private void submitAfterBarrier(CountDownLatch start, CountDownLatch ready, ExamSessionResponse created, String clientId, List<SubmitExamSessionRequest.AnswerItem> answers) {
        try {
            ready.countDown(); start.await();
            service.submit(created.sessionId(), new SubmitExamSessionRequest(clientId, answers), created.anonymousSessionToken(), null);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private List<SubmitExamSessionRequest.AnswerItem> answersFor(ExamSessionResponse response, boolean includeBlankAndPartial) {
        List<SubmitExamSessionRequest.AnswerItem> result = new ArrayList<>();
        boolean blanked = false, partial = false;
        for (var question : response.questions()) {
            String type = question.question().path("questionType").asText();
            JsonNode selected = correctAnswer(question.questionInstanceId());
            if (includeBlankAndPartial && type.equals("mcq") && !blanked) { selected = mapper.nullNode(); blanked = true; }
            if (includeBlankAndPartial && type.equals("true_false") && !partial) {
                var item = mapper.createObjectNode(); item.put("a", true); item.putNull("b"); item.put("c", false); item.putNull("d"); selected = item; partial = true;
            }
            result.add(new SubmitExamSessionRequest.AnswerItem(question.questionInstanceId(), type, selected));
        }
        return result;
    }

    private JsonNode correctAnswer(String instance) {
        String raw = jdbc.getJdbcTemplate().queryForObject("SELECT answer_key_snapshot_json FROM exam_session_questions WHERE public_question_instance_id=?", String.class, instance);
        JsonNode key = read(raw);
        return key.path("questionType").asText().equals("mcq") ? mapper.getNodeFactory().textNode(key.path("correctOptionId").asText()) : key.path("correctStatements");
    }

    private JsonNode differentAnswer(String instance) {
        JsonNode answer = correctAnswer(instance);
        if (answer.isTextual()) return mapper.getNodeFactory().textNode(answer.asText().equals("A") ? "B" : "A");
        var changed = ((tools.jackson.databind.node.ObjectNode) answer.deepCopy()); changed.put("a", !answer.path("a").asBoolean()); return changed;
    }

    private void assertNoPreSubmitAnswerKeys(String payload) {
        for (String forbidden : List.of("correctOptionId", "isTrue", "correctAnswer", "answerKey", "scoringKey")) {
            assertFalse(payload.contains(forbidden), "pre-submit payload exposed " + forbidden);
        }
    }

    private JsonNode read(String raw) { try { return mapper.readTree(raw); } catch (Exception ex) { throw new IllegalStateException(ex); } }
    private int count(String table) { return jdbc.getJdbcTemplate().queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }
    private String cleanExamId() { return jdbc.getJdbcTemplate().queryForObject("SELECT exam_id FROM exam_definitions WHERE verification_status='VERIFIED' LIMIT 1", String.class); }
    private String activeDatasetVersion() { return jdbc.getJdbcTemplate().queryForObject("SELECT aggregate_hash FROM exam_datasets WHERE status='ACTIVE'", String.class); }
    private Path root() { return Path.of("..").toAbsolutePath().normalize(); }
}

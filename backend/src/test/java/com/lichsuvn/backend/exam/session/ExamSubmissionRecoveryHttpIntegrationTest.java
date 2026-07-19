package com.lichsuvn.backend.exam.session;

import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.exam.dataset.ExamDatasetImportService;
import com.lichsuvn.backend.exam.dataset.ExamH2TestDatabase;
import com.lichsuvn.backend.exam.session.api.dto.CreateExamSessionRequest;
import com.lichsuvn.backend.exam.session.api.dto.ExamSessionResponse;
import com.lichsuvn.backend.exam.session.api.dto.RecoverExamSubmissionRequest;
import com.lichsuvn.backend.exam.session.api.dto.SubmitExamSessionRequest;
import com.lichsuvn.backend.exam.session.application.ExamSessionService;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import javax.sql.DataSource;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:recovery-http;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.hikari.connection-init-sql=",
        "spring.flyway.enabled=false",
        "spring.jpa.hibernate.ddl-auto=none",
        "app.jwt.secret=test-only-secret-that-is-long-enough-for-hmac-signing"
})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ExamSubmissionRecoveryHttpIntegrationTest {
    private static final String RECOVER_PATH = "/api/exam-submissions/recover";

    @Autowired private WebApplicationContext context;
    @Autowired private DataSource dataSource;
    @Autowired private ExamDatasetImportService importer;
    @Autowired private ExamSessionService service;
    @Autowired private ObjectMapper mapper;

    private MockMvc mockMvc;
    private JdbcTemplate jdbc;

    @BeforeAll
    void setUpDatabase() throws Exception {
        ExamH2TestDatabase.applyGoal2Schema(dataSource);
        Path root = Path.of("..").toAbsolutePath().normalize();
        importer.run(root, root.resolve("data/exams"), root.resolve("frontend/public/data/exams"), false, "test");
        jdbc = new JdbcTemplate(dataSource);
        mockMvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @Test
    void recoveryRequiresAuthenticationAndValidRequestSerialization() throws Exception {
        mockMvc.perform(post(RECOVER_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());

        UserPrincipal owner = createUser("validation");
        mockMvc.perform(post(RECOVER_PATH)
                        .with(auth(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }


    @Test
    void serverIssuedRecoveryRejectsOwnerVersionContentAndQuestionDescriptorMismatches() throws Exception {
        UserPrincipal owner = createUser("owner");
        UserPrincipal stranger = createUser("stranger");
        ExamSessionResponse session = createTimed(owner, "TIMED_ORIGINAL");
        RecoverExamSubmissionRequest valid = recoveryRequest(session, "00000000-0000-4000-8000-000000000101");

        expectError(valid, stranger, 403, "RECOVERY_OWNER_REQUIRED");
        expectError(copy(valid, valid.questionRefs(), valid.answers(), "missing-dataset", valid.examContentHash()), owner, 409, "VERSION_MISMATCH");
        expectError(copy(valid, valid.questionRefs(), valid.answers(), valid.datasetVersion(), "f".repeat(64)), owner, 409, "VERSION_MISMATCH");
        RecoverExamSubmissionRequest wrongExam = new RecoverExamSubmissionRequest(valid.clientSubmissionId(), valid.serverSessionId(), null,
                valid.mode(), valid.datasetVersion(), "wrong-exam", valid.examContentHash(), valid.localSubmissionHash(), valid.clientTiming(), valid.questionRefs(), valid.answers());
        expectError(wrongExam, owner, 409, "VERSION_MISMATCH");

        List<RecoverExamSubmissionRequest.QuestionRef> wrongPublicId = new ArrayList<>(valid.questionRefs());
        var first = wrongPublicId.getFirst();
        wrongPublicId.set(0, new RecoverExamSubmissionRequest.QuestionRef(first.questionInstanceId(), "wrong-public-id"));
        expectError(copy(valid, wrongPublicId, valid.answers(), valid.datasetVersion(), valid.examContentHash()), owner, 400, "INVALID_SUBMISSION");

        List<RecoverExamSubmissionRequest.QuestionRef> wrongOrder = new ArrayList<>(valid.questionRefs());
        var temporary = wrongOrder.get(0);
        wrongOrder.set(0, wrongOrder.get(1));
        wrongOrder.set(1, temporary);
        expectError(copy(valid, wrongOrder, valid.answers(), valid.datasetVersion(), valid.examContentHash()), owner, 400, "INVALID_SUBMISSION");

        List<RecoverExamSubmissionRequest.QuestionRef> duplicate = new ArrayList<>(valid.questionRefs());
        duplicate.set(1, duplicate.getFirst());
        expectError(copy(valid, duplicate, valid.answers(), valid.datasetVersion(), valid.examContentHash()), owner, 400, "INVALID_SUBMISSION");

        List<RecoverExamSubmissionRequest.QuestionRef> missing = new ArrayList<>(valid.questionRefs());
        missing.removeLast();
        expectError(copy(valid, missing, valid.answers(), valid.datasetVersion(), valid.examContentHash()), owner, 400, "INVALID_SUBMISSION");

        List<RecoverExamSubmissionRequest.QuestionRef> extra = new ArrayList<>(valid.questionRefs());
        extra.add(new RecoverExamSubmissionRequest.QuestionRef("qi_extra", "question-extra"));
        expectError(copy(valid, extra, valid.answers(), valid.datasetVersion(), valid.examContentHash()), owner, 400, "INVALID_SUBMISSION");
    }

    @Test
    void recoveryIgnoresClientScoreAndEnforcesIdempotentSingleAttempt() throws Exception {
        UserPrincipal owner = createUser("idempotent");
        ExamSessionResponse session = createTimed(owner, "TIMED_ORIGINAL");
        RecoverExamSubmissionRequest request = recoveryRequest(session, "00000000-0000-4000-8000-000000000102");
        ObjectNode payload = mapper.valueToTree(request);
        payload.put("score", 10);
        payload.put("correctness", true);

        mockMvc.perform(post(RECOVER_PATH).with(auth(owner)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.scoreAuthority").value("BACKEND"))
                .andExpect(jsonPath("$.data.timingAuthority").value("CLIENT_UNVERIFIED"))
                .andExpect(jsonPath("$.data.submissionOrigin").value("SERVER_ISSUED_LATE"));

        mockMvc.perform(post(RECOVER_PATH).with(auth(owner)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.receiptStatus").value("SUCCESS"));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM exam_v2_attempts WHERE session_id=?", Integer.class, session.sessionId()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM exam_submission_receipts r JOIN exam_sessions s ON s.id=r.session_id WHERE s.public_session_id=? AND r.status='SUCCESS'", Integer.class, session.sessionId()));

        List<SubmitExamSessionRequest.AnswerItem> changed = new ArrayList<>(request.answers());
        var answer = changed.getFirst();
        changed.set(0, new SubmitExamSessionRequest.AnswerItem(answer.questionInstanceId(), answer.questionType(), different(answer.selected())));
        expectError(copy(request, request.questionRefs(), changed, request.datasetVersion(), request.examContentHash()), owner, 409, "SESSION_ALREADY_SUBMITTED");
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM exam_v2_attempts WHERE session_id=?", Integer.class, session.sessionId()));
    }

    @Test
    void staticRecoveryUsesRetainedDatasetAndStaticCustomMockRemainsLocalOnly() throws Exception {
        UserPrincipal owner = createUser("static");
        ExamSessionResponse serverCustom = createTimed(owner, "CUSTOM_MOCK");
        RecoverExamSubmissionRequest serverCustomRequest = recoveryRequest(serverCustom, "00000000-0000-4000-8000-000000000105");
        mockMvc.perform(post(RECOVER_PATH).with(auth(owner)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(serverCustomRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.scoreAuthority").value("BACKEND"))
                .andExpect(jsonPath("$.data.timingAuthority").value("CLIENT_UNVERIFIED"))
                .andExpect(jsonPath("$.data.submissionOrigin").value("SERVER_ISSUED_LATE"));

        ExamSessionResponse original = createTimed(null, "TIMED_ORIGINAL");
        RecoverExamSubmissionRequest staticRequest = new RecoverExamSubmissionRequest(
                "00000000-0000-4000-8000-000000000103", null, "local-original-h1", "TIMED_ORIGINAL",
                original.datasetVersion(), cleanExamId(), original.examContentHash(), "client-hint",
                new RecoverExamSubmissionRequest.ClientTiming(1L, 2L), refs(original), answers(original));

        byte[] h1 = jdbc.queryForObject("SELECT active_dataset_id FROM exam_runtime_state WHERE state_id=1", (rs, row) -> rs.getBytes(1));
        byte[] h2 = UuidBytes.fromUuid(UUID.randomUUID());
        try {
            jdbc.update("INSERT INTO exam_datasets (id,aggregate_hash,build_id,status,hash_schema_version,build_algorithm_version,source_count,build_metadata_json) VALUES (?,?,?,'ACTIVE',1,1,0,'{}')",
                    h2, "2".repeat(64), "http-test-h2");
            jdbc.update("UPDATE exam_runtime_state SET active_dataset_id=? WHERE state_id=1", h2);
            mockMvc.perform(post(RECOVER_PATH).with(auth(owner)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(staticRequest)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.scoreAuthority").value("BACKEND"))
                    .andExpect(jsonPath("$.data.timingAuthority").value("CLIENT_UNVERIFIED"))
                    .andExpect(jsonPath("$.data.submissionOrigin").value("CLIENT_FALLBACK"));
        } finally {
            jdbc.update("UPDATE exam_runtime_state SET active_dataset_id=? WHERE state_id=1", h1);
        }

        ExamSessionResponse custom = createTimed(null, "CUSTOM_MOCK");
        RecoverExamSubmissionRequest unsupported = new RecoverExamSubmissionRequest(
                "00000000-0000-4000-8000-000000000104", null, "local-custom-without-descriptor", "CUSTOM_MOCK",
                custom.datasetVersion(), null, custom.examContentHash(), "client-hint",
                new RecoverExamSubmissionRequest.ClientTiming(1L, 2L), refs(custom), answers(custom));
        expectError(unsupported, owner, 409, "RECOVERY_DESCRIPTOR_UNAVAILABLE");
    }

    private ExamSessionResponse createTimed(UserPrincipal principal, String mode) {
        return service.create(new CreateExamSessionRequest(mode, mode.equals("TIMED_ORIGINAL") ? cleanExamId() : null,
                mode.equals("CUSTOM_MOCK") ? activeDatasetVersion() : null, mode.equals("CUSTOM_MOCK") ? 10 : null,
                "all", "all", "all", "all", null, null), principal);
    }

    private RecoverExamSubmissionRequest recoveryRequest(ExamSessionResponse session, String clientId) {
        return new RecoverExamSubmissionRequest(clientId, session.sessionId(), null, session.mode(), session.datasetVersion(),
                session.mode().equals("TIMED_ORIGINAL") ? cleanExamId() : null, session.examContentHash(), "client-hint", new RecoverExamSubmissionRequest.ClientTiming(1L, 2L),
                refs(session), answers(session));
    }

    private RecoverExamSubmissionRequest copy(RecoverExamSubmissionRequest source,
                                               List<RecoverExamSubmissionRequest.QuestionRef> refs,
                                               List<SubmitExamSessionRequest.AnswerItem> answers,
                                               String datasetVersion,
                                               String examContentHash) {
        return new RecoverExamSubmissionRequest(source.clientSubmissionId(), source.serverSessionId(), source.localSessionId(),
                source.mode(), datasetVersion, source.examId(), examContentHash, source.localSubmissionHash(), source.clientTiming(), refs, answers);
    }

    private List<RecoverExamSubmissionRequest.QuestionRef> refs(ExamSessionResponse session) {
        return session.questions().stream()
                .map(question -> new RecoverExamSubmissionRequest.QuestionRef(question.questionInstanceId(), question.publicQuestionId()))
                .toList();
    }

    private List<SubmitExamSessionRequest.AnswerItem> answers(ExamSessionResponse session) {
        List<SubmitExamSessionRequest.AnswerItem> answers = new ArrayList<>();
        for (var question : session.questions()) {
            String raw = jdbc.queryForObject("SELECT answer_key_snapshot_json FROM exam_session_questions WHERE public_question_instance_id=?", String.class, question.questionInstanceId());
            JsonNode key;
            try {
                key = mapper.readTree(raw);
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
            JsonNode selected = key.path("questionType").asText().equals("mcq")
                    ? mapper.getNodeFactory().textNode(key.path("correctOptionId").asText())
                    : key.path("correctStatements");
            answers.add(new SubmitExamSessionRequest.AnswerItem(question.questionInstanceId(), key.path("questionType").asText(), selected));
        }
        return answers;
    }

    private JsonNode different(JsonNode selected) {
        if (selected.isTextual()) return mapper.getNodeFactory().textNode(selected.asText().equals("A") ? "B" : "A");
        ObjectNode changed = (ObjectNode) selected.deepCopy();
        changed.put("a", !selected.path("a").asBoolean());
        return changed;
    }

    private void expectError(RecoverExamSubmissionRequest request, UserPrincipal principal, int statusCode, String code) throws Exception {
        mockMvc.perform(post(RECOVER_PATH).with(auth(principal)).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(request)))
                .andExpect(status().is(statusCode))
                .andExpect(jsonPath("$.code").value(code));
    }

    private UserPrincipal createUser(String prefix) {
        UUID id = UUID.randomUUID();
        byte[] bytes = UuidBytes.fromUuid(id);
        jdbc.update("INSERT INTO users (id) VALUES (?)", bytes);
        return new UserPrincipal(id.toString(), bytes, prefix + "@example.test", List.of("USER"));
    }

    private RequestPostProcessor auth(UserPrincipal principal) {
        return authentication(new UsernamePasswordAuthenticationToken(principal, null, List.of(new SimpleGrantedAuthority("ROLE_USER"))));
    }

    private String cleanExamId() {
        return jdbc.queryForObject("SELECT exam_id FROM exam_definitions d JOIN exam_runtime_state r ON r.active_dataset_id=d.dataset_id WHERE r.state_id=1 AND d.verification_status='VERIFIED' LIMIT 1", String.class);
    }

    private String activeDatasetVersion() {
        return jdbc.queryForObject("SELECT d.aggregate_hash FROM exam_datasets d JOIN exam_runtime_state r ON r.active_dataset_id=d.id WHERE r.state_id=1", String.class);
    }
}

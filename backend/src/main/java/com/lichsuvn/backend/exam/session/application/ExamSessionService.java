package com.lichsuvn.backend.exam.session.application;

import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.NotFoundException;
import com.lichsuvn.backend.exam.dataset.ExamDatasetHashing;
import com.lichsuvn.backend.exam.session.api.dto.CheckQuestionRequest;
import com.lichsuvn.backend.exam.session.api.dto.CreateExamSessionRequest;
import com.lichsuvn.backend.exam.session.api.dto.ExamSessionResponse;
import com.lichsuvn.backend.exam.session.api.dto.ExamSessionSubmitResponse;
import com.lichsuvn.backend.exam.session.api.dto.RecoverExamSubmissionRequest;
import com.lichsuvn.backend.exam.session.api.dto.SubmitExamSessionRequest;
import com.lichsuvn.backend.exam.session.infrastructure.ExamSessionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class ExamSessionService {
    private static final Set<String> MODES = Set.of("TIMED_ORIGINAL", "CUSTOM_MOCK", "FREE_PRACTICE", "TOPIC_PRACTICE", "RETRY_WRONG", "CUSTOM_PRACTICE");
    private static final Set<String> PRACTICE = Set.of("FREE_PRACTICE", "TOPIC_PRACTICE", "RETRY_WRONG", "CUSTOM_PRACTICE");
    private static final Set<String> TIMED = Set.of("TIMED_ORIGINAL", "CUSTOM_MOCK");
    private static final List<String> TF_KEYS = List.of("a", "b", "c", "d");
    private static final double[] TF_LADDER = {0d, .1d, .25d, .5d, 1d};
    private static final String SCORING_VERSION = "thpt_2025_v1";

    private final ExamSessionRepository repository;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transaction;
    private final TransactionTemplate requiresNew;
    private final SecureRandom secureRandom = new SecureRandom();
    private final int submitGraceSeconds;

    public ExamSessionService(ExamSessionRepository repository, ObjectMapper objectMapper, PlatformTransactionManager transactionManager,
                              @Value("${exam.session.submit-grace-seconds:10}") int submitGraceSeconds) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.transaction = new TransactionTemplate(transactionManager);
        this.requiresNew = new TransactionTemplate(transactionManager);
        this.requiresNew.setPropagationBehaviorName("PROPAGATION_REQUIRES_NEW");
        this.submitGraceSeconds = Math.max(0, submitGraceSeconds);
    }

    @Transactional
    public ExamSessionResponse create(CreateExamSessionRequest request, UserPrincipal principal) {
        String mode = normalizeMode(request.mode());
        var dataset = requireDataset();
        byte[] userId = principalId(principal);
        CreatePlan plan = buildPlan(request, mode, dataset, userId);
        if (plan.questions().isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "NO_MATCHING_QUESTIONS", "No public question matches this session request");
        }
        String publicId = "sess_" + UUID.randomUUID();
        String token = userId == null ? generateToken() : null;
        Instant started = Instant.now();
        Instant deadline = TIMED.contains(mode) ? started.plus(Duration.ofMinutes(plan.durationMinutes())) : null;
        byte[] sessionId = bytes();
        repository.insertSession(new ExamSessionRepository.SessionRow(sessionId, publicId, userId, token == null ? null : sha256(token), dataset.id(), dataset.version(), mode,
                plan.title(), plan.examId(), plan.contentHash(), write(plan.config()), SCORING_VERSION, started, deadline, submitGraceSeconds, "IN_PROGRESS", null, null, null));
        int position = 0;
        List<ExamSessionResponse.SessionQuestion> safeQuestions = new ArrayList<>();
        for (SeedQuestion seed : plan.questions()) {
            ExamSessionRepository.QuestionRow question = seed.question();
            String instance = "qi_" + UUID.randomUUID();
            Snapshot snapshot = question == null ? seed.snapshot() : snapshot(question, instance, mode);
            position++;
            String publicQuestionId = question == null ? seed.publicQuestionId() : question.publicId();
            String type = question == null ? snapshot.safe().path("questionType").asText() : question.sectionType();
            String sectionId = question == null ? null : question.sectionId();
            repository.insertSessionQuestion(new ExamSessionRepository.SessionQuestionRow(bytes(), sessionId, instance, question == null ? null : question.id(), publicQuestionId, position, sectionId, type, write(snapshot.safe()), write(snapshot.answerKey()), null, null, null));
            safeQuestions.add(new ExamSessionResponse.SessionQuestion(instance, publicQuestionId, position, snapshot.safe(), null));
        }
        return new ExamSessionResponse(publicId, token, mode, plan.title(), dataset.version(), plan.contentHash(), SCORING_VERSION,
                started.toEpochMilli(), deadline == null ? null : deadline.toEpochMilli(), "IN_PROGRESS", safeQuestions, null, null);
    }

    @Transactional(readOnly = true)
    public ExamSessionResponse resume(String sessionId, String token, UserPrincipal principal) {
        var session = requireSession(sessionId);
        authorize(session, token, principal);
        return response(session, false);
    }

    @Transactional
    public ExamSessionResponse.CheckedQuestionResult check(String sessionId, String instanceId, CheckQuestionRequest request, String token, UserPrincipal principal) {
        var session = lockAndAuthorize(sessionId, token, principal);
        requirePractice(session);
        requireStatus(session, "IN_PROGRESS");
        var question = repository.lockSessionQuestion(session.id(), requireText(instanceId, "INVALID_QUESTION_INSTANCE", "questionInstanceId is required"))
                .orElseThrow(() -> new NotFoundException("SESSION_QUESTION_NOT_FOUND", "Question instance is not part of this session"));
        JsonNode answer = normalizeAnswer(request.questionType(), request.selected(), question, true);
        String answerJson = canonicalAnswerText(answer);
        if (question.checkedResultJson() != null) {
            if (answerJson.equals(question.practiceAnswerJson())) return checkedResult(question.checkedResultJson());
            throw new ApiException(HttpStatus.CONFLICT, "QUESTION_ALREADY_CHECKED", "A checked question cannot be answered differently");
        }
        var checked = scoreQuestion(question, answer, session.mode());
        repository.saveCheckedQuestion(question.id(), answerJson, writeChecked(checked));
        var refreshed = repository.listSessionQuestions(session.id());
        if (refreshed.stream().allMatch(item -> item.checkedResultJson() != null)) repository.completeSession(session.id());
        return checked;
    }

    @Transactional
    public ExamSessionResponse.PracticeSummary complete(String sessionId, String token, UserPrincipal principal) {
        var session = lockAndAuthorize(sessionId, token, principal);
        requirePractice(session);
        if (session.status().equals("IN_PROGRESS")) repository.completeSession(session.id());
        if (!session.status().equals("IN_PROGRESS") && !session.status().equals("COMPLETED")) {
            throw new ApiException(HttpStatus.CONFLICT, "SESSION_NOT_COMPLETABLE", "This practice session cannot be completed in its current state");
        }
        return practiceSummary(repository.listSessionQuestions(session.id()));
    }

    public ExamSessionSubmitResponse submit(String sessionId, SubmitExamSessionRequest request, String token, UserPrincipal principal) {
        var preflight = requireSession(sessionId);
        authorize(preflight, token, principal);
        requireTimed(preflight);
        requireClientSubmissionId(request.clientSubmissionId());
        String hash = submissionHash(sessionId, request);
        var existingSuccess = repository.findSuccessReceipt(preflight.id());
        if (existingSuccess.isPresent()) {
            if (existingSuccess.get().submissionHash().equals(hash)) return storedSuccess(preflight, existingSuccess.get());
            throw new ApiException(HttpStatus.CONFLICT, "SESSION_ALREADY_SUBMITTED", "This session already has a successful submission");
        }
        var receipt = acquireReceipt(preflight, request.clientSubmissionId().trim(), hash, principalId(principal));
        if (receipt.status().equals("SUCCESS")) return storedSuccess(preflight, receipt);
        try {
            return transaction.execute(status -> scoreSubmission(sessionId, request, hash, token, principal, receipt));
        } catch (ApiException ex) {
            if (Set.of("INVALID_SUBMISSION", "SUBMISSION_AFTER_GRACE").contains(ex.getCode())) {
                requiresNew.executeWithoutResult(status -> repository.updateReceipt(receipt.id(), ex.getCode().equals("SUBMISSION_AFTER_GRACE") ? "FAILED_RETRYABLE" : "FAILED_PERMANENT", ex.getCode(), null, null));
            }
            throw ex;
        } catch (RuntimeException ex) {
            requiresNew.executeWithoutResult(status -> repository.updateReceipt(receipt.id(), "FAILED_RETRYABLE", "SCORING_TEMPORARILY_UNAVAILABLE", null, null));
            throw ex;
        }
    }

    /**
     * Recovers an authenticated submission without trusting browser-side scoring or timing.
     * A server-issued session is re-scored from its pinned snapshots. A static fallback is
     * accepted only when its H1 dataset/exam/refs can be reconstructed from the database.
     */
    public ExamSessionSubmitResponse recover(RecoverExamSubmissionRequest request, UserPrincipal principal) {
        byte[] userId = principalId(principal);
        if (userId == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Recovery requires an authenticated owner");
        requireClientSubmissionId(request.clientSubmissionId());
        String recoverySessionId = StringUtils.hasText(request.serverSessionId()) ? request.serverSessionId().trim() : null;
        boolean staticRecovery = recoverySessionId == null;
        if (recoverySessionId == null) {
            recoverySessionId = createStaticRecoverySession(request, userId);
        }
        final String pinnedRecoverySessionId = recoverySessionId;
        var preflight = requireSession(pinnedRecoverySessionId);
        requireTimed(preflight);
        if (!same(preflight.userId(), userId)) throw new ApiException(HttpStatus.FORBIDDEN, "RECOVERY_OWNER_REQUIRED", "Only the authenticated session owner may recover this submission");
        SubmitExamSessionRequest submitted;
        if (staticRecovery) {
            requireStaticRecoveryDescriptor(preflight, request);
            submitted = remapStaticRecoveryAnswers(request, preflight);
        } else {
            requireRecoveryDescriptor(preflight, request);
            submitted = new SubmitExamSessionRequest(request.clientSubmissionId(), request.answers());
        }
        String hash = submissionHash(pinnedRecoverySessionId, submitted);
        var success = repository.findSuccessReceipt(preflight.id());
        if (success.isPresent()) {
            if (success.get().submissionHash().equals(hash)) return storedSuccess(preflight, success.get());
            throw new ApiException(HttpStatus.CONFLICT, "SESSION_ALREADY_SUBMITTED", "This session already has a successful submission");
        }
        var receipt = acquireReceipt(preflight, request.clientSubmissionId().trim(), hash, userId);
        if (receipt.status().equals("SUCCESS")) return storedSuccess(preflight, receipt);
        String origin = staticRecovery ? "CLIENT_FALLBACK" : "SERVER_ISSUED_LATE";
        try {
            return transaction.execute(status -> scoreRecovery(pinnedRecoverySessionId, submitted, hash, userId, receipt, origin));
        } catch (ApiException ex) {
            requiresNew.executeWithoutResult(status -> repository.updateReceipt(receipt.id(),
                    ex.getCode().equals("VERSION_MISMATCH") ? "VERSION_MISMATCH" : "FAILED_PERMANENT", ex.getCode(), null, null));
            throw ex;
        } catch (RuntimeException ex) {
            requiresNew.executeWithoutResult(status -> repository.updateReceipt(receipt.id(), "FAILED_RETRYABLE", "SCORING_TEMPORARILY_UNAVAILABLE", null, null));
            throw ex;
        }
    }

    private ExamSessionSubmitResponse scoreRecovery(String sessionId, SubmitExamSessionRequest request, String hash, byte[] userId,
                                                     ExamSessionRepository.ReceiptRow receipt, String origin) {
        var session = repository.lockSession(sessionId).orElseThrow(() -> new NotFoundException("EXAM_SESSION_NOT_FOUND", "Exam session was not found"));
        requireTimed(session);
        if (!same(session.userId(), userId)) throw new ApiException(HttpStatus.FORBIDDEN, "RECOVERY_OWNER_REQUIRED", "Only the authenticated session owner may recover this submission");
        var success = repository.findSuccessReceipt(session.id());
        if (success.isPresent()) {
            if (success.get().submissionHash().equals(hash)) return storedSuccess(session, success.get());
            throw new ApiException(HttpStatus.CONFLICT, "SESSION_ALREADY_SUBMITTED", "This session already has a successful submission");
        }
        if (!session.status().equals("IN_PROGRESS")) throw new ApiException(HttpStatus.CONFLICT, "SESSION_NOT_RECOVERABLE", "This session is not accepting recovery");
        repository.updateReceipt(receipt.id(), "PROCESSING", null, null, null);
        List<ExamSessionRepository.SessionQuestionRow> questions = repository.listSessionQuestions(session.id());
        Map<String, JsonNode> answers = validateSubmission(request, questions);
        SnapshotResult result = scoreSession(session, questions, answers, "BACKEND", "CLIENT_UNVERIFIED", origin);
        String resultJson = write(result.snapshot());
        byte[] attemptId = bytes();
        repository.insertAttempt(new ExamSessionRepository.AttemptRow(attemptId, userId, session.publicId(), session.mode(), session.examId(), session.title(), session.mode().equals("CUSTOM_MOCK"),
                session.examId() == null ? "[]" : write(arrayOf(session.examId())), write(questionRefs(result.snapshot())), write(answersArray(answers)), session.configJson(), resultJson,
                "BACKEND", "CLIENT_UNVERIFIED", origin, session.scoringVersion(), session.datasetVersion(), session.contentHash(), result.totalQuestions(), result.totalScore(), result.mcqScore(), result.tfScore(), result.durationSeconds(), Instant.now()));
        repository.submitSession(session.id(), null);
        repository.updateReceipt(receipt.id(), "SUCCESS", null, attemptId, 1);
        return new ExamSessionSubmitResponse(session.publicId(), "SUCCESS", "BACKEND", "CLIENT_UNVERIFIED", origin, result.snapshot());
    }

    private String createStaticRecoverySession(RecoverExamSubmissionRequest request, byte[] userId) {
        String mode = normalizeMode(request.mode());
        if (!TIMED.contains(mode)) throw new ApiException(HttpStatus.BAD_REQUEST, "RECOVERY_MODE_UNSUPPORTED", "Only timed and custom mock submissions can be recovered");
        if (mode.equals("CUSTOM_MOCK")) {
            throw new ApiException(HttpStatus.CONFLICT, "RECOVERY_DESCRIPTOR_UNAVAILABLE",
                    "Static custom mock recovery requires a server-verifiable selection descriptor");
        }
        String localSessionId = requireText(request.localSessionId(), "INVALID_SUBMISSION", "localSessionId is required for static recovery");
        String datasetVersion = requireText(request.datasetVersion(), "VERSION_MISMATCH", "datasetVersion is required for local recovery");
        var dataset = repository.findDatasetByVersion(datasetVersion)
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "VERSION_MISMATCH", "The local dataset version is no longer available"));
        List<RecoverExamSubmissionRequest.QuestionRef> refs = request.questionRefs();
        Set<String> instances = new HashSet<>();
        Set<String> publicIds = new HashSet<>();
        for (var ref : refs) {
            if (ref == null || !StringUtils.hasText(ref.questionInstanceId()) || !StringUtils.hasText(ref.publicQuestionId())
                    || !instances.add(ref.questionInstanceId()) || !publicIds.add(ref.publicQuestionId())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SUBMISSION", "Recovery question references are invalid");
            }
        }
        List<String> orderedPublicIds = refs.stream().map(RecoverExamSubmissionRequest.QuestionRef::publicQuestionId).toList();
        List<ExamSessionRepository.QuestionRow> questions = repository.questionsForPublicIds(dataset.id(), orderedPublicIds);
        if (questions.size() != refs.size()) throw new ApiException(HttpStatus.CONFLICT, "VERSION_MISMATCH", "A recovered question is missing from the pinned dataset");
        String examId = StringUtils.hasText(request.examId()) ? request.examId().trim() : null;
        String title = mode.equals("CUSTOM_MOCK") ? "Đề thi thử tùy chọn đã khôi phục" : "Đề thi đã khôi phục";
        String contentHash = null;
        int durationMinutes = 0;
        if (examId != null) {
            var exam = repository.findPublicExam(dataset.id(), examId)
                    .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "VERSION_MISMATCH", "The recovered exam is not available in its pinned dataset"));
            if (!StringUtils.hasText(request.examContentHash()) || !exam.contentHash().equals(request.examContentHash().trim())) {
                throw new ApiException(HttpStatus.CONFLICT, "VERSION_MISMATCH", "The recovered exam content does not match the pinned version");
            }
            List<String> expectedPublicIds = repository.questionsForExam(dataset.id(), exam.id()).stream()
                    .map(ExamSessionRepository.QuestionRow::publicId).toList();
            if (!orderedPublicIds.equals(expectedPublicIds)) {
                throw new ApiException(HttpStatus.CONFLICT, "VERSION_MISMATCH", "The recovered questions do not match the pinned exam version");
            }
            title = exam.title(); contentHash = exam.contentHash(); durationMinutes = exam.durationMinutes();
        }
        String publicId = "recover_" + sha256(Base64.getUrlEncoder().withoutPadding().encodeToString(userId) + ":" + localSessionId).substring(0, 32);
        if (repository.findSession(publicId).isPresent()) return publicId;
        byte[] sessionId = bytes();
        Instant now = Instant.now();
        try {
            repository.insertSession(new ExamSessionRepository.SessionRow(sessionId, publicId, userId, null, dataset.id(), dataset.version(), mode, title, examId, contentHash,
                    write(objectMapper.createObjectNode().put("recovery", true)), SCORING_VERSION, now, null, submitGraceSeconds, "IN_PROGRESS", null, null, null));
        } catch (DataIntegrityViolationException race) {
            if (repository.findSession(publicId).isPresent()) return publicId;
            throw race;
        }
        for (int index = 0; index < questions.size(); index++) {
            var question = questions.get(index);
            var ref = refs.get(index);
            String recoveryInstanceId = "recover_" + UUID.randomUUID();
            Snapshot snapshot = snapshot(question, recoveryInstanceId, mode);
            repository.insertSessionQuestion(new ExamSessionRepository.SessionQuestionRow(bytes(), sessionId, recoveryInstanceId, question.id(), question.publicId(), index + 1,
                    question.sectionId(), question.sectionType(), write(snapshot.safe()), write(snapshot.answerKey()), null, null, null));
        }
        return publicId;
    }

    private void requireRecoveryDescriptor(ExamSessionRepository.SessionRow session, RecoverExamSubmissionRequest request) {
        if (!session.mode().equals(normalizeMode(request.mode()))) throw new ApiException(HttpStatus.CONFLICT, "VERSION_MISMATCH", "Recovery mode does not match the server session");
        if (StringUtils.hasText(request.datasetVersion()) && !session.datasetVersion().equals(request.datasetVersion().trim())) throw new ApiException(HttpStatus.CONFLICT, "VERSION_MISMATCH", "Recovery dataset version does not match the server session");
        if (StringUtils.hasText(request.examId()) && !java.util.Objects.equals(session.examId(), request.examId().trim())) throw new ApiException(HttpStatus.CONFLICT, "VERSION_MISMATCH", "Recovery exam does not match the server session");
        if (StringUtils.hasText(request.examContentHash()) && !java.util.Objects.equals(session.contentHash(), request.examContentHash().trim())) throw new ApiException(HttpStatus.CONFLICT, "VERSION_MISMATCH", "Recovery exam content does not match the server session");
        List<ExamSessionRepository.SessionQuestionRow> questions = repository.listSessionQuestions(session.id());
        if (questions.size() != request.questionRefs().size()) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SUBMISSION", "Recovery question references do not match the session");
        Set<String> seen = new HashSet<>();
        for (int index = 0; index < questions.size(); index++) {
            var ref = request.questionRefs().get(index);
            var expected = questions.get(index);
            if (ref == null || !seen.add(ref.questionInstanceId())
                    || !expected.instanceId().equals(ref.questionInstanceId())
                    || !expected.publicQuestionId().equals(ref.publicQuestionId())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SUBMISSION", "Recovery question references do not match the session");
            }
        }
    }

    private void requireStaticRecoveryDescriptor(ExamSessionRepository.SessionRow session, RecoverExamSubmissionRequest request) {
        List<ExamSessionRepository.SessionQuestionRow> questions = repository.listSessionQuestions(session.id());
        if (questions.size() != request.questionRefs().size()) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SUBMISSION", "Recovery question references do not match the pinned dataset");
        Set<String> clientInstances = new HashSet<>();
        for (int index = 0; index < questions.size(); index++) {
            var ref = request.questionRefs().get(index);
            if (ref == null || !StringUtils.hasText(ref.questionInstanceId()) || !clientInstances.add(ref.questionInstanceId())
                    || !questions.get(index).publicQuestionId().equals(ref.publicQuestionId())) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_SUBMISSION", "Recovery question references do not match the pinned dataset");
            }
        }
    }

    private SubmitExamSessionRequest remapStaticRecoveryAnswers(RecoverExamSubmissionRequest request, ExamSessionRepository.SessionRow session) {
        List<ExamSessionRepository.SessionQuestionRow> questions = repository.listSessionQuestions(session.id());
        Map<String, SubmitExamSessionRequest.AnswerItem> byClientInstance = new HashMap<>();
        for (var answer : request.answers()) {
            if (answer == null || !StringUtils.hasText(answer.questionInstanceId()) || byClientInstance.put(answer.questionInstanceId(), answer) != null) throw invalidSubmission();
        }
        List<SubmitExamSessionRequest.AnswerItem> remapped = new ArrayList<>();
        for (int index = 0; index < questions.size(); index++) {
            var clientRef = request.questionRefs().get(index);
            var answer = byClientInstance.remove(clientRef.questionInstanceId());
            if (answer == null) throw invalidSubmission();
            remapped.add(new SubmitExamSessionRequest.AnswerItem(questions.get(index).instanceId(), answer.questionType(), answer.selected()));
        }
        if (!byClientInstance.isEmpty()) throw invalidSubmission();
        return new SubmitExamSessionRequest(request.clientSubmissionId(), remapped);
    }

    private ExamSessionSubmitResponse scoreSubmission(String sessionId, SubmitExamSessionRequest request, String hash, String token, UserPrincipal principal, ExamSessionRepository.ReceiptRow receipt) {
        var session = lockAndAuthorize(sessionId, token, principal);
        requireTimed(session);
        var success = repository.findSuccessReceipt(session.id());
        if (success.isPresent()) {
            if (success.get().submissionHash().equals(hash)) {
                if (!same(receipt.id(), success.get().id())) repository.updateReceipt(receipt.id(), "SUPERSEDED", "DUPLICATE_SUBMISSION_REPLAYED", null, null);
                return storedSuccess(session, success.get());
            }
            throw new ApiException(HttpStatus.CONFLICT, "SESSION_ALREADY_SUBMITTED", "This session already has a successful submission");
        }
        if (!session.status().equals("IN_PROGRESS")) throw new ApiException(HttpStatus.CONFLICT, "SESSION_NOT_SUBMITTABLE", "Session is not accepting submissions");
        repository.updateReceipt(receipt.id(), "PROCESSING", null, null, null);
        if (Instant.now().isAfter(session.deadlineAt().plusSeconds(session.graceSeconds()))) {
            throw new ApiException(HttpStatus.CONFLICT, "SUBMISSION_AFTER_GRACE", "Submission arrived after the server grace period");
        }
        Map<String, JsonNode> answers = validateSubmission(request, repository.listSessionQuestions(session.id()));
        SnapshotResult result = scoreSession(session, repository.listSessionQuestions(session.id()), answers, "BACKEND", "SERVER", "SERVER_ON_TIME");
        String resultJson = write(result.snapshot());
        byte[] attemptId = null;
        if (session.userId() != null) {
            attemptId = bytes();
            repository.insertAttempt(new ExamSessionRepository.AttemptRow(attemptId, session.userId(), session.publicId(), session.mode(), session.examId(), session.title(), session.mode().equals("CUSTOM_MOCK"),
                    session.examId() == null ? "[]" : write(arrayOf(session.examId())), write(questionRefs(result.snapshot())), write(answersArray(answers)), session.configJson(), resultJson,
                    "BACKEND", "SERVER", "SERVER_ON_TIME", session.scoringVersion(), session.datasetVersion(), session.contentHash(), result.totalQuestions(), result.totalScore(), result.mcqScore(), result.tfScore(), result.durationSeconds(), Instant.now()));
            repository.submitSession(session.id(), null);
        } else {
            repository.submitSession(session.id(), resultJson);
        }
        repository.updateReceipt(receipt.id(), "SUCCESS", null, attemptId, 1);
        return new ExamSessionSubmitResponse(session.publicId(), "SUCCESS", "BACKEND", "SERVER", "SERVER_ON_TIME", result.snapshot());
    }

    private ExamSessionRepository.ReceiptRow acquireReceipt(ExamSessionRepository.SessionRow session, String clientId, String hash, byte[] userId) {
        try {
            return requiresNew.execute(status -> {
                var existing = repository.findReceiptByClientId(clientId);
                if (existing.isPresent()) {
                    var row = existing.get();
                    if (!same(row.sessionId(), session.id()) || !row.submissionHash().equals(hash)) throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "clientSubmissionId belongs to another payload or session");
                    return row;
                }
                var created = new ExamSessionRepository.ReceiptRow(bytes(), session.id(), userId, clientId, hash, "RECEIVED", null, null, null);
                repository.insertReceipt(created);
                return created;
            });
        } catch (DataIntegrityViolationException race) {
            return repository.findReceiptByClientId(clientId).orElseThrow(() -> race);
        }
    }

    private Map<String, JsonNode> validateSubmission(SubmitExamSessionRequest request, List<ExamSessionRepository.SessionQuestionRow> questions) {
        Set<String> expected = new HashSet<>();
        for (var q : questions) expected.add(q.instanceId());
        Map<String, ExamSessionRepository.SessionQuestionRow> byInstance = new HashMap<>();
        for (var q : questions) byInstance.put(q.instanceId(), q);
        Map<String, JsonNode> answers = new HashMap<>();
        for (var item : request.answers()) {
            if (!StringUtils.hasText(item.questionInstanceId()) || !expected.contains(item.questionInstanceId()) || answers.containsKey(item.questionInstanceId())) throw invalidSubmission();
            var question = byInstance.get(item.questionInstanceId());
            answers.put(item.questionInstanceId(), normalizeAnswer(item.questionType(), item.selected(), question, false));
        }
        if (!answers.keySet().equals(expected)) throw invalidSubmission();
        return answers;
    }

    private SnapshotResult scoreSession(ExamSessionRepository.SessionRow session, List<ExamSessionRepository.SessionQuestionRow> questions, Map<String, JsonNode> answers,
                                        String scoreAuthority, String timingAuthority, String submissionOrigin) {
        ArrayNode reviewed = objectMapper.createArrayNode();
        int correctMcq = 0, blankMcq = 0, wrongMcq = 0;
        int[] tfBreakdown = new int[5];
        double originalMcq = 0, originalTf = 0, customMcqUnits = 0, customTfUnits = 0;
        for (var q : questions) {
            JsonNode answer = answers.get(q.instanceId());
            var scored = scoreQuestion(q, answer, session.mode());
            ObjectNode key = read(q.answerKeyJson());
            ObjectNode safe = read(q.safeJson());
            ObjectNode item = objectMapper.createObjectNode();
            item.put("publicQuestionId", q.publicQuestionId()); item.put("questionInstanceId", q.instanceId()); item.put("questionType", q.sectionType());
            item.set("question", safe); item.set("userAnswer", answer); item.set("correctAnswer", scored.correctAnswer()); item.put("correctness", scored.correct()); item.put("points", scored.points()); item.put("completionState", scored.completionState());
            if (key.path("explanation").isNull()) item.putNull("explanation"); else item.set("explanation", key.path("explanation"));
            item.set("sources", key.path("sources")); item.set("topicRefs", key.path("topics")); reviewed.add(item);
            if (q.sectionType().equals("mcq")) {
                if (scored.correct()) correctMcq++; else if (scored.completionState().equals("BLANK")) blankMcq++; else wrongMcq++;
                originalMcq += scored.points(); customMcqUnits += scored.correct() ? 1d : 0d;
            } else {
                int count = scored.correctCount(); tfBreakdown[Math.min(4, count)]++;
                originalTf += scored.points(); customTfUnits += count / (double) TF_KEYS.size();
            }
        }
        boolean custom = session.mode().equals("CUSTOM_MOCK");
        double total = custom ? round(((customMcqUnits + customTfUnits) / questions.size()) * 10) : round(originalMcq + originalTf);
        double mcq = custom ? round((customMcqUnits / questions.size()) * 10) : round(originalMcq);
        double tf = custom ? round((customTfUnits / questions.size()) * 10) : round(originalTf);
        Instant now = Instant.now();
        ObjectNode summary = objectMapper.createObjectNode();
        summary.put("totalScore", total); summary.put("mcqScore", mcq); summary.put("tfScore", tf); summary.put("totalQuestions", questions.size()); summary.put("correctMCQ", correctMcq); summary.put("wrongMCQ", wrongMcq); summary.put("blankMCQ", blankMcq);
        ArrayNode histogram = summary.putArray("tfBreakdown"); for (int value : tfBreakdown) histogram.add(value);
        ObjectNode root = objectMapper.createObjectNode();
        root.put("snapshotSchemaVersion", 2); root.put("sessionId", session.publicId()); root.put("mode", session.mode()); root.put("title", session.title()); root.put("datasetVersion", session.datasetVersion()); root.put("examContentHash", session.contentHash()); root.put("scoringVersion", session.scoringVersion()); root.put("scoreAuthority", scoreAuthority); root.put("timingAuthority", timingAuthority); root.put("submissionOrigin", submissionOrigin); root.put("startedAtServer", session.startedAt().toEpochMilli()); root.put("submittedAtServer", now.toEpochMilli()); root.set("summary", summary); root.set("questions", reviewed);
        return new SnapshotResult(root, total, mcq, tf, questions.size(), (int)Math.max(0, Duration.between(session.startedAt(), now).toSeconds()));
    }

    private ExamSessionResponse.CheckedQuestionResult scoreQuestion(ExamSessionRepository.SessionQuestionRow q, JsonNode answer, String mode) {
        ObjectNode key = read(q.answerKeyJson());
        String type = q.sectionType();
        if (type.equals("mcq")) {
            String selected = answer.isNull() ? null : answer.asText();
            String correct = key.path("correctOptionId").asText();
            boolean hit = selected != null && selected.equals(correct);
            double points = hit ? (mode.equals("CUSTOM_MOCK") || mode.equals("CUSTOM_PRACTICE") ? 1d : key.path("flatPoints").asDouble(.25d)) : 0d;
            return new ExamSessionResponse.CheckedQuestionResult(answer, objectMapper.getNodeFactory().textNode(correct), hit, points, selected == null ? "BLANK" : "COMPLETE", textOrNull(key.path("explanation")), hit ? 1 : 0);
        }
        ObjectNode selected = (ObjectNode) answer;
        ObjectNode correct = (ObjectNode) key.path("correctStatements");
        int count = 0, filled = 0;
        for (String statement : TF_KEYS) {
            JsonNode value = selected.path(statement); if (!value.isNull()) filled++;
            if (!value.isNull() && value.asBoolean() == correct.path(statement).asBoolean()) count++;
        }
        double points = (mode.equals("CUSTOM_MOCK") || mode.equals("CUSTOM_PRACTICE")) ? count / 4d : TF_LADDER[count];
        return new ExamSessionResponse.CheckedQuestionResult(answer, correct, count == 4, points, filled == 0 ? "BLANK" : filled == 4 ? "COMPLETE" : "PARTIAL", textOrNull(key.path("explanation")), count);
    }

    private ExamSessionResponse response(ExamSessionRepository.SessionRow session, boolean includeToken) {
        List<ExamSessionResponse.SessionQuestion> items = new ArrayList<>();
        for (var question : repository.listSessionQuestions(session.id())) items.add(new ExamSessionResponse.SessionQuestion(question.instanceId(), question.publicQuestionId(), question.position(), read(question.safeJson()), question.checkedResultJson() == null ? null : checkedResult(question.checkedResultJson())));
        JsonNode result = session.userId() == null && session.resultJson() != null ? read(session.resultJson()) : null;
        return new ExamSessionResponse(session.publicId(), null, session.mode(), session.title(), session.datasetVersion(), session.contentHash(), session.scoringVersion(), session.startedAt().toEpochMilli(), session.deadlineAt() == null ? null : session.deadlineAt().toEpochMilli(), session.status(), items, PRACTICE.contains(session.mode()) ? practiceSummary(repository.listSessionQuestions(session.id())) : null, result);
    }

    private ExamSessionSubmitResponse storedSuccess(ExamSessionRepository.SessionRow session, ExamSessionRepository.ReceiptRow receipt) {
        JsonNode result = session.resultJson() != null ? read(session.resultJson()) : receipt.attemptId() == null
                ? objectMapper.createObjectNode()
                : repository.findAttemptResult(receipt.attemptId()).map(this::read).orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "ATTEMPT_RESULT_MISSING", "Successful attempt result is unavailable"));
        return new ExamSessionSubmitResponse(session.publicId(), "SUCCESS", result.path("scoreAuthority").asText("BACKEND"),
                result.path("timingAuthority").asText("SERVER"), result.path("submissionOrigin").asText("SERVER_ON_TIME"), result);
    }

    private CreatePlan buildPlan(CreateExamSessionRequest request, String mode, ExamSessionRepository.DatasetRow dataset, byte[] userId) {
        if (mode.equals("TIMED_ORIGINAL") || mode.equals("FREE_PRACTICE")) {
            String examId = requireText(request.examId(), "INVALID_EXAM_ID", "examId is required");
            var exam = repository.findPublicExam(dataset.id(), examId).orElseThrow(() -> new NotFoundException("EXAM_NOT_FOUND", "Exam is not public in the active dataset"));
            return new CreatePlan(exam.title(), exam.examId(), exam.contentHash(), exam.durationMinutes(), objectMapper.createObjectNode().put("examId", exam.examId()), seeds(repository.questionsForExam(dataset.id(), exam.id())));
        }
        if (mode.equals("RETRY_WRONG")) {
            if (userId == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Retry requires an authenticated attempt owner");
            String sourceId = requireText(request.sourceAttemptId(), "INVALID_RETRY_SOURCE", "sourceAttemptId is required");
            JsonNode source = repository.findAttemptResult(userId, sourceId).map(this::read).orElseThrow(() -> new NotFoundException("EXAM_ATTEMPT_NOT_FOUND", "Retry source attempt was not found"));
            if (source.path("snapshotSchemaVersion").asInt() != 2) throw new ApiException(HttpStatus.CONFLICT, "RETRY_SOURCE_UNSUPPORTED", "Legacy retry remains on the compatibility flow until it has an immutable snapshot v2");
            List<SeedQuestion> retry = new ArrayList<>();
            for (JsonNode reviewed : source.path("questions")) {
                if (reviewed.path("correctness").asBoolean() && "COMPLETE".equals(reviewed.path("completionState").asText())) continue;
                ObjectNode safe = (ObjectNode) reviewed.path("question");
                ObjectNode key = objectMapper.createObjectNode();
                key.put("questionType", reviewed.path("questionType").asText()); key.set("explanation", reviewed.path("explanation")); key.set("sources", reviewed.path("sources")); key.set("topics", reviewed.path("topicRefs")); key.put("flatPoints", .25d);
                if (reviewed.path("questionType").asText().equals("mcq")) key.put("correctOptionId", reviewed.path("correctAnswer").asText()); else key.set("correctStatements", reviewed.path("correctAnswer"));
                retry.add(new SeedQuestion(null, reviewed.path("publicQuestionId").asText(), new Snapshot(safe, key)));
            }
            return new CreatePlan("Ôn lại câu sai", null, source.path("examContentHash").asText(null), 0, objectMapper.createObjectNode().put("sourceAttemptId", sourceId), retry);
        }
        if (StringUtils.hasText(request.expectedDatasetVersion()) && !dataset.version().equals(request.expectedDatasetVersion().trim())) throw new ApiException(HttpStatus.CONFLICT, "DATASET_VERSION_MISMATCH", "The requested custom session dataset is no longer active");
        int count = request.questionCount() == null ? 30 : request.questionCount();
        String type = choice(request.questionType(), Set.of("all", "mcq", "true_false"), "all"); String difficulty = choice(request.difficulty(), Set.of("all", "easy", "medium", "hard"), "all"); String cognitive = choice(request.cognitiveLevel(), Set.of("all", "knowledge", "comprehension", "application"), "all"); String scope = choice(request.scopeType(), Set.of("all", "topic", "period"), "all");
        String slug = scope.equals("all") ? null : requireText(request.scopeSlug(), "INVALID_SCOPE", "scopeSlug is required for topic or period");
        List<ExamSessionRepository.QuestionRow> candidates = new ArrayList<>(repository.questionsForFilter(dataset.id(), new ExamSessionRepository.Filter(type, difficulty, cognitive, scope, slug)));
        Collections.shuffle(candidates, secureRandom); if (candidates.size() > count) candidates = new ArrayList<>(candidates.subList(0, count));
        ObjectNode config = objectMapper.createObjectNode(); config.put("questionCount", count); config.put("questionType", type); config.put("difficulty", difficulty); config.put("cognitiveLevel", cognitive); config.put("scopeType", scope); if (slug != null) config.put("scopeSlug", slug);
        String title = mode.equals("TOPIC_PRACTICE") ? "Ôn theo chủ đề" : mode.equals("CUSTOM_PRACTICE") ? "Luyện tập tùy chọn" : "Đề thi thử tùy chọn";
        return new CreatePlan(title, null, null, mode.equals("CUSTOM_MOCK") ? 50 : 0, config, seeds(candidates));
    }

    private Snapshot snapshot(ExamSessionRepository.QuestionRow q, String instance, String mode) {
        ObjectNode safe = objectMapper.createObjectNode(); safe.put("questionType", q.type()); safe.put("questionText", q.text()); safe.put("difficulty", q.difficulty()); safe.put("cognitiveLevel", q.cognitiveLevel());
        ObjectNode key = objectMapper.createObjectNode(); key.put("questionType", q.type()); key.set("explanation", q.explanation() == null ? objectMapper.nullNode() : objectMapper.getNodeFactory().textNode(q.explanation())); key.set("sources", sourceArray(q.id())); key.set("topics", topicArray(q.id())); key.put("flatPoints", q.sectionQuestionCount() == 0 ? .25d : q.sectionMaxScore() / q.sectionQuestionCount());
        if (q.type().equals("mcq")) { ArrayNode options=safe.putArray("options"); for(var option:repository.options(q.id())) {ObjectNode o=options.addObject();o.put("id",option.key());o.put("text",option.text());if(option.correct())key.put("correctOptionId",option.key());} }
        else { ArrayNode statements=safe.putArray("statements"); ObjectNode correct=key.putObject("correctStatements"); for(var statement:repository.statements(q.id())) {ObjectNode s=statements.addObject();s.put("id",statement.key());s.put("text",statement.text());correct.put(statement.key(),statement.truth());} }
        return new Snapshot(safe,key);
    }

    private ArrayNode sourceArray(byte[] id) { ArrayNode array=objectMapper.createArrayNode(); for(var s:repository.sources(id)){ObjectNode node=array.addObject();node.put("title",s.title());if(s.location()==null)node.putNull("location");else node.put("location",s.location());} return array; }
    private ArrayNode topicArray(byte[] id) { ArrayNode array=objectMapper.createArrayNode(); for(var t:repository.topics(id)){ObjectNode node=array.addObject();node.put("slug",t.slug());node.put("title",t.title());node.put("periodSlug",t.periodSlug());node.put("periodTitle",t.periodTitle());} return array; }
    private ExamSessionResponse.PracticeSummary practiceSummary(List<ExamSessionRepository.SessionQuestionRow> questions) { int checked=0,correct=0;double points=0;for(var q:questions)if(q.checkedResultJson()!=null){checked++;var r=checkedResult(q.checkedResultJson());if(r.correct())correct++;points+=r.points();}return new ExamSessionResponse.PracticeSummary(questions.size(),checked,correct,round(points),questions.size()-checked); }
    private ExamSessionResponse.CheckedQuestionResult checkedResult(String raw) { JsonNode n=read(raw);return new ExamSessionResponse.CheckedQuestionResult(n.path("userAnswer"),n.path("correctAnswer"),n.path("correct").asBoolean(),n.path("points").asDouble(),n.path("completionState").asText(),textOrNull(n.path("explanation")),n.path("correctCount").asInt()); }
    private String writeChecked(ExamSessionResponse.CheckedQuestionResult r) { ObjectNode n=objectMapper.createObjectNode();n.set("userAnswer",r.userAnswer());n.set("correctAnswer",r.correctAnswer());n.put("correct",r.correct());n.put("points",r.points());n.put("completionState",r.completionState());n.put("correctCount",r.correctCount());if(r.explanation()==null)n.putNull("explanation");else n.put("explanation",r.explanation());return write(n); }
    private JsonNode normalizeAnswer(String suppliedType, JsonNode selected, ExamSessionRepository.SessionQuestionRow q, boolean requireComplete) { if(!q.sectionType().equals(suppliedType))throw invalidSubmission(); ObjectNode safe=read(q.safeJson()); if(q.sectionType().equals("mcq")){if(selected==null||selected.isNull()){if(requireComplete)throw invalidSubmission();return objectMapper.nullNode();}Set<String> options=new HashSet<>();for(JsonNode option:safe.path("options"))options.add(option.path("id").asText());if(!selected.isTextual()||!options.contains(selected.asText()))throw invalidSubmission();return objectMapper.getNodeFactory().textNode(selected.asText());} if(selected==null||!selected.isObject())throw invalidSubmission();ObjectNode normalized=objectMapper.createObjectNode();Set<String> expected=new java.util.TreeSet<>();for(JsonNode statement:safe.path("statements"))expected.add(statement.path("id").asText());if(selected.size()!=expected.size())throw invalidSubmission();for(String key:expected){JsonNode value=selected.get(key);if(value==null||(!value.isNull()&&!value.isBoolean()))throw invalidSubmission();if(requireComplete&&value.isNull())throw invalidSubmission();normalized.set(key,value);}return normalized; }
    private String submissionHash(String sessionId, SubmitExamSessionRequest request) { ArrayNode answers=objectMapper.createArrayNode(); List<SubmitExamSessionRequest.AnswerItem> items=new ArrayList<>(request.answers());items.sort(java.util.Comparator.comparing(SubmitExamSessionRequest.AnswerItem::questionInstanceId, java.util.Comparator.nullsLast(String::compareTo)));for(var item:items){ObjectNode n=answers.addObject();n.put("questionInstanceId",item.questionInstanceId());n.put("questionType",item.questionType());n.set("selected",item.selected());}ObjectNode root=objectMapper.createObjectNode();root.put("contractVersion",1);root.put("sessionId",sessionId);root.set("answers",answers);return ExamDatasetHashing.canonicalSha256(root); }
    private ArrayNode answersArray(Map<String,JsonNode> answers){ArrayNode array=objectMapper.createArrayNode();answers.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e->{ObjectNode n=array.addObject();n.put("questionInstanceId",e.getKey());n.set("selected",e.getValue());});return array;}
    private ArrayNode questionRefs(JsonNode snapshot){ArrayNode refs=objectMapper.createArrayNode();for(JsonNode question:snapshot.path("questions")){ObjectNode ref=refs.addObject();ref.put("questionInstanceId",question.path("questionInstanceId").asText());ref.put("questionId",question.path("publicQuestionId").asText());}return refs;}
    private ArrayNode arrayOf(String value){ArrayNode a=objectMapper.createArrayNode();a.add(value);return a;}
    private ExamSessionRepository.DatasetRow requireDataset(){return repository.findActiveDataset().orElseThrow(()->new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"EXAM_DATASET_UNAVAILABLE","No active exam dataset is available"));}
    private ExamSessionRepository.SessionRow requireSession(String id){return repository.findSession(requireText(id,"INVALID_SESSION_ID","sessionId is required")).orElseThrow(()->new NotFoundException("EXAM_SESSION_NOT_FOUND","Exam session was not found"));}
    private ExamSessionRepository.SessionRow lockAndAuthorize(String id,String token,UserPrincipal p){var s=repository.lockSession(requireText(id,"INVALID_SESSION_ID","sessionId is required")).orElseThrow(()->new NotFoundException("EXAM_SESSION_NOT_FOUND","Exam session was not found"));authorize(s,token,p);return s;}
    private void authorize(ExamSessionRepository.SessionRow s,String token,UserPrincipal p){byte[] user=principalId(p);if(s.userId()!=null){if(user==null||!same(s.userId(),user))throw new ApiException(HttpStatus.FORBIDDEN,"SESSION_OWNER_REQUIRED","Only the authenticated session owner may access this session");return;}if(s.tokenHash()==null||!StringUtils.hasText(token)||!MessageDigest.isEqual(s.tokenHash().getBytes(StandardCharsets.US_ASCII),sha256(token).getBytes(StandardCharsets.US_ASCII)))throw new ApiException(HttpStatus.UNAUTHORIZED,"ANONYMOUS_SESSION_TOKEN_REQUIRED","A valid X-Exam-Session-Token is required");}
    private void requirePractice(ExamSessionRepository.SessionRow s){if(!PRACTICE.contains(s.mode()))throw new ApiException(HttpStatus.CONFLICT,"CHECK_OR_COMPLETE_NOT_ALLOWED","This operation is only available for practice sessions");}
    private void requireTimed(ExamSessionRepository.SessionRow s){if(!TIMED.contains(s.mode()))throw new ApiException(HttpStatus.CONFLICT,"SUBMIT_NOT_ALLOWED","Whole-session submit is only available for timed or mock sessions");}
    private void requireStatus(ExamSessionRepository.SessionRow s,String status){if(!s.status().equals(status))throw new ApiException(HttpStatus.CONFLICT,"SESSION_NOT_IN_PROGRESS","Session is not in progress");}
    private String normalizeMode(String value){String m=requireText(value,"INVALID_SESSION_MODE","mode is required").toUpperCase(Locale.ROOT);if(!MODES.contains(m))throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_SESSION_MODE","Unsupported exam session mode");return m;}
    private String choice(String value,Set<String> allowed,String fallback){String normalized=StringUtils.hasText(value)?value.trim().toLowerCase(Locale.ROOT):fallback;if(!allowed.contains(normalized))throw invalidSubmission();return normalized;}
    private String requireText(String value,String code,String message){if(!StringUtils.hasText(value))throw new ApiException(HttpStatus.BAD_REQUEST,code,message);return value.trim();}
    private void requireClientSubmissionId(String value){try{UUID.fromString(requireText(value,"INVALID_SUBMISSION","clientSubmissionId is required"));}catch(IllegalArgumentException ex){throw invalidSubmission();}}
    private ApiException invalidSubmission(){return new ApiException(HttpStatus.BAD_REQUEST,"INVALID_SUBMISSION","Submission answer set is malformed or does not match this server-issued session");}
    private byte[] principalId(UserPrincipal p){return p==null||p.idBytes()==null||p.idBytes().length!=16?null:p.idBytes();}
    private byte[] bytes(){return UuidBytes.fromUuid(UUID.randomUUID());}
    private String generateToken(){byte[] b=new byte[32];secureRandom.nextBytes(b);return Base64.getUrlEncoder().withoutPadding().encodeToString(b);}
    private String sha256(String v){return ExamDatasetHashing.sha256(v.getBytes(StandardCharsets.UTF_8));}
    private boolean same(byte[] a,byte[] b){return a!=null&&b!=null&&MessageDigest.isEqual(a,b);}
    private ObjectNode read(String raw){try{return (ObjectNode)objectMapper.readTree(raw);}catch(JacksonException e){throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,"STORED_SESSION_JSON_INVALID","Stored session JSON is invalid");}}
    private String write(JsonNode n){try{return objectMapper.writeValueAsString(n);}catch(JacksonException e){throw new IllegalStateException("Cannot serialize session JSON",e);}}
    private String canonicalAnswerText(JsonNode n){return n.isObject() ? ExamDatasetHashing.canonicalText(n) : write(n);}
    private String textOrNull(JsonNode n){return n==null||n.isNull()?null:n.asText();}
    private double round(double n){return Math.round(n*100d)/100d;}
    private record Snapshot(ObjectNode safe,ObjectNode answerKey){}
    private List<SeedQuestion> seeds(List<ExamSessionRepository.QuestionRow> questions){return questions.stream().map(q->new SeedQuestion(q,q.publicId(),null)).toList();}
    private record CreatePlan(String title,String examId,String contentHash,int durationMinutes,JsonNode config,List<SeedQuestion> questions){}
    private record SeedQuestion(ExamSessionRepository.QuestionRow question,String publicQuestionId,Snapshot snapshot){}
    private record SnapshotResult(ObjectNode snapshot,double totalScore,double mcqScore,double tfScore,int totalQuestions,int durationSeconds){}
}

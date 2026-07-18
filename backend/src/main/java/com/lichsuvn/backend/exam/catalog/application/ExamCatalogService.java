package com.lichsuvn.backend.exam.catalog.application;

import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.exception.NotFoundException;
import com.lichsuvn.backend.exam.catalog.api.dto.CustomExamPreviewRequest;
import com.lichsuvn.backend.exam.catalog.api.dto.CustomExamPreviewResponse;
import com.lichsuvn.backend.exam.catalog.api.dto.ExamCatalogDetailResponse;
import com.lichsuvn.backend.exam.catalog.api.dto.ExamCatalogListResponse;
import com.lichsuvn.backend.exam.catalog.api.dto.ExamTopicResponse;
import com.lichsuvn.backend.exam.catalog.infrastructure.ExamCatalogRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;

@Service
public class ExamCatalogService {
    private static final Set<String> CATALOG_VIEWS = Set.of("VERIFIED", "REVIEWABLE");
    private static final Set<String> QUESTION_TYPES = Set.of("all", "mcq", "true_false");
    private static final Set<String> DIFFICULTIES = Set.of("all", "easy", "medium", "hard");
    private static final Set<String> COGNITIVE_LEVELS = Set.of("all", "knowledge", "comprehension", "application");
    private static final Set<String> SCOPES = Set.of("all", "topic", "period");

    private final ExamCatalogRepository repository;

    public ExamCatalogService(ExamCatalogRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public ExamCatalogListResponse listExams(String requestedView) {
        var dataset = requireActiveDataset();
        String view = normalizeView(requestedView);
        var items = repository.listExams(dataset.id(), view.equals("VERIFIED"));
        return new ExamCatalogListResponse(dataset.aggregateHash(), view, items.size(), items);
    }

    @Transactional(readOnly = true)
    public ExamCatalogDetailResponse findExam(String examId) {
        if (!StringUtils.hasText(examId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_EXAM_ID", "examId is required");
        }
        var dataset = requireActiveDataset();
        var exam = repository.findPublicExam(dataset.id(), examId.trim())
                .orElseThrow(() -> new NotFoundException("EXAM_NOT_FOUND", "Exam was not found in the active public catalog"));
        var sections = repository.listSections(exam.id());
        return new ExamCatalogDetailResponse(
                dataset.aggregateHash(),
                exam.examId(),
                exam.title(),
                exam.year(),
                exam.source(),
                exam.sourceDetail(),
                exam.examCode(),
                exam.format(),
                exam.timeLimitMinutes(),
                exam.totalScore(),
                exam.mcqCount() + exam.tfCount(),
                exam.verificationStatus(),
                exam.hasWarnings(),
                sections
        );
    }

    @Transactional(readOnly = true)
    public ExamTopicResponse listTopics() {
        var dataset = requireActiveDataset();
        var items = repository.listTopics(dataset.id());
        return new ExamTopicResponse(dataset.aggregateHash(), items.size(), items);
    }

    @Transactional(readOnly = true)
    public CustomExamPreviewResponse preview(CustomExamPreviewRequest request) {
        var dataset = requireActiveDataset();
        String questionType = normalizeChoice(request.questionType(), "all", QUESTION_TYPES, "questionType");
        String difficulty = normalizeChoice(request.difficulty(), "all", DIFFICULTIES, "difficulty");
        String cognitive = normalizeChoice(request.cognitiveLevel(), "all", COGNITIVE_LEVELS, "cognitiveLevel");
        String scope = normalizeChoice(request.scopeType(), "all", SCOPES, "scopeType");
        String scopeSlug = scope.equals("all") ? null : requireScopeSlug(request.scopeSlug());

        var filter = new ExamCatalogRepository.PreviewFilter(
                questionType,
                difficulty,
                cognitive,
                scope,
                scopeSlug
        );
        var counts = repository.preview(dataset.id(), filter);
        int requestedCount = request.questionCount();
        int selectedCount = Math.min(requestedCount, counts.total());
        var warnings = new ArrayList<String>();
        if (counts.total() == 0) {
            warnings.add("NO_MATCHING_QUESTIONS");
        } else if (counts.total() < requestedCount) {
            warnings.add("INSUFFICIENT_QUESTIONS");
        }

        return new CustomExamPreviewResponse(
                dataset.aggregateHash(),
                new CustomExamPreviewResponse.NormalizedConfig(
                        requestedCount,
                        questionType,
                        difficulty,
                        cognitive,
                        scope,
                        scopeSlug
                ),
                counts.total(),
                selectedCount,
                counts.total() >= requestedCount,
                new CustomExamPreviewResponse.Breakdown(
                        counts.questionType(),
                        counts.difficulty(),
                        counts.cognitiveLevel()
                ),
                warnings
        );
    }

    private ExamCatalogRepository.ActiveDataset requireActiveDataset() {
        return repository.findActiveDataset().orElseThrow(() -> new ApiException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "EXAM_DATASET_UNAVAILABLE",
                "No active exam dataset is available"
        ));
    }

    private String normalizeView(String value) {
        String normalized = StringUtils.hasText(value) ? value.trim().toUpperCase(Locale.ROOT) : "VERIFIED";
        if (!CATALOG_VIEWS.contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CATALOG_VIEW", "view must be VERIFIED or REVIEWABLE");
        }
        return normalized;
    }

    private String normalizeChoice(String value, String fallback, Set<String> allowed, String field) {
        String normalized = StringUtils.hasText(value) ? value.trim().toLowerCase(Locale.ROOT) : fallback;
        if (!allowed.contains(normalized)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CUSTOM_PREVIEW_FILTER", field + " has an unsupported value");
        }
        return normalized;
    }

    private String requireScopeSlug(String value) {
        if (!StringUtils.hasText(value)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CUSTOM_PREVIEW_SCOPE", "scopeSlug is required for topic or period scope");
        }
        String slug = value.trim().toLowerCase(Locale.ROOT);
        if (!slug.matches("[a-z0-9]+(?:-[a-z0-9]+)*")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CUSTOM_PREVIEW_SCOPE", "scopeSlug has an invalid format");
        }
        return slug;
    }
}

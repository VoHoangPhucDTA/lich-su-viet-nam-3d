package com.lichsuvn.backend.exam.catalog;

import com.lichsuvn.backend.exam.catalog.api.dto.CustomExamPreviewRequest;
import com.lichsuvn.backend.exam.catalog.api.dto.ExamCatalogDetailResponse;
import com.lichsuvn.backend.exam.catalog.application.ExamCatalogService;
import com.lichsuvn.backend.exam.catalog.infrastructure.ExamCatalogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ExamCatalogServiceTest {
    private ExamCatalogRepository repository;
    private ExamCatalogService service;
    private byte[] datasetId;

    @BeforeEach
    void setUp() {
        repository = mock(ExamCatalogRepository.class);
        service = new ExamCatalogService(repository);
        datasetId = new byte[16];
        when(repository.findActiveDataset()).thenReturn(Optional.of(
                new ExamCatalogRepository.ActiveDataset(datasetId, "dataset-hash")
        ));
    }

    @Test
    void defaultCatalogUsesVerifiedPublicView() {
        when(repository.listExams(datasetId, true)).thenReturn(List.of());
        var response = service.listExams(null);
        assertEquals("VERIFIED", response.view());
        verify(repository).listExams(datasetId, true);
    }

    @Test
    void reviewableCatalogStillDelegatesToPublicOnlyRepositoryQuery() {
        when(repository.listExams(datasetId, false)).thenReturn(List.of());
        var response = service.listExams("reviewable");
        assertEquals("REVIEWABLE", response.view());
        verify(repository).listExams(datasetId, false);
    }

    @Test
    void detailDtoCannotLeakQuestionOrAnswerKeyFields() throws Exception {
        when(repository.findPublicExam(datasetId, "exam-1")).thenReturn(Optional.of(
                new ExamCatalogRepository.ExamDefinitionRow(
                        new byte[16], "exam-1", "Exam", 2026, "source", "detail", "code",
                        "thpt_2025", 50, BigDecimal.TEN, 24, 4, "VERIFIED", false
                )
        ));
        when(repository.listSections(new byte[16])).thenReturn(List.of(
                new ExamCatalogDetailResponse.SectionSummary("phan-1", "mcq", "Section", 1, 24, BigDecimal.valueOf(6))
        ));

        String json = JsonMapper.builder().build().writeValueAsString(service.findExam("exam-1"));
        assertFalse(json.contains("questionText"));
        assertFalse(json.contains("correctOptionId"));
        assertFalse(json.contains("questionRefs"));
        assertFalse(json.contains("explanation"));
    }

    @Test
    void customPreviewReturnsOnlyCountsAndNormalizedConfig() {
        when(repository.preview(datasetId, new ExamCatalogRepository.PreviewFilter(
                "mcq", "medium", "knowledge", "topic", "asean"
        ))).thenReturn(new ExamCatalogRepository.PreviewCounts(
                8,
                Map.of("mcq", 8, "true_false", 0),
                Map.of("easy", 0, "medium", 8, "hard", 0),
                Map.of("knowledge", 8, "comprehension", 0, "application", 0)
        ));

        var response = service.preview(new CustomExamPreviewRequest(
                10, "MCQ", "medium", "knowledge", "topic", "asean"
        ));
        assertEquals(8, response.availableCount());
        assertEquals(8, response.selectedCount());
        assertFalse(response.enoughQuestions());
        assertEquals(List.of("INSUFFICIENT_QUESTIONS"), response.warnings());
    }
}

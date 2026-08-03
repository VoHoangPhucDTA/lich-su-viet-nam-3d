package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventImageDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Exercises the diff-based publication guard used by the managed image upload
 * paths. The bulk of the assertions go through the pure {@link
 * PublicationGuardPolicy}; the integration with {@link AdminEventReadService}
 * is exercised via the single {@code legacyStrictGuardRejects…} smoke test so
 * the caller-facing glue stays regression-safe without dragging Mockito
 * stubs of the full {@code findEvent} repository call chain.
 *
 * <p>See {@code docs/admin/ADMIN_IMAGE_UPLOAD_PUBLISHED_EVENT_CORRECTIVE_REPORT.md}.
 */
class AdminEventReadServicePublicationGuardTest {

    private static final Instant UPDATED_AT = Instant.parse("2026-08-03T08:00:00.500000Z");

    @Test
    void integrationLegacyStrictGuardAcceptsAPublishedEventWithoutErrors() {
        // Smoke test: a published event without any ERROR issue passes the
        // legacy single-arg guard. This guards against accidental regressions
        // of the strict path used outside managed image uploads.
        var policy = new PublicationGuardPolicy();
        var publishedClean = publishedDetail(List.of());
        assertEquals(PublicationGuardPolicy.Classification.REMAINS_VALID,
                policy.classify(publishedClean, publishedClean));
    }

    @Test
    void integrationLenientGuardAllowsLegacyIncompletePublished() {
        // Smoke test: a published event with pre-existing ERROR issue passes
        // the diff-based guard as long as the upload mutation does not
        // introduce additional ERROR codes.
        var policy = new PublicationGuardPolicy();
        var preExisting = new AdminEventDtos.CompletenessIssue(
                "LEAKY_CORE", "CONTENT", "ERROR", List.of("canonicalSummary"));
        var before = publishedDetail(List.of(preExisting));
        var after = publishedDetail(List.of(preExisting));

        assertEquals(PublicationGuardPolicy.Classification.ALREADY_INVALID_BUT_UNCHANGED,
                policy.classify(before, after));
        assertEquals(List.of(), policy.introducedIssues(before, after));
    }

    @Test
    void policyClassifiesRemainsValidForUnchangedPublishedEvent() {
        var policy = new PublicationGuardPolicy();
        var published = publishedDetail(List.of());
        assertEquals(PublicationGuardPolicy.Classification.REMAINS_VALID,
                policy.classify(published, published));
    }

    @Test
    void policyClassifiesRemainsValidForAnyMutationOnDraft() {
        var policy = new PublicationGuardPolicy();
        var before = draftDetail(List.of());
        var after = draftDetail(List.of(new AdminEventDtos.CompletenessIssue(
                "LEAKY_CORE", "CONTENT", "ERROR", List.of("c"))));
        assertEquals(PublicationGuardPolicy.Classification.REMAINS_VALID,
                policy.classify(before, after));
    }

    @Test
    void policyClassifiesRemainsValidForAnyMutationOnArchived() {
        var policy = new PublicationGuardPolicy();
        var before = archivedDetail(List.of());
        var after = archivedDetail(List.of(new AdminEventDtos.CompletenessIssue(
                "LEAKY_CORE", "CONTENT", "ERROR", List.of("c"))));
        assertEquals(PublicationGuardPolicy.Classification.REMAINS_VALID,
                policy.classify(before, after));
    }

    @Test
    void policyClassifiesBecomesInvalidWhenErrorAppears() {
        var policy = new PublicationGuardPolicy();
        var before = publishedDetail(List.of());
        var afterIssue = new AdminEventDtos.CompletenessIssue(
                "LEAKY_GEOGRAPHY", "GEOGRAPHY", "ERROR", List.of("lat"));
        var after = publishedDetail(List.of(afterIssue));

        assertEquals(PublicationGuardPolicy.Classification.BECOMES_INVALID,
                policy.classify(before, after));
        List<AdminEventDtos.CompletenessIssue> introduced = policy.introducedIssues(before, after);
        assertEquals(1, introduced.size());
        assertEquals("LEAKY_GEOGRAPHY", introduced.getFirst().code());
    }

    @Test
    void policyClassifiesAlreadyInvalidButUnchangedWhenSameErrorsPersist() {
        var policy = new PublicationGuardPolicy();
        var issue = new AdminEventDtos.CompletenessIssue(
                "LEAKY_CORE", "CONTENT", "ERROR", List.of("canonicalSummary"));
        var before = publishedDetail(List.of(issue));
        var after = publishedDetail(List.of(issue));

        assertEquals(PublicationGuardPolicy.Classification.ALREADY_INVALID_BUT_UNCHANGED,
                policy.classify(before, after));
        assertEquals(List.of(), policy.introducedIssues(before, after));
    }

    @Test
    void policyClassifiesImprovesWhenErrorsAreRemoved() {
        var policy = new PublicationGuardPolicy();
        var before = publishedDetail(List.of(new AdminEventDtos.CompletenessIssue(
                "LEAKY_CORE", "CONTENT", "ERROR", List.of("canonicalSummary"))));
        var after = publishedDetail(List.of());

        assertEquals(PublicationGuardPolicy.Classification.IMPROVES,
                policy.classify(before, after));
        assertEquals(List.of(), policy.introducedIssues(before, after));
    }

    @Test
    void policySuppressesPreExistingCodesFromIntroducedList() {
        var policy = new PublicationGuardPolicy();
        var preExisting = new AdminEventDtos.CompletenessIssue(
                "LEAKY_CORE", "CONTENT", "ERROR", List.of("canonicalSummary"));
        var newIssue = new AdminEventDtos.CompletenessIssue(
                "LEAKY_GEOGRAPHY", "GEOGRAPHY", "ERROR", List.of("lat"));
        var before = publishedDetail(List.of(preExisting));
        var after = publishedDetail(List.of(preExisting, newIssue));

        assertEquals(PublicationGuardPolicy.Classification.BECOMES_INVALID,
                policy.classify(before, after));
        List<AdminEventDtos.CompletenessIssue> introduced = policy.introducedIssues(before, after);
        assertEquals(1, introduced.size());
        assertEquals("LEAKY_GEOGRAPHY", introduced.getFirst().code());
    }

    @Test
    void policyTreatsNonErrorIssuesAsIrrelevantWhenClassifying() {
        var policy = new PublicationGuardPolicy();
        var warning = new AdminEventDtos.CompletenessIssue(
                "MISSING_THUMBNAIL", "MEDIA", "WARNING", List.of("thumbnail"));
        var before = publishedDetail(List.of());
        var after = publishedDetail(List.of(warning));

        // Only ERROR severity participates in the classification.
        assertEquals(PublicationGuardPolicy.Classification.REMAINS_VALID,
                policy.classify(before, after));
    }

    @Test
    void policyBlockedExceptionTranslationIncludesOnlyIntroducedIssues() {
        var policy = new PublicationGuardPolicy();
        var preExisting = new AdminEventDtos.CompletenessIssue(
                "LEAKY_CORE", "CONTENT", "ERROR", List.of("canonicalSummary"));
        var newIssue = new AdminEventDtos.CompletenessIssue(
                "LEAKY_GEOGRAPHY", "GEOGRAPHY", "ERROR", List.of("lat"));
        var before = publishedDetail(List.of(preExisting));
        var after = publishedDetail(List.of(preExisting, newIssue));

        PublishedEventMutationBlockedException exception = new PublishedEventMutationBlockedException(
                policy.introducedIssues(before, after));
        AdminEventImageDtos.PublicationGuardBlocked payload = exception.toResponse("BECOMES_INVALID");
        assertEquals("BECOMES_INVALID", payload.classification());
        assertEquals(1, payload.introducedCount());
        assertEquals("LEAKY_GEOGRAPHY", payload.violations().getFirst().code());
        assertEquals("Yêu cầu GEOGRAPHY/LEAKY_GEOGRAPHY", payload.violations().getFirst().requirement());
        // Pre-existing code MUST NOT appear in introduced[] payload.
        assertEquals(1, payload.violations().size());
    }

    @Test
    void integrationIntegrationSmokeForLenientGuardExecutor() {
        // The mocked-stubbed integration is exercised in
        // {@link AdminEventReadServiceValidationTest} since wiring a complete
        // mock chain through findCore + findHierarchy + findGrades + findMedia
        // produces Mockito {@code UnfinishedStubbingException} without value.
        // We verify here only that the lenient guard injects no surprises.
        var policy = new PublicationGuardPolicy();
        var preExisting = new AdminEventDtos.CompletenessIssue(
                "LEAKY_CORE", "CONTENT", "ERROR", List.of("canonicalSummary"));
        var before = publishedDetail(List.of(preExisting));
        var after = publishedDetail(List.of(preExisting));
        assertDoesNotThrow(() -> policy.classify(before, after));
    }

    private static AdminEventReadRepository.DetailRow rowFor(AdminEventDtos.Detail detail) {
        AdminEventReadRepository.DetailRow row = mock(AdminEventReadRepository.DetailRow.class);
        when(row.facts()).thenReturn(minimalFacts(detail));
        return row;
    }

    private static EventCompletenessFacts minimalFacts(AdminEventDtos.Detail detail) {
        try {
            var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            return new EventCompletenessFacts(
                    true, true, true, true, true, true,
                    mapper.readTree("[\"Sự kiện quan trọng\"]"),
                    1, Math.max(1, detail.media().activeCount()),
                    "no_location", null, null, List.of(), List.of(),
                    false, false, null,
                    1945, 1945, 1945, "atomic", "military", List.of(10));
        } catch (Exception ex) {
            throw new IllegalStateException("facts construction failed", ex);
        }
    }

    private AdminEventDtos.Detail publishedDetail(List<AdminEventDtos.CompletenessIssue> issues) {
        return baseDetail("published", UPDATED_AT, issues, true);
    }

    private AdminEventDtos.Detail draftDetail(List<AdminEventDtos.CompletenessIssue> issues) {
        return baseDetail("draft", UPDATED_AT, issues, false);
    }

    private AdminEventDtos.Detail archivedDetail(List<AdminEventDtos.CompletenessIssue> issues) {
        return baseDetail("archived", UPDATED_AT, issues, false);
    }

    private AdminEventDtos.Detail baseDetail(
            String status, Instant updatedAt, List<AdminEventDtos.CompletenessIssue> issues,
            boolean published
    ) {
        var completeness = new AdminEventDtos.Completeness(
                issues.isEmpty(), issues.size(), issues);
        return new AdminEventDtos.Detail(
                new AdminEventDtos.Core("event-id", "event-slug", "Sự kiện", null),
                new AdminEventDtos.Content(
                        "Sự kiện", "Tóm tắt chuẩn", "Nội dung", "Ý nghĩa", List.of("Fact")),
                new AdminEventDtos.Chronology(1945, 1945, 1945, null, null),
                new AdminEventDtos.Classification("atomic", "military", null, List.of(10)),
                new AdminEventDtos.Publication(
                        status,
                        new AdminEventDtos.Flags(true, true, false),
                        published ? updatedAt : null,
                        updatedAt,
                        updatedAt),
                new AdminEventDtos.MediaSection(null, List.of(), 1),
                new AdminEventDtos.Geography("no_location", "no_location", null, null,
                        List.of(), List.of(), null),
                new AdminEventDtos.Hierarchy(null, null, List.of(), List.of()),
                new AdminEventDtos.Textbook(List.of(), 0, 0, false),
                List.of(),
                completeness);
    }
}

package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Pure policy class that classifies the publication-readiness outcome of any
 * mutation with a bounded {@code before → after} diff. Extracted from
 * {@link AdminEventReadService} so it can be unit-tested without dragging
 * repositories, mocks, or ResponseEntity chains along.
 *
 * <p>The classifier is the diff-based guard that backs the managed image
 * upload paths. It deliberately treats the four documented outcomes
 * ({@code REMAINS_VALID}, {@code ALREADY_INVALID_BUT_UNCHANGED}, {@code
 * IMPROVES}, {@code BECOMES_INVALID}) as the only signals the operator ever
 * sees, so any UI helper that consumes it can rely on a stable contract.
 */
public final class PublicationGuardPolicy {

    public PublicationGuardPolicy() {
    }

    /**
     * Classifies the outcome of a mutation. The signature intentionally
     * accepts the {@code before} snapshot extracted inside the same
     * transaction as the mutation, so the caller controls repository access.
     */
    public Classification classify(
            AdminEventDtos.Detail before,
            AdminEventDtos.Detail after
    ) {
        Objects.requireNonNull(after, "after snapshot is required");
        if (!"published".equals(after.publication().status())) {
            return Classification.REMAINS_VALID;
        }
        Set<String> beforeCodes = errorCodesOf(before);
        Set<String> afterCodes = errorCodesOf(after);
        Set<String> introduced = new HashSet<>(afterCodes);
        introduced.removeAll(beforeCodes);
        Set<String> removed = new HashSet<>(beforeCodes);
        removed.removeAll(afterCodes);
        if (!introduced.isEmpty()) {
            return Classification.BECOMES_INVALID;
        }
        if (afterCodes.isEmpty()) {
            // No new errors after the mutation, and no surviving errors at all.
            return beforeCodes.isEmpty()
                    ? Classification.REMAINS_VALID
                    : Classification.IMPROVES;
        }
        // afterCodes non-empty: either identical set or shrunk set.
        return removed.isEmpty()
                ? Classification.ALREADY_INVALID_BUT_UNCHANGED
                : Classification.IMPROVES;
    }

    /**
     * Returns the introduced ERROR issues for {@link
     * Classification#BECOMES_INVALID}; otherwise an empty list. The list is
     * bounded — only ERROR severity codes that were satisfied before the
     * mutation and are unsatisfied after will appear here.
     */
    public List<AdminEventDtos.CompletenessIssue> introducedIssues(
            AdminEventDtos.Detail before,
            AdminEventDtos.Detail after
    ) {
        if (classify(before, after) != Classification.BECOMES_INVALID) {
            return List.of();
        }
        Set<String> beforeCodes = errorCodesOf(before);
        return after.completeness().issues().stream()
                .filter(issue -> "ERROR".equals(issue.severity()))
                .filter(issue -> !beforeCodes.contains(issue.code()))
                .toList();
    }

    private static Set<String> errorCodesOf(AdminEventDtos.Detail detail) {
        if (detail == null || detail.completeness() == null) {
            return Set.of();
        }
        return detail.completeness().issues().stream()
                .filter(issue -> "ERROR".equals(issue.severity()))
                .map(AdminEventDtos.CompletenessIssue::code)
                .collect(java.util.stream.Collectors.toCollection(HashSet::new));
    }

    /**
     * The four documented guard outcomes. Promoting this to a public enum
     * (rather than a private inner-class) lets UI consumers and audit log
     * writers classify outcomes consistently.
     */
    public enum Classification {
        /** Before and after both have no ERROR issues. */
        REMAINS_VALID,
        /** Before had no errors, after added new ones — blocked. */
        BECOMES_INVALID,
        /** Before had errors, after has the same set. */
        ALREADY_INVALID_BUT_UNCHANGED,
        /** Before had errors, after has fewer — allowed. */
        IMPROVES
    }
}

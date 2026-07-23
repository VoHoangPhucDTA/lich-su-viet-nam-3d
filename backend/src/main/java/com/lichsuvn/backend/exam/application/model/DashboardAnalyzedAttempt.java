package com.lichsuvn.backend.exam.application.model;

import com.lichsuvn.backend.exam.application.DashboardAnalyticsPolicy;
import com.lichsuvn.backend.exam.application.DashboardSnapshotV2Parser;

public record DashboardAnalyzedAttempt(
        DashboardAttemptRecord attempt,
        boolean summaryEligible,
        DashboardAnalyticsPolicy.AuthorityKind authorityKind,
        DashboardSnapshotV2Parser.ParseResult detail
) {}

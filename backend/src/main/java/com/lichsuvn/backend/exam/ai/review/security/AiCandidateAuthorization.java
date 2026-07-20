package com.lichsuvn.backend.exam.ai.review.security;

import com.lichsuvn.backend.auth.security.UserPrincipal;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

public final class AiCandidateAuthorization {
    private static final Set<AiCandidatePermission> TEACHER = EnumSet.of(
            AiCandidatePermission.AI_CANDIDATE_CREATE,
            AiCandidatePermission.AI_CANDIDATE_VIEW,
            AiCandidatePermission.AI_CANDIDATE_EDIT,
            AiCandidatePermission.AI_CANDIDATE_SUBMIT,
            AiCandidatePermission.AI_CANDIDATE_REVIEW,
            AiCandidatePermission.AI_CANDIDATE_AUDIT_VIEW
    );
    private static final Set<AiCandidatePermission> ADMIN = EnumSet.allOf(AiCandidatePermission.class);

    private AiCandidateAuthorization() {}

    public static Set<AiCandidatePermission> permissions(List<String> roles) {
        if (roles == null) return Set.of();
        if (roles.contains("admin")) return Set.copyOf(ADMIN);
        if (roles.contains("teacher")) return Set.copyOf(TEACHER);
        return Set.of();
    }

    public static boolean has(UserPrincipal principal, AiCandidatePermission permission) {
        return principal != null && principal.idBytes() != null && principal.idBytes().length == 16
                && permissions(principal.roles()).contains(permission);
    }

    public static boolean isAdmin(UserPrincipal principal) {
        return principal != null && principal.roles() != null && principal.roles().contains("admin");
    }

    public static List<String> names(List<String> roles) {
        return permissions(roles).stream().map(Enum::name).sorted().toList();
    }
}

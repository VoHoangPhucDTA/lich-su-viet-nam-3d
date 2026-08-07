package com.lichsuvn.backend.admin.api.dto;

import java.util.List;

public final class AdminUserMutationDtos {
    private AdminUserMutationDtos() {
    }

    public record ReplaceRoles(String expectedUpdatedAt, List<String> roles) {
    }

    public record ChangeStatus(String expectedUpdatedAt, String status) {
    }
}

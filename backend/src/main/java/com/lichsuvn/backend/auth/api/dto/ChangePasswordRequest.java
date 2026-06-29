package com.lichsuvn.backend.auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        @NotBlank @Size(max = 100) String oldPassword,
        @NotBlank @Size(max = 100) String newPassword
) {
}

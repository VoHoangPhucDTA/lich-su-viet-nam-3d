package com.lichsuvn.backend.auth.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(max = 100) String password,
        @Size(max = 255) String fullName,
        @Size(max = 20) String grade,
        @Size(max = 255) String school
) {
}

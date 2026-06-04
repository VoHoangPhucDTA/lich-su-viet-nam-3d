package com.lichsuvn.backend.auth.api.dto;

import jakarta.validation.constraints.Size;

/**
 * DTO nhận yêu cầu cập nhật thông tin cá nhân từ người dùng đang đăng nhập.
 * Tất cả trường đều optional — chỉ trường nào có giá trị mới được cập nhật.
 */
public record UpdateProfileRequest(

        @Size(max = 100, message = "Full name must not exceed 100 characters")
        String fullName,

        String grade,

        @Size(max = 200, message = "School name must not exceed 200 characters")
        String school,

        @Size(max = 500, message = "Avatar URL must not exceed 500 characters")
        String avatarUrl
) {}

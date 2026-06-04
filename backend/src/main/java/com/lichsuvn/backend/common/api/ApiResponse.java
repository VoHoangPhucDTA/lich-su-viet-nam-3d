package com.lichsuvn.backend.common.api;

import java.time.Instant;

/**
 * Response envelope chuẩn cho toàn bộ REST API.
 *
 * Mục tiêu:
 * - Frontend luôn đọc cùng một format: success/code/message/data/timestamp.
 * - Các module sau này như auth, progress, quiz, exam, RAG dùng chung cấu trúc.
 * - Không trả dữ liệu thô hoặc exception stack trace trực tiếp ra client.
 */
public record ApiResponse<T>(
        boolean success,
        String code,
        String message,
        T data,
        Instant timestamp
) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, "SUCCESS", "Success", data, Instant.now());
    }

    public static <T> ApiResponse<T> ok(T data, String message) {
        return new ApiResponse<>(true, "SUCCESS", message, data, Instant.now());
    }

    public static ApiResponse<ApiError> error(String code, String message, ApiError error) {
        return new ApiResponse<>(false, code, message, error, Instant.now());
    }
}

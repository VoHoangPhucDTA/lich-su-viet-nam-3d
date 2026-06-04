package com.lichsuvn.backend.common.api;

import java.util.List;

public record ApiError(
        String path,
        List<FieldViolation> violations
) {
    public static ApiError of(String path) {
        return new ApiError(path, List.of());
    }
}

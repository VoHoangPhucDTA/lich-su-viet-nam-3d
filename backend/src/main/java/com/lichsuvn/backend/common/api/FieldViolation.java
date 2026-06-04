package com.lichsuvn.backend.common.api;

public record FieldViolation(
        String field,
        String message
) {
}

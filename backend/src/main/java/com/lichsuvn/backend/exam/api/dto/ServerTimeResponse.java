package com.lichsuvn.backend.exam.api.dto;

public record ServerTimeResponse(
        long serverTime,
        String iso
) {
}

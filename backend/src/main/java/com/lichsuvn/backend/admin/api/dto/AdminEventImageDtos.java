package com.lichsuvn.backend.admin.api.dto;

public final class AdminEventImageDtos {
    private AdminEventImageDtos() {
    }

    public record UploadResponse(
            long mediaId,
            String updatedAt,
            AdminEventDtos.Detail event
    ) {
    }
}

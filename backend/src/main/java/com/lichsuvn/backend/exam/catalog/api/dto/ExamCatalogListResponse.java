package com.lichsuvn.backend.exam.catalog.api.dto;

import java.util.List;

public record ExamCatalogListResponse(
        String datasetVersion,
        String view,
        int total,
        List<ExamCatalogItemResponse> items
) {
}

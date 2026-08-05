package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;

import java.util.List;

public class EventPublishBlockedException extends ApiException {
    private final List<AdminEventDtos.CompletenessIssue> issues;

    public EventPublishBlockedException(List<AdminEventDtos.CompletenessIssue> issues) {
        super(HttpStatus.CONFLICT, "EVENT_PUBLISH_BLOCKED",
                "Event is not ready for publication");
        this.issues = List.copyOf(issues);
    }

    public List<AdminEventDtos.CompletenessIssue> getIssues() {
        return issues;
    }
}

package com.lichsuvn.backend.exam.ai.review.api;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.api.ApiResponse;
import com.lichsuvn.backend.exam.ai.review.application.AiCandidateService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.List;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/exams/ai/candidates")
public class AiCandidateController {
    private final AiCandidateService service;
    public AiCandidateController(AiCandidateService service) { this.service = service; }

    @PostMapping
    @PreAuthorize("hasAuthority('AI_CANDIDATE_CREATE')")
    public ApiResponse<List<AiCandidateDtos.Detail>> create(@Valid @RequestBody AiCandidateDtos.CreateRequest request, @AuthenticationPrincipal UserPrincipal principal) {
        return ApiResponse.ok(service.create(request, principal), "AI candidates saved as drafts");
    }
    @GetMapping
    @PreAuthorize("hasAuthority('AI_CANDIDATE_VIEW')")
    public ApiResponse<AiCandidateDtos.Page> list(@RequestParam(required = false) String status,
            @RequestParam(required = false) String difficulty, @RequestParam(required = false) Integer grade,
            @RequestParam(required = false) Integer lessonNumber, @RequestParam(required = false) String createdBy,
            @RequestParam(required = false) String reviewedBy, @RequestParam(required = false, name = "q") String search,
            @RequestParam(required = false) LocalDateTime createdFrom, @RequestParam(required = false) LocalDateTime createdTo,
            @RequestParam(required = false) Integer limit, @RequestParam(required = false) Integer offset,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ApiResponse.ok(service.list(status, difficulty, grade, lessonNumber, createdBy, reviewedBy, search,
                createdFrom, createdTo, limit, offset, principal));
    }
    @GetMapping("/publish-targets") @PreAuthorize("hasAuthority('AI_CANDIDATE_PUBLISH')") public ApiResponse<List<AiCandidateDtos.PublishTarget>> publishTargets(@AuthenticationPrincipal UserPrincipal principal) { return ApiResponse.ok(service.publishTargets(principal)); }
    @GetMapping("/{id}") @PreAuthorize("hasAuthority('AI_CANDIDATE_VIEW')") public ApiResponse<AiCandidateDtos.Detail> detail(@PathVariable String id, @AuthenticationPrincipal UserPrincipal principal) { return ApiResponse.ok(service.detail(id, principal)); }
    @PutMapping("/{id}") @PreAuthorize("hasAuthority('AI_CANDIDATE_EDIT')") public ApiResponse<AiCandidateDtos.Detail> update(@PathVariable String id, @Valid @RequestBody AiCandidateDtos.UpdateRequest request, @AuthenticationPrincipal UserPrincipal principal) { return ApiResponse.ok(service.update(id, request, principal)); }
    @PostMapping("/{id}/submit") @PreAuthorize("hasAuthority('AI_CANDIDATE_SUBMIT')") public ApiResponse<AiCandidateDtos.Detail> submit(@PathVariable String id, @Valid @RequestBody AiCandidateDtos.VersionRequest request, @AuthenticationPrincipal UserPrincipal principal) { return ApiResponse.ok(service.submit(id, request, principal)); }
    @PostMapping("/{id}/approve") @PreAuthorize("hasAuthority('AI_CANDIDATE_REVIEW')") public ApiResponse<AiCandidateDtos.Detail> approve(@PathVariable String id, @Valid @RequestBody AiCandidateDtos.ApproveRequest request, @AuthenticationPrincipal UserPrincipal principal) { return ApiResponse.ok(service.approve(id, request, principal)); }
    @PostMapping("/{id}/reject") @PreAuthorize("hasAuthority('AI_CANDIDATE_REVIEW')") public ApiResponse<AiCandidateDtos.Detail> reject(@PathVariable String id, @Valid @RequestBody AiCandidateDtos.RejectRequest request, @AuthenticationPrincipal UserPrincipal principal) { return ApiResponse.ok(service.reject(id, request, principal)); }
    @PostMapping("/{id}/publish") @PreAuthorize("hasAuthority('AI_CANDIDATE_PUBLISH')") public ApiResponse<AiCandidateDtos.Detail> publish(@PathVariable String id, @Valid @RequestBody AiCandidateDtos.PublishRequest request, @AuthenticationPrincipal UserPrincipal principal) { return ApiResponse.ok(service.publish(id, request, principal)); }
    @PostMapping("/{id}/revisions") @PreAuthorize("hasAuthority('AI_CANDIDATE_CREATE')") public ApiResponse<AiCandidateDtos.Detail> createRevision(@PathVariable String id, @Valid @RequestBody AiCandidateDtos.RevisionCreateRequest request, @AuthenticationPrincipal UserPrincipal principal) { return ApiResponse.ok(service.createRevision(id, request, principal), "Revision candidate created"); }
    @PostMapping("/{id}/source-search") @PreAuthorize("hasAuthority('AI_CANDIDATE_EDIT')") public ApiResponse<List<AiCandidateDtos.SourceSearchResult>> sourceSearch(@PathVariable String id, @Valid @RequestBody AiCandidateDtos.SourceSearchRequest request, @AuthenticationPrincipal UserPrincipal principal) { return ApiResponse.ok(service.sourceSearch(id, request, principal)); }
    @PutMapping("/{id}/sources") @PreAuthorize("hasAuthority('AI_CANDIDATE_EDIT')") public ApiResponse<AiCandidateDtos.Detail> remapSources(@PathVariable String id, @Valid @RequestBody AiCandidateDtos.SourceRemapRequest request, @AuthenticationPrincipal UserPrincipal principal) { return ApiResponse.ok(service.remapSources(id, request, principal)); }
    @GetMapping("/{id}/audit") @PreAuthorize("hasAuthority('AI_CANDIDATE_AUDIT_VIEW')") public ApiResponse<List<AiCandidateDtos.AuditEvent>> audit(@PathVariable String id, @AuthenticationPrincipal UserPrincipal principal) { return ApiResponse.ok(service.audit(id, principal)); }
}

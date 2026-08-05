package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventImageDtos;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;

import java.util.List;

/**
 * Raised by the diff-based publication guard used by managed image upload paths
 * (gallery upload, thumbnail upload, thumbnail replacement, managed image removal)
 * when a mutation is about to introduce a new ERROR-severity completeness issue
 * for a published event. Pre-existing issues do NOT cause this exception — the
 * guard only blocks the {@code satisfied → unsatisfied} regression.
 *
 * <p>The exception intentionally carries only the bounded violation list that
 * the Admin UI needs to display a friendly Vietnamese message. It never leaks
 * narrative content, secrets, raw payloads, or the before/after snapshots.
 */
public class PublishedEventMutationBlockedException extends ApiException {
    private final List<AdminEventDtos.CompletenessIssue> introduced;

    public PublishedEventMutationBlockedException(
            List<AdminEventDtos.CompletenessIssue> introduced
    ) {
        super(
                HttpStatus.CONFLICT,
                "PUBLISHED_EVENT_WOULD_BECOME_INVALID",
                "Sự kiện đang xuất bản chưa đáp ứng điều kiện cần thiết. Hãy gỡ xuất bản trước khi thay đổi."
        );
        this.introduced = List.copyOf(introduced);
    }

    /**
     * Issues introduced by this mutation only. {@link #introduced} excludes any
     * ERROR that was already present before the mutation ran, so the Admin UI
     * can show a focused "what changed" list instead of a noisy duplicate.
     */
    public List<AdminEventDtos.CompletenessIssue> introduced() {
        return introduced;
    }

    /**
     * Converts the bounded introduced list into a safe payload for the response
     * envelope. Mapping rules:
     * <ul>
     *   <li>{@code section} → stable enum-style string from the issue (e.g. CONTENT)</li>
     *   <li>{@code code} → bounded machine code from completeness (e.g. MISSING_CORE_CONTENT)</li>
     *   <li>{@code requirement} → human-readable Vietnamese label for the code</li>
     *   <li>{@code reason} → issue code (safe, never raw narrative)</li>
     *   <li>{@code fields} → field names only</li>
     * </ul>
     */
    public AdminEventImageDtos.PublicationGuardBlocked toResponse(String classification) {
        List<AdminEventImageDtos.PublicationGuardViolation> mapped = introduced.stream()
                .map(issue -> new AdminEventImageDtos.PublicationGuardViolation(
                        issue.section(),
                        issue.code(),
                        requirementLabel(issue.code(), issue.section()),
                        issue.code(),
                        issue.fields()))
                .toList();
        return new AdminEventImageDtos.PublicationGuardBlocked(
                classification,
                mapped.size(),
                mapped);
    }

    /**
     * Stable Vietnamese labels for the well-known completeness codes. Anything
     * that falls outside the allow-list falls back to the code itself, so the
     * UI never echoes unsanitised narrative data back to the operator.
     */
    static String requirementLabel(String code, String section) {
        if (code == null) {
            return "Điều kiện xuất bản không xác định";
        }
        return switch (code) {
            case "MISSING_CORE_CONTENT" -> "Thiếu nội dung cốt lõi (tiêu đề, tóm tắt, nội dung, key facts)";
            case "INVALID_CORE_CONTENT" -> "Nội dung cốt lõi không hợp lệ (key facts)";
            case "MISSING_THUMBNAIL" -> "Thiếu ảnh đại diện";
            case "INVALID_THUMBNAIL" -> "Ảnh đại diện có cấu hình không hợp lệ";
            case "MISSING_ACTIVE_MEDIA" -> "Thiếu media đang hoạt động";
            case "MISSING_GEOGRAPHY" -> "Thiếu dữ liệu địa lý";
            case "INVALID_GEOGRAPHY" -> "Dữ liệu địa lý không hợp lệ";
            case "MISSING_MAP_DATA" -> "Thiếu dữ liệu bản đồ";
            case "INVALID_MAP_DATA" -> "Dữ liệu bản đồ không hợp lệ";
            case "INVALID_CHRONOLOGY" -> "Niên đại sự kiện không hợp lệ";
            case "INVALID_CLASSIFICATION" -> "Phân loại sự kiện không hợp lệ";
            case "MISSING_GRADES" -> "Thiếu khối lớp cho sự kiện";
            case "INVALID_GRADES" -> "Khối lớp không hợp lệ";
            default -> "Yêu cầu " + section + "/" + code;
        };
    }
}

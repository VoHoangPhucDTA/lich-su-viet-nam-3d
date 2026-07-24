package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.admin.api.dto.AdminDashboardDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminDashboardReadRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventReadRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AdminDashboardReadService {
    private static final int ATTENTION_LIMIT = 10;
    private static final int AUDIT_LIMIT = 10;

    private final AdminEventReadRepository eventRepository;
    private final AdminDashboardReadRepository dashboardRepository;
    private final EventCompletenessService completenessService;

    public AdminDashboardReadService(
            AdminEventReadRepository eventRepository,
            AdminDashboardReadRepository dashboardRepository,
            EventCompletenessService completenessService
    ) {
        this.eventRepository = eventRepository;
        this.dashboardRepository = dashboardRepository;
        this.completenessService = completenessService;
    }

    public AdminDashboardDtos.Dashboard findDashboard() {
        EventSnapshot snapshot = loadEventSnapshot();
        return new AdminDashboardDtos.Dashboard(
                metrics(snapshot),
                attention(snapshot),
                dashboardRepository.findRecentAudit(AUDIT_LIMIT)
        );
    }

    public AdminDashboardDtos.Metrics findMetrics() {
        return metrics(loadEventSnapshot());
    }

    public List<AdminDashboardDtos.AttentionEvent> findAttention() {
        return attention(loadEventSnapshot());
    }

    public List<AdminDashboardDtos.AuditEntry> findRecentAudit() {
        return dashboardRepository.findRecentAudit(AUDIT_LIMIT);
    }

    private EventSnapshot loadEventSnapshot() {
        List<AdminEventReadRepository.ListRow> rows = eventRepository.findDashboardRows();
        Map<String, List<Integer>> grades = eventRepository.findGrades(
                rows.stream().map(AdminEventReadRepository.ListRow::id).toList());
        Map<String, AssessedEvent> unique = new LinkedHashMap<>();
        for (AdminEventReadRepository.ListRow row : rows) {
            EventCompletenessFacts facts = row.facts()
                    .withGrades(grades.getOrDefault(row.id(), List.of()));
            EventCompletenessService.Assessment assessment = completenessService.assess(facts);
            unique.putIfAbsent(row.id(), new AssessedEvent(row, assessment));
        }
        return new EventSnapshot(List.copyOf(unique.values()));
    }

    private AdminDashboardDtos.Metrics metrics(EventSnapshot snapshot) {
        long published = countStatus(snapshot, "published");
        long draft = countStatus(snapshot, "draft");
        long archived = countStatus(snapshot, "archived");
        long missingThumbnail = countIssue(snapshot, "MISSING_THUMBNAIL");
        long missingMedia = countIssue(snapshot, "MISSING_ACTIVE_MEDIA");
        long mapDataIssues = snapshot.events().stream()
                .filter(event -> hasIssue(event, "MISSING_MAP_DATA")
                        || hasIssue(event, "INVALID_MAP_DATA"))
                .count();
        long incomplete = snapshot.events().stream()
                .filter(event -> !event.assessment().completeness().complete())
                .count();
        return new AdminDashboardDtos.Metrics(
                new AdminDashboardDtos.EventMetrics(
                        snapshot.events().size(), published, draft, archived,
                        missingThumbnail, missingMedia, mapDataIssues, incomplete
                ),
                dashboardRepository.findUserMetrics()
        );
    }

    private List<AdminDashboardDtos.AttentionEvent> attention(EventSnapshot snapshot) {
        List<AssessedEvent> candidates = new ArrayList<>(snapshot.events().stream()
                .filter(event -> !"archived".equals(event.row().status()))
                .filter(event -> !event.assessment().completeness().complete())
                .toList());
        candidates.sort(Comparator
                .comparingInt(this::statusPriority)
                .thenComparingInt(this::severityPriority)
                .thenComparing(Comparator.comparingInt(this::issueCount).reversed())
                .thenComparing(this::updatedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(event -> event.row().id()));
        return candidates.stream().limit(ATTENTION_LIMIT).map(this::attentionItem).toList();
    }

    private AdminDashboardDtos.AttentionEvent attentionItem(AssessedEvent event) {
        AdminEventDtos.Completeness completeness = event.assessment().completeness();
        String reasonCode = completeness.issues().stream()
                .filter(issue -> "ERROR".equals(issue.severity()))
                .findFirst()
                .or(() -> completeness.issues().stream().findFirst())
                .map(AdminEventDtos.CompletenessIssue::code)
                .orElse("COMPLETENESS_REVIEW");
        return new AdminDashboardDtos.AttentionEvent(
                event.row().id(), event.row().title(), event.row().chronology(),
                event.row().status(), event.row().thumbnail(), completeness,
                event.row().updatedAt(), reasonCode,
                recommendedFilter(reasonCode, event.row().status())
        );
    }

    private String recommendedFilter(String reasonCode, String status) {
        return switch (reasonCode) {
            case "MISSING_THUMBNAIL" -> "missingThumbnail=true";
            case "MISSING_ACTIVE_MEDIA" -> "missingMedia=true";
            case "MISSING_MAP_DATA" -> "missingMapData=true";
            default -> "status=" + status;
        };
    }

    private long countStatus(EventSnapshot snapshot, String status) {
        return snapshot.events().stream().filter(event -> status.equals(event.row().status())).count();
    }

    private long countIssue(EventSnapshot snapshot, String code) {
        return snapshot.events().stream().filter(event -> hasIssue(event, code)).count();
    }

    private boolean hasIssue(AssessedEvent event, String code) {
        return event.assessment().completeness().issues().stream()
                .anyMatch(issue -> code.equals(issue.code()));
    }

    private int statusPriority(AssessedEvent event) {
        return "published".equals(event.row().status()) ? 0 : 1;
    }

    private int severityPriority(AssessedEvent event) {
        return event.assessment().completeness().issues().stream()
                .anyMatch(issue -> "ERROR".equals(issue.severity())) ? 0 : 1;
    }

    private int issueCount(AssessedEvent event) {
        return event.assessment().completeness().issueCount();
    }

    private Instant updatedAt(AssessedEvent event) {
        return event.row().updatedAt();
    }

    private record AssessedEvent(
            AdminEventReadRepository.ListRow row,
            EventCompletenessService.Assessment assessment
    ) {
    }

    private record EventSnapshot(List<AssessedEvent> events) {
    }
}

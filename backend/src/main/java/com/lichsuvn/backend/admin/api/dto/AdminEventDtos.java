package com.lichsuvn.backend.admin.api.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class AdminEventDtos {
    private AdminEventDtos() {
    }

    public record Page(List<ListItem> items, int count, long total, int limit, int offset) {
    }

    public record ListItem(
            String id,
            String slug,
            String title,
            String shortTitle,
            String eventLevel,
            String eventType,
            String eventSubtype,
            Chronology chronology,
            String cardSummary,
            String status,
            List<Integer> grades,
            String normalizedGeoType,
            String canonicalGeoType,
            Thumbnail thumbnail,
            int activeMediaCount,
            Flags flags,
            Completeness completeness,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record Detail(
            Core core,
            Content content,
            Chronology chronology,
            Classification classification,
            Publication publication,
            MediaSection media,
            Geography geography,
            Hierarchy hierarchy,
            Textbook textbook,
            List<ExternalSource> externalSources,
            Completeness completeness
    ) {
    }

    public record Core(String id, String slug, String title, String shortTitle) {
    }

    public record Content(
            String cardSummary,
            String canonicalSummary,
            String detailedNarrative,
            String significance,
            List<String> keyFacts
    ) {
    }

    public record Chronology(
            Integer startYear,
            Integer endYear,
            Integer effectiveEndYear,
            String displayDate,
            String datePrecision
    ) {
    }

    public record Classification(
            String eventLevel,
            String eventType,
            String eventSubtype,
            List<Integer> grades
    ) {
    }

    public record Publication(
            String status,
            Flags flags,
            Instant publishedAt,
            Instant createdAt,
            @JsonFormat(
                    shape = JsonFormat.Shape.STRING,
                    pattern = "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'",
                    timezone = "UTC")
            Instant updatedAt
    ) {
    }

    public record Flags(boolean showOnHomepage, boolean showOnTimeline, boolean featured) {
    }

    public record Thumbnail(Long id, String url, String altText) {
    }

    public record MediaSection(Thumbnail thumbnail, List<Media> items, int activeCount) {
    }

    public record Media(
            Long id,
            String mediaType,
            String url,
            boolean urlSafe,
            String caption,
            String altText,
            String sourceName,
            String license,
            String storageType,
            boolean thumbnail,
            int sortOrder,
            String status,
            Instant createdAt
    ) {
    }

    public record Geography(
            String normalizedGeoType,
            String canonicalGeoType,
            BigDecimal lat,
            BigDecimal lng,
            List<String> provinceNames,
            List<String> historicalLocations,
            MapData mapData
    ) {
    }

    public record MapData(
            String geoType,
            Marker marker,
            List<Marker> markers,
            List<String> provinceNames,
            List<String> historicalLocations,
            List<String> gadmRefs,
            DisplayGeometry displayGeometry,
            FocusGeometry focusGeometry
    ) {
    }

    public record Marker(String name, String label, BigDecimal lat, BigDecimal lng, BigDecimal confidence) {
    }

    public record DisplayGeometry(
            String geoType,
            Marker marker,
            List<String> provinceNames,
            List<String> historicalLocations
    ) {
    }

    public record FocusGeometry(String mode, BigDecimal zoom, Point center, List<String> provinceNames) {
    }

    public record Point(BigDecimal lat, BigDecimal lng) {
    }

    public record Hierarchy(
            EventLink parent,
            EventLink root,
            List<EventLink> children,
            List<Relation> relations
    ) {
    }

    public record EventLink(
            String id,
            String slug,
            String title,
            String status,
            String eventLevel,
            Integer startYear,
            Integer endYear
    ) {
    }

    public record Relation(
            String associationType,
            String relationType,
            int sortOrder,
            EventLink event
    ) {
    }

    public record Textbook(
            List<TextbookReference> visibleReferences,
            int totalReferenceCount,
            int visibleReferenceCount,
            boolean hasTextbookContent
    ) {
    }

    public record TextbookReference(
            Long id,
            Integer grade,
            String book,
            String theme,
            String lesson,
            Integer pageStart,
            Integer pageEnd,
            String excerpt,
            String url
    ) {
    }

    public record ExternalSource(
            String sourceType,
            String title,
            String canonicalUri,
            String externalId,
            String language,
            int sourceOrder,
            String matchType,
            boolean primary,
            String verificationStatus
    ) {
    }

    public record Completeness(boolean complete, int issueCount, List<CompletenessIssue> issues) {
    }

    public record CompletenessIssue(
            String code,
            String section,
            String severity,
            List<String> fields
    ) {
    }
}

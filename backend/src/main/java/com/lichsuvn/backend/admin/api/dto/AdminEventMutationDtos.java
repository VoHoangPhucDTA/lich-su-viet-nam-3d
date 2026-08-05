package com.lichsuvn.backend.admin.api.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Typed, allow-listed mutation contracts. Patch uses setter presence tracking so
 * omitted values are not confused with explicit nulls.
 */
public final class AdminEventMutationDtos {
    private AdminEventMutationDtos() {
    }

    public record Create(
            @NotBlank @Size(max = 500) String title,
            @NotBlank @Size(max = 180) String slug,
            @Size(max = 255) String shortTitle,
            @NotBlank String eventLevel,
            @NotBlank String eventType,
            @Size(max = 120) String eventSubtype,
            Integer startYear,
            Integer endYear,
            Integer effectiveEndYear,
            @Size(max = 120) String displayDate,
            @Size(max = 40) String datePrecision,
            @Size(max = 1000) String cardSummary,
            @Size(max = 20000) String canonicalSummary,
            @Size(max = 100000) String detailedNarrative,
            @Size(max = 20000) String significance,
            @Valid @NotNull @Size(max = 20) List<@NotBlank @Size(max = 500) String> keyFacts,
            @NotNull @Size(max = 3) List<@NotNull Integer> grades,
            Boolean showOnHomepage,
            Boolean showOnTimeline,
            Boolean featured
    ) {
    }

    public static final class CorePatch {
        private String expectedUpdatedAt;
        private String title;
        private String slug;
        private String shortTitle;
        private String eventLevel;
        private String eventType;
        private String eventSubtype;
        private Integer startYear;
        private Integer endYear;
        private Integer effectiveEndYear;
        private String displayDate;
        private String datePrecision;
        private String cardSummary;
        private String canonicalSummary;
        private String detailedNarrative;
        private String significance;
        private List<String> keyFacts;
        private Boolean showOnHomepage;
        private Boolean showOnTimeline;
        private Boolean featured;
        @JsonIgnore
        private final Set<String> present = new LinkedHashSet<>();
        @JsonIgnore
        private final Set<String> unsupported = new LinkedHashSet<>();

        @JsonProperty("expectedUpdatedAt")
        public void setExpectedUpdatedAt(String value) { expectedUpdatedAt = value; present.add("expectedUpdatedAt"); }
        public void setTitle(String value) { title = value; present.add("title"); }
        public void setSlug(String value) { slug = value; present.add("slug"); }
        public void setShortTitle(String value) { shortTitle = value; present.add("shortTitle"); }
        public void setEventLevel(String value) { eventLevel = value; present.add("eventLevel"); }
        public void setEventType(String value) { eventType = value; present.add("eventType"); }
        public void setEventSubtype(String value) { eventSubtype = value; present.add("eventSubtype"); }
        public void setStartYear(Integer value) { startYear = value; present.add("startYear"); }
        public void setEndYear(Integer value) { endYear = value; present.add("endYear"); }
        public void setEffectiveEndYear(Integer value) { effectiveEndYear = value; present.add("effectiveEndYear"); }
        public void setDisplayDate(String value) { displayDate = value; present.add("displayDate"); }
        public void setDatePrecision(String value) { datePrecision = value; present.add("datePrecision"); }
        public void setCardSummary(String value) { cardSummary = value; present.add("cardSummary"); }
        public void setCanonicalSummary(String value) { canonicalSummary = value; present.add("canonicalSummary"); }
        public void setDetailedNarrative(String value) { detailedNarrative = value; present.add("detailedNarrative"); }
        public void setSignificance(String value) { significance = value; present.add("significance"); }
        public void setKeyFacts(List<String> value) { keyFacts = value; present.add("keyFacts"); }
        public void setShowOnHomepage(Boolean value) { showOnHomepage = value; present.add("showOnHomepage"); }
        public void setShowOnTimeline(Boolean value) { showOnTimeline = value; present.add("showOnTimeline"); }
        public void setFeatured(Boolean value) { featured = value; present.add("featured"); }

        @JsonAnySetter
        public void unsupported(String name, Object ignored) { unsupported.add(name); }

        public String expectedUpdatedAt() { return expectedUpdatedAt; }
        public Set<String> present() { return Set.copyOf(present); }
        public Set<String> unsupported() { return Set.copyOf(unsupported); }
        public String title() { return title; }
        public String slug() { return slug; }
        public String shortTitle() { return shortTitle; }
        public String eventLevel() { return eventLevel; }
        public String eventType() { return eventType; }
        public String eventSubtype() { return eventSubtype; }
        public Integer startYear() { return startYear; }
        public Integer endYear() { return endYear; }
        public Integer effectiveEndYear() { return effectiveEndYear; }
        public String displayDate() { return displayDate; }
        public String datePrecision() { return datePrecision; }
        public String cardSummary() { return cardSummary; }
        public String canonicalSummary() { return canonicalSummary; }
        public String detailedNarrative() { return detailedNarrative; }
        public String significance() { return significance; }
        public List<String> keyFacts() { return keyFacts; }
        public Boolean showOnHomepage() { return showOnHomepage; }
        public Boolean showOnTimeline() { return showOnTimeline; }
        public Boolean featured() { return featured; }
    }

    public record Grades(
            @NotBlank String expectedUpdatedAt,
            @NotNull @Size(max = 3) List<@NotNull Integer> grades
    ) {
    }
}

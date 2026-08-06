package com.lichsuvn.backend.admin.api.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class AdminEventMediaMutationDtos {
    private AdminEventMediaMutationDtos() {
    }

    public static final class Create {
        @NotBlank private String expectedUpdatedAt;
        @NotBlank private String mediaType;
        @NotBlank @Size(max = 1000) private String url;
        @Size(max = 1000) private String caption;
        @Size(max = 500) private String altText;
        @Size(max = 255) private String sourceName;
        @Size(max = 255) private String license;
        private String status;
        @JsonIgnore
        private final Set<String> unsupported = new LinkedHashSet<>();

        public Create() {
        }

        public Create(
                String expectedUpdatedAt, String mediaType, String url, String caption,
                String altText, String sourceName, String license, String status
        ) {
            this.expectedUpdatedAt = expectedUpdatedAt;
            this.mediaType = mediaType;
            this.url = url;
            this.caption = caption;
            this.altText = altText;
            this.sourceName = sourceName;
            this.license = license;
            this.status = status;
        }

        @JsonAnySetter
        public void unsupported(String name, Object ignored) { unsupported.add(name); }
        public Set<String> unsupported() { return Set.copyOf(unsupported); }

        public String expectedUpdatedAt() { return expectedUpdatedAt; }
        public void setExpectedUpdatedAt(String value) { expectedUpdatedAt = value; }
        public String mediaType() { return mediaType; }
        public void setMediaType(String value) { mediaType = value; }
        public String url() { return url; }
        public void setUrl(String value) { url = value; }
        public String caption() { return caption; }
        public void setCaption(String value) { caption = value; }
        public String altText() { return altText; }
        public void setAltText(String value) { altText = value; }
        public String sourceName() { return sourceName; }
        public void setSourceName(String value) { sourceName = value; }
        public String license() { return license; }
        public void setLicense(String value) { license = value; }
        public String status() { return status; }
        public void setStatus(String value) { status = value; }
    }

    public static final class Patch {
        @NotBlank private String expectedUpdatedAt;
        private String mediaType;
        @Size(max = 1000) private String url;
        @Size(max = 1000) private String caption;
        @Size(max = 500) private String altText;
        @Size(max = 255) private String sourceName;
        @Size(max = 255) private String license;
        private String status;
        @JsonIgnore
        private final Set<String> present = new LinkedHashSet<>();
        @JsonIgnore
        private final Set<String> unsupported = new LinkedHashSet<>();

        @JsonProperty("expectedUpdatedAt")
        public void setExpectedUpdatedAt(String value) { expectedUpdatedAt = value; present.add("expectedUpdatedAt"); }
        public void setMediaType(String value) { mediaType = value; present.add("mediaType"); }
        public void setUrl(String value) { url = value; present.add("url"); }
        public void setCaption(String value) { caption = value; present.add("caption"); }
        public void setAltText(String value) { altText = value; present.add("altText"); }
        public void setSourceName(String value) { sourceName = value; present.add("sourceName"); }
        public void setLicense(String value) { license = value; present.add("license"); }
        public void setStatus(String value) { status = value; present.add("status"); }

        @JsonAnySetter
        public void unsupported(String name, Object ignored) {
            unsupported.add(name);
        }

        public Set<String> present() { return Set.copyOf(present); }
        public Set<String> unsupported() { return Set.copyOf(unsupported); }
        public String expectedUpdatedAt() { return expectedUpdatedAt; }
        public String mediaType() { return mediaType; }
        public String url() { return url; }
        public String caption() { return caption; }
        public String altText() { return altText; }
        public String sourceName() { return sourceName; }
        public String license() { return license; }
        public String status() { return status; }
    }

    public static final class Version {
        @NotBlank private String expectedUpdatedAt;
        @JsonIgnore
        private final Set<String> unsupported = new LinkedHashSet<>();

        public Version() {
        }

        public Version(String expectedUpdatedAt) {
            this.expectedUpdatedAt = expectedUpdatedAt;
        }

        public String expectedUpdatedAt() { return expectedUpdatedAt; }
        public void setExpectedUpdatedAt(String value) { expectedUpdatedAt = value; }
        @JsonAnySetter public void unsupported(String name, Object ignored) { unsupported.add(name); }
        public Set<String> unsupported() { return Set.copyOf(unsupported); }
    }

    public static final class Order {
        @NotBlank private String expectedUpdatedAt;
        @NotNull @Size(max = 200) private List<Long> mediaIds;
        @JsonIgnore
        private final Set<String> unsupported = new LinkedHashSet<>();

        public Order() {
        }

        public Order(String expectedUpdatedAt, List<Long> mediaIds) {
            this.expectedUpdatedAt = expectedUpdatedAt;
            this.mediaIds = mediaIds;
        }

        public String expectedUpdatedAt() { return expectedUpdatedAt; }
        public void setExpectedUpdatedAt(String value) { expectedUpdatedAt = value; }
        public List<Long> mediaIds() { return mediaIds; }
        public void setMediaIds(List<Long> value) { mediaIds = value; }
        @JsonAnySetter public void unsupported(String name, Object ignored) { unsupported.add(name); }
        public Set<String> unsupported() { return Set.copyOf(unsupported); }
    }
}

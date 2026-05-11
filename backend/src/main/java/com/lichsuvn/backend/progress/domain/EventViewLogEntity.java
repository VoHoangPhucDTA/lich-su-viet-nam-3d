package com.lichsuvn.backend.progress.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "event_view_logs")
public class EventViewLogEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, columnDefinition = "BINARY(16)")
    private byte[] userId;

    @Column(name = "event_id", nullable = false)
    private String eventId;

    @Column(name = "viewed_at", insertable = false, updatable = false)
    private Instant viewedAt;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "progress_percent")
    private Byte progressPercent;

    @Column(name = "source")
    private String source;

    @Column(name = "created_date", nullable = false)
    private LocalDate createdDate;

    public void setUserId(byte[] userId) {
        this.userId = userId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public void setDurationSeconds(Integer durationSeconds) {
        this.durationSeconds = durationSeconds;
    }

    public void setProgressPercent(Integer progressPercent) {
        this.progressPercent = progressPercent == null ? null : progressPercent.byteValue();
    }

    public void setSource(String source) {
        this.source = source;
    }

    public void setCreatedDate(LocalDate createdDate) {
        this.createdDate = createdDate;
    }
}

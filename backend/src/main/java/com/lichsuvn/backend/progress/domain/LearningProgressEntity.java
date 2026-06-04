package com.lichsuvn.backend.progress.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "learning_progress")
public class LearningProgressEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, columnDefinition = "BINARY(16)")
    private byte[] userId;

    @Column(name = "scope_type", nullable = false)
    private String scopeType;

    @Column(name = "scope_id", nullable = false)
    private String scopeId;

    @Column(name = "events_viewed", nullable = false)
    private Integer eventsViewed;

    @Column(name = "total_minutes", nullable = false)
    private Integer totalMinutes;

    @Column(name = "last_activity_at")
    private Instant lastActivityAt;

    public Integer getEventsViewed() {
        return eventsViewed;
    }

    public Integer getTotalMinutes() {
        return totalMinutes;
    }

    public Instant getLastActivityAt() {
        return lastActivityAt;
    }
}

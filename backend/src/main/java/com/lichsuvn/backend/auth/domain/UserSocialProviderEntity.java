package com.lichsuvn.backend.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Maps a social-login identity (Google sub / Facebook id) to a UserEntity.
 * One user can have multiple linked providers; one provider identity belongs to at most one user.
 * Schema: V10__social_auth.sql
 */
@Entity
@Table(name = "user_social_providers")
public class UserSocialProviderEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The owning user account. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    /** Provider name: "google" | "facebook" */
    @Column(name = "provider", nullable = false, length = 20)
    private String provider;

    /** Immutable identity from provider — Google "sub", Facebook numeric id. */
    @Column(name = "provider_id", nullable = false, length = 255)
    private String providerId;

    /** Email as returned by provider at link time (audit trail only — not used for auth lookup). */
    @Column(name = "email", length = 255)
    private String email;

    /** Full name from provider at link time. */
    @Column(name = "display_name", length = 255)
    private String displayName;

    /** Profile picture URL from provider at link time. */
    @Column(name = "avatar_url", length = 1000)
    private String avatarUrl;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    // ── Getters & setters ──────────────────────────────────────────────────

    public Long getId() { return id; }

    public UserEntity getUser() { return user; }
    public void setUser(UserEntity user) { this.user = user; }

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }

    public String getProviderId() { return providerId; }
    public void setProviderId(String providerId) { this.providerId = providerId; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }

    public Instant getCreatedAt() { return createdAt; }
}

package com.lichsuvn.backend.exam.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "exam_v2_attempts")
public class ExamAttemptEntity {
    @Id
    @Column(name = "id", nullable = false, columnDefinition = "BINARY(16)")
    private byte[] id;

    @Column(name = "user_id", nullable = false, columnDefinition = "BINARY(16)")
    private byte[] userId;

    @Column(name = "session_id", nullable = false, length = 120)
    private String sessionId;

    @Column(name = "mode", nullable = false, length = 40)
    private String mode;

    @Column(name = "exam_id")
    private String examId;

    @Column(name = "title", length = 500)
    private String title;

    @Column(name = "is_custom", nullable = false)
    private boolean custom;

    @Lob
    @Column(name = "source_exam_ids_json", columnDefinition = "LONGTEXT")
    private String sourceExamIdsJson;

    @Lob
    @Column(name = "question_refs_json", columnDefinition = "LONGTEXT")
    private String questionRefsJson;

    @Lob
    @Column(name = "question_snapshots_json", columnDefinition = "LONGTEXT")
    private String questionSnapshotsJson;

    @Lob
    @Column(name = "answers_json", columnDefinition = "LONGTEXT")
    private String answersJson;

    @Lob
    @Column(name = "config_json", columnDefinition = "LONGTEXT")
    private String configJson;

    @Lob
    @Column(name = "result_json", nullable = false, columnDefinition = "LONGTEXT")
    private String resultJson;

    @Column(name = "snapshot_schema_version")
    private Integer snapshotSchemaVersion;

    @Column(name = "score_authority", length = 32)
    private String scoreAuthority;

    @Column(name = "timing_authority", length = 32)
    private String timingAuthority;

    @Column(name = "submission_origin", length = 40)
    private String submissionOrigin;

    @Column(name = "scoring_version", length = 64)
    private String scoringVersion;

    @Column(name = "dataset_version", length = 64)
    private String datasetVersion;

    @Column(name = "exam_content_hash", length = 64)
    private String examContentHash;

    @Column(name = "total_questions", nullable = false)
    private int totalQuestions;

    @Column(name = "total_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal totalScore;

    @Column(name = "mcq_score", precision = 5, scale = 2)
    private BigDecimal mcqScore;

    @Column(name = "tf_score", precision = 5, scale = 2)
    private BigDecimal tfScore;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    public byte[] getId() {
        return id;
    }

    public void setId(byte[] id) {
        this.id = id;
    }

    public byte[] getUserId() {
        return userId;
    }

    public void setUserId(byte[] userId) {
        this.userId = userId;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(String mode) {
        this.mode = mode;
    }

    public String getExamId() {
        return examId;
    }

    public void setExamId(String examId) {
        this.examId = examId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public boolean isCustom() {
        return custom;
    }

    public void setCustom(boolean custom) {
        this.custom = custom;
    }

    public String getSourceExamIdsJson() {
        return sourceExamIdsJson;
    }

    public void setSourceExamIdsJson(String sourceExamIdsJson) {
        this.sourceExamIdsJson = sourceExamIdsJson;
    }

    public String getQuestionRefsJson() {
        return questionRefsJson;
    }

    public void setQuestionRefsJson(String questionRefsJson) {
        this.questionRefsJson = questionRefsJson;
    }

    public String getQuestionSnapshotsJson() {
        return questionSnapshotsJson;
    }

    public void setQuestionSnapshotsJson(String questionSnapshotsJson) {
        this.questionSnapshotsJson = questionSnapshotsJson;
    }

    public String getAnswersJson() {
        return answersJson;
    }

    public void setAnswersJson(String answersJson) {
        this.answersJson = answersJson;
    }

    public String getConfigJson() {
        return configJson;
    }

    public void setConfigJson(String configJson) {
        this.configJson = configJson;
    }

    public String getResultJson() {
        return resultJson;
    }

    public void setResultJson(String resultJson) {
        this.resultJson = resultJson;
    }

    public String getScoreAuthority() { return scoreAuthority; }
    public void setScoreAuthority(String scoreAuthority) { this.scoreAuthority = scoreAuthority; }
    public Integer getSnapshotSchemaVersion() { return snapshotSchemaVersion; }
    public void setSnapshotSchemaVersion(Integer snapshotSchemaVersion) { this.snapshotSchemaVersion = snapshotSchemaVersion; }
    public String getTimingAuthority() { return timingAuthority; }
    public void setTimingAuthority(String timingAuthority) { this.timingAuthority = timingAuthority; }
    public String getSubmissionOrigin() { return submissionOrigin; }
    public void setSubmissionOrigin(String submissionOrigin) { this.submissionOrigin = submissionOrigin; }
    public String getScoringVersion() { return scoringVersion; }
    public void setScoringVersion(String scoringVersion) { this.scoringVersion = scoringVersion; }
    public String getDatasetVersion() { return datasetVersion; }
    public void setDatasetVersion(String datasetVersion) { this.datasetVersion = datasetVersion; }
    public String getExamContentHash() { return examContentHash; }
    public void setExamContentHash(String examContentHash) { this.examContentHash = examContentHash; }

    public int getTotalQuestions() {
        return totalQuestions;
    }

    public void setTotalQuestions(int totalQuestions) {
        this.totalQuestions = totalQuestions;
    }

    public BigDecimal getTotalScore() {
        return totalScore;
    }

    public void setTotalScore(BigDecimal totalScore) {
        this.totalScore = totalScore;
    }

    public BigDecimal getMcqScore() {
        return mcqScore;
    }

    public void setMcqScore(BigDecimal mcqScore) {
        this.mcqScore = mcqScore;
    }

    public BigDecimal getTfScore() {
        return tfScore;
    }

    public void setTfScore(BigDecimal tfScore) {
        this.tfScore = tfScore;
    }

    public Integer getDurationSeconds() {
        return durationSeconds;
    }

    public void setDurationSeconds(Integer durationSeconds) {
        this.durationSeconds = durationSeconds;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}

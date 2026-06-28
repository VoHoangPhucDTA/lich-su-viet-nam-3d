package com.lichsuvn.backend.tts.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * In-memory TTS job queue.
 * <p>
 * Each job is identified by a unique jobId (UUID).
 * Jobs are processed asynchronously by a single background thread.
 * The job's state transitions: PENDING → PROCESSING → COMPLETED | FAILED.
 * <p>
 * Tradeoff note: in-memory means jobs are lost on restart.
 * For MVP this is acceptable. A production version would persist jobs to DB.
 */
@Component
public class TtsJobManager {

    private static final Logger log = LoggerFactory.getLogger(TtsJobManager.class);

    private final ConcurrentHashMap<String, TtsJob> jobs = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "tts-job-processor");
        t.setDaemon(true);
        return t;
    });

    private final NarrationService narrationService;

    public TtsJobManager(NarrationService narrationService) {
        this.narrationService = narrationService;
    }

    /** Create a new job and begin processing it in the background. Returns the jobId. */
    public String createJob(String eventId, String text, String voice, double speed) {
        String jobId = java.util.UUID.randomUUID().toString();
        TtsJob job = new TtsJob(jobId, eventId, text, voice, speed, "PENDING");
        jobs.put(jobId, job);
        log.info("TTS job {} created for event {}", jobId, eventId);

        CompletableFuture.runAsync(() -> processJob(job), executor)
                .exceptionally(ex -> {
                    log.error("TTS job {} failed unexpectedly", jobId, ex);
                    job.status = "FAILED";
                    job.errorMessage = "Internal processing error: " + ex.getMessage();
                    return null;
                });

        return jobId;
    }

    /** Get the current status of a job. Returns null if jobId not found. */
    public TtsJob getJob(String jobId) {
        return jobs.get(jobId);
    }

    /** Remove a completed/failed job from memory (cleanup). */
    public void removeJob(String jobId) {
        jobs.remove(jobId);
    }

    // ── Background processing ──────────────────────────────────────────────

    private void processJob(TtsJob job) {
        try {
            job.status = "PROCESSING";
            String normalized = job.text.trim();
            if (normalized.isEmpty()) {
                job.status = "FAILED";
                job.errorMessage = "Text content is empty";
                return;
            }

            // 1. Chunk text using the active provider's limits
            List<String> chunks = narrationService.chunkText(normalized);

            // 2. Generate audio for each chunk sequentially via the configured provider
            for (int i = 0; i < chunks.size(); i++) {
                String filename = narrationService.generateSingleChunk(chunks.get(i), job.voice, job.speed);
                job.addChunkFilename(filename);
                job.totalChunks = chunks.size();
                log.debug("TTS job {} chunk {}/{} generated → {}", job.jobId, i + 1, chunks.size(), filename);
            }

            job.status = "COMPLETED";
            log.info("TTS job {} completed with {} chunks", job.jobId, chunks.size());
        } catch (Exception e) {
            job.status = "FAILED";
            job.errorMessage = e.getMessage();
            log.error("TTS job {} failed: {}", job.jobId, e.getMessage());
        }
    }

    // ── In-memory job data class ──────────────────────────────────────────

    public static class TtsJob {
        public final String jobId;
        public final String eventId;
        public final String text;
        public final String voice;
        public final double speed;
        public volatile String status;
        public volatile String errorMessage;
        public final java.util.List<String> chunkFilenames = new java.util.ArrayList<>();
        public volatile int totalChunks;

        TtsJob(String jobId, String eventId, String text, String voice, double speed, String status) {
            this.jobId = jobId;
            this.eventId = eventId;
            this.text = text;
            this.voice = voice;
            this.speed = speed;
            this.status = status;
        }

        void addChunkFilename(String filename) {
            chunkFilenames.add(filename);
        }
    }
}

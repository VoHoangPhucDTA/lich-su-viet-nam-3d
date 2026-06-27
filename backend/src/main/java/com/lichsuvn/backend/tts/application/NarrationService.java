package com.lichsuvn.backend.tts.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.Collections;

/**
 * Orchestration service for AI Historical Narration.
 * <p>
 * Responsibilities:
 * <ul>
 *   <li>Sanitize and chunk input text based on the active provider's limits</li>
 *   <li>Delegate actual synthesis to the configured {@link TextToSpeechService} provider</li>
 *   <li>Cache generated audio files to disk to avoid regenerating identical content</li>
 *   <li>Serve cached audio files via a filename-based URL</li>
 * </ul>
 * <p>
 * This service is provider-agnostic — it communicates only through the
 * {@code TextToSpeechService} interface. Switching TTS providers requires
 * no changes to this class, only swapping the injected implementation.
 */
@Service
public class NarrationService {

    private static final Logger log = LoggerFactory.getLogger(NarrationService.class);

    /** Sentence-ending pattern for smart chunking. */
    private static final Pattern SENTENCE_END = Pattern.compile("(?<=[.!?])\\s+");

    private final String cacheDir;
    private final TextToSpeechService ttsProvider;

    /** In-memory index: SHA-256 hash → filename, for quick lookup. */
    private final ConcurrentHashMap<String, String> cacheIndex = new ConcurrentHashMap<>();

    public NarrationService(
            @Value("${app.tts.cache-dir:${user.home}/.lichsuvn/tts-cache}") String cacheDir,
            TextToSpeechService ttsProvider) throws IOException {
        this.cacheDir = cacheDir;
        this.ttsProvider = ttsProvider;

        // Ensure cache directory exists
        Files.createDirectories(Paths.get(cacheDir));

        log.info("NarrationService initialized with provider: {} (chunk limit: {})",
                ttsProvider.getProviderName(), ttsProvider.getMaxChunkLength());
    }

    // ── Provider introspection ────────────────────────────────────────────

    /**
     * @return Human-readable name of the active TTS provider.
     */
    public String getProviderName() {
        return ttsProvider.getProviderName();
    }

    /**
     * @return List of available voice codes from the active provider.
     */
    public List<String> getAvailableVoices() {
        return Collections.unmodifiableList(ttsProvider.getAvailableVoices());
    }

    /**
     * @return The default voice name for the active provider.
     */
    public String getDefaultVoice() {
        return ttsProvider.getDefaultVoice();
    }

    /**
     * @return Maximum chunk length for the active provider.
     */
    public int getMaxChunkLength() {
        return ttsProvider.getMaxChunkLength();
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Split long text into chunks respecting the active provider's character limit.
     * Splits at sentence boundaries when possible.
     */
    public List<String> chunkText(String text) {
        int maxLen = ttsProvider.getMaxChunkLength();
        String normalized = text.replaceAll("\\s+", " ").trim();
        if (normalized.length() <= maxLen) {
            return List.of(normalized);
        }

        List<String> chunks = new ArrayList<>();
        String[] sentences = SENTENCE_END.split(normalized);
        StringBuilder current = new StringBuilder();

        for (String sentence : sentences) {
            String trimmed = sentence.trim();
            if (trimmed.isEmpty()) continue;

            // If a single sentence exceeds maxLen, split it mid-sentence
            if (trimmed.length() > maxLen) {
                if (!current.isEmpty()) {
                    chunks.add(current.toString().trim());
                    current = new StringBuilder();
                }
                int start = 0;
                while (start < trimmed.length()) {
                    int end = Math.min(start + maxLen, trimmed.length());
                    chunks.add(trimmed.substring(start, end).trim());
                    start = end;
                }
                continue;
            }

            // Would adding this sentence exceed the limit?
            if (!current.isEmpty() && current.length() + 1 + trimmed.length() > maxLen) {
                chunks.add(current.toString().trim());
                current = new StringBuilder();
            }
            if (!current.isEmpty()) current.append(' ');
            current.append(trimmed);
        }

        if (!current.isEmpty()) {
            chunks.add(current.toString().trim());
        }

        return chunks;
    }

    /**
     * Generate audio for a single text chunk via the configured TTS provider.
     * <p>
     * The audio is saved to a local cache directory and the filename is returned.
     *
     * @return The cache filename (e.g. "a1b2c3d4.mp3") that can be served via the audio endpoint.
     */
    public String generateSingleChunk(String text, String voice, double speed) throws Exception {
        // 1. Compute cache key
        String providerName = ttsProvider.getProviderName();
        String effectiveVoice = (voice != null && !voice.isBlank()) ? voice : ttsProvider.getDefaultVoice();
        String cacheKey = hash(text + "|" + providerName + "|" + effectiveVoice + "|" + speed);
        String cachedFilename = cacheIndex.get(cacheKey);

        if (cachedFilename != null) {
            Path cachedFile = Paths.get(cacheDir, cachedFilename);
            if (Files.exists(cachedFile)) {
                log.debug("TTS cache hit: {} (provider: {})", cachedFilename, providerName);
                return cachedFilename;
            }
        }

        // 2. Delegate synthesis to the configured provider
        byte[] audioData = ttsProvider.synthesize(text, effectiveVoice, speed);

        // 3. Save to cache directory
        String filename = cacheKey + ".mp3";
        Path outputPath = Paths.get(cacheDir, filename);
        Files.write(outputPath, audioData);

        // 4. Update cache index
        cacheIndex.put(cacheKey, filename);

        log.info("TTS generated audio: {} ({} bytes, provider={}, voice={}, speed={})",
                filename, audioData.length, providerName, effectiveVoice, speed);

        return filename;
    }

    /**
     * Serve a cached audio file by filename.
     *
     * @return The audio file bytes, or null if not found.
     */
    public byte[] getAudioFile(String filename) {
        try {
            // Sanitize: prevent directory traversal
            Path filePath = Paths.get(cacheDir, filename).normalize();
            if (!filePath.startsWith(Paths.get(cacheDir).normalize())) {
                log.warn("Blocked directory traversal attempt: {}", filename);
                return null;
            }
            return Files.readAllBytes(filePath);
        } catch (IOException e) {
            log.warn("Audio file not found: {}", filename);
            return null;
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private String hash(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashBytes);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}

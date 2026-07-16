package com.lichsuvn.backend.tts.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/** Deterministically splits narration while preserving every Unicode code point. */
@Service
public class NarrationChunker {
    private final int targetLength;
    private final int hardMaxLength;
    private final String version;

    public NarrationChunker(
            @Value("${app.tts.chunk.target-length:1800}") int targetLength,
            @Value("${app.tts.chunk.hard-max-length:2000}") int hardMaxLength,
            @Value("${app.tts.chunk.version:v1}") String version) {
        if (targetLength <= 0 || hardMaxLength < targetLength) {
            throw new IllegalArgumentException("Invalid TTS chunk length configuration");
        }
        this.targetLength = targetLength;
        this.hardMaxLength = hardMaxLength;
        this.version = version;
    }

    public List<String> chunk(String text) {
        String normalized = text == null ? "" : text.replaceAll("\\s+", " ").trim();
        if (normalized.isEmpty()) return List.of();
        List<String> chunks = new ArrayList<>();
        splitRange(normalized, chunks);
        return List.copyOf(chunks);
    }

    public String version() {
        return version;
    }

    private void splitRange(String text, List<String> output) {
        if (text.codePointCount(0, text.length()) <= targetLength) {
            output.add(text);
            return;
        }
        int boundary = findBoundary(text, targetLength);
        if (boundary <= 0 || boundary >= text.length()) {
            boundary = codePointBoundary(text, hardMaxLength);
        }
        String left = text.substring(0, boundary).strip();
        String right = text.substring(boundary).strip();
        if (left.isEmpty() || right.isEmpty()) {
            hardSplit(text, output);
            return;
        }
        splitRange(left, output);
        splitRange(right, output);
    }

    private int findBoundary(String text, int desiredCodePoints) {
        int target = codePointBoundary(text, Math.min(desiredCodePoints, hardMaxLength));
        int[] priorities = { '\n', '.', '!', '?', ';', ':', ',', ' ' };
        for (int priority : priorities) {
            int candidate = -1;
            for (int i = target; i > 0; ) {
                int cp = text.codePointBefore(i);
                int start = i - Character.charCount(cp);
                if (cp == priority) {
                    candidate = i;
                    break;
                }
                i = start;
            }
            if (candidate > 0) return candidate;
        }
        return target;
    }

    private void hardSplit(String text, List<String> output) {
        int start = 0;
        while (start < text.length()) {
            int end = codePointBoundary(text.substring(start), hardMaxLength);
            if (end <= 0) end = text.substring(start).length();
            output.add(text.substring(start, start + end).strip());
            start += end;
        }
    }

    private int codePointBoundary(String text, int codePoints) {
        return text.offsetByCodePoints(0, Math.min(codePoints, text.codePointCount(0, text.length())));
    }
}

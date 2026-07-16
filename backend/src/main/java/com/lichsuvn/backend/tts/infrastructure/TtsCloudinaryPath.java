package com.lichsuvn.backend.tts.infrastructure;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Builds Cloudinary public IDs without passing both folder and prefixed ID. */
@Component
public class TtsCloudinaryPath {
    private final String rootFolder;
    private final String narrationsFolder;
    private final String chunksFolder;

    public TtsCloudinaryPath(
            @Value("${app.tts.cloudinary.root-folder:history_audio}") String rootFolder,
            @Value("${app.tts.cloudinary.narrations-folder:narrations}") String narrationsFolder,
            @Value("${app.tts.cloudinary.chunks-folder:chunks}") String chunksFolder) {
        this.rootFolder = clean(rootFolder, "history_audio");
        this.narrationsFolder = clean(narrationsFolder, "narrations");
        this.chunksFolder = clean(chunksFolder, "chunks");
    }

    public String buildNarrationPublicId(String cacheKey) {
        return rootFolder + "/" + narrationsFolder + "/" + cacheKey;
    }

    public String buildChunkPublicId(String chunkKey) {
        return rootFolder + "/" + chunksFolder + "/" + chunkKey;
    }

    String rootFolder() {
        return rootFolder;
    }

    private String clean(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim().replaceAll("^/+|/+$", "");
    }
}

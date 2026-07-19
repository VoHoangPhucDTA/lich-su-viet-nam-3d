package com.lichsuvn.backend.tts.application;

public interface AudioStorageService {
    boolean isConfigured();

    StoredAudio upload(byte[] audioBytes, String publicId, String mimeType) throws Exception;

    byte[] download(String audioUrl) throws Exception;

    void delete(String publicId) throws Exception;

    record StoredAudio(
            String storageProvider,
            String storagePublicId,
            String audioUrl,
            String mimeType,
            Long fileSize,
            Long durationMs
    ) {
    }
}

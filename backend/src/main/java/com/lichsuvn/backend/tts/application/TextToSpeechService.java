package com.lichsuvn.backend.tts.application;

import java.util.List;

/**
 * Provider-agnostic interface for Text-to-Speech synthesis.
 * <p>
 * Each TTS provider (Viettel AI, Google Cloud, FPT AI, Azure, OpenAI, etc.)
 * implements this interface. The rest of the application communicates only
 * with {@code TextToSpeechService}, never with provider-specific code.
 * <p>
 * This makes switching between providers trivial — just swap the
 * {@code @Primary} implementation in the Spring context.
 */
public interface TextToSpeechService {

    /**
     * @return Human-readable provider name (e.g. "Viettel AI", "Google Cloud").
     */
    String getProviderName();

    /**
     * @return Maximum number of characters the provider accepts per request.
     */
    int getMaxChunkLength();

    /**
     * @return Default voice name the provider should use when none is specified.
     */
    String getDefaultVoice();

    /**
     * Synthesize a single text chunk into audio bytes.
     *
     * @param text  The text to convert to speech (must be ≤ {@link #getMaxChunkLength()} chars).
     * @param voice Voice name (e.g. "hcm-diemmy"). If null/blank, the provider's default is used.
     * @param speed Speaking rate (1.0 = normal). Provider-specific range; clamped automatically.
     * @return Raw audio bytes (MP3 or WAV depending on provider).
     * @throws Exception If the API call fails (auth, network, quota, etc.).
     */
    byte[] synthesize(String text, String voice, double speed) throws Exception;

    /**
     * @return List of available voice codes for this provider.
     */
    List<String> getAvailableVoices();
}

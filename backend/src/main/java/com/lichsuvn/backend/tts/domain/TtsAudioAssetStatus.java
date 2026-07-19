package com.lichsuvn.backend.tts.domain;

public enum TtsAudioAssetStatus {
    PENDING("pending"),
    SYNTHESIZING("synthesizing"),
    UPLOADING("uploading"),
    READY("ready"),
    FAILED("failed");

    private final String value;

    TtsAudioAssetStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static TtsAudioAssetStatus fromValue(String value) {
        for (TtsAudioAssetStatus status : values()) {
            if (status.value.equals(value)) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unsupported TTS audio asset status: " + value);
    }
}

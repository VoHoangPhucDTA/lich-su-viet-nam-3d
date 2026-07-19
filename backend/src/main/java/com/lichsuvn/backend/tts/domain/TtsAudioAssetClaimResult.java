package com.lichsuvn.backend.tts.domain;

public record TtsAudioAssetClaimResult(
        Kind kind,
        TtsAudioAsset asset
) {
    public enum Kind {
        CLAIMED_NEW,
        EXISTING_PENDING,
        EXISTING_READY,
        EXISTING_FAILED
    }

    public boolean owner() {
        return kind == Kind.CLAIMED_NEW;
    }
}

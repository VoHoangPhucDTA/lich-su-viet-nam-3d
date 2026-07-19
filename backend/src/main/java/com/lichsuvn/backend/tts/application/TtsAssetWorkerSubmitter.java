package com.lichsuvn.backend.tts.application;

public interface TtsAssetWorkerSubmitter {
    void submit(Runnable task);
}

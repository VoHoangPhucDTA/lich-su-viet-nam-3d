package com.lichsuvn.backend.tts.application;

import java.util.List;

public interface AudioAssemblyService {
    boolean isAvailable();

    AssembledAudio assemble(List<AudioChunkInput> chunks) throws Exception;

    record AudioChunkInput(int index, byte[] audioBytes) {}

    record AssembledAudio(byte[] audioBytes, String mimeType, long durationMs) {}
}

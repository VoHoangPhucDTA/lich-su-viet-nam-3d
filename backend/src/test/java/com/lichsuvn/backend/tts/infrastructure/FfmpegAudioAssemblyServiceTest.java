package com.lichsuvn.backend.tts.infrastructure;

import com.lichsuvn.backend.tts.application.AudioAssemblyService;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class FfmpegAudioAssemblyServiceTest {
    @Test
    void assemblesOrderedMp3AndDecodesAfterSeek() throws Exception {
        String ffmpeg = configured("APP_TTS_FFMPEG_EXECUTABLE", "ffmpeg");
        String ffprobe = configured("APP_TTS_FFPROBE_EXECUTABLE", "ffprobe");
        assumeTrue(canRun(ffmpeg), "ffmpeg is not available");
        assumeTrue(canRun(ffprobe), "ffprobe is not available");

        FfmpegAudioAssemblyService service = new FfmpegAudioAssemblyService(ffmpeg, ffprobe, 30);
        byte[] first = generateTone(ffmpeg, 440);
        byte[] second = generateTone(ffmpeg, 660);

        AudioAssemblyService.AssembledAudio assembled = service.assemble(List.of(
                new AudioAssemblyService.AudioChunkInput(1, second),
                new AudioAssemblyService.AudioChunkInput(0, first)
        ));

        assertEquals("audio/mpeg", assembled.mimeType());
        assertTrue(assembled.audioBytes().length > first.length);
        assertTrue(assembled.durationMs() >= 900 && assembled.durationMs() <= 2500,
                "Unexpected assembled duration: " + assembled.durationMs());
        assertEquals(0, decodeFromOffset(ffmpeg, assembled.audioBytes()));
    }

    private byte[] generateTone(String ffmpeg, int frequency) throws Exception {
        Path output = Files.createTempFile("tts-fixture-", ".mp3");
        try {
            ProcessResult result = run(List.of(ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", "sine=frequency=" + frequency + ":duration=0.6:sample_rate=16000",
                    "-c:a", "libmp3lame", "-b:a", "64k", output.toString()));
            assertEquals(0, result.exitCode(), result.output());
            return Files.readAllBytes(output);
        } finally {
            Files.deleteIfExists(output);
        }
    }

    private int decodeFromOffset(String ffmpeg, byte[] audio) throws Exception {
        Path input = Files.createTempFile("tts-assembled-", ".mp3");
        try {
            Files.write(input, audio);
            return run(List.of(ffmpeg, "-hide_banner", "-loglevel", "error", "-ss", "0.7",
                    "-i", input.toString(), "-f", "null", "-" )).exitCode();
        } finally {
            Files.deleteIfExists(input);
        }
    }

    private boolean canRun(String executable) {
        try {
            return run(List.of(executable, "-version")).exitCode() == 0;
        } catch (Exception ex) {
            return false;
        }
    }

    private ProcessResult run(List<String> command) throws Exception {
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        boolean finished = process.waitFor(30, TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            throw new IllegalStateException("Process timed out: " + command.get(0));
        }
        return new ProcessResult(process.exitValue(), new String(process.getInputStream().readAllBytes()));
    }

    private String configured(String envName, String fallback) throws Exception {
        String property = System.getProperty(envName);
        if (property != null && !property.isBlank()) return property;
        String env = System.getenv(envName);
        if (env != null && !env.isBlank()) return env;
        Path dotenv = Path.of(".env");
        if (Files.exists(dotenv)) {
            for (String line : Files.readAllLines(dotenv)) {
                if (line.startsWith(envName + "=")) return line.substring(envName.length() + 1).trim();
            }
        }
        return fallback;
    }

    private record ProcessResult(int exitCode, String output) {}
}

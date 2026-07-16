package com.lichsuvn.backend.tts.infrastructure;

import com.lichsuvn.backend.tts.application.AudioAssemblyService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Service
public class FfmpegAudioAssemblyService implements AudioAssemblyService {
    private static final Logger log = LoggerFactory.getLogger(FfmpegAudioAssemblyService.class);
    private final String ffmpeg;
    private final String ffprobe;
    private final long timeoutSeconds;

    public FfmpegAudioAssemblyService(
            @Value("${app.tts.ffmpeg.executable:ffmpeg}") String ffmpeg,
            @Value("${app.tts.ffprobe.executable:ffprobe}") String ffprobe,
            @Value("${app.tts.ffmpeg.timeout-seconds:180}") long timeoutSeconds) {
        this.ffmpeg = ffmpeg;
        this.ffprobe = ffprobe;
        this.timeoutSeconds = timeoutSeconds;
    }

    @Override
    public boolean isAvailable() {
        return runs(ffmpeg, "-version") && runs(ffprobe, "-version");
    }

    @Override
    public AssembledAudio assemble(List<AudioChunkInput> chunks) throws Exception {
        if (chunks == null || chunks.isEmpty()) throw new IllegalArgumentException("No audio chunks to assemble");
        if (!isAvailable()) throw new IllegalStateException("FFmpeg and ffprobe are required for long narration assembly");
        Path dir = Files.createTempDirectory("tts-assembly-");
        try {
            List<AudioChunkInput> ordered = chunks.stream().sorted(Comparator.comparingInt(AudioChunkInput::index)).toList();
            List<String> lines = new ArrayList<>();
            for (AudioChunkInput chunk : ordered) {
                Path input = dir.resolve(String.format("chunk-%06d.mp3", chunk.index()));
                Files.write(input, chunk.audioBytes());
                lines.add("file '" + input.toAbsolutePath().toString().replace("'", "'\\''") + "'");
            }
            Path concat = dir.resolve("concat.txt");
            Files.writeString(concat, String.join(System.lineSeparator(), lines), StandardCharsets.UTF_8);
            Path output = dir.resolve("assembled.mp3");
            run(List.of(ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
                    "-i", concat.toString(), "-c", "copy", output.toString()));
            if (!Files.exists(output) || Files.size(output) <= 0) throw new IllegalStateException("FFmpeg produced empty output");
            long durationMs = probeDuration(output);
            return new AssembledAudio(Files.readAllBytes(output), "audio/mpeg", durationMs);
        } finally {
            try (var paths = Files.walk(dir)) {
                paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try { Files.deleteIfExists(path); } catch (Exception ex) { log.warn("Could not delete temp file {}", path); }
                });
            }
        }
    }

    private long probeDuration(Path output) throws Exception {
        ProcessResult result = run(List.of(ffprobe, "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", output.toString()));
        double seconds = Double.parseDouble(result.stdout().trim());
        if (!(seconds > 0)) throw new IllegalStateException("ffprobe returned invalid duration");
        return Math.round(seconds * 1000);
    }

    private boolean runs(String executable, String arg) {
        try { run(List.of(executable, arg)); return true; } catch (Exception ex) { return false; }
    }

    private ProcessResult run(List<String> command) throws Exception {
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("Process timed out: " + command.get(0));
        }
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        if (process.exitValue() != 0) throw new IllegalStateException("Process failed: " + command.get(0) + " " + output);
        return new ProcessResult(output);
    }

    private record ProcessResult(String stdout) {}
}

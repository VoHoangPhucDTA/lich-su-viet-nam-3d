package com.lichsuvn.backend.tts.infrastructure;

import com.lichsuvn.backend.tts.application.TextToSpeechService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

/**
 * Viettel AI Text-to-Speech provider.
 * <p>
 * Calls the Viettel AI API ({@code POST /tts/speech_synthesis}) to convert
 * Vietnamese text into natural-sounding speech.
 * <p>
 * API details (from official Viettel AI documentation):
 * <ul>
 *   <li>Endpoint: {@code https://viettelai.vn/tts/speech_synthesis}</li>
 *   <li>Auth: {@code token} field in the JSON request body (NOT an HTTP header)</li>
 *   <li>Request: JSON with {@code text}, {@code voice}, {@code speed},
 *       {@code token}, {@code tts_return_option}, {@code without_filter}, {@code id}</li>
 *   <li>Response: JSON with {@code code}, {@code message}, {@code data} containing audio bytes</li>
 *   <li>Character limit: ~5000 chars per request (we chunk conservatively)</li>
 * </ul>
 * <p>
 * Vietnamese voices:
 * <ul>
 *   <li>{@code hcm-diemmy} — Southern female (default) 🏆</li>
 *   <li>{@code hcm-thuyduyen} — Southern female</li>
 *   <li>{@code hn-quynhanh} — Northern female</li>
 *   <li>{@code hn-thanhtung} — Northern male</li>
 *   <li>{@code hue-maingoc} — Central female</li>
 * </ul>
 */
@Component
public class ViettelTextToSpeechProvider implements TextToSpeechService {

    private static final Logger log = LoggerFactory.getLogger(ViettelTextToSpeechProvider.class);

    /** Viettel AI TTS API endpoint. */
    private static final String API_URL = "https://viettelai.vn/tts/speech_synthesis";

    /** Conservative max characters per request to avoid timeouts. */
    private static final int MAX_CHUNK_LENGTH = 2000;

    /** Connection & read timeout in seconds. */
    private static final int TIMEOUT_SECONDS = 60;

    /** Default Vietnamese voice (Southern female, most natural for narration). */
    private static final String DEFAULT_VOICE = "hcm-diemmy";

    private static final List<String> AVAILABLE_VOICES = List.of(
            "hcm-diemmy",    // Southern female
            "hcm-thuyduyen", // Southern female
            "hn-quynhanh",   // Northern female
            "hn-thanhtung",  // Northern male
            "hue-maingoc"    // Central female
    );

    private final String apiToken;
    private final HttpClient httpClient;

    /**
     * @param apiToken Viettel AI API token (from {@code APP_VIETTEL_AI_TOKEN} env var).
     *                 Must be configured for the provider to function.
     */
    public ViettelTextToSpeechProvider(
            @Value("${app.viettel-ai.token:}") String apiToken) {
        this.apiToken = apiToken;

        if (apiToken == null || apiToken.isBlank()) {
            log.warn("Viettel AI TTS token is not configured. "
                    + "Set APP_VIETTEL_AI_TOKEN environment variable or app.viettel-ai.token property. "
                    + "Narration will fail until a valid token is provided.");
        } else {
            log.info("Viettel AI TTS provider initialized. Token length: {} chars", apiToken.length());
        }

        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .build();
    }

    // ── TextToSpeechService implementation ─────────────────────────────────

    @Override
    public String getProviderName() {
        return "Viettel AI";
    }

    @Override
    public int getMaxChunkLength() {
        return MAX_CHUNK_LENGTH;
    }

    @Override
    public String getDefaultVoice() {
        return DEFAULT_VOICE;
    }

    @Override
    public byte[] synthesize(String text, String voice, double speed) throws Exception {
        if (apiToken == null || apiToken.isBlank()) {
            throw new IllegalStateException(
                    "Viettel AI TTS token is not configured. "
                    + "Please set APP_VIETTEL_AI_TOKEN in your environment.");
        }

        // Resolve voice: validate against known voices, fall back to default if unknown
        String effectiveVoice = resolveVoice(voice);
        double effectiveSpeed = clampSpeed(speed);

        // Build JSON body per Viettel AI API spec
        // IMPORTANT: token is sent IN THE JSON BODY, NOT as an HTTP header
        String requestId = UUID.randomUUID().toString().substring(0, 8);
        String jsonBody = String.format(
                "{" +
                "\"text\":%s," +
                "\"voice\":\"%s\"," +
                "\"speed\":%.2f," +
                "\"tts_return_option\":3," +
                "\"token\":\"%s\"," +
                "\"without_filter\":false," +
                "\"id\":\"%s\"" +
                "}",
                escapeJson(text),
                effectiveVoice,
                effectiveSpeed,
                apiToken,
                requestId
        );

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(API_URL))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .build();

        log.debug("Viettel TTS request: voice={}, speed={}, textLen={}, requestId={}",
                effectiveVoice, effectiveSpeed, text.length(), requestId);

        HttpResponse<byte[]> response = httpClient.send(request,
                HttpResponse.BodyHandlers.ofByteArray());

        int statusCode = response.statusCode();

        if (statusCode == 200) {
            byte[] body = response.body();

            // Viettel AI API v2 returns a JSON envelope with audio data base64-encoded
            // Try to parse as JSON first
            String bodyStr = new String(body, StandardCharsets.UTF_8).trim();

            // Check if response is JSON (starts with {) or binary audio
            if (bodyStr.startsWith("{")) {
                return parseJsonResponse(bodyStr, effectiveVoice, effectiveSpeed);
            }

            // Raw binary audio response (older API version)
            if (body.length == 0) {
                throw new RuntimeException("Viettel AI TTS returned empty audio content");
            }
            log.info("Viettel TTS success (binary): voice={}, speed={}, audioBytes={}",
                    effectiveVoice, effectiveSpeed, body.length);
            return body;
        }

        // Parse error response for meaningful message
        String errorBody = new String(response.body(), StandardCharsets.UTF_8);
        String errorMsg = parseApiError(statusCode, errorBody);

        log.error("Viettel TTS failed: HTTP {} – {}", statusCode, errorBody);
        throw new RuntimeException(errorMsg);
    }

    @Override
    public List<String> getAvailableVoices() {
        return AVAILABLE_VOICES;
    }

    // ── Response parsing ───────────────────────────────────────────────────

    /**
     * Parse a JSON response from the Viettel AI TTS API v2.
     * <p>
     * Expected format:
     * <pre>{@code
     * {
     *   "code": 200,
     *   "message": "Success",
     *   "data": "<base64-encoded-audio-bytes>"
     * }
     * }</pre>
     */
    private byte[] parseJsonResponse(String json, String voice, double speed) throws Exception {
        // Extract "code" field
        int code = extractIntField(json, "\"code\"");
        if (code != 200) {
            String apiMessage = extractStringField(json, "\"message\"");
            throw new RuntimeException(String.format(
                    "Viettel AI TTS API error (code %d): %s", code, apiMessage));
        }

        // Extract "data" field — contains base64-encoded audio
        String data = extractStringField(json, "\"data\"");
        if (data == null || data.isEmpty()) {
            throw new RuntimeException("Viettel AI TTS returned empty data field");
        }

        byte[] audioData = java.util.Base64.getDecoder().decode(data);
        log.info("Viettel TTS success (JSON): voice={}, speed={}, audioBytes={}",
                voice, speed, audioData.length);
        return audioData;
    }

    /**
     * Extract a quoted string field value from a JSON string.
     * Looks for: "fieldName": "value"
     */
    private static String extractStringField(String json, String fieldKey) {
        int keyIndex = json.indexOf(fieldKey);
        if (keyIndex < 0) return null;
        int colonIndex = json.indexOf(':', keyIndex + fieldKey.length());
        if (colonIndex < 0) return null;
        int quoteStart = json.indexOf('"', colonIndex + 1);
        if (quoteStart < 0) return null;
        int quoteEnd = json.indexOf('"', quoteStart + 1);
        if (quoteEnd < 0) return null;
        return json.substring(quoteStart + 1, quoteEnd);
    }

    /**
     * Extract an integer field value from a JSON string.
     * Looks for: "fieldName": 200
     */
    private static int extractIntField(String json, String fieldKey) {
        int keyIndex = json.indexOf(fieldKey);
        if (keyIndex < 0) return -1;
        int colonIndex = json.indexOf(':', keyIndex + fieldKey.length());
        if (colonIndex < 0) return -1;
        // Skip whitespace
        int valueStart = colonIndex + 1;
        while (valueStart < json.length() && json.charAt(valueStart) == ' ') valueStart++;
        int valueEnd = valueStart;
        while (valueEnd < json.length() && Character.isDigit(json.charAt(valueEnd))) valueEnd++;
        if (valueEnd == valueStart) return -1;
        return Integer.parseInt(json.substring(valueStart, valueEnd));
    }

    /**
     * Parse API error response into a user-friendly message.
     */
    private static String parseApiError(int httpStatus, String errorBody) {
        // Try to extract vi_message or en_message from JSON error
        String viMsg = extractStringField(errorBody, "\"vi_message\"");
        if (viMsg != null) {
            return "Viettel AI: " + viMsg;
        }
        String enMsg = extractStringField(errorBody, "\"en_message\"");
        if (enMsg != null) {
            return "Viettel AI: " + enMsg;
        }
        String message = extractStringField(errorBody, "\"message\"");
        if (message != null) {
            return "Viettel AI: " + message;
        }

        // Fallback to HTTP status
        return switch (httpStatus) {
            case 401, 403 -> "Xác thực Viettel AI thất bại. Vui lòng kiểm tra API token.";
            case 429 -> "Đã vượt quá hạn mức sử dụng Viettel AI TTS. Vui lòng thử lại sau.";
            case 502, 503 -> "Dịch vụ Viettel AI TTS đang gặp sự cố. Vui lòng thử lại sau.";
            default -> String.format("Viettel AI TTS API error (HTTP %d)", httpStatus);
        };
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /**
     * Resolve the voice name: validate against known voices, fall back to default if unknown.
     * This handles cases where the frontend sends a provider-specific voice name from an
     * older or different provider (e.g. "banmai" from Google TTS).
     */
    private String resolveVoice(String requestedVoice) {
        if (requestedVoice == null || requestedVoice.isBlank()) {
            return DEFAULT_VOICE;
        }
        String lower = requestedVoice.toLowerCase();
        if (AVAILABLE_VOICES.contains(lower)) {
            return lower;
        }
        // Unknown voice — log warning and fall back to default
        log.warn("Unknown Viettel AI voice '{}', falling back to default '{}'", requestedVoice, DEFAULT_VOICE);
        return DEFAULT_VOICE;
    }

    /**
     * Clamp speed to Viettel AI's supported range (0.5 – 2.0).
     * Viettel AI typically supports 0.5 to 2.0.
     */
    private static double clampSpeed(double speed) {
        if (speed <= 0) return 1.0;
        return Math.max(0.5, Math.min(2.0, speed));
    }

    /**
     * Escape a Java string for use inside a JSON string value.
     * Handles quotes, backslashes, and control characters.
     */
    private static String escapeJson(String s) {
        if (s == null || s.isEmpty()) return "\"\"";
        StringBuilder sb = new StringBuilder(s.length() + 16);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
        return sb.toString();
    }
}

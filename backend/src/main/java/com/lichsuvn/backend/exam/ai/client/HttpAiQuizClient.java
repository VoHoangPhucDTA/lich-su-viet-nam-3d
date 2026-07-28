package com.lichsuvn.backend.exam.ai.client;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.ai.client.dto.AiHealthResponse;
import com.lichsuvn.backend.exam.ai.client.dto.AiQuizGenerationRequest;
import com.lichsuvn.backend.exam.ai.client.dto.AiQuizGenerationResponse;
import com.lichsuvn.backend.exam.ai.config.AiServiceClientConfig;
import com.lichsuvn.backend.exam.ai.config.AiServiceProperties;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;

@Component
public class HttpAiQuizClient implements AiQuizClient {
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final AiServiceProperties properties;

    public HttpAiQuizClient(
            @Qualifier(AiServiceClientConfig.HTTP_CLIENT_BEAN) HttpClient httpClient,
            ObjectMapper objectMapper,
            AiServiceProperties properties
    ) {
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Override
    public AiQuizGenerationResponse generate(AiQuizGenerationRequest request, String requestId) {
        if (properties.internalToken().isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "AI_SERVICE_UNAVAILABLE",
                    "AI Service internal authentication is not configured");
        }
        byte[] body;
        try {
            body = objectMapper.writeValueAsBytes(request);
        } catch (JsonProcessingException ex) {
            throw invalidResponse("AI request could not be serialized", ex);
        }
        HttpRequest httpRequest = request(properties.generationPath(), requestId)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .build();
        HttpResponse<byte[]> response = send(httpRequest);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw mapError(response.statusCode(), response.body());
        }
        return parse(response.body(), AiQuizGenerationResponse.class);
    }

    @Override
    public AiHealthResponse health(String requestId) {
        HttpResponse<byte[]> response = send(request(properties.healthPath(), requestId).GET().build());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw mapError(response.statusCode(), response.body());
        }
        return parse(response.body(), AiHealthResponse.class);
    }

    private HttpRequest.Builder request(String path, String requestId) {
        return HttpRequest.newBuilder(resolve(path))
                .timeout(properties.readTimeout())
                .header("Accept", "application/json")
                .header("X-Request-ID", requestId)
                .header("X-Internal-Service-Token", properties.internalToken());
    }

    private URI resolve(String path) {
        String normalized = path.startsWith("/") ? path.substring(1) : path;
        String base = properties.baseUrl().toString();
        return URI.create(base.endsWith("/") ? base : base + "/").resolve(normalized);
    }

    private HttpResponse<byte[]> send(HttpRequest request) {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
        } catch (HttpTimeoutException ex) {
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, "AI_SERVICE_TIMEOUT", "AI Service timed out");
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_SERVICE_UNAVAILABLE", "AI Service call was interrupted");
        } catch (IOException ex) {
            if (hasCause(ex, ConnectException.class)) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_SERVICE_UNAVAILABLE", "AI Service is unavailable");
            }
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_SERVICE_UNAVAILABLE", "AI Service communication failed");
        }
    }

    private <T> T parse(byte[] body, Class<T> type) {
        try {
            return objectMapper.readValue(body, type);
        } catch (IOException ex) {
            throw invalidResponse("AI Service returned malformed JSON", ex);
        }
    }

    private ApiException mapError(int status, byte[] body) {
        String detail = safeDetail(body);
        if (status == 409 && !"INSUFFICIENT_CONTEXT".equals(detail)) {
            return new ApiException(HttpStatus.BAD_GATEWAY, "AI_SERVICE_INVALID_RESPONSE", "AI Service returned an unexpected conflict");
        }
        return switch (status) {
            case 401, 403 -> new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "AI_SERVICE_UNAVAILABLE", "AI Service is unavailable");
            case 409 -> new ApiException(HttpStatus.CONFLICT, "AI_INSUFFICIENT_CONTEXT", "AI Service could not find sufficient context");
            case 422 -> new ApiException(HttpStatus.valueOf(422), "AI_SERVICE_CONTRACT_REJECTED", "AI Service rejected the request contract");
            case 502 -> new ApiException(HttpStatus.BAD_GATEWAY, "AI_GENERATION_FAILED", "AI Service returned invalid generated output");
            case 503 -> new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_SERVICE_UNAVAILABLE", "AI Service is temporarily unavailable");
            default -> new ApiException(HttpStatus.BAD_GATEWAY, "AI_SERVICE_INVALID_RESPONSE", "AI Service returned an unexpected response");
        };
    }

    private String safeDetail(byte[] body) {
        try {
            JsonNode node = objectMapper.readTree(new String(body, StandardCharsets.UTF_8));
            JsonNode detail = node == null ? null : node.get("detail");
            return detail == null || !detail.isTextual() ? "" : detail.asText();
        } catch (IOException ignored) {
            return "";
        }
    }

    private static boolean hasCause(Throwable error, Class<? extends Throwable> type) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            if (type.isInstance(current)) return true;
        }
        return false;
    }

    private static ApiException invalidResponse(String message, Exception cause) {
        ApiException exception = new ApiException(HttpStatus.BAD_GATEWAY, "AI_SERVICE_INVALID_RESPONSE", message);
        exception.initCause(cause);
        return exception;
    }
}

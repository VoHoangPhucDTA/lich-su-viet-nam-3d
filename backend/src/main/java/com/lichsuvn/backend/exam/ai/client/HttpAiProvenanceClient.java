package com.lichsuvn.backend.exam.ai.client;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.ai.client.dto.AiProvenanceDtos;
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

@Component
public class HttpAiProvenanceClient implements AiProvenanceClient {
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final AiServiceProperties properties;

    public HttpAiProvenanceClient(@Qualifier(AiServiceClientConfig.HTTP_CLIENT_BEAN) HttpClient httpClient,
                                  ObjectMapper objectMapper, AiServiceProperties properties) {
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Override
    public AiProvenanceDtos.Response validate(AiProvenanceDtos.Request request, String requestId) {
        return send(request, requestId, properties.provenancePath(), AiProvenanceDtos.Response.class,
                "AI_CANDIDATE_PROVENANCE_INVALID", "AI provenance");
    }

    @Override
    public AiProvenanceDtos.SearchResponse search(AiProvenanceDtos.SearchRequest request, String requestId) {
        return send(request, requestId, "/ai/provenance/sources/search", AiProvenanceDtos.SearchResponse.class,
                "AI_SOURCE_SEARCH_UNAVAILABLE", "Canonical source search");
    }

    private <T> T send(Object request, String requestId, String path, Class<T> responseType,
                       String invalidCode, String operation) {
        if (properties.internalToken().isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_PROVENANCE_SERVICE_UNAVAILABLE",
                    operation + " internal authentication is not configured");
        }
        byte[] body;
        try { body = objectMapper.writeValueAsBytes(request); }
        catch (JsonProcessingException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, invalidCode, operation + " request is invalid");
        }
        HttpRequest httpRequest = HttpRequest.newBuilder(resolve(path))
                .timeout(properties.readTimeout())
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("X-Request-ID", requestId)
                .header("X-Internal-Service-Token", properties.internalToken())
                .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
        try {
            HttpResponse<byte[]> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() == 401 || response.statusCode() == 403 || response.statusCode() == 503) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_PROVENANCE_SERVICE_UNAVAILABLE", "AI provenance service is unavailable");
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, invalidCode, operation + " returned an invalid response");
            }
            return objectMapper.readValue(response.body(), responseType);
        } catch (HttpTimeoutException ex) {
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, "AI_PROVENANCE_VALIDATION_TIMEOUT", "AI provenance validation timed out");
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_PROVENANCE_SERVICE_UNAVAILABLE", "AI provenance validation was interrupted");
        } catch (IOException ex) {
            String code = hasCause(ex, ConnectException.class) ? "AI_PROVENANCE_SERVICE_UNAVAILABLE" : invalidCode;
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, code, operation + " communication failed");
        }
    }

    private URI resolve(String path) {
        String normalized = path.startsWith("/") ? path.substring(1) : path;
        String base = properties.baseUrl().toString();
        return URI.create(base.endsWith("/") ? base : base + "/").resolve(normalized);
    }
    private boolean hasCause(Throwable error, Class<? extends Throwable> type) {
        for (Throwable current = error; current != null; current = current.getCause()) if (type.isInstance(current)) return true;
        return false;
    }
}

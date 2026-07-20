package com.lichsuvn.backend.exam.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.ai.client.HttpAiQuizClient;
import com.lichsuvn.backend.exam.ai.client.dto.AiQuizGenerationRequest;
import com.lichsuvn.backend.exam.ai.config.AiServiceProperties;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HttpAiQuizClientTest {
    private HttpServer server;

    @AfterEach
    void stop() {
        if (server != null) server.stop(0);
    }

    @Test
    void parsesSuccessAndSendsCorrelationId() throws Exception {
        server = server(exchange -> respond(exchange, 200, validJson()));
        HttpAiQuizClient client = client(Duration.ofSeconds(2));

        var result = client.generate(request(), "request-123");

        assertEquals(1, result.metadata().generatedCount());
    }

    @Test
    void mapsFastApiStatusesWithoutExposingRawBody() throws Exception {
        for (var item : List.of(
                new StatusCase(409, "{\"detail\":\"INSUFFICIENT_CONTEXT\"}", "AI_INSUFFICIENT_CONTEXT"),
                new StatusCase(422, "{\"detail\":[]}", "AI_SERVICE_CONTRACT_REJECTED"),
                new StatusCase(502, "{\"detail\":\"provider secret\"}", "AI_GENERATION_FAILED"),
                new StatusCase(503, "{\"detail\":\"provider secret\"}", "AI_SERVICE_UNAVAILABLE")
        )) {
            if (server != null) server.stop(0);
            server = server(exchange -> respond(exchange, item.status(), item.body()));
            ApiException error = assertThrows(ApiException.class, () -> client(Duration.ofSeconds(2)).generate(request(), "id"));
            assertEquals(item.code(), error.getCode());
            assertTrue(!error.getMessage().contains("provider secret"));
        }
    }

    @Test
    void mapsMalformedJsonAndTimeout() throws Exception {
        server = server(exchange -> respond(exchange, 200, "not-json"));
        ApiException malformed = assertThrows(ApiException.class, () -> client(Duration.ofSeconds(2)).generate(request(), "id"));
        assertEquals("AI_SERVICE_INVALID_RESPONSE", malformed.getCode());

        server.stop(0);
        server = server(exchange -> {
            try { Thread.sleep(250); } catch (InterruptedException ex) { Thread.currentThread().interrupt(); }
            respond(exchange, 200, validJson());
        });
        ApiException timeout = assertThrows(ApiException.class, () -> client(Duration.ofMillis(50)).generate(request(), "id"));
        assertEquals("AI_SERVICE_TIMEOUT", timeout.getCode());
    }

    @Test
    void mapsConnectionRefusedWithoutRetry() throws Exception {
        server = server(exchange -> respond(exchange, 200, validJson()));
        HttpAiQuizClient client = client(Duration.ofSeconds(1));
        server.stop(0);
        server = null;

        ApiException error = assertThrows(ApiException.class, () -> client.generate(request(), "id"));

        assertEquals("AI_SERVICE_UNAVAILABLE", error.getCode());
    }

    private HttpAiQuizClient client(Duration timeout) {
        AiServiceProperties properties = new AiServiceProperties(true,
                URI.create("http://127.0.0.1:" + server.getAddress().getPort()),
                Duration.ofSeconds(1), timeout, "/ai/quiz/generate", "/ai/health", 3);
        return new HttpAiQuizClient(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build(), new ObjectMapper(), properties);
    }

    private static AiQuizGenerationRequest request() {
        return new AiQuizGenerationRequest("query", 12, 6, null, "MEDIUM", 1, 5, List.of());
    }

    private static HttpServer server(Handler handler) throws IOException {
        HttpServer value = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        value.createContext("/ai/quiz/generate", exchange -> {
            assertTrue(exchange.getRequestHeaders().getFirst("X-Request-ID") != null
                    && !exchange.getRequestHeaders().getFirst("X-Request-ID").isBlank(),
                    "correlation ID must be propagated");
            handler.handle(exchange);
        });
        value.setExecutor(Executors.newCachedThreadPool());
        value.start();
        return value;
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static String validJson() {
        return """
                {"questions":[{"question":"Q","options":[{"id":"A","text":"A"},{"id":"B","text":"B"},{"id":"C","text":"C"},{"id":"D","text":"D"}],"correctOptionId":"B","explanation":"E","difficulty":"MEDIUM","sourceChunkIds":["c1"]}],"sources":[{"chunkId":"c1","documentId":"d1","grade":12,"lessonNumber":6,"lessonTitle":"L","sectionTitle":"S","pageStart":1,"pageEnd":1}],"metadata":{"requestedCount":1,"generatedCount":1,"retrievedChunkCount":1,"generationModel":"g","embeddingModel":"e","collectionName":"c","promptVersion":"p","schemaVersion":"s","repairAttempts":0,"latencyMs":1.0},"warnings":[]}
                """;
    }

    @FunctionalInterface
    private interface Handler { void handle(HttpExchange exchange) throws IOException; }
    private record StatusCase(int status, String body, String code) {}
}

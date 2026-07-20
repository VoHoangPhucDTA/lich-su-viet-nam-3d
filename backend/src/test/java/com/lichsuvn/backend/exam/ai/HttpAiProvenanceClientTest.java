package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.exam.ai.client.HttpAiProvenanceClient;
import com.lichsuvn.backend.exam.ai.client.dto.AiProvenanceDtos;
import com.lichsuvn.backend.exam.ai.config.AiServiceProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HttpAiProvenanceClientTest {
    private HttpServer server;

    @AfterEach
    void stop() {
        if (server != null) server.stop(0);
    }

    @Test
    void sendsInternalTokenAndParsesMetadataOnlyResponse() throws Exception {
        AtomicReference<String> receivedToken = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/ai/provenance/validate", exchange -> {
            receivedToken.set(exchange.getRequestHeaders().getFirst("X-Internal-Service-Token"));
            byte[] body = """
                    {"valid":true,"corpusMatches":true,"collectionMatches":true,"embeddingContractMatches":true,
                     "sources":[{"chunkId":"chunk-1","exists":true,"hashMatches":true,"pendingReview":false}],"errors":[]}
                    """.getBytes();
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();

        AiProvenanceDtos.Response response = client(Duration.ofSeconds(1)).validate(request(), "request-id");
        assertEquals("unit-test-token", receivedToken.get());
        assertEquals(true, response.valid());
        assertEquals(1, response.sources().size());
    }

    @Test
    void timeoutFailsClosedWithoutExposingToken() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/ai/provenance/validate", exchange -> {
            try { Thread.sleep(150); } catch (InterruptedException ex) { Thread.currentThread().interrupt(); }
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        server.start();

        ApiException error = assertThrows(ApiException.class,
                () -> client(Duration.ofMillis(30)).validate(request(), "request-id"));
        assertEquals("AI_PROVENANCE_VALIDATION_TIMEOUT", error.getCode());
        assertFalse(error.getMessage().contains("unit-test-token"));
    }

    @Test
    void canonicalSearchUsesFixedInternalRouteAndReturnsBoundedContract() throws Exception {
        AtomicReference<String> receivedToken = new AtomicReference<>();
        AtomicReference<String> receivedBody = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/ai/provenance/sources/search", exchange -> {
            receivedToken.set(exchange.getRequestHeaders().getFirst("X-Internal-Service-Token"));
            receivedBody.set(new String(exchange.getRequestBody().readAllBytes()));
            byte[] body = """
                    {"results":[{"chunkId":"chunk-2","chunkHash":"%s","documentId":"doc","grade":12,
                    "lessonNumber":6,"lessonTitle":"Lesson","sectionTitle":"Section","pageStart":1,"pageEnd":1,
                    "excerpt":"bounded","distance":0.12,"pendingReview":false}]}
                    """.formatted("b".repeat(64)).getBytes();
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();

        AiProvenanceDtos.SearchResponse response = client(Duration.ofSeconds(1)).search(
                new AiProvenanceDtos.SearchRequest("query", 12, 6, null, 10), "request-id");
        assertEquals("unit-test-token", receivedToken.get());
        assertEquals(true, receivedBody.get().contains("\"lessonNumber\":6"));
        assertEquals("chunk-2", response.results().getFirst().chunkId());
        assertFalse(receivedBody.get().contains("unit-test-token"));
    }

    private HttpAiProvenanceClient client(Duration timeout) {
        AiServiceProperties properties = new AiServiceProperties(true,
                URI.create("http://127.0.0.1:" + server.getAddress().getPort()), Duration.ofSeconds(1), timeout,
                "/ai/quiz/generate", "/ai/health", "/ai/provenance/validate", "unit-test-token", 3);
        return new HttpAiProvenanceClient(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build(),
                new ObjectMapper(), properties);
    }

    private AiProvenanceDtos.Request request() {
        return new AiProvenanceDtos.Request("a".repeat(64), "collection", "embedding", 768,
                List.of(new AiProvenanceDtos.Source("chunk-1", "b".repeat(64))));
    }
}

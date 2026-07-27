package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.exam.ai.api.dto.PracticeQuizCompletionRequest;
import com.lichsuvn.backend.exam.ai.application.PracticeQuizCompletionService;
import com.lichsuvn.backend.exam.ai.infrastructure.PracticeQuizAttemptRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

@ExtendWith(MockitoExtension.class)
class PracticeQuizCompletionServiceTest {
    @Mock PracticeQuizAttemptRepository repository;

    @Test
    void storesOnlySafeMetadataAndUsesDeterministicAttemptId() {
        var service = new PracticeQuizCompletionService(repository, new ObjectMapper());
        var principal = new UserPrincipal("owner", new byte[16], "owner@example.test", List.of("student"));
        var request = new PracticeQuizCompletionRequest(
                "session-123",
                "  Cách mạng tháng Tám  ",
                "MEDIUM",
                5,
                90_000
        );

        var first = service.record(request, principal);
        var second = service.record(request, principal);

        assertEquals(1, first.schemaVersion());
        assertEquals(first.attemptId(), second.attemptId());
        assertEquals("recorded", first.status());

        ArgumentCaptor<byte[]> attemptId = ArgumentCaptor.forClass(byte[].class);
        ArgumentCaptor<byte[]> userId = ArgumentCaptor.forClass(byte[].class);
        ArgumentCaptor<String> config = ArgumentCaptor.forClass(String.class);
        verify(repository, times(2)).recordCompletion(
                attemptId.capture(),
                userId.capture(),
                org.mockito.ArgumentMatchers.eq("Cách mạng tháng Tám"),
                org.mockito.ArgumentMatchers.eq("medium"),
                org.mockito.ArgumentMatchers.eq(5),
                org.mockito.ArgumentMatchers.eq(90_000),
                config.capture()
        );
        assertArrayEquals(principal.idBytes(), userId.getValue());
        assertEquals(16, attemptId.getValue().length);
        assertTrue(config.getValue().contains("\"scoreAuthority\":\"CLIENT_NOT_STORED\""));
        assertTrue(config.getValue().contains("\"timingAuthority\":\"CLIENT_UNVERIFIED\""));
        assertTrue(!config.getValue().contains("correctAnswer"));
    }
}

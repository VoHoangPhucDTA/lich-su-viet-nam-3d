package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.exam.ai.api.dto.PracticeQuizGenerateRequest;
import com.lichsuvn.backend.exam.ai.api.dto.PracticeQuizGenerateResponse;
import org.junit.jupiter.api.Test;

import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PracticeQuizPublicContractTest {
    @Test
    void publicRequestAndResponseDoNotExposeInternalRoutingFields() {
        assertEquals(
                List.of("query", "difficulty", "count"),
                componentNames(PracticeQuizGenerateRequest.class)
        );
        assertEquals(
                List.of("questions", "sources", "warnings", "generation"),
                componentNames(PracticeQuizGenerateResponse.class)
        );
    }

    private static List<String> componentNames(Class<?> type) {
        return Arrays.stream(type.getRecordComponents()).map(RecordComponent::getName).toList();
    }
}

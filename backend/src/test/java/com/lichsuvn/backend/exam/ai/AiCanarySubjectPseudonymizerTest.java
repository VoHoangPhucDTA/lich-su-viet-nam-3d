package com.lichsuvn.backend.exam.ai;

import com.lichsuvn.backend.exam.ai.application.AiCanarySubjectPseudonymizer;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class AiCanarySubjectPseudonymizerTest {
    @Test
    void assignmentIsStableAndSecretScopedWithoutExposingRawUserId() {
        String first = AiCanarySubjectPseudonymizer.pseudonymize("synthetic-user-1", "secret-a");

        assertEquals(first, AiCanarySubjectPseudonymizer.pseudonymize("synthetic-user-1", "secret-a"));
        assertNotEquals(first, AiCanarySubjectPseudonymizer.pseudonymize("synthetic-user-2", "secret-a"));
        assertNotEquals(first, AiCanarySubjectPseudonymizer.pseudonymize("synthetic-user-1", "secret-b"));
        assertFalse(first.contains("synthetic-user-1"));
    }

    @Test
    void missingIdentityOrSecretFailsClosed() {
        assertNull(AiCanarySubjectPseudonymizer.pseudonymize(null, "secret"));
        assertNull(AiCanarySubjectPseudonymizer.pseudonymize(" ", "secret"));
        assertNull(AiCanarySubjectPseudonymizer.pseudonymize("user", null));
        assertNull(AiCanarySubjectPseudonymizer.pseudonymize("user", " "));
    }
}

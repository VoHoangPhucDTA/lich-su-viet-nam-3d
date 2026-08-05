package com.lichsuvn.backend.admin.application;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.sql.SQLException;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminUserMutationTransactionRunnerTest {

    @Test
    void nullMutationResultRollsBackInsideTransaction() {
        RecordingTransactionManager manager = new RecordingTransactionManager();
        AdminUserMutationTransactionRunner runner =
                new AdminUserMutationTransactionRunner(manager);

        assertThrows(IllegalStateException.class, () -> runner.execute(() -> null));

        assertFalse(manager.committed);
        assertTrue(manager.rolledBack);
    }

    @Test
    void TiDbWriteConflictIsRetriedAndMappedToConflict() {
        RecordingTransactionManager manager = new RecordingTransactionManager();
        AdminUserMutationTransactionRunner runner =
                new AdminUserMutationTransactionRunner(manager);
        AtomicInteger attempts = new AtomicInteger();

        assertThrows(
                com.lichsuvn.backend.common.exception.ApiException.class,
                () -> runner.execute(() -> {
                    attempts.incrementAndGet();
                    throw new RuntimeException(new SQLException("write conflict", "HY000", 9007));
                }));

        assertTrue(attempts.get() == 3);
        assertTrue(manager.rolledBack);
        assertFalse(manager.committed);
    }

    private static final class RecordingTransactionManager
            implements PlatformTransactionManager {
        private boolean committed;
        private boolean rolledBack;

        @Override
        public TransactionStatus getTransaction(TransactionDefinition definition) {
            return new SimpleTransactionStatus();
        }

        @Override
        public void commit(TransactionStatus status) {
            committed = true;
        }

        @Override
        public void rollback(TransactionStatus status) {
            rolledBack = true;
        }
    }
}

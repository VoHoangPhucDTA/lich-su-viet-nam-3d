package com.lichsuvn.backend.auth.integration;

import com.lichsuvn.backend.auth.domain.UserEntity;
import com.lichsuvn.backend.auth.infrastructure.UserRepository;
import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.testsupport.LocalMySqlContainer;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.OptimisticLockType;
import org.hibernate.annotations.OptimisticLocking;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.jwt.secret=test-only-secret-that-is-long-enough-for-hmac-signing"
})
@Testcontainers(disabledWithoutDocker = true)
class UserEntityOptimisticConcurrencyIntegrationTest {
    private static final String USER_ID = "00000000-0000-4000-8000-000000009901";

    @Container
    private static final MySQLContainer MYSQL =
            new LocalMySqlContainer("mysql:8.0.36")
                    .withDatabaseName("user_optimistic_concurrency")
                    .withUsername("test")
                    .withPassword("test");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
        registry.add("spring.datasource.hikari.connection-init-sql", () -> "");
    }

    @Autowired
    private UserRepository users;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void mappingUsesVersionlessOptimisticLockingWithDynamicUpdates() {
        assertNotNull(UserEntity.class.getAnnotation(DynamicUpdate.class));
        OptimisticLocking locking =
                UserEntity.class.getAnnotation(OptimisticLocking.class);
        assertNotNull(locking);
        assertEquals(OptimisticLockType.ALL, locking.type());
    }

    @Test
    void staleJpaWriterCannotRestoreAdminChangedStatusOrCredentialVersion()
            throws Exception {
        byte[] id = UuidBytes.fromUuid(UUID.fromString(USER_ID));
        jdbc.update("DELETE FROM user_roles WHERE user_id=?", id);
        jdbc.update("DELETE FROM users WHERE id=?", id);
        jdbc.update("""
                INSERT INTO users (
                    id, email, password_hash, full_name, status,
                    failed_login_count, auth_version
                )
                VALUES (?, 'optimistic-race@example.test', 'hash',
                        'Original name', 'active', 0, 0)
                """, id);

        CountDownLatch loaded = new CountDownLatch(1);
        CountDownLatch adminCommitted = new CountDownLatch(1);
        TransactionTemplate jpaTransaction =
                new TransactionTemplate(transactionManager);

        try (var executor = Executors.newSingleThreadExecutor()) {
            var staleWriter = executor.submit(() -> jpaTransaction.execute(status -> {
                UserEntity user = users.findById(id).orElseThrow();
                user.setFullName("Stale profile write");
                loaded.countDown();
                await(adminCommitted);
                return user.getFullName();
            }));

            assertTrue(loaded.await(30, TimeUnit.SECONDS));
            assertEquals(1, jdbc.update("""
                    UPDATE users
                    SET status='disabled',
                        auth_version=auth_version + 1
                    WHERE id=?
                    """, id));
            adminCommitted.countDown();

            ExecutionException conflict =
                    assertThrows(ExecutionException.class, staleWriter::get);
            assertNotNull(conflict.getCause());
        }

        assertEquals("disabled", jdbc.queryForObject(
                "SELECT status FROM users WHERE id=?",
                String.class,
                id));
        assertEquals(1L, jdbc.queryForObject(
                "SELECT auth_version FROM users WHERE id=?",
                Long.class,
                id));
        assertEquals("Original name", jdbc.queryForObject(
                "SELECT full_name FROM users WHERE id=?",
                String.class,
                id));
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(30, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting for concurrent mutation");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Concurrent mutation was interrupted", exception);
        }
    }
}

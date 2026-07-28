package com.lichsuvn.backend.admin.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminUserDtos;
import com.lichsuvn.backend.admin.api.dto.AdminUserMutationDtos;
import com.lichsuvn.backend.admin.application.AdminUserMutationService;
import com.lichsuvn.backend.admin.application.AdminUserMutationTransactionRunner;
import com.lichsuvn.backend.admin.application.AdminUserReadService;
import com.lichsuvn.backend.admin.infrastructure.AdminUserMutationRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminUserReadRepository;
import com.lichsuvn.backend.auth.infrastructure.UuidBytes;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import com.lichsuvn.backend.common.media.MediaUrlPolicy;
import com.lichsuvn.backend.testsupport.LocalMySqlContainer;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.mysql.MySQLContainer;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class AdminUserMutationIntegrationTest {
    private static final String ACTOR = "10000000-0000-0000-0000-000000000001";
    private static MySQLContainer mysql;
    private static HikariDataSource dataSource;
    private static JdbcTemplate jdbc;
    private static NamedParameterJdbcTemplate named;
    private static TransactionTemplate tx;
    private static AdminUserMutationTransactionRunner mutationTransactions;
    private static AdminUserReadService reads;
    private static AdminUserMutationService mutations;
    private static UserPrincipal actor;
    private static boolean available;
    private static String unavailableReason;

    @BeforeAll
    static void startDatabase() {
        try {
            mysql = new LocalMySqlContainer("mysql:8.0.36")
                    .withDatabaseName("admin_phase10_test")
                    .withUsername("test")
                    .withPassword("test");
            mysql.start();
            Flyway flyway = Flyway.configure()
                    .dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                    .locations("filesystem:src/main/resources/db/migration")
                    .load();
            flyway.migrate();

            HikariConfig config = new HikariConfig();
            config.setJdbcUrl(mysql.getJdbcUrl()
                    + "?connectionTimeZone=Asia/Ho_Chi_Minh"
                    + "&forceConnectionTimeZoneToSession=true");
            config.setUsername(mysql.getUsername());
            config.setPassword(mysql.getPassword());
            config.setMaximumPoolSize(8);
            config.setConnectionInitSql("SET time_zone = '+07:00'");
            dataSource = new HikariDataSource(config);
            jdbc = new JdbcTemplate(dataSource);
            named = new NamedParameterJdbcTemplate(dataSource);
            reads = new AdminUserReadService(
                    new AdminUserReadRepository(named, new MediaUrlPolicy()));
            var transactionManager = new DataSourceTransactionManager(dataSource);
            tx = new TransactionTemplate(transactionManager);
            mutationTransactions = new AdminUserMutationTransactionRunner(transactionManager);
            mutations = new AdminUserMutationService(
                    new AdminUserMutationRepository(named, new ObjectMapper()), reads, mutationTransactions);
            seed(ACTOR, "phase10-actor@example.test", "active", List.of("teacher"));
            actor = principal(ACTOR);
            available = true;
        } catch (Exception exception) {
            unavailableReason = exception.getClass().getSimpleName() + ": " + exception.getMessage();
            if (dataSource != null) dataSource.close();
            if (mysql != null) mysql.stop();
        }
    }

    @AfterAll
    static void stopDatabase() {
        if (dataSource != null) dataSource.close();
        if (mysql != null) mysql.stop();
    }

    @Test
    void flywayV39ProvidesExactVersionAndPermanentCredentialCounter() {
        assumeTrue(available, unavailableReason);
        assertEquals("datetime(6)", columnType("users", "updated_at"));
        assertEquals("bigint", columnType("users", "auth_version"));
        assertEquals("0", jdbc.queryForObject("""
                SELECT COLUMN_DEFAULT
                FROM information_schema.columns
                WHERE table_schema=DATABASE() AND table_name='users'
                  AND column_name='auth_version'
                """, String.class));
        assertEquals(1L, jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM flyway_schema_history
                WHERE version='39' AND success=1
                """, Long.class));

        String id = id(10);
        seed(id, "phase10-version@example.test", "active", List.of("student"));
        jdbc.update("UPDATE users SET updated_at='2026-07-26 10:20:30.123456' WHERE id=UUID_TO_BIN(?)", id);
        assertEquals(
                "2026-07-26T03:20:30.123456Z",
                reads.findUser(id).account().updatedAt());
        assertEquals(0L, authVersion(id));
    }

    @Test
    void flywayV40ProvidesOneDurableLastActiveAdminGuard() {
        assumeTrue(available, unavailableReason);
        assertEquals(1L, jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM flyway_schema_history
                WHERE version='40' AND success=1
                """, Long.class));
        assertEquals(1L, jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM admin_mutation_guards
                WHERE guard_key='last_active_admin'
                """, Long.class));
    }

    @Test
    void flywayV41ProvidesAtomicActiveAdminCounter() {
        assumeTrue(available, unavailableReason);
        assertEquals(41, jdbc.queryForObject("""
                SELECT MAX(CAST(version AS UNSIGNED))
                FROM flyway_schema_history
                WHERE success=1
                """, Integer.class));
        assertEquals(activeAdminCount(), guardActiveAdminCount());
    }

    @Test
    void completeRoleReplacementAndImmediateStatusSavePreserveSixDigits() {
        assumeTrue(available, unavailableReason);
        String id = id(11);
        seed(id, "phase10-consecutive@example.test", "active", List.of("student"));
        String expected = reads.findUser(id).account().updatedAt();

        AdminUserDtos.Detail roles = tx.execute(status -> mutations.replaceRoles(
                id,
                new AdminUserMutationDtos.ReplaceRoles(
                        expected, List.of("student", "teacher")),
                actor));
        assertEquals(
                List.of(AdminUserDtos.Role.TEACHER, AdminUserDtos.Role.STUDENT),
                roles.account().roles());
        assertNotEquals(expected, roles.account().updatedAt());
        assertEquals(1L, authVersion(id));

        AdminUserDtos.Detail disabled = tx.execute(status -> mutations.updateStatus(
                id,
                new AdminUserMutationDtos.ChangeStatus(
                        roles.account().updatedAt(), "disabled"),
                actor));
        assertEquals(AdminUserDtos.Status.DISABLED, disabled.account().status());
        assertNotEquals(roles.account().updatedAt(), disabled.account().updatedAt());
        assertEquals(2L, authVersion(id));
        assertEquals(2, auditCount(id));

        String audit = jdbc.queryForObject("""
                SELECT CONCAT(CAST(before_json AS CHAR),CAST(after_json AS CHAR))
                FROM admin_audit_logs
                WHERE entity_type='user' AND entity_id=?
                ORDER BY id DESC LIMIT 1
                """, String.class, id);
        assertTrue(audit.contains("expectedVersion"));
        assertTrue(audit.contains("resultingVersion"));
        for (String forbidden : List.of(
                "auth_version", "authVersion", "email", "token", "password",
                "provider", "locked", "ip_address", "learning")) {
            assertFalse(audit.toLowerCase().contains(forbidden.toLowerCase()), forbidden);
        }
    }

    @Test
    void noRoleCanBeRepairedAndInvalidStoredPayloadTransitionAndDeletedStatesAreRejected() {
        assumeTrue(available, unavailableReason);
        String noRole = id(12);
        seed(noRole, "phase10-no-role@example.test", "pending", List.of());
        var repaired = tx.execute(status -> mutations.replaceRoles(
                noRole,
                new AdminUserMutationDtos.ReplaceRoles(
                        reads.findUser(noRole).account().updatedAt(),
                        List.of("admin", "teacher")),
                actor));
        assertEquals(
                List.of(AdminUserDtos.Role.ADMIN, AdminUserDtos.Role.TEACHER),
                repaired.account().roles());

        String unsupported = id(13);
        seed(unsupported, "phase10-unknown-role@example.test", "active", List.of("student"));
        jdbc.update("INSERT INTO roles(code,name) VALUES ('future_role','Future')");
        jdbc.update("""
                INSERT INTO user_roles(user_id,role_id)
                SELECT UUID_TO_BIN(?),id FROM roles WHERE code='future_role'
                """, unsupported);
        assertCode("UNSUPPORTED_STORED_USER_ROLE", () -> tx.execute(status ->
                mutations.replaceRoles(
                        unsupported,
                        new AdminUserMutationDtos.ReplaceRoles(
                                reads.findUser(unsupported).account().updatedAt(),
                                List.of("teacher")),
                        actor)));

        String active = id(14);
        seed(active, "phase10-invalid@example.test", "active", List.of("student"));
        String version = reads.findUser(active).account().updatedAt();
        Map<String, Object> before = snapshot(active);
        assertCode("DUPLICATE_USER_ROLE", () -> tx.execute(status ->
                mutations.replaceRoles(active,
                        new AdminUserMutationDtos.ReplaceRoles(
                                version, List.of("teacher", "teacher")), actor)));
        assertCode("UNSUPPORTED_USER_ROLE", () -> tx.execute(status ->
                mutations.replaceRoles(active,
                        new AdminUserMutationDtos.ReplaceRoles(
                                version, List.of("owner")), actor)));
        assertCode("INVALID_USER_ROLES", () -> tx.execute(status ->
                mutations.replaceRoles(active,
                        new AdminUserMutationDtos.ReplaceRoles(version, List.of()), actor)));
        assertCode("INVALID_USER_STATUS_TRANSITION", () -> tx.execute(status ->
                mutations.updateStatus(active,
                        new AdminUserMutationDtos.ChangeStatus(version, "pending"), actor)));
        assertCode("INVALID_USER_STATUS", () -> tx.execute(status ->
                mutations.updateStatus(active,
                        new AdminUserMutationDtos.ChangeStatus(version, "archived"), actor)));
        assertCode("INVALID_EXPECTED_VERSION", () -> tx.execute(status ->
                mutations.updateStatus(active,
                        new AdminUserMutationDtos.ChangeStatus(
                                "2026-07-26T10:20:30Z", "disabled"), actor)));
        assertCode("NO_CHANGES", () -> tx.execute(status ->
                mutations.updateStatus(active,
                        new AdminUserMutationDtos.ChangeStatus(version, "active"), actor)));
        assertEquals(before, snapshot(active));
        assertEquals(0, auditCount(active));

        assertCode("INVALID_USER_ID", () -> tx.execute(status ->
                mutations.updateStatus(
                        "not-a-uuid",
                        new AdminUserMutationDtos.ChangeStatus(version, "disabled"),
                        actor)));
        assertCode("ADMIN_USER_NOT_FOUND", () -> tx.execute(status ->
                mutations.updateStatus(
                        id(98),
                        new AdminUserMutationDtos.ChangeStatus(version, "disabled"),
                        actor)));

        String deleted = id(15);
        seed(deleted, "phase10-deleted@example.test", "deleted", List.of("student"));
        assertCode("USER_DELETED_IMMUTABLE", () -> tx.execute(status ->
                mutations.updateStatus(
                        deleted,
                        new AdminUserMutationDtos.ChangeStatus(
                                reads.findUser(deleted).account().updatedAt(), "active"),
                        actor)));
    }

    @Test
    void staleAndSelfActionsModifyNothing() {
        assumeTrue(available, unavailableReason);
        String target = id(16);
        seed(target, "phase10-stale@example.test", "active", List.of("student"));
        Map<String, Object> before = snapshot(target);
        assertCode("USER_UPDATE_CONFLICT", () -> tx.execute(status ->
                mutations.updateStatus(
                        target,
                        new AdminUserMutationDtos.ChangeStatus(
                                "2020-01-01T00:00:00.000001Z", "disabled"),
                        actor)));
        assertEquals(before, snapshot(target));

        String selfId = id(17);
        seed(selfId, "phase10-self@example.test", "active", List.of("admin"));
        UserPrincipal self = principal(selfId);
        String version = reads.findUser(selfId).account().updatedAt();
        assertCode("ADMIN_SELF_MUTATION_FORBIDDEN", () -> tx.execute(status ->
                mutations.updateStatus(
                        selfId,
                        new AdminUserMutationDtos.ChangeStatus(version, "disabled"),
                        self)));
        assertCode("ADMIN_SELF_MUTATION_FORBIDDEN", () -> tx.execute(status ->
                mutations.replaceRoles(
                        selfId,
                        new AdminUserMutationDtos.ReplaceRoles(version, List.of("teacher")),
                        self)));
        assertEquals(0L, authVersion(selfId));
    }

    @Test
    void sameVersionHasOneWinnerAndDurableGuardProtectsFinalTwoAdmins() throws Exception {
        assumeTrue(available, unavailableReason);
        String sameTarget = id(18);
        seed(sameTarget, "phase10-race@example.test", "pending", List.of("student"));
        String sharedVersion = reads.findUser(sameTarget).account().updatedAt();
        List<Object> sameTargetResults = race(
                () -> mutateStatus(sameTarget, sharedVersion, "active"),
                () -> mutateRoles(sameTarget, sharedVersion, List.of("teacher")));
        assertEquals(1, sameTargetResults.stream()
                .filter(AdminUserDtos.Detail.class::isInstance).count());
        assertEquals(1, sameTargetResults.stream()
                .filter("USER_UPDATE_CONFLICT"::equals).count());
        assertEquals(1L, authVersion(sameTarget));
        assertEquals(1, auditCount(sameTarget));

        String firstAdmin = id(19);
        String secondAdmin = id(20);
        jdbc.update("""
                UPDATE users u
                JOIN user_roles ur ON ur.user_id=u.id
                JOIN roles r ON r.id=ur.role_id
                SET u.status='disabled'
                WHERE r.code='admin' AND u.status='active'
                """);
        seed(firstAdmin, "phase10-admin-a@example.test", "active", List.of("admin"));
        seed(secondAdmin, "phase10-admin-b@example.test", "active", List.of("admin"));
        syncActiveAdminGuard();
        long guardRevisionBefore = guardRevision();
        List<Object> lastAdminResults = race(
                () -> mutateStatus(
                        firstAdmin, reads.findUser(firstAdmin).account().updatedAt(), "disabled"),
                () -> mutateRoles(
                        secondAdmin, reads.findUser(secondAdmin).account().updatedAt(),
                        List.of("teacher")));
        assertEquals(1, lastAdminResults.stream()
                .filter(AdminUserDtos.Detail.class::isInstance).count());
        assertEquals(1, lastAdminResults.stream()
                .filter("LAST_ACTIVE_ADMIN_REQUIRED"::equals).count());
        assertEquals(1L, jdbc.queryForObject("""
                SELECT COUNT(DISTINCT u.id)
                FROM users u
                JOIN user_roles ur ON ur.user_id=u.id
                JOIN roles r ON r.id=ur.role_id
                WHERE u.status='active' AND r.code='admin'
                """, Long.class));
        assertEquals(guardRevisionBefore + 1, guardRevision());
        assertEquals(1L, guardActiveAdminCount());
    }

    @Test
    void durableGuardReconcilesAnUndercountBeforeRemovingAnActiveAdmin() {
        assumeTrue(available, unavailableReason);
        String firstAdmin = id(23);
        String secondAdmin = id(24);
        seed(firstAdmin, "phase10-drift-admin-a@example.test", "active", List.of("admin"));
        seed(secondAdmin, "phase10-drift-admin-b@example.test", "active", List.of("admin"));
        long activeBefore = activeAdminCount();
        jdbc.update("""
                UPDATE admin_mutation_guards
                SET active_admin_count=1
                WHERE guard_key='last_active_admin'
                """);

        AdminUserDtos.Detail disabled = mutations.updateStatus(
                firstAdmin,
                new AdminUserMutationDtos.ChangeStatus(
                        reads.findUser(firstAdmin).account().updatedAt(), "disabled"),
                actor);

        assertEquals(AdminUserDtos.Status.DISABLED, disabled.account().status());
        assertEquals(activeBefore - 1, activeAdminCount());
        assertEquals(activeAdminCount(), guardActiveAdminCount());
    }

    @Test
    void auditAndRoleInsertFailuresRollbackStatusRolesVersionsAndAuthVersion() {
        assumeTrue(available, unavailableReason);
        String auditFailure = id(21);
        seed(auditFailure, "phase10-audit-rollback@example.test", "active", List.of("student"));
        Map<String, Object> auditBefore = snapshot(auditFailure);
        UserPrincipal missingActor = principal(id(99));
        assertThrows(RuntimeException.class, () -> tx.execute(status -> mutations.updateStatus(
                auditFailure,
                new AdminUserMutationDtos.ChangeStatus(
                        reads.findUser(auditFailure).account().updatedAt(), "disabled"),
                missingActor)));
        assertEquals(auditBefore, snapshot(auditFailure));
        assertEquals(0, auditCount(auditFailure));

        String insertFailure = id(22);
        seed(insertFailure, "phase10-role-rollback@example.test", "active", List.of("student"));
        Map<String, Object> roleBefore = snapshot(insertFailure);
        var failingRepository = new AdminUserMutationRepository(named, new ObjectMapper()) {
            @Override
            public void replaceRoles(
                    byte[] userId,
                    List<String> canonicalRoles,
                    Map<String, Long> roleIds
            ) {
                super.replaceRoles(userId, canonicalRoles, roleIds);
                throw new IllegalStateException("phase10 forced role persistence failure");
            }
        };
        var failingService = new AdminUserMutationService(failingRepository, reads, mutationTransactions);
        assertThrows(RuntimeException.class, () -> tx.execute(status ->
                failingService.replaceRoles(
                        insertFailure,
                        new AdminUserMutationDtos.ReplaceRoles(
                                reads.findUser(insertFailure).account().updatedAt(),
                                List.of("teacher")),
                        actor)));
        assertEquals(roleBefore, snapshot(insertFailure));
        assertEquals(0, auditCount(insertFailure));

        String guardedAdmin = id(25);
        String survivingAdmin = id(26);
        seed(guardedAdmin, "phase10-guard-rollback-a@example.test", "active", List.of("admin"));
        seed(survivingAdmin, "phase10-guard-rollback-b@example.test", "active", List.of("admin"));
        Map<String, Object> guardedBefore = snapshot(guardedAdmin);
        long guardCountBefore = guardActiveAdminCount();
        long guardRevisionBefore = guardRevision();
        assertThrows(RuntimeException.class, () -> mutations.updateStatus(
                guardedAdmin,
                new AdminUserMutationDtos.ChangeStatus(
                        reads.findUser(guardedAdmin).account().updatedAt(), "disabled"),
                missingActor));
        assertEquals(guardedBefore, snapshot(guardedAdmin));
        assertEquals(guardCountBefore, guardActiveAdminCount());
        assertEquals(guardRevisionBefore, guardRevision());
        assertEquals(0, auditCount(guardedAdmin));
    }

    private static Object mutateStatus(String id, String version, String status) {
        try {
            return tx.execute(transaction -> mutations.updateStatus(
                    id, new AdminUserMutationDtos.ChangeStatus(version, status), actor));
        } catch (ApiException exception) {
            return exception.getCode();
        }
    }

    private static Object mutateRoles(String id, String version, List<String> roles) {
        try {
            return tx.execute(transaction -> mutations.replaceRoles(
                    id, new AdminUserMutationDtos.ReplaceRoles(version, roles), actor));
        } catch (ApiException exception) {
            return exception.getCode();
        }
    }

    private static List<Object> race(
            java.util.concurrent.Callable<Object> first,
            java.util.concurrent.Callable<Object> second
    ) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var left = executor.submit(() -> afterLatch(ready, start, first));
            var right = executor.submit(() -> afterLatch(ready, start, second));
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            return List.of(
                    left.get(30, TimeUnit.SECONDS),
                    right.get(30, TimeUnit.SECONDS));
        }
    }

    private static Object afterLatch(
            CountDownLatch ready,
            CountDownLatch start,
            java.util.concurrent.Callable<Object> task
    ) throws Exception {
        ready.countDown();
        assertTrue(start.await(10, TimeUnit.SECONDS));
        return task.call();
    }

    private static void seed(String id, String email, String status, List<String> roles) {
        jdbc.update("""
                INSERT INTO users
                    (id,email,password_hash,full_name,status,created_at,updated_at)
                VALUES
                    (UUID_TO_BIN(?),?,'hash','Phase 10 user',?,
                     '2026-07-26 10:00:00.000000','2026-07-26 10:00:00.123456')
                """, id, email, status);
        for (String role : roles) {
            jdbc.update("""
                    INSERT INTO user_roles(user_id,role_id)
                    SELECT UUID_TO_BIN(?),id FROM roles WHERE code=?
                    """, id, role);
        }
        if ("active".equals(status) && roles.contains("admin")) {
            // Fixture DML bypasses the service that maintains the durable guard in production.
            syncActiveAdminGuard();
        }
    }

    private static Map<String, Object> snapshot(String id) {
        return jdbc.queryForMap("""
                SELECT status,
                       DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s.%f') AS updated_at,
                       auth_version,
                       COALESCE((
                         SELECT GROUP_CONCAT(r.code ORDER BY r.code SEPARATOR ',')
                         FROM user_roles ur JOIN roles r ON r.id=ur.role_id
                         WHERE ur.user_id=u.id
                       ),'') AS roles
                FROM users u
                WHERE u.id=UUID_TO_BIN(?)
                """, id);
    }

    private static long authVersion(String id) {
        return jdbc.queryForObject(
                "SELECT auth_version FROM users WHERE id=UUID_TO_BIN(?)",
                Long.class, id);
    }

    private static long guardRevision() {
        return jdbc.queryForObject("""
                SELECT revision
                FROM admin_mutation_guards
                WHERE guard_key='last_active_admin'
                """, Long.class);
    }

    private static long guardActiveAdminCount() {
        return jdbc.queryForObject("""
                SELECT active_admin_count
                FROM admin_mutation_guards
                WHERE guard_key='last_active_admin'
                """, Long.class);
    }

    private static long activeAdminCount() {
        return jdbc.queryForObject("""
                SELECT COUNT(DISTINCT u.id)
                FROM users u
                JOIN user_roles ur ON ur.user_id=u.id
                JOIN roles r ON r.id=ur.role_id
                WHERE u.status='active' AND r.code='admin'
                """, Long.class);
    }

    private static void syncActiveAdminGuard() {
        jdbc.update("""
                UPDATE admin_mutation_guards
                SET active_admin_count=(
                    SELECT COUNT(DISTINCT u.id)
                    FROM users u
                    JOIN user_roles ur ON ur.user_id=u.id
                    JOIN roles r ON r.id=ur.role_id
                    WHERE u.status='active' AND r.code='admin'
                )
                WHERE guard_key='last_active_admin'
                """);
    }

    private static int auditCount(String id) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) FROM admin_audit_logs
                WHERE entity_type='user' AND entity_id=?
                """, Integer.class, id);
    }

    private static String columnType(String table, String column) {
        return jdbc.queryForObject("""
                SELECT COLUMN_TYPE
                FROM information_schema.columns
                WHERE table_schema=DATABASE() AND table_name=? AND column_name=?
                """, String.class, table, column);
    }

    private static void assertCode(
            String code,
            org.junit.jupiter.api.function.Executable executable
    ) {
        ApiException error = assertThrows(ApiException.class, executable);
        assertEquals(code, error.getCode());
    }

    private static UserPrincipal principal(String id) {
        return new UserPrincipal(
                id,
                UuidBytes.fromUuid(UUID.fromString(id)),
                "phase10-admin@example.test",
                List.of("admin"));
    }

    private static String id(int suffix) {
        return "10000000-0000-0000-0000-%012d".formatted(suffix);
    }
}

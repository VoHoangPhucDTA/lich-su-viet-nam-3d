package com.lichsuvn.backend.testsupport;

import org.testcontainers.mysql.MySQLContainer;

/**
 * Shared settings for disposable local MySQL Testcontainers.
 *
 * <p>Cold MySQL initialization on the local Docker Desktop volume takes longer than
 * JdbcDatabaseContainer's two-minute connection default. This test-only helper changes
 * neither Surefire nor application, Flyway, or remote-database settings.</p>
 */
public final class LocalMySqlContainer extends MySQLContainer {
    public LocalMySqlContainer(String imageName) {
        super(imageName);
        withStartupTimeoutSeconds(360);
        withConnectTimeoutSeconds(360);
    }
}

package com.lichsuvn.backend.importer.canonicalgeo;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.MySQLContainer;

/**
 * Phase C2-T2 native-context regression test.
 *
 * <p>Boots the exact Spring context that {@link CanonicalGeographySyncApplication}
 * uses — its public nested {@code SyncConfiguration} class, the
 * {@code canonical-geo-sync} profile, and the non-web environment. We call
 * {@code SpringApplication.run(SyncConfiguration.class)} programmatically so
 * the wiring is identical to the native runner at the JVM level. Because
 * {@code SpringApplication.run} invokes the {@code CommandLineRunner} as
 * part of context refresh, we must disable the runner's side effects: the
 * TestContainers MySQL is empty (no historical_events rows) so
 * {@code buildPlan} would compute 361 canonical-only rows but never write.
 *
 * <p>We override application.properties via command-line args so the
 * TestContainers JDBC URL wins over the localhost default, and we pass
 * {@code --spring.flyway.enabled=false} because we already applied the V38
 * migration manually before Spring booted. The locked canonical SHA
 * {@code 7b2b2f4d391614020c5a1362006ee01847332c2a5b6fae033dc0ac605e0e58f0}
 * is passed via {@code --canonical-geo-sync.expected-canonical-sha} so the
 * runner's SHA gate accepts the run.
 *
 * <p>Without Phase C2-T2 wiring this test fails at context-refresh with
 * the same {@code UnsatisfiedDependencyException} observed in C2-P-FIX.
 * With Phase C2-T2 wiring the context refreshes successfully and exactly
 * one Jackson 2 {@link ObjectMapper} bean is present in the canonical-sync
 * application context.
 */
@DisplayName("C2-T2 native canonical-sync Spring context starts and wires Jackson 2 ObjectMapper")
class CanonicalGeographyNativeStartupTest {

    private static MySQLContainer<?> mysql;
    private static ConfigurableApplicationContext applicationContext;

    @BeforeAll
    static void startApplicationContext() throws Exception {
        try {
            // Step 1: Bring up MySQL Testcontainer.
            mysql = new MySQLContainer<>("mysql:8.0.36")
                    .withDatabaseName("lichsuvn_phase4a_native_startup")
                    .withUsername("lichsuvn_local")
                    .withPassword("native-startup-test");
            mysql.start();

            // Step 2: Apply V38 schema migration manually so Spring's
            // auto-Flyway sees an already-migrated database.
            Flyway.configure()
                    .dataSource(mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())
                    .locations("filesystem:src/main/resources/db/migration")
                    .load()
                    .migrate();

            // Step 3: Boot SpringApplication with command-line argument
            // overrides: JDBC URL + flyway disabled + locked canonical SHA.
            SpringApplication app = new SpringApplication(
                    CanonicalGeographySyncApplication.SyncConfiguration.class);
            app.setWebApplicationType(WebApplicationType.NONE);
            app.setAdditionalProfiles(CanonicalGeographySyncApplication.PROFILE);
            String[] args = new String[] {
                    "--spring.datasource.url=" + mysql.getJdbcUrl(),
                    "--spring.datasource.username=" + mysql.getUsername(),
                    "--spring.datasource.password=" + mysql.getPassword(),
                    "--spring.flyway.enabled=false",
                    "--canonical-geo-sync.expected-canonical-sha="
                            + "7b2b2f4d391614020c5a1362006ee01847332c2a5b6fae033dc0ac605e0e58f0"
            };
            applicationContext = app.run(args);
        } catch (Throwable t) {
            stopContainerQuietly();
            throw new IllegalStateException(
                    "Native canonical-sync Spring context failed to refresh: "
                            + t.getMessage(), t);
        }
    }

    @AfterAll
    static void closeContext() {
        // Clear DB rows that may have been inserted by the dry-run for safety
        // (the runner's dryRun path skips writes but FlushMode.AUTO + auto
        // commit behaviour is intentional here).
        try {
            JdbcTemplate jdbcTemplate = new JdbcTemplate(new DriverManagerDataSource(
                    mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword()));
            jdbcTemplate.update("DELETE FROM historical_events WHERE id LIKE 'c2t2-fixture-%'");
            jdbcTemplate.update("DELETE FROM historical_events");
        } catch (Throwable ignored) { /* best-effort cleanup */ }
        if (applicationContext != null) {
            applicationContext.close();
        }
        stopContainerQuietly();
    }

    private static void stopContainerQuietly() {
        if (mysql != null) {
            try { mysql.stop(); } catch (Throwable ignored) { /* best-effort */ }
        }
    }

    @Test
    @DisplayName("context refreshes and exactly one Jackson 2 ObjectMapper bean is registered")
    void contextWiresJackson2ObjectMapper() {
        // Exactly one Jackson 2 ObjectMapper bean must exist in this context;
        // it is the one declared by SyncConfiguration.canonicalGeoObjectMapper.
        var jackson2Beans = applicationContext.getBeansOfType(ObjectMapper.class);
        assertThat(jackson2Beans)
                .as("exactly one Jackson 2 ObjectMapper bean must be present in canonical-sync context")
                .hasSize(1);
        assertThat(jackson2Beans.values())
                .singleElement()
                .isInstanceOf(com.fasterxml.jackson.databind.ObjectMapper.class);

        // Required component beans all exist and are wired.
        assertThat(applicationContext.getBean(
                CanonicalGeographySyncRunner.class)).isNotNull();
        assertThat(applicationContext.getBean(
                CanonicalGeographySyncRepository.class)).isNotNull();
        assertThat(applicationContext.getBean(
                CanonicalGeographySyncService.class)).isNotNull();
        assertThat(applicationContext.getBean(
                CanonicalGeographyDatasourceGuard.class)).isNotNull();
        assertThat(applicationContext.getBean(
                CanonicalGeographyProjection.class)).isNotNull();
    }

    @Test
    @DisplayName("CanonicalGeographyProjection has a working Jackson 2 ObjectMapper wired by Spring")
    void projectionIsWiredAndFunctional() {
        var projection = applicationContext.getBean(
                CanonicalGeographyProjection.class);
        // Public behaviour: geoHash must work without throwing — proves the
        // projection has a working Jackson 2 ObjectMapper at construction.
        var hash = projection.geoHash(
                com.lichsuvn.backend.event.domain.EventGeoType.POINT,
                new BigDecimal("21.02"),
                new BigDecimal("105.85"),
                List.of(),
                null,
                true);
        assertThat(hash).isNotBlank().hasSize(64);
    }
}

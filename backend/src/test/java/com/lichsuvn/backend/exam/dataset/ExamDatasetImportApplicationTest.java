package com.lichsuvn.backend.exam.dataset;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.context.WebApplicationContext;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExamDatasetImportApplicationTest {
    @Test
    void explicitImporterProfileRunsDryByDefaultWithoutWebServer() throws Exception {
        String url = "jdbc:h2:mem:importer-nonweb;MODE=MySQL;DB_CLOSE_DELAY=-1";
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL(url);
        dataSource.setUser("sa");
        ExamH2TestDatabase.applyQuestionBankSchema(dataSource);
        Path root = Path.of("..").toAbsolutePath().normalize();

        try (ConfigurableApplicationContext context = ExamDatasetImportApplication.run(
                "--spring.datasource.url=" + url,
                "--spring.datasource.driver-class-name=org.h2.Driver",
                "--spring.datasource.username=sa",
                "--spring.datasource.password=",
                "--spring.datasource.hikari.connection-init-sql=",
                "--spring.flyway.enabled=false",
                "--app.import.exams.repository-root=" + root,
                "--app.import.exams.source-directory=" + root.resolve("data/exams"),
                "--app.import.exams.artifact-directory=" + root.resolve("frontend/public/data/exams")
        )) {
            assertFalse(context instanceof WebApplicationContext);
            assertNull(context.getEnvironment().getProperty("local.server.port"));
            assertTrue(context.getEnvironment().acceptsProfiles(org.springframework.core.env.Profiles.of("import-exams")));
        }

        assertNull(new JdbcTemplate(dataSource).queryForObject(
                "SELECT active_dataset_id FROM exam_runtime_state WHERE state_id=1",
                (resultSet, row) -> resultSet.getBytes(1)));
    }

    @Test
    void importerProfileDetectionRequiresExplicitProfile() {
        assertTrue(ExamDatasetImportApplication.isRequested("--spring.profiles.active=dev,import-exams"));
        assertFalse(ExamDatasetImportApplication.isRequested("--app.import.exams.promote=true"));
    }
}

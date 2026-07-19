package com.lichsuvn.backend.exam.dataset;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.nio.file.Path;

@Component
@Profile("import-exams")
public class ExamDatasetImportRunner implements CommandLineRunner {
    private final ExamDatasetImportService importService;
    private final Path repositoryRoot;
    private final Path sourceDirectory;
    private final Path artifactDirectory;
    private final boolean dryRun;
    private final String sourceCommit;

    public ExamDatasetImportRunner(
            ExamDatasetImportService importService,
            @Value("${app.import.exams.repository-root:..}") String repositoryRoot,
            @Value("${app.import.exams.source-directory:../data/exams}") String sourceDirectory,
            @Value("${app.import.exams.artifact-directory:../frontend/public/data/exams}") String artifactDirectory,
            @Value("${app.import.exams.promote:false}") boolean promote,
            @Value("${app.import.exams.source-commit:}") String sourceCommit
    ) {
        this.importService = importService;
        this.repositoryRoot = Path.of(repositoryRoot).toAbsolutePath().normalize();
        this.sourceDirectory = Path.of(sourceDirectory).toAbsolutePath().normalize();
        this.artifactDirectory = Path.of(artifactDirectory).toAbsolutePath().normalize();
        this.dryRun = !promote;
        this.sourceCommit = sourceCommit;
    }

    @Override
    public void run(String... args) {
        ExamDatasetImportResult result = importService.run(
                repositoryRoot,
                sourceDirectory,
                artifactDirectory,
                dryRun,
                sourceCommit
        );
        System.out.printf(
                "Exam dataset %s: hash=%s exams=%d sections=%d questions=%d topics=%d taggings=%d%n",
                result.status(),
                result.aggregateHash(),
                result.examCount(),
                result.sectionCount(),
                result.questionCount(),
                result.topicCount(),
                result.taggingCount()
        );
    }
}

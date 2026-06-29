package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Stream;

@Component
@Profile("archive-legacy-events")
public class LegacyEventArchiveRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(LegacyEventArchiveRunner.class);
    private static final int BATCH_SIZE = 100;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final Path archivePath;

    public LegacyEventArchiveRunner(
            NamedParameterJdbcTemplate jdbc,
            @Value("${app.archive.legacy-events-path:../history_events_export_2026-04-24T14-28-46-607Z}") String archivePath
    ) {
        this.jdbc = jdbc;
        this.objectMapper = new ObjectMapper();
        this.archivePath = Path.of(archivePath).toAbsolutePath().normalize();
    }

    @Override
    public void run(String... args) {
        if (!Files.isDirectory(archivePath)) {
            log.error("Legacy archive path does not exist: {}", archivePath);
            return;
        }

        List<String> warnings = new ArrayList<>();
        List<Path> jsonFiles;
        Set<String> allIds;

        try {
            jsonFiles = listJsonFiles();
        } catch (IOException ex) {
            log.error("Failed to list JSON files under {}: {}", archivePath, ex.getMessage());
            return;
        }

        allIds = collectEventIds(jsonFiles, warnings);

        if (allIds.isEmpty()) {
            log.warn("No event IDs found in the legacy dataset.");
            printSummary(jsonFiles.size(), 0, 0, 0, warnings.size(), warnings, "(no IDs to verify)");
            return;
        }

        int updatedCount = archiveEvents(allIds, warnings);
        int notFoundCount = Math.max(0, allIds.size() - updatedCount);

        String mismatchReport = verifyArchiveCount(allIds);

        printSummary(jsonFiles.size(), allIds.size(), updatedCount, notFoundCount, warnings.size(), warnings, mismatchReport);
    }

    // ── File scanning ──────────────────────────────────────────────────────

    private List<Path> listJsonFiles() throws IOException {
        try (Stream<Path> files = Files.walk(archivePath)) {
            return files
                    .filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".json"))
                    .sorted(Comparator.comparing(Path::toString))
                    .toList();
        }
    }

    // ── ID collection ──────────────────────────────────────────────────────

    private Set<String> collectEventIds(List<Path> jsonFiles, List<String> warnings) {
        Set<String> ids = new HashSet<>();
        for (Path file : jsonFiles) {
            try {
                JsonNode root = objectMapper.readTree(file.toFile());
                JsonNode idNode = root.path("id");
                if (idNode.isMissingNode() || idNode.isNull()) {
                    warnings.add("Missing 'id' field in " + file);
                    continue;
                }
                String id = idNode.asText();
                if (id.isBlank()) {
                    warnings.add("Empty 'id' field in " + file);
                    continue;
                }
                ids.add(id);
            } catch (Exception ex) {
                warnings.add("Failed to parse " + file + ": " + ex.getMessage());
            }
        }
        return ids;
    }

    // ── Database update ────────────────────────────────────────────────────

    private int archiveEvents(Set<String> allIds, List<String> warnings) {
        List<String> idList = new ArrayList<>(allIds);
        int totalUpdated = 0;

        String sql = """
                UPDATE historical_events
                SET status = 'archived'
                WHERE id IN (:ids)
                """;

        for (int i = 0; i < idList.size(); i += BATCH_SIZE) {
            int end = Math.min(i + BATCH_SIZE, idList.size());
            List<String> batch = idList.subList(i, end);

            try {
                int rows = jdbc.update(sql, new MapSqlParameterSource("ids", batch));
                totalUpdated += rows;
            } catch (Exception ex) {
                warnings.add("Batch update failed for IDs " + batch.getFirst() + ".." + batch.getLast() + ": " + ex.getMessage());
            }
        }

        return totalUpdated;
    }

    // ── Verification ───────────────────────────────────────────────────────

    private String verifyArchiveCount(Set<String> allIds) {
        String sql = "SELECT COUNT(*) FROM historical_events WHERE status = 'archived'";

        try {
            Integer totalArchived = jdbc.getJdbcTemplate().queryForObject(sql, Integer.class);
            long collected = allIds.size();
            long actual = totalArchived != null ? totalArchived : 0L;
            if (actual != collected) {
                return String.format(
                        "Mismatch: %d IDs collected, %d rows with status='archived' (expected match if all legacy events are archived and no other events are archived)",
                        collected, actual
                );
            }
            return String.format("Verified: %d rows have status='archived' (matches %d IDs collected)", actual, collected);
        } catch (Exception ex) {
            return "Could not verify archived count: " + ex.getMessage();
        }
    }

    // ── Summary ────────────────────────────────────────────────────────────

    private void printSummary(int jsonFileCount, int uniqueIdCount, int updatedCount,
                              int notFoundCount, int warningCount, List<String> warnings,
                              String mismatchReport) {
        String separator = "========================================";
        log.info(separator);
        log.info("  Legacy Event Archive Summary");
        log.info(separator);
        log.info("  JSON files scanned:    {}", jsonFileCount);
        log.info("  Unique event IDs:      {}", uniqueIdCount);
        log.info("  Database rows updated: {}", updatedCount);
        log.info("  IDs not found:         {}", notFoundCount);
        log.info("  Warnings:              {}", warningCount);
        if (!warnings.isEmpty()) {
            log.info("  ── Warning Details ──");
            for (int i = 0; i < Math.min(warnings.size(), 20); i++) {
                log.info("    [{}] {}", i + 1, warnings.get(i));
            }
            if (warnings.size() > 20) {
                log.info("    ... and {} more warnings", warnings.size() - 20);
            }
        }
        log.info(separator);
        log.info("  Verification:       {}", mismatchReport);
        log.info("  Finished successfully.");
        log.info(separator);

        // Stdout fallback for visibility
        System.out.println();
        System.out.println(separator);
        System.out.println("Legacy Event Archive Summary");
        System.out.println(separator);
        System.out.println("JSON files scanned:    " + jsonFileCount);
        System.out.println("Unique event IDs:      " + uniqueIdCount);
        System.out.println("Database rows updated: " + updatedCount);
        System.out.println("IDs not found:         " + notFoundCount);
        System.out.println("Warnings:              " + warningCount);
        System.out.println(separator);
        System.out.println("Verification:       " + mismatchReport);
        System.out.println("Finished successfully.");
        System.out.println(separator);
    }
}

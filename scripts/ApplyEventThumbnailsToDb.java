import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ApplyEventThumbnailsToDb {
    private static final Pattern ID_PATTERN = Pattern.compile("\"id\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern THUMB_PATTERN = Pattern.compile(
            "\"thumbnail\"\\s*:\\s*\"(https://res\\.cloudinary\\.com/[^\"]*"
                    + "(?:historical_events_thumbnail1|historical_events_thumbnail|event-thumbnails)/[^\"]+)\"");
    private static final Pattern MANIFEST_STATUS_PATTERN = Pattern.compile("\"status\"\\s*:\\s*\"([^\"]+)\"");

    public static void main(String[] args) throws Exception {
        Options options = Options.parse(args);
        Map<String, String> thumbnails = readThumbnails(options.eventsPath);
        ManifestCounts manifest = readManifestCounts(options.manifestPath);
        Map<String, String> env = readEnv(options.envPath);

        String url = required(env, "SPRING_DATASOURCE_URL");
        String username = required(env, "SPRING_DATASOURCE_USERNAME");
        String password = required(env, "SPRING_DATASOURCE_PASSWORD");

        SyncCounts counts = new SyncCounts();
        counts.sourceThumbnails = thumbnails.size();
        counts.manifestMatched = manifest.matched;
        counts.manifestUnmatched = manifest.unmatched;
        counts.manifestAmbiguous = manifest.ambiguous;
        counts.manifestFailed = manifest.failed;

        Connection connection = null;
        try {
            connection = DriverManager.getConnection(url, username, password);
            connection.setAutoCommit(false);
            for (Map.Entry<String, String> entry : thumbnails.entrySet()) {
                inspectAndMaybeApply(connection, entry.getKey(), entry.getValue(), options.apply, counts);
            }
            if (options.apply) {
                connection.commit();
            } else {
                connection.rollback();
            }
        } catch (Exception error) {
            if (connection != null) {
                try {
                    connection.rollback();
                } catch (SQLException rollbackError) {
                    error.addSuppressed(rollbackError);
                }
            }
            throw error;
        } finally {
            if (connection != null) connection.close();
        }

        printSummary(options, url, counts);
        if (counts.missingEvents > 0 || counts.manifestFailed > 0) {
            System.exit(2);
        }
    }

    private static void inspectAndMaybeApply(
            Connection connection,
            String eventId,
            String thumbnailUrl,
            boolean apply,
            SyncCounts counts
    ) throws Exception {
        String title = findEventTitle(connection, eventId);
        if (title == null) {
            counts.missingEvents += 1;
            return;
        }

        MediaRow target = findMedia(connection, eventId, thumbnailUrl);
        int otherThumbnailRows = countOtherThumbnailRows(connection, eventId, thumbnailUrl);
        boolean targetIsAlreadyValid = target != null
                && target.isThumbnail
                && "active".equals(target.status)
                && "object_storage".equals(target.storageType)
                && target.sortOrder == 0;

        if (target == null) {
            counts.pendingInsert += 1;
        } else if (targetIsAlreadyValid) {
            counts.existingValid += 1;
        } else {
            counts.pendingUpdateExisting += 1;
        }

        counts.pendingDemoteRows += otherThumbnailRows;
        if (otherThumbnailRows > 0) counts.eventsWithOtherThumbnails += 1;

        if (!apply) return;

        counts.demotedRows += demoteOtherThumbnails(connection, eventId, thumbnailUrl);
        if (target == null) {
            insertThumbnail(connection, eventId, thumbnailUrl, title);
            counts.inserted += 1;
        } else if (!targetIsAlreadyValid) {
            updateThumbnail(connection, target.id, title);
            counts.updatedExisting += 1;
        }
    }

    private static Map<String, String> readThumbnails(Path eventsPath) throws IOException {
        Map<String, String> thumbnails = new LinkedHashMap<>();
        for (String line : Files.readAllLines(eventsPath, StandardCharsets.UTF_8)) {
            Matcher idMatcher = ID_PATTERN.matcher(line);
            Matcher thumbnailMatcher = THUMB_PATTERN.matcher(line);
            if (idMatcher.find() && thumbnailMatcher.find()) {
                thumbnails.put(idMatcher.group(1), unescapeJson(thumbnailMatcher.group(1)));
            }
        }
        return thumbnails;
    }

    private static ManifestCounts readManifestCounts(Path manifestPath) throws IOException {
        ManifestCounts counts = new ManifestCounts();
        if (!Files.isRegularFile(manifestPath)) return counts;
        for (String line : Files.readAllLines(manifestPath, StandardCharsets.UTF_8)) {
            Matcher matcher = MANIFEST_STATUS_PATTERN.matcher(line);
            if (!matcher.find()) continue;
            String status = matcher.group(1);
            switch (status) {
                case "uploaded", "skipped_existing_manifest", "dry_run" -> counts.matched += 1;
                case "unmatched" -> counts.unmatched += 1;
                case "ambiguous" -> counts.ambiguous += 1;
                case "failed" -> counts.failed += 1;
                default -> {
                    // Ignore manifest-level status-like fields from future versions.
                }
            }
        }
        return counts;
    }

    private static Map<String, String> readEnv(Path envPath) throws IOException {
        Map<String, String> env = new LinkedHashMap<>();
        for (String rawLine : Files.readAllLines(envPath, StandardCharsets.UTF_8)) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            int equals = line.indexOf('=');
            if (equals <= 0) continue;
            String key = line.substring(0, equals).trim();
            String value = line.substring(equals + 1).trim();
            int commentIndex = value.indexOf(" #");
            if (commentIndex >= 0) value = value.substring(0, commentIndex).trim();
            env.put(key, value);
        }
        return env;
    }

    private static String required(Map<String, String> env, String key) {
        String value = env.get(key);
        if (value == null || value.isBlank()) throw new IllegalStateException("Missing " + key);
        return value;
    }

    private static String findEventTitle(Connection connection, String eventId) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT title FROM historical_events WHERE id = ? AND status = 'published'")) {
            statement.setString(1, eventId);
            try (ResultSet rs = statement.executeQuery()) {
                return rs.next() ? rs.getString("title") : null;
            }
        }
    }

    private static MediaRow findMedia(Connection connection, String eventId, String url) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT id, is_thumbnail, status, storage_type, sort_order
                FROM event_media
                WHERE event_id = ? AND url = ?
                LIMIT 1
                """)) {
            statement.setString(1, eventId);
            statement.setString(2, url);
            try (ResultSet rs = statement.executeQuery()) {
                if (!rs.next()) return null;
                return new MediaRow(
                        rs.getLong("id"),
                        rs.getBoolean("is_thumbnail"),
                        rs.getString("status"),
                        rs.getString("storage_type"),
                        rs.getInt("sort_order")
                );
            }
        }
    }

    private static int countOtherThumbnailRows(Connection connection, String eventId, String url) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT COUNT(*) FROM event_media WHERE event_id = ? AND is_thumbnail = TRUE AND url <> ?")) {
            statement.setString(1, eventId);
            statement.setString(2, url);
            try (ResultSet rs = statement.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }

    private static int demoteOtherThumbnails(Connection connection, String eventId, String url) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(
                "UPDATE event_media SET is_thumbnail = FALSE WHERE event_id = ? AND is_thumbnail = TRUE AND url <> ?")) {
            statement.setString(1, eventId);
            statement.setString(2, url);
            return statement.executeUpdate();
        }
    }

    private static void insertThumbnail(Connection connection, String eventId, String url, String title) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO event_media
                    (event_id, media_type, url, caption, alt_text, source_name, license, storage_type, is_thumbnail, sort_order, status)
                VALUES
                    (?, 'image', ?, ?, ?, 'Cloudinary', NULL, 'object_storage', TRUE, 0, 'active')
                """)) {
            statement.setString(1, eventId);
            statement.setString(2, url);
            statement.setString(3, title);
            statement.setString(4, title);
            statement.executeUpdate();
        }
    }

    private static void updateThumbnail(Connection connection, long mediaId, String title) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement("""
                UPDATE event_media
                SET media_type = 'image',
                    caption = COALESCE(caption, ?),
                    alt_text = COALESCE(alt_text, ?),
                    source_name = COALESCE(source_name, 'Cloudinary'),
                    storage_type = 'object_storage',
                    is_thumbnail = TRUE,
                    sort_order = 0,
                    status = 'active'
                WHERE id = ?
                """)) {
            statement.setString(1, title);
            statement.setString(2, title);
            statement.setLong(3, mediaId);
            statement.executeUpdate();
        }
    }

    private static void printSummary(Options options, String jdbcUrl, SyncCounts counts) {
        System.out.println("{");
        System.out.printf("  \"mode\": \"%s\",%n", options.apply ? "apply" : "dry-run");
        System.out.printf("  \"dbHost\": \"%s\",%n", safeHost(jdbcUrl));
        System.out.printf("  \"sourceThumbnails\": %d,%n", counts.sourceThumbnails);
        System.out.printf("  \"manifestMatched\": %d,%n", counts.manifestMatched);
        System.out.printf("  \"manifestUnmatched\": %d,%n", counts.manifestUnmatched);
        System.out.printf("  \"manifestAmbiguous\": %d,%n", counts.manifestAmbiguous);
        System.out.printf("  \"manifestFailed\": %d,%n", counts.manifestFailed);
        System.out.printf("  \"existingValid\": %d,%n", counts.existingValid);
        System.out.printf("  \"pendingInsert\": %d,%n", counts.pendingInsert);
        System.out.printf("  \"pendingUpdateExisting\": %d,%n", counts.pendingUpdateExisting);
        System.out.printf("  \"pendingDemoteRows\": %d,%n", counts.pendingDemoteRows);
        System.out.printf("  \"eventsWithOtherThumbnails\": %d,%n", counts.eventsWithOtherThumbnails);
        System.out.printf("  \"missingEvents\": %d,%n", counts.missingEvents);
        System.out.printf("  \"inserted\": %d,%n", counts.inserted);
        System.out.printf("  \"updatedExisting\": %d,%n", counts.updatedExisting);
        System.out.printf("  \"demotedRows\": %d%n", counts.demotedRows);
        System.out.println("}");
    }

    private static String safeHost(String jdbcUrl) {
        try {
            String raw = jdbcUrl.substring("jdbc:mysql://".length());
            URI uri = URI.create("mysql://" + raw);
            return uri.getHost();
        } catch (Exception ignored) {
            return "unknown";
        }
    }

    private static String unescapeJson(String value) {
        return value.replace("\\/", "/").replace("\\\"", "\"");
    }

    private record MediaRow(long id, boolean isThumbnail, String status, String storageType, int sortOrder) {
    }

    private static final class ManifestCounts {
        int matched;
        int unmatched;
        int ambiguous;
        int failed;
    }

    private static final class SyncCounts {
        int sourceThumbnails;
        int manifestMatched;
        int manifestUnmatched;
        int manifestAmbiguous;
        int manifestFailed;
        int existingValid;
        int pendingInsert;
        int pendingUpdateExisting;
        int pendingDemoteRows;
        int eventsWithOtherThumbnails;
        int missingEvents;
        int inserted;
        int updatedExisting;
        int demotedRows;
    }

    private static final class Options {
        final Path eventsPath;
        final Path envPath;
        final Path manifestPath;
        final boolean apply;

        Options(Path eventsPath, Path envPath, Path manifestPath, boolean apply) {
            this.eventsPath = eventsPath;
            this.envPath = envPath;
            this.manifestPath = manifestPath;
            this.apply = apply;
        }

        static Options parse(String[] args) {
            Path repoRoot = Path.of("").toAbsolutePath().normalize();
            Path eventsPath = repoRoot.resolve("crawData/stage4b_curate_tree/output/phase2/core_events.jsonl");
            Path envPath = repoRoot.resolve("backend/.env");
            Path manifestPath = repoRoot.resolve("crawData/stage4b_curate_tree/output/phase2/event_thumbnail_upload_manifest.json");
            boolean apply = false;

            for (int i = 0; i < args.length; i++) {
                String arg = args[i];
                switch (arg) {
                    case "--apply" -> apply = true;
                    case "--dry-run" -> apply = false;
                    case "--events-path" -> eventsPath = Path.of(args[++i]).toAbsolutePath().normalize();
                    case "--env-path" -> envPath = Path.of(args[++i]).toAbsolutePath().normalize();
                    case "--manifest" -> manifestPath = Path.of(args[++i]).toAbsolutePath().normalize();
                    default -> {
                        if (!arg.isBlank()) {
                            throw new IllegalArgumentException("Unknown argument: " + arg.toLowerCase(Locale.ROOT));
                        }
                    }
                }
            }
            return new Options(eventsPath, envPath, manifestPath, apply);
        }
    }
}

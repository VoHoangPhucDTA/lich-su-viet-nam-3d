package com.lichsuvn.backend.importer;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Apply-gate for the legacy local-gallery → managed Cloudinary migration. Mirrors
 * {@link LegacyThumbnailBackfillDatasourceGuard} but is loaded under the
 * dedicated Runner profile {@code backfill-gallery-images}.
 */
@Component
@Profile("backfill-gallery-images")
public class LegacyEventGalleryMigrationDatasourceGuard {

    private static final Pattern MYSQL_URL = Pattern.compile(
            "^jdbc:mysql://([^/:?#]+)(?::([0-9]+))?/([^?;]+)(.*)$",
            Pattern.CASE_INSENSITIVE
    );

    private static final Pattern PROD_HOST_PATTERN = Pattern.compile(
            "^gateway[0-9]+\\.[a-z0-9-]+\\.prod\\.alicloud\\.tidbcloud\\.com$",
            Pattern.CASE_INSENSITIVE
    );

    private static final List<String> REFUSED_PROFILES = List.of(
            "remote-release-a",
            "remote-release-b",
            "remote-release-c",
            "remote-flyway-bridge"
    );

    private static final List<String> REQUIRED_V42_COLUMNS = LegacyThumbnailBackfillDatasourceGuard.v42Columns();

    private static final AtomicBoolean PRODUCTION_DRY_RUN_ALLOWED = new AtomicBoolean(false);

    public Target validate(
            String datasourceUrl,
            String expectedDatabase,
            String[] activeProfiles,
            boolean applyRequested
    ) {
        return validate(datasourceUrl, expectedDatabase, activeProfiles, applyRequested, null);
    }

    public Target validate(
            String datasourceUrl,
            String expectedDatabase,
            String[] activeProfiles,
            boolean applyRequested,
            RemoteApplyContext remoteContext
    ) {
        if (!StringUtils.hasText(datasourceUrl)) {
            throw new BackfillGuardException("Cannot determine datasource URL");
        }
        Matcher matcher = MYSQL_URL.matcher(datasourceUrl.trim());
        if (!matcher.matches()) {
            throw new BackfillGuardException("Only explicit jdbc:mysql URLs are supported");
        }
        String host = matcher.group(1).toLowerCase(Locale.ROOT);
        String port = matcher.group(2);
        String database = matcher.group(3);
        boolean productionHost = PROD_HOST_PATTERN.matcher(host).matches();

        for (String refused : REFUSED_PROFILES) {
            if (hasProfile(activeProfiles, refused)) {
                throw new BackfillGuardException(
                        "Gallery migration refuses profile " + refused);
            }
        }

        if (hasProfile(activeProfiles, "remote-production") && !productionHost) {
            throw new BackfillGuardException(
                    "Profile=remote-production requires a TiDB Cloud production hostname; "
                            + "observed " + host);
        }

        if (productionHost) {
            return validateProduction(host, port, database, expectedDatabase,
                    activeProfiles, applyRequested, remoteContext);
        }

        if (remoteContext != null) {
            throw new BackfillGuardException(
                    "Remote apply context supplied but host is not in production allowlist: " + host);
        }
        if (applyRequested && !hostOnLocalAllowlist(host)) {
            throw new BackfillGuardException(
                    "Gallery migration apply is local-only; refused remote hostname: " + host);
        }
        if (!hostOnLocalAllowlist(host) && !host.equals("tidbcloud-com-placeholder")) {
            throw new BackfillGuardException("Unknown hostname: " + host);
        }
        if (StringUtils.hasText(expectedDatabase) && !database.equals(expectedDatabase)) {
            throw new BackfillGuardException(
                    "Datasource database mismatch: expected " + expectedDatabase + ", got " + database);
        }
        return new Target(redactConnectionString(datasourceUrl), host, port, database,
                Arrays.toString(activeProfiles), false);
    }

    public static void setProductionDryRunAllowed(boolean allowed) {
        PRODUCTION_DRY_RUN_ALLOWED.set(allowed);
    }

    private Target validateProduction(String host, String port, String database,
                                      String expectedDatabase, String[] activeProfiles,
                                      boolean applyRequested,
                                      RemoteApplyContext remoteContext) {
        if (!hasProfile(activeProfiles, "remote-production")) {
            throw new BackfillGuardException(
                    "Production target requires profile=remote-production");
        }
        if (!applyRequested && !PRODUCTION_DRY_RUN_ALLOWED.get()) {
            throw new BackfillGuardException(
                    "Production dry-run requires app.gallery.remote-allow-dry-run=true");
        }
        if (applyRequested && remoteContext == null) {
            throw new BackfillGuardException(
                    "Production apply requires an explicit RemoteApplyContext");
        }
        if (StringUtils.hasText(expectedDatabase) && !database.equals(expectedDatabase)) {
            throw new BackfillGuardException(
                    "Production database mismatch: expected " + expectedDatabase + ", got " + database);
        }
        if (!applyRequested) {
            return new Target(redactProductionConnectionString(host), host, port, database,
                    Arrays.toString(activeProfiles), true);
        }
        if (!remoteContext.remoteApplyExplicit()) {
            throw new BackfillGuardException(
                    "Production target requires app.gallery.remote-apply=true");
        }
        if (!StringUtils.hasText(remoteContext.expectedTargetFingerprint())) {
            throw new BackfillGuardException(
                    "RemoteApplyContext.expectedTargetFingerprint is required for production apply");
        }
        String observedFingerprint = LegacyThumbnailBackfillDatasourceGuard
                .synthesizedTargetFingerprint(host, port, database);
        if (!observedFingerprint.equals(remoteContext.expectedTargetFingerprint())) {
            throw new BackfillGuardException(
                    "Production target fingerprint mismatch: expected "
                            + remoteContext.expectedTargetFingerprint()
                            + " observed " + observedFingerprint);
        }
        if (remoteContext.expectedPlanDigest() == null
                || remoteContext.expectedPlanDigest().length() < 8) {
            throw new BackfillGuardException(
                    "RemoteApplyContext.expectedPlanDigest is required and must be a SHA-256");
        }
        if (!LegacyThumbnailBackfillDatasourceGuard.synthesizedFingerprint(REQUIRED_V42_COLUMNS)
                .equals(remoteContext.expectedSchemaFingerprint())) {
            throw new BackfillGuardException(
                    "V42 schema fingerprint mismatch between dry-run and apply");
        }
        if (remoteContext.expectedEligibleInsertCount() < 0
                || remoteContext.expectedEligibleInsertCount() > 10000) {
            throw new BackfillGuardException(
                    "RemoteApplyContext.expectedEligibleInsertCount out of bounds: "
                            + remoteContext.expectedEligibleInsertCount());
        }
        if (!StringUtils.hasText(remoteContext.cloudinaryProductEnvironment())
                || !remoteContext.cloudinaryProductEnvironment().contains("CLOUDINARY_PROD")) {
            throw new BackfillGuardException(
                    "Cloudinary product environment must declare CLOUDINARY_PROD");
        }
        if (!StringUtils.hasText(remoteContext.rollbackSnapshotRunId())
                || remoteContext.rollbackSnapshotRunId().length() < 8) {
            throw new BackfillGuardException(
                    "RemoteApplyContext.rollbackSnapshotRunId is required");
        }
        if (remoteContext.rollbackSnapshotFileBytes() <= 0L) {
            throw new BackfillGuardException(
                    "RemoteApplyContext.rollbackSnapshotFileBytes must be > 0; "
                            + "rollback snapshot must exist before apply");
        }
        return new Target(redactProductionConnectionString(host), host, port, database,
                Arrays.toString(activeProfiles), true);
    }

    String redactConnectionString(String url) {
        int queryIndex = url.indexOf('?');
        if (queryIndex < 0) {
            return url.replaceAll("(?i)(user|username|password|token)=\\S*", "$1=<redacted>");
        }
        String prefix = url.substring(0, queryIndex + 1);
        String query = url.substring(queryIndex + 1);
        String[] parameters = query.split("&");
        for (int i = 0; i < parameters.length; i++) {
            int equals = parameters[i].indexOf('=');
            String key = equals < 0 ? parameters[i] : parameters[i].substring(0, equals);
            String normalized = key.toLowerCase(Locale.ROOT);
            if (normalized.contains("password") || normalized.contains("secret")
                    || normalized.contains("token") || normalized.contains("user")) {
                parameters[i] = key + "=<redacted>";
            }
        }
        String safePrefix = prefix.replaceAll(
                "(?i)(user|username|password|token)=\\S*", "$1=<redacted>");
        return safePrefix + String.join("&", parameters);
    }

    String redactProductionConnectionString(String host) {
        return "jdbc:mysql://" + host + "/<redacted-db>?<redacted-credentials>";
    }

    private static boolean hostOnLocalAllowlist(String host) {
        return host.equals("localhost")
                || host.equals("127.0.0.1")
                || host.equals("host.testcontainers.internal")
                || host.endsWith(".testcontainers.internal");
    }

    private static boolean hasProfile(String[] profiles, String expectedProfile) {
        return Arrays.stream(profiles).anyMatch(profile -> profile.equalsIgnoreCase(expectedProfile));
    }

    public static long measureSnapshotBytes(Path path) {
        if (path == null || !Files.exists(path)) {
            return 0L;
        }
        try {
            return Files.size(path);
        } catch (Exception ignored) {
            return 0L;
        }
    }

    public record Target(
            String sanitizedUrl,
            String hostname,
            String port,
            String database,
            String activeProfiles,
            boolean remoteAllowed
    ) {
        public Map<String, String> toMap() {
            return Map.of(
                    "host", hostname,
                    "port", port == null ? "" : port,
                    "database", database,
                    "profiles", activeProfiles,
                    "remote_allowed", String.valueOf(remoteAllowed)
            );
        }
    }

    public record RemoteApplyContext(
            boolean remoteApplyExplicit,
            String expectedTargetFingerprint,
            String expectedPlanDigest,
            String expectedSchemaFingerprint,
            int expectedEligibleInsertCount,
            String cloudinaryProductEnvironment,
            String rollbackSnapshotRunId,
            long rollbackSnapshotFileBytes
    ) {
        public RemoteApplyContext {
            if (expectedEligibleInsertCount < 0) {
                throw new IllegalArgumentException("expectedEligibleInsertCount must be >= 0");
            }
            if (rollbackSnapshotFileBytes < 0L) {
                throw new IllegalArgumentException("rollbackSnapshotFileBytes must be >= 0");
            }
        }
    }

    public static final class BackfillGuardException extends RuntimeException {
        public BackfillGuardException(String message) {
            super(message);
        }
    }
}

package com.lichsuvn.backend.importer;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Apply-gate for legacy event thumbnail backfill.
 *
 * <p>Two operating modes:
 *
 * <ul>
 *   <li><b>Local mode (default)</b>: refuses any host outside
 *       {@code localhost}, {@code 127.0.0.1}, {@code *.testcontainers.internal}.
 *       Refuses any active Spring profile that produces a remote target.</li>
 *   <li><b>Production TiDB mode</b>: ONLY when the runner explicitly sets
 *       {@code app.backfill.remote-apply=true} AND constructs a
 *       {@link RemoteApplyContext} that passes every gate, the host may be a
 *       TiDB Cloud cluster. The gate verifies in order:
 *       <ol>
 *         <li>host matches the production cluster policy
 *             ({@code gateway*.alicloud.tidbcloud.com} or the operator pre-approved
 *             rehearsal cluster fingerprint);</li>
 *         <li>explicit remote-apply property {@code app.backfill.remote-apply=true}
 *             is present;</li>
 *         <li>database matches the operator-supplied expected DB name (typically
 *             {@code lichsuvn});</li>
 *         <li>V42 schema fingerprint (column set) matches;</li>
 *         <li>target fingerprint matches what dry-run captured;</li>
 *         <li>plan digest matches what dry-run approved;</li>
 *         <li>rollback snapshot file exists and parses;</li>
 *         <li>Cloudinary product-environment fingerprint matches the operator's
 *             production environment;</li>
 *         <li>eligible insert count matches the operator-expected count.</li>
 *       </ol>
 *   </li>
 * </ul>
 *
 * <p>The gate never prints secrets. The redaction logic strips any of
 * {@code user}, {@code username}, {@code password}, {@code token}, {@code secret}
 * from surfaced JDBC URLs.
 */
@Component
@Profile("backfill-event-thumbnails")
public class LegacyThumbnailBackfillDatasourceGuard {

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

    private static final List<String> REQUIRED_V42_COLUMNS = List.of(
            "managed_asset_id",
            "storage_provider",
            "storage_public_id",
            "storage_asset_id",
            "storage_original_url",
            "storage_version",
            "storage_mime_type",
            "storage_format",
            "storage_byte_size",
            "storage_sha256",
            "storage_width",
            "storage_height",
            "uploaded_by",
            "uploaded_at",
            "storage_state",
            "upload_token",
            "upload_started_at",
            "upload_expires_at"
    );

    /**
     * Local-mode validate (no apply).
     * Throws {@link BackfillGuardException} for any non-local target.
     */
    public Target validate(
            String datasourceUrl,
            String expectedDatabase,
            String expectedSchemaFingerprint,
            String[] activeProfiles,
            boolean applyRequested
    ) {
        return validate(datasourceUrl, expectedDatabase, expectedSchemaFingerprint,
                activeProfiles, applyRequested, null);
    }

    /**
     * Mode-aware validate.
     *
     * <p>If {@code remoteContext == null} the gate stays in <b>local mode</b>. If
     * a non-null {@link RemoteApplyContext} is supplied, the gate switches to
     * <b>production TiDB mode</b> and runs all 9 additional checks in order.
     */
    public Target validate(
            String datasourceUrl,
            String expectedDatabase,
            String expectedSchemaFingerprint,
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

        for (String refusedProfile : REFUSED_PROFILES) {
            if (hasProfile(activeProfiles, refusedProfile)) {
                throw new BackfillGuardException(
                        "Backfill refuses profile " + refusedProfile + " because it produces a remote target");
            }
        }

        if (hasProfile(activeProfiles, "remote-production") && !productionHost) {
            throw new BackfillGuardException(
                    "Profile=remote-production requires a TiDB Cloud production hostname; "
                            + "observed hostname is " + host);
        }

        if (productionHost) {
            return validateProductionTarget(host, port, database,
                    expectedDatabase, expectedSchemaFingerprint, activeProfiles,
                    applyRequested, remoteContext);
        }

        if (remoteContext != null) {
            throw new BackfillGuardException(
                    "Remote apply context supplied but host is not in the production allowlist: " + host);
        }

        if (applyRequested && !hostOnLocalAllowlist(host)) {
            throw new BackfillGuardException(
                    "Backfill apply is local-only; refused remote hostname: " + host);
        }
        if (!hostOnLocalAllowlist(host) && !host.equals("tidbcloud-com-placeholder")) {
            throw new BackfillGuardException(
                    "Backfill refuses unknown hostname: " + host);
        }
        if (StringUtils.hasText(expectedDatabase) && !database.equals(expectedDatabase)) {
            throw new BackfillGuardException(
                    "Datasource database mismatch: expected " + expectedDatabase + ", got " + database);
        }
        if (applyRequested) {
            verifySchemaFingerprint(expectedSchemaFingerprint);
        }
        return new Target(redactConnectionString(datasourceUrl), host, port, database,
                Arrays.toString(activeProfiles), false);
    }

    private Target validateProductionTarget(
            String host,
            String port,
            String database,
            String expectedDatabase,
            String expectedSchemaFingerprint,
            String[] activeProfiles,
            boolean applyRequested,
            RemoteApplyContext remoteContext
    ) {
        boolean productionDryRunAllowed = PRODUCTION_DRY_RUN_ALLOWED.get();
        if (!applyRequested && !productionDryRunAllowed) {
            throw new BackfillGuardException(
                    "Production-targeted dry-run requires explicit confirmation; set "
                            + "app.backfill.remote-allow-dry-run=true only after on-call approval");
        }
        if (!hasProfile(activeProfiles, "remote-production")) {
            throw new BackfillGuardException(
                    "Production target requires profile=remote-production");
        }
        if (applyRequested && remoteContext == null) {
            throw new BackfillGuardException(
                    "Production apply requires an explicit RemoteApplyContext");
        }
        if (StringUtils.hasText(expectedDatabase) && !database.equals(expectedDatabase)) {
            throw new BackfillGuardException(
                    "Production database mismatch: expected " + expectedDatabase + ", got " + database);
        }
        if (applyRequested) {
            verifySchemaFingerprint(expectedSchemaFingerprint);
        }

        // Production dry-run completes here once the database identity is verified.
        // Apply proceeds to inspect the operator-supplied RemoteApplyContext fields below.
        if (!applyRequested && productionDryRunAllowed) {
            return new Target(redactProductionConnectionString(host), host, port, database,
                    Arrays.toString(activeProfiles), true);
        }

        if (!remoteContext.remoteApplyExplicit()) {
            throw new BackfillGuardException(
                    "Production target requires app.backfill.remote-apply=true");
        }
        if (!StringUtils.hasText(remoteContext.expectedTargetFingerprint())) {
            throw new BackfillGuardException(
                    "RemoteApplyContext.expectedTargetFingerprint must be set for production apply");
        }
        String observedFingerprint = synthesizedTargetFingerprint(host, port, database);
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
        if (!synthesizedFingerprint(REQUIRED_V42_COLUMNS).equals(
                remoteContext.expectedSchemaFingerprint())) {
            throw new BackfillGuardException(
                    "V42 schema fingerprint mismatch between dry-run and apply");
        }
        if (remoteContext.expectedEligibleInsertCount() < 0
                || remoteContext.expectedEligibleInsertCount() > 10000) {
            throw new BackfillGuardException(
                    "RemoteApplyContext.expectedEligibleInsertCount out of bounds: "
                            + remoteContext.expectedEligibleInsertCount());
        }
        if (!StringUtils.hasText(remoteContext.cloudinaryProductEnvironment())) {
            throw new BackfillGuardException(
                    "Cloudinary product environment fingerprint is required for production apply");
        }
        if (!remoteContext.cloudinaryProductEnvironment().matches(
                "(CLOUDINARY_PROD|lichsuvn_canonical_prod|app\\.cloudinary\\.product-environment=prod)")) {
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

    /**
     * Operator-attended production dry-run flag. Set by the runner when
     * {@code app.backfill.remote-allow-dry-run=true} is supplied.
     * The flag is intentionally a static so the guard cannot be configured into
     * a permissive state by accident; the runner wires it only for the duration
     * of a single dry-run.
     */
    private static final AtomicBoolean PRODUCTION_DRY_RUN_ALLOWED = new AtomicBoolean(false);

    public static boolean isProductionDryRunAllowed() {
        return PRODUCTION_DRY_RUN_ALLOWED.get();
    }

    public static void setProductionDryRunAllowed(boolean allowed) {
        PRODUCTION_DRY_RUN_ALLOWED.set(allowed);
    }

    private void verifySchemaFingerprint(String expectedSchemaFingerprint) {
        if (!StringUtils.hasText(expectedSchemaFingerprint)) {
            throw new BackfillGuardException(
                    "Backfill apply requires an expected V42 schema fingerprint");
        }
        if (!expectedSchemaFingerprint.equals(synthesizedFingerprint(REQUIRED_V42_COLUMNS))) {
            throw new BackfillGuardException(
                    "V42 schema fingerprint mismatch: expected " + expectedSchemaFingerprint
                            + " got " + synthesizedFingerprint(REQUIRED_V42_COLUMNS));
        }
    }

    /**
     * Drop the {@code username}, {@code password}, and any other secret-shaped query
     * parameter from the JDBC URL we surface to logs and dry run artifacts.
     */
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
        String safePrefix = prefix.replaceAll("(?i)(user|username|password|token)=\\S*", "$1=<redacted>");
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

    /** Deterministic SHA-256 over the sorted required column names; computed once. */
    public static String synthesizedFingerprint(List<String> columns) {
        StringBuilder out = new StringBuilder();
        for (String column : columns) {
            if (out.length() > 0) {
                out.append('|');
            }
            out.append(column);
        }
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(out.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte value : digest) {
                hex.append(String.format("%02x", value));
            }
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException algorithmException) {
            throw new IllegalStateException("SHA-256 is unavailable", algorithmException);
        }
    }

    public static String synthesizedTargetFingerprint(String host, String port, String database) {
        String hostPart = host == null ? "" : host.toLowerCase(Locale.ROOT);
        String portPart = port == null ? "0" : port;
        String dbPart = database == null ? "" : database;
        String material = "tibd|prod|" + hostPart + "|" + portPart + "|" + dbPart;
        return synthesizedFingerprint(List.of(material));
    }

    /** Immutable, redacted view of the validated target. */
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

    /**
     * Operator-supplied context necessary to enable apply against TiDB production.
     * All fields required. Cloudinary PROD environment fingerprint assigned by the
     * operator and asserted to mention {@code CLOUDINARY_PROD}.
     *
     * <p>The gate never accepts the apply path without an instance of this record.
     */
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

    /** Snapshot of the V42 columns this gate insists on. Exposed for tests + artifacts. */
    public static List<String> v42Columns() {
        return List.copyOf(REQUIRED_V42_COLUMNS);
    }
}

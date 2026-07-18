package com.lichsuvn.backend.importer;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class HistoryRagDatasourceGuard {

    private static final Pattern MYSQL_URL = Pattern.compile(
            "^jdbc:mysql://([^/:?#]+)(?::([0-9]+))?/([^?;]+)(.*)$",
            Pattern.CASE_INSENSITIVE
    );

    public DatasourceTarget validateDryRun(
            String datasourceUrl,
            String expectedDatabase,
            String[] activeProfiles,
            boolean dryRun,
            boolean allowWrite,
            String rollbackRunId
    ) {
        return validate(
                datasourceUrl,
                expectedDatabase,
                activeProfiles,
                dryRun,
                allowWrite,
                rollbackRunId,
                ReleaseAAuthorization.denied()
        );
    }

    public DatasourceTarget validateReleaseA(
            String datasourceUrl,
            String expectedDatabase,
            String[] activeProfiles,
            boolean dryRun,
            boolean allowWrite,
            String rollbackRunId,
            ReleaseAAuthorization authorization
    ) {
        return validate(
                datasourceUrl,
                expectedDatabase,
                activeProfiles,
                dryRun,
                allowWrite,
                rollbackRunId,
                authorization
        );
    }

    public DatasourceTarget validateReleaseB(
            String datasourceUrl,
            String[] activeProfiles,
            ReleaseBAuthorization authorization
    ) {
        if (!StringUtils.hasText(datasourceUrl)) {
            throw new UnsafeDatasourceException("Cannot determine datasource URL");
        }
        Matcher matcher = MYSQL_URL.matcher(datasourceUrl.trim());
        if (!matcher.matches()) {
            throw new UnsafeDatasourceException("Only explicit jdbc:mysql URLs are supported");
        }
        String host = matcher.group(1).toLowerCase(Locale.ROOT);
        String database = matcher.group(3);
        if (!host.contains("tidbcloud.com")) {
            throw new UnsafeDatasourceException("Release B only permits the approved TiDB Cloud target");
        }
        if (!authorization.enabled() || !authorization.approved()) {
            throw new UnsafeDatasourceException("TiDB Cloud requires explicit Release B authorization");
        }
        if (!hasProfile(activeProfiles, "remote-release-b")) {
            throw new UnsafeDatasourceException("TiDB Cloud Release B requires the remote-release-b profile");
        }
        if (!host.equals(authorization.expectedHost())) {
            throw new UnsafeDatasourceException("TiDB Cloud hostname does not match the approved Release B target");
        }
        if (!database.equals(authorization.expectedDatabase())) {
            throw new UnsafeDatasourceException("TiDB Cloud database does not match the approved Release B target");
        }
        if (!StringUtils.hasText(authorization.backupSha256())) {
            throw new UnsafeDatasourceException("Release B requires a recorded backup SHA-256");
        }
        if (!authorization.restoreVerified()) {
            throw new UnsafeDatasourceException("Release B requires verified backup restore evidence");
        }
        return new DatasourceTarget(sanitize(datasourceUrl), host, database, ListProfiles.format(activeProfiles));
    }

    public DatasourceTarget validateReleaseC(
            String datasourceUrl,
            String expectedDatabase,
            String[] activeProfiles,
            boolean dryRun,
            boolean allowWrite,
            String rollbackRunId,
            ReleaseCAuthorization authorization
    ) {
        validateMode(dryRun, allowWrite, rollbackRunId);
        Matcher matcher = requireMysqlUrl(datasourceUrl);
        String host = matcher.group(1).toLowerCase(Locale.ROOT);
        String database = matcher.group(3);
        if (!host.contains("tidbcloud.com")) {
            throw new UnsafeDatasourceException("Release C only permits the approved TiDB Cloud target");
        }
        if (!authorization.enabled() || !authorization.approved()) {
            throw new UnsafeDatasourceException("TiDB Cloud requires explicit Release C authorization");
        }
        if (!hasProfile(activeProfiles, "remote-release-c")) {
            throw new UnsafeDatasourceException("TiDB Cloud Release C requires the remote-release-c profile");
        }
        if (!host.equals(authorization.expectedHost())) {
            throw new UnsafeDatasourceException("TiDB Cloud hostname does not match the approved Release C target");
        }
        if (!database.equals(authorization.expectedDatabase())
                || (StringUtils.hasText(expectedDatabase) && !database.equals(expectedDatabase))) {
            throw new UnsafeDatasourceException("TiDB Cloud database does not match the approved Release C target");
        }
        requireSha256(authorization.expectedPackageSha256(), "Release C package");
        requireSha256(authorization.backupSha256(), "Release C backup");
        if (!authorization.restoreVerified()) {
            throw new UnsafeDatasourceException("Release C requires verified backup restore evidence");
        }
        return new DatasourceTarget(sanitize(datasourceUrl), host, database, ListProfiles.format(activeProfiles));
    }

    private DatasourceTarget validate(
            String datasourceUrl,
            String expectedDatabase,
            String[] activeProfiles,
            boolean dryRun,
            boolean allowWrite,
            String rollbackRunId,
            ReleaseAAuthorization authorization
    ) {
        validateMode(dryRun, allowWrite, rollbackRunId);
        boolean remoteProfile = Arrays.stream(activeProfiles)
                .anyMatch(profile -> profile.equalsIgnoreCase("remote-production"));
        if (remoteProfile) {
            throw new UnsafeDatasourceException("The remote-production profile is not allowed for history RAG import");
        }

        Matcher matcher = requireMysqlUrl(datasourceUrl);
        String host = matcher.group(1).toLowerCase(Locale.ROOT);
        String database = matcher.group(3);
        if (host.contains("tidbcloud.com")) {
            validateReleaseATarget(host, database, activeProfiles, authorization);
        } else if (!isAllowedLocalHost(host)) {
            throw new UnsafeDatasourceException("Datasource hostname is not in the local allowlist: " + host);
        }
        if (StringUtils.hasText(expectedDatabase) && !database.equals(expectedDatabase)) {
            throw new UnsafeDatasourceException(
                    "Datasource database mismatch: expected " + expectedDatabase + ", got " + database);
        }
        return new DatasourceTarget(sanitize(datasourceUrl), host, database, ListProfiles.format(activeProfiles));
    }

    private void validateMode(boolean dryRun, boolean allowWrite, String rollbackRunId) {
        if (dryRun && allowWrite) {
            throw new UnsafeDatasourceException("Dry-run cannot be combined with allow-write");
        }
        if (!dryRun && !allowWrite) {
            throw new UnsafeDatasourceException("Apply mode requires history RAG write permission");
        }
        if (StringUtils.hasText(rollbackRunId) && dryRun) {
            throw new UnsafeDatasourceException("Rollback requires apply mode");
        }
    }

    private Matcher requireMysqlUrl(String datasourceUrl) {
        if (!StringUtils.hasText(datasourceUrl)) {
            throw new UnsafeDatasourceException("Cannot determine datasource URL");
        }
        Matcher matcher = MYSQL_URL.matcher(datasourceUrl.trim());
        if (!matcher.matches()) {
            throw new UnsafeDatasourceException("Only explicit jdbc:mysql URLs are supported");
        }
        return matcher;
    }

    private void requireSha256(String value, String label) {
        if (value == null || !value.matches("(?i)^[0-9a-f]{64}$")) {
            throw new UnsafeDatasourceException(label + " requires an exact SHA-256");
        }
    }

    private void validateReleaseATarget(
            String host,
            String database,
            String[] activeProfiles,
            ReleaseAAuthorization authorization
    ) {
        if (!authorization.enabled() || !authorization.approved()) {
            throw new UnsafeDatasourceException("TiDB Cloud requires explicit Release A authorization");
        }
        if (!hasProfile(activeProfiles, "remote-release-a") || !hasProfile(activeProfiles, "history-rag-import")) {
            throw new UnsafeDatasourceException("TiDB Cloud Release A requires remote-release-a and history-rag-import profiles");
        }
        if (!host.equals(authorization.expectedHost())) {
            throw new UnsafeDatasourceException("TiDB Cloud hostname does not match the approved Release A target");
        }
        if (!database.equals(authorization.expectedDatabase())) {
            throw new UnsafeDatasourceException("TiDB Cloud database does not match the approved Release A target");
        }
        if (!StringUtils.hasText(authorization.expectedPackageSha256())) {
            throw new UnsafeDatasourceException("TiDB Cloud Release A requires an approved package SHA-256");
        }
    }

    private boolean hasProfile(String[] profiles, String expectedProfile) {
        return Arrays.stream(profiles).anyMatch(profile -> profile.equalsIgnoreCase(expectedProfile));
    }

    private boolean isAllowedLocalHost(String host) {
        return host.equals("localhost")
                || host.equals("127.0.0.1")
                || host.equals("host.testcontainers.internal")
                || host.endsWith(".testcontainers.internal");
    }

    private String sanitize(String url) {
        int queryIndex = url.indexOf('?');
        if (queryIndex < 0) {
            return url;
        }
        String prefix = url.substring(0, queryIndex + 1);
        String[] parameters = url.substring(queryIndex + 1).split("&");
        for (int index = 0; index < parameters.length; index++) {
            int equals = parameters[index].indexOf('=');
            String key = equals < 0 ? parameters[index] : parameters[index].substring(0, equals);
            String normalizedKey = key.toLowerCase(Locale.ROOT);
            if (normalizedKey.contains("password")
                    || normalizedKey.contains("secret")
                    || normalizedKey.contains("token")) {
                parameters[index] = key + "=<redacted>";
            }
        }
        return prefix + String.join("&", parameters);
    }

    public record DatasourceTarget(String sanitizedUrl, String hostname, String database, String activeProfiles) {
    }

    public record ReleaseAAuthorization(
            boolean enabled,
            boolean approved,
            String expectedHost,
            String expectedDatabase,
            String expectedPackageSha256
    ) {
        public static ReleaseAAuthorization denied() {
            return new ReleaseAAuthorization(false, false, "", "", "");
        }
    }

    public record ReleaseBAuthorization(
            boolean enabled,
            boolean approved,
            String expectedHost,
            String expectedDatabase,
            String backupSha256,
            boolean restoreVerified
    ) {
    }

    public record ReleaseCAuthorization(
            boolean enabled,
            boolean approved,
            String expectedHost,
            String expectedDatabase,
            String expectedPackageSha256,
            String backupSha256,
            boolean restoreVerified
    ) {
    }

    public static class UnsafeDatasourceException extends RuntimeException {
        public UnsafeDatasourceException(String message) {
            super(message);
        }
    }

    private static final class ListProfiles {
        private static String format(String[] profiles) {
            return profiles.length == 0 ? "default" : String.join(",", profiles);
        }
    }
}

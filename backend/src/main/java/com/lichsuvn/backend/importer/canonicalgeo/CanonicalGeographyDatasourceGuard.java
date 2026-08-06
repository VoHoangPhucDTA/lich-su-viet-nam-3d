package com.lichsuvn.backend.importer.canonicalgeo;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Loopback-only guard for the canonical geography sync. Mirrors the shape of
 * HistoryRagDatasourceGuard but is intentionally stricter: the target must be
 * a loopback host and the database must match the expected name.
 */
@Component
public class CanonicalGeographyDatasourceGuard {

    private static final Pattern MYSQL_URL = Pattern.compile(
            "^jdbc:mysql://([^/:?#]+)(?::([0-9]+))?/([^?;]+)(.*)$",
            Pattern.CASE_INSENSITIVE
    );

    public DatasourceTarget validate(
            String datasourceUrl,
            String expectedDatabase,
            String[] activeProfiles
    ) {
        if (!StringUtils.hasText(datasourceUrl)) {
            throw new UnsafeDatasourceException("Cannot determine datasource URL");
        }
        Matcher matcher = MYSQL_URL.matcher(datasourceUrl.trim());
        if (!matcher.matches()) {
            throw new UnsafeDatasourceException("Only explicit jdbc:mysql URLs are supported");
        }
        String host = matcher.group(1).toLowerCase(Locale.ROOT);
        String port = matcher.group(2);
        String database = matcher.group(3);
        if (!isAllowedLocalHost(host)) {
            throw new UnsafeDatasourceException("Datasource hostname is not in the local allowlist: " + host);
        }
        if (Arrays.stream(activeProfiles)
                .anyMatch(profile -> profile.toLowerCase(Locale.ROOT).startsWith("remote"))) {
            throw new UnsafeDatasourceException(
                    "Remote profiles are not allowed for canonical geography sync: " + Arrays.toString(activeProfiles));
        }
        if (StringUtils.hasText(expectedDatabase) && !database.equals(expectedDatabase)) {
            throw new UnsafeDatasourceException(
                    "Datasource database mismatch: expected " + expectedDatabase + ", got " + database);
        }
        return new DatasourceTarget(sanitize(datasourceUrl), host, port == null ? "3306" : port, database);
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

    public record DatasourceTarget(String sanitizedUrl, String hostname, String port, String database) {
    }

    public static class UnsafeDatasourceException extends RuntimeException {
        public UnsafeDatasourceException(String message) {
            super(message);
        }
    }
}

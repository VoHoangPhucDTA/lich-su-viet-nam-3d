package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;

public final class AdminUserVersionCodec {
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter FORMATTER =
            new DateTimeFormatterBuilder().appendInstant(6).toFormatter();

    private AdminUserVersionCodec() {
    }

    public static String format(Instant value) {
        return FORMATTER.format(value);
    }

    public static LocalDateTime parse(String value) {
        if (value == null || value.isBlank()) {
            throw invalid();
        }
        try {
            Instant instant = Instant.from(FORMATTER.parse(value));
            return LocalDateTime.ofInstant(instant, DATABASE_ZONE);
        } catch (DateTimeParseException exception) {
            throw invalid();
        }
    }

    private static ApiException invalid() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "INVALID_EXPECTED_VERSION",
                "expectedUpdatedAt must be an opaque six-digit UTC version");
    }
}

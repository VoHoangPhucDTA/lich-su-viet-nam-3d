package com.lichsuvn.backend.exam.dataset;

import org.erdtman.jcs.JsonCanonicalizer;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

public final class ExamDatasetHashing {
    private ExamDatasetHashing() {
    }

    public static byte[] canonicalBytes(JsonNode value) {
        try {
            return new JsonCanonicalizer(value.toString()).getEncodedUTF8();
        } catch (IOException ex) {
            throw new IllegalArgumentException("Value is not valid RFC 8785 JSON", ex);
        }
    }

    public static String canonicalText(JsonNode value) {
        return new String(canonicalBytes(value), StandardCharsets.UTF_8);
    }

    public static String canonicalSha256(JsonNode value) {
        return sha256(canonicalBytes(value));
    }

    public static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }
}

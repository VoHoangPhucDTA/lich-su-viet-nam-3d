package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.MemoryCacheImageInputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.Locale;

@Component
public class EventImageValidator {
    public static final int MAX_BYTES = 10 * 1024 * 1024;
    public static final int MAX_DIMENSION = 6000;
    public static final long MAX_PIXELS = 25_000_000L;

    public ValidatedEventImage validate(
            MultipartFile file,
            String altText,
            String caption,
            String sourceName,
            String license
    ) {
        if (file == null || file.isEmpty()) {
            throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_FILE_REQUIRED");
        }
        if (file.getSize() > MAX_BYTES) {
            throw error(HttpStatus.PAYLOAD_TOO_LARGE, "EVENT_IMAGE_PAYLOAD_TOO_LARGE");
        }
        String safeAlt = bounded(altText, 500, true);
        if (safeAlt == null || safeAlt.codePoints().noneMatch(Character::isLetterOrDigit)) {
            throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_ALT_TEXT_REQUIRED");
        }
        String safeCaption = bounded(caption, 1000, false);
        String safeSource = bounded(sourceName, 255, false);
        String safeLicense = bounded(license, 255, false);
        byte[] bytes = readBounded(file);
        DetectedFormat detected = detect(bytes);
        validateStructure(bytes, detected);
        Dimensions dimensions = decode(bytes, detected);
        return new ValidatedEventImage(
                bytes,
                detected.mimeType,
                detected.canonicalName,
                bytes.length,
                sha256(bytes),
                dimensions.width,
                dimensions.height,
                safeAlt,
                safeCaption,
                safeSource,
                safeLicense);
    }

    private byte[] readBounded(MultipartFile file) {
        try (InputStream input = file.getInputStream();
             ByteArrayOutputStream output = new ByteArrayOutputStream(
                     (int) Math.min(Math.max(file.getSize(), 32), MAX_BYTES))) {
            byte[] buffer = new byte[16 * 1024];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_BYTES) {
                    throw error(HttpStatus.PAYLOAD_TOO_LARGE, "EVENT_IMAGE_PAYLOAD_TOO_LARGE");
                }
                output.write(buffer, 0, read);
            }
            if (total == 0) {
                throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_FILE_REQUIRED");
            }
            return output.toByteArray();
        } catch (ApiException exception) {
            throw exception;
        } catch (IOException exception) {
            throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_INVALID_CONTENT");
        }
    }

    private DetectedFormat detect(byte[] bytes) {
        if (bytes.length >= 8
                && (bytes[0] & 0xff) == 0x89
                && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G'
                && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10) {
            return new DetectedFormat("png", "image/png");
        }
        if (bytes.length >= 4
                && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8
                && (bytes[2] & 0xff) == 0xff) {
            return new DetectedFormat("jpeg", "image/jpeg");
        }
        if (WebpImageInspector.isWebp(bytes)) {
            return new DetectedFormat("webp", "image/webp");
        }
        throw error(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "EVENT_IMAGE_UNSUPPORTED_FORMAT");
    }

    private void validateStructure(byte[] bytes, DetectedFormat format) {
        if ("png".equals(format.canonicalName)) {
            validatePngChunks(bytes);
        } else if ("webp".equals(format.canonicalName)) {
            validateWebp(bytes);
        } else {
            if (bytes.length < 4
                    || (bytes[bytes.length - 2] & 0xff) != 0xff
                    || (bytes[bytes.length - 1] & 0xff) != 0xd9) {
                throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_INVALID_CONTENT");
            }
        }
    }

    private void validateWebp(byte[] bytes) {
        try {
            if (WebpImageInspector.parse(bytes).animated()) {
                throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_ANIMATED_UNSUPPORTED");
            }
        } catch (ApiException exception) {
            throw exception;
        } catch (IllegalArgumentException exception) {
            throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_INVALID_CONTENT");
        }
    }

    private void validatePngChunks(byte[] bytes) {
        int position = 8;
        boolean ended = false;
        while (position + 12 <= bytes.length) {
            long length = unsignedInt(bytes, position);
            if (length > Integer.MAX_VALUE || position + 12L + length > bytes.length) {
                throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_INVALID_CONTENT");
            }
            String type = new String(bytes, position + 4, 4, java.nio.charset.StandardCharsets.US_ASCII);
            if ("acTL".equals(type)) {
                throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_ANIMATED_UNSUPPORTED");
            }
            position += 12 + (int) length;
            if ("IEND".equals(type)) {
                ended = true;
                break;
            }
        }
        if (!ended || position != bytes.length) {
            throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_INVALID_CONTENT");
        }
    }

    private Dimensions decode(byte[] bytes, DetectedFormat detected) {
        if ("webp".equals(detected.canonicalName)) {
            try {
                WebpImageInspector.WebpInfo info = WebpImageInspector.parse(bytes);
                if (info.animated()) {
                    throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_ANIMATED_UNSUPPORTED");
                }
                int width = info.width();
                int height = info.height();
                if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION
                        || (long) width * height > MAX_PIXELS) {
                    throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_DIMENSIONS_TOO_LARGE");
                }
                return new Dimensions(width, height);
            } catch (ApiException exception) {
                throw exception;
            } catch (IllegalArgumentException exception) {
                throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_INVALID_CONTENT");
            }
        }
        try (var imageInput = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(imageInput);
            if (!readers.hasNext()) {
                throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_INVALID_CONTENT");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(imageInput, true, true);
                String readerFormat = reader.getFormatName().toLowerCase(Locale.ROOT);
                boolean formatMatches = "png".equals(detected.canonicalName)
                        ? readerFormat.contains("png")
                        : readerFormat.contains("jpeg") || readerFormat.contains("jpg");
                if (!formatMatches) {
                    throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_INVALID_CONTENT");
                }
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION
                        || (long) width * height > MAX_PIXELS) {
                    throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_DIMENSIONS_TOO_LARGE");
                }
                BufferedImage decoded = reader.read(0);
                if (decoded == null || decoded.getWidth() != width || decoded.getHeight() != height) {
                    throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_INVALID_CONTENT");
                }
                return new Dimensions(width, height);
            } finally {
                reader.dispose();
            }
        } catch (ApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_INVALID_CONTENT");
        }
    }

    private long unsignedInt(byte[] bytes, int offset) {
        return ((long) (bytes[offset] & 0xff) << 24)
                | ((long) (bytes[offset + 1] & 0xff) << 16)
                | ((long) (bytes[offset + 2] & 0xff) << 8)
                | (bytes[offset + 3] & 0xffL);
    }

    private String bounded(String value, int max, boolean required) {
        if (value == null || value.isBlank()) {
            return required ? null : null;
        }
        String result = value.trim();
        if (result.length() > max) {
            throw error(HttpStatus.BAD_REQUEST, "EVENT_IMAGE_METADATA_INVALID");
        }
        return result;
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private ApiException error(HttpStatus status, String code) {
        return new ApiException(status, code, "Event image upload is invalid");
    }

    private record DetectedFormat(String canonicalName, String mimeType) {
    }

    private record Dimensions(int width, int height) {
    }

    public record ValidatedEventImage(
            byte[] bytes,
            String mimeType,
            String format,
            long byteSize,
            String sha256,
            int width,
            int height,
            String altText,
            String caption,
            String sourceName,
            String license
    ) {
        public ValidatedEventImage {
            bytes = bytes.clone();
        }

        @Override
        public byte[] bytes() {
            return bytes.clone();
        }
    }
}

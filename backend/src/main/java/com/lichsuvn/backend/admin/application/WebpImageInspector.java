package com.lichsuvn.backend.admin.application;

/**
 * Pure-byte WebP (RIFF/WEBP) inspector: magic detection, RIFF chunk walking,
 * dimensions for the VP8 / VP8L / VP8X formats, and animation detection. No
 * image decoder is used, so static WebP can be validated without a Java WebP
 * plugin (the JDK's {@code ImageIO} has no WebP reader).
 *
 * <p>The parser is strict: the RIFF size field must equal {@code bytes.length -
 * 8}, every chunk must stay in bounds, and the first chunk must be one of
 * {@code VP8 }, {@code VP8L} or {@code VP8X}. Animated WebP is reported through
 * {@link WebpInfo#animated()} (VP8X animation flag or {@code ANMF} chunks);
 * callers decide whether to accept or reject it. Corrupt input raises
 * {@link IllegalArgumentException}.
 */
public final class WebpImageInspector {

    private WebpImageInspector() {
    }

    /**
     * True when {@code head} begins with the {@code RIFF....WEBP} magic bytes.
     */
    public static boolean isWebp(byte[] head) {
        return head != null && head.length >= 12
                && head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F'
                && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P';
    }

    /**
     * Parses a complete WebP byte array and returns its dimensions and
     * animation flag. Throws {@link IllegalArgumentException} on corrupt or
     * structurally invalid input.
     */
    public static WebpInfo parse(byte[] bytes) {
        if (!isWebp(bytes)) {
            throw new IllegalArgumentException("Not a WebP file");
        }
        if (bytes.length < 20) {
            throw new IllegalArgumentException("WebP file too short");
        }
        long riffSize = le32(bytes, 4);
        if (riffSize != (long) bytes.length - 8L) {
            throw new IllegalArgumentException("WebP RIFF size field does not match payload");
        }
        int position = 12;
        Integer width = null;
        Integer height = null;
        boolean animated = false;
        boolean firstChunk = true;
        while (position + 8 <= bytes.length) {
            int chunkSize = (int) le32(bytes, position + 4);
            if (chunkSize < 0 || position + 8 + chunkSize > bytes.length) {
                throw new IllegalArgumentException("WebP chunk exceeds file bounds");
            }
            String fourCc = ascii(bytes, position, 4);
            int data = position + 8;
            if (firstChunk && !isImageChunk(fourCc)) {
                throw new IllegalArgumentException("WebP first chunk is not an image chunk: " + fourCc);
            }
            switch (fourCc) {
                case "VP8 " -> {
                    // VP8 payload layout (as parsed by libwebp): 3-byte frame tag,
                    // 3-byte key-frame start code 9D 01 2A, then 2 bytes width
                    // (14 bits) and 2 bytes height (14 bits).
                    requireData(data, 10, chunkSize, "VP8");
                    if (bytes[data + 3] != (byte) 0x9D
                            || bytes[data + 4] != 0x01
                            || bytes[data + 5] != 0x2A) {
                        throw new IllegalArgumentException("VP8 chunk does not start with a key-frame start code");
                    }
                    if (width == null) {
                        width = le16(bytes, data + 6) & 0x3FFF;
                        height = le16(bytes, data + 8) & 0x3FFF;
                    }
                }
                case "VP8L" -> {
                    requireData(data, 5, chunkSize, "VP8L");
                    if (bytes[data] != 0x2F) {
                        throw new IllegalArgumentException("VP8L signature byte missing");
                    }
                    if (width == null) {
                        long bits = le32(bytes, data + 1);
                        width = (int) (bits & 0x3FFF) + 1;
                        height = (int) ((bits >>> 14) & 0x3FFF) + 1;
                    }
                }
                case "VP8X" -> {
                    requireData(data, 10, chunkSize, "VP8X");
                    if ((bytes[data] & 0x02) != 0) {
                        animated = true;
                    }
                    if (width == null) {
                        width = (int) le24(bytes, data + 4) + 1;
                        height = (int) le24(bytes, data + 7) + 1;
                    }
                }
                case "ANMF" -> animated = true;
                default -> {
                    // Other chunks (ALPH, ICCP, EXIF, XMP, ...) carry no size/dimension
                    // information needed for validation and are ignored.
                }
            }
            firstChunk = false;
            position += 8 + chunkSize;
            if ((chunkSize & 1) == 1 && position < bytes.length) {
                position += 1; // RIFF pads odd-sized chunks to even boundaries
            }
        }
        if (position != bytes.length) {
            // The chunk walk must consume the whole payload; trailing bytes mean
            // the declared RIFF size or the chunk sizes are inconsistent.
            throw new IllegalArgumentException("WebP trailing bytes after last chunk");
        }
        if (width == null || height == null || width <= 0 || height <= 0) {
            throw new IllegalArgumentException("WebP dimensions could not be read");
        }
        return new WebpInfo(width, height, animated);
    }

    public record WebpInfo(int width, int height, boolean animated) {
    }

    private static boolean isImageChunk(String fourCc) {
        return "VP8 ".equals(fourCc) || "VP8L".equals(fourCc) || "VP8X".equals(fourCc);
    }

    private static void requireData(int dataOffset, int needed, int chunkSize, String kind) {
        if (chunkSize < needed) {
            throw new IllegalArgumentException(kind + " chunk is too small: " + chunkSize);
        }
    }

    private static String ascii(byte[] bytes, int offset, int length) {
        StringBuilder value = new StringBuilder(length);
        for (int index = 0; index < length; index++) {
            value.append((char) (bytes[offset + index] & 0xFF));
        }
        return value.toString();
    }

    private static long le32(byte[] bytes, int offset) {
        return ((long) (bytes[offset] & 0xFF))
                | ((long) (bytes[offset + 1] & 0xFF) << 8)
                | ((long) (bytes[offset + 2] & 0xFF) << 16)
                | ((long) (bytes[offset + 3] & 0xFF) << 24);
    }

    private static long le24(byte[] bytes, int offset) {
        return ((long) (bytes[offset] & 0xFF))
                | ((long) (bytes[offset + 1] & 0xFF) << 8)
                | ((long) (bytes[offset + 2] & 0xFF) << 16);
    }

    private static int le16(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFF) | ((bytes[offset + 1] & 0xFF) << 8);
    }
}

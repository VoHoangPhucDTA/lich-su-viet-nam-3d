package com.lichsuvn.backend.admin.application;

import java.util.Arrays;

/**
 * Builds minimal structurally-valid WebP byte arrays (and corrupt variants) for
 * tests. The generated files are not decodable images — only the RIFF/WEBP
 * container structure that {@link WebpImageInspector} validates.
 */
public final class TestWebpFactory {

    private TestWebpFactory() {
    }

    /** Minimal static VP8L (lossless) WebP with the given canvas dimensions. */
    public static byte[] vp8l(int width, int height) {
        byte[] data = new byte[5];
        data[0] = 0x2F;
        long bits = ((long) (width - 1) & 0x3FFF) | (((long) (height - 1) & 0x3FFF) << 14);
        data[1] = (byte) (bits & 0xFF);
        data[2] = (byte) ((bits >>> 8) & 0xFF);
        data[3] = (byte) ((bits >>> 16) & 0xFF);
        data[4] = (byte) ((bits >>> 24) & 0xFF);
        return riffWithChunks(new byte[][]{chunk("VP8L", data)});
    }

    /** Minimal static VP8 (lossy) WebP with the given dimensions. */
    public static byte[] vp8(int width, int height) {
        byte[] data = new byte[10];
        data[0] = 0x30; // frame tag (frame_type=0, version=0, show_frame=1)
        data[1] = 0x00;
        data[2] = 0x00;
        data[3] = (byte) 0x9D; // key-frame start code
        data[4] = 0x01;
        data[5] = 0x2A;
        data[6] = (byte) (width & 0xFF);
        data[7] = (byte) ((width >> 8) & 0xFF);
        data[8] = (byte) (height & 0xFF);
        data[9] = (byte) ((height >> 8) & 0xFF);
        return riffWithChunks(new byte[][]{chunk("VP8 ", data)});
    }

    /** VP8X extended WebP; {@code animated} sets the animation flag bit. */
    public static byte[] vp8x(int width, int height, boolean animated) {
        byte[] data = new byte[10];
        data[0] = (byte) (animated ? 0x02 : 0x00);
        putLe24(data, 4, width - 1);
        putLe24(data, 7, height - 1);
        return riffWithChunks(new byte[][]{chunk("VP8X", data)});
    }

    /** VP8X followed by an ANMF chunk, i.e. an animated container. */
    public static byte[] animatedWithAnmf(int width, int height) {
        byte[] vp8x = chunk("VP8X", new byte[10]);
        byte[] anmf = chunk("ANMF", new byte[16]);
        byte[] raw = riffWithChunks(new byte[][]{vp8x, anmf});
        byte[] canvas = vp8x(width, height, false);
        // Keep the two-chunk structure but borrow the canvas dims from vp8x()
        byte[] result = Arrays.copyOf(raw, raw.length);
        System.arraycopy(canvas, 12, result, 12, canvas.length - 12);
        return result;
    }

    /** RIFF container whose first chunk is ANIM — structurally invalid. */
    public static byte[] firstChunkNotImage() {
        return riffWithChunks(new byte[][]{chunk("ANIM", new byte[6])});
    }

    /** VP8L with a corrupt signature byte (not 0x2F). */
    public static byte[] corruptVp8lSignature(int width, int height) {
        byte[] valid = vp8l(width, height);
        valid[20] = 0x30; // first byte of the VP8L payload
        return valid;
    }

    /** Tamper the RIFF size field so it no longer matches the payload length. */
    public static byte[] tamperRiffSize(byte[] webp) {
        byte[] result = webp.clone();
        result[4] = (byte) (result[4] + 1);
        return result;
    }

    /** Truncate to {@code length} bytes (must be below the valid file size). */
    public static byte[] truncated(byte[] webp, int length) {
        return Arrays.copyOf(webp, Math.max(0, Math.min(length, webp.length - 1)));
    }

    private static byte[] riffWithChunks(byte[][] chunks) {
        int total = 12;
        for (byte[] c : chunks) {
            total += c.length;
        }
        byte[] out = new byte[total];
        out[0] = 'R';
        out[1] = 'I';
        out[2] = 'F';
        out[3] = 'F';
        int size = total - 8;
        out[4] = (byte) (size & 0xFF);
        out[5] = (byte) ((size >> 8) & 0xFF);
        out[6] = (byte) ((size >> 16) & 0xFF);
        out[7] = (byte) ((size >> 24) & 0xFF);
        out[8] = 'W';
        out[9] = 'E';
        out[10] = 'B';
        out[11] = 'P';
        int position = 12;
        for (byte[] c : chunks) {
            System.arraycopy(c, 0, out, position, c.length);
            position += c.length;
        }
        return out;
    }

    private static byte[] chunk(String fourCc, byte[] data) {
        byte[] c = new byte[8 + data.length];
        for (int index = 0; index < 4; index++) {
            c[index] = (byte) fourCc.charAt(index);
        }
        c[4] = (byte) (data.length & 0xFF);
        c[5] = (byte) ((data.length >> 8) & 0xFF);
        c[6] = (byte) ((data.length >> 16) & 0xFF);
        c[7] = (byte) ((data.length >> 24) & 0xFF);
        System.arraycopy(data, 0, c, 8, data.length);
        return c;
    }

    private static void putLe24(byte[] bytes, int offset, int value) {
        bytes[offset] = (byte) (value & 0xFF);
        bytes[offset + 1] = (byte) ((value >> 8) & 0xFF);
        bytes[offset + 2] = (byte) ((value >> 16) & 0xFF);
    }
}

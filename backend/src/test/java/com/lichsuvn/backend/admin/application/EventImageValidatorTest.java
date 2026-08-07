package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.common.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.zip.CRC32;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EventImageValidatorTest {
    private final EventImageValidator validator = new EventImageValidator();

    @Test
    void validatesDecodedPngAndIgnoresBrowserFilenameAndContentType() throws Exception {
        byte[] bytes = image("png", BufferedImage.TYPE_INT_ARGB, 17, 11);
        var file = new MockMultipartFile(
                "file", "../../../payload.svg", "application/octet-stream", bytes);

        var result = validator.validate(
                file, "Bản đồ chiến dịch", " Chú thích ", " Nguồn ", " CC BY ");

        assertEquals("image/png", result.mimeType());
        assertEquals("png", result.format());
        assertEquals(17, result.width());
        assertEquals(11, result.height());
        assertEquals(bytes.length, result.byteSize());
        assertEquals(
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)),
                result.sha256());
        assertEquals("Bản đồ chiến dịch", result.altText());
        assertEquals("Chú thích", result.caption());
        assertNotNull(result.bytes());
    }

    @Test
    void validatesDecodedJpegByMagicRatherThanClientClaim() throws Exception {
        byte[] bytes = image("jpg", BufferedImage.TYPE_INT_RGB, 23, 13);
        var file = new MockMultipartFile("file", "anything.png", "image/png", bytes);

        var result = validator.validate(file, "Ảnh di tích", null, null, null);

        assertEquals("image/jpeg", result.mimeType());
        assertEquals("jpeg", result.format());
        assertEquals(23, result.width());
        assertEquals(13, result.height());
    }

    @Test
    void rejectsEmptyOversizedUnsupportedMalformedAndTrailingContent() throws Exception {
        assertCode("EVENT_IMAGE_FILE_REQUIRED", new byte[0]);
        assertCode("EVENT_IMAGE_PAYLOAD_TOO_LARGE",
                new byte[EventImageValidator.MAX_BYTES + 1]);
        assertCode("EVENT_IMAGE_UNSUPPORTED_FORMAT",
                "<svg xmlns='http://www.w3.org/2000/svg'/>".getBytes());
        assertCode("EVENT_IMAGE_INVALID_CONTENT",
                new byte[]{(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0, 1});

        byte[] png = image("png", BufferedImage.TYPE_INT_RGB, 3, 3);
        byte[] trailing = Arrays.copyOf(png, png.length + 4);
        trailing[png.length] = 'P';
        assertCode("EVENT_IMAGE_INVALID_CONTENT", trailing);

        byte[] jpeg = image("jpg", BufferedImage.TYPE_INT_RGB, 3, 3);
        assertCode("EVENT_IMAGE_INVALID_CONTENT", Arrays.copyOf(jpeg, jpeg.length - 1));
    }

    @Test
    void acceptsStaticWebpByMagicAndRejectsAnimatedOrCorruptWebp() throws Exception {
        byte[] png = image("png", BufferedImage.TYPE_INT_ARGB, 4, 4);
        assertCode("EVENT_IMAGE_ANIMATED_UNSUPPORTED", addActlChunk(png));

        var file = new MockMultipartFile(
                "file", "photo.webp", "image/webp", TestWebpFactory.vp8l(23, 17));
        var result = validator.validate(file, "Ảnh WebP", null, null, null);

        assertEquals("image/webp", result.mimeType());
        assertEquals("webp", result.format());
        assertEquals(23, result.width());
        assertEquals(17, result.height());

        // The browser filename/content-type claim is ignored; magic bytes decide.
        var mislabelled = new MockMultipartFile(
                "file", "anything.png", "image/png", TestWebpFactory.vp8(9, 7));
        var mislabelledResult = validator.validate(mislabelled, "Ảnh WebP 2", null, null, null);
        assertEquals("image/webp", mislabelledResult.mimeType());
        assertEquals(9, mislabelledResult.width());
        assertEquals(7, mislabelledResult.height());

        assertCode("EVENT_IMAGE_ANIMATED_UNSUPPORTED", TestWebpFactory.vp8x(64, 64, true));
        assertCode("EVENT_IMAGE_ANIMATED_UNSUPPORTED", TestWebpFactory.animatedWithAnmf(64, 64));
        assertCode("EVENT_IMAGE_INVALID_CONTENT", TestWebpFactory.tamperRiffSize(TestWebpFactory.vp8l(10, 10)));
        assertCode("EVENT_IMAGE_INVALID_CONTENT", TestWebpFactory.truncated(TestWebpFactory.vp8l(10, 10), 19));
        assertCode("EVENT_IMAGE_INVALID_CONTENT", TestWebpFactory.firstChunkNotImage());
        assertCode("EVENT_IMAGE_INVALID_CONTENT", TestWebpFactory.corruptVp8lSignature(10, 10));
    }

    @Test
    void rejectsWebpBeyondDimensionAndPixelLimits() throws Exception {
        assertCode(
                "EVENT_IMAGE_DIMENSIONS_TOO_LARGE",
                TestWebpFactory.vp8x(EventImageValidator.MAX_DIMENSION + 1, 1, false));
        assertCode(
                "EVENT_IMAGE_DIMENSIONS_TOO_LARGE",
                TestWebpFactory.vp8x(5_000, 5_001, false));
    }

    @Test
    void rejectsDimensionAndPixelLimitsBeforeFullDecode() throws Exception {
        byte[] png = image("png", BufferedImage.TYPE_INT_RGB, 1, 1);
        assertCode(
                "EVENT_IMAGE_DIMENSIONS_TOO_LARGE",
                withPngDimensions(png, EventImageValidator.MAX_DIMENSION + 1, 1));
        assertCode(
                "EVENT_IMAGE_DIMENSIONS_TOO_LARGE",
                withPngDimensions(png, 5_000, 5_001));
    }

    @Test
    void enforcesMeaningfulAltAndMetadataBounds() throws Exception {
        byte[] png = image("png", BufferedImage.TYPE_INT_RGB, 3, 3);
        var file = new MockMultipartFile("file", "x.png", "image/png", png);

        assertEquals("EVENT_IMAGE_ALT_TEXT_REQUIRED",
                assertThrows(ApiException.class,
                        () -> validator.validate(file, " -- ", null, null, null)).getCode());
        assertEquals("EVENT_IMAGE_METADATA_INVALID",
                assertThrows(ApiException.class,
                        () -> validator.validate(file, "Ảnh hợp lệ", "x".repeat(1001), null, null))
                        .getCode());
    }

    private void assertCode(String code, byte[] bytes) {
        var file = new MockMultipartFile("file", "ignored.bin", "image/jpeg", bytes);
        assertEquals(code, assertThrows(ApiException.class,
                () -> validator.validate(file, "Ảnh hợp lệ", null, null, null)).getCode());
    }

    private byte[] image(String format, int type, int width, int height) throws Exception {
        BufferedImage image = new BufferedImage(width, height, type);
        var graphics = image.createGraphics();
        graphics.setColor(Color.BLUE);
        graphics.fillRect(0, 0, width, height);
        graphics.dispose();
        var output = new ByteArrayOutputStream();
        assertTrue(ImageIO.write(image, format, output));
        return output.toByteArray();
    }

    private byte[] addActlChunk(byte[] png) {
        int iendStart = png.length - 12;
        byte[] type = new byte[]{'a', 'c', 'T', 'L'};
        byte[] data = ByteBuffer.allocate(8).putInt(2).putInt(0).array();
        CRC32 crc = new CRC32();
        crc.update(type);
        crc.update(data);
        ByteBuffer chunk = ByteBuffer.allocate(20);
        chunk.putInt(data.length).put(type).put(data).putInt((int) crc.getValue());
        byte[] result = new byte[png.length + chunk.array().length];
        System.arraycopy(png, 0, result, 0, iendStart);
        System.arraycopy(chunk.array(), 0, result, iendStart, chunk.array().length);
        System.arraycopy(png, iendStart, result, iendStart + chunk.array().length, 12);
        return result;
    }

    private byte[] withPngDimensions(byte[] png, int width, int height) {
        byte[] result = png.clone();
        ByteBuffer.wrap(result, 16, 8).putInt(width).putInt(height);
        CRC32 crc = new CRC32();
        crc.update(result, 12, 17);
        ByteBuffer.wrap(result, 29, 4).putInt((int) crc.getValue());
        return result;
    }
}

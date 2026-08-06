package com.lichsuvn.backend.admin.application;

import org.junit.jupiter.api.Test;

import static com.lichsuvn.backend.admin.application.TestWebpFactory.animatedWithAnmf;
import static com.lichsuvn.backend.admin.application.TestWebpFactory.corruptVp8lSignature;
import static com.lichsuvn.backend.admin.application.TestWebpFactory.firstChunkNotImage;
import static com.lichsuvn.backend.admin.application.TestWebpFactory.tamperRiffSize;
import static com.lichsuvn.backend.admin.application.TestWebpFactory.truncated;
import static com.lichsuvn.backend.admin.application.TestWebpFactory.vp8;
import static com.lichsuvn.backend.admin.application.TestWebpFactory.vp8l;
import static com.lichsuvn.backend.admin.application.TestWebpFactory.vp8x;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WebpImageInspectorTest {

    @Test
    void detectsWebpMagicOnlyForRiffWebpHeaders() {
        assertTrue(WebpImageInspector.isWebp(vp8l(10, 10)));
        assertTrue(WebpImageInspector.isWebp(vp8(10, 10)));
        assertTrue(WebpImageInspector.isWebp(vp8x(10, 10, false)));
        assertFalse(WebpImageInspector.isWebp(new byte[]{'R', 'I', 'F', 'F', 0, 0, 0, 0, 'A', 'V', 'I', ' '}));
        assertFalse(WebpImageInspector.isWebp(new byte[0]));
        assertFalse(WebpImageInspector.isWebp(null));
    }

    @Test
    void parsesStaticVp8lLosslessDimensions() {
        var info = WebpImageInspector.parse(vp8l(640, 480));
        assertEquals(640, info.width());
        assertEquals(480, info.height());
        assertFalse(info.animated());
    }

    @Test
    void parsesStaticVp8LossyDimensions() {
        var info = WebpImageInspector.parse(vp8(32, 64));
        assertEquals(32, info.width());
        assertEquals(64, info.height());
        assertFalse(info.animated());
    }

    @Test
    void parsesStaticVp8xExtendedCanvas() {
        var info = WebpImageInspector.parse(vp8x(300, 200, false));
        assertEquals(300, info.width());
        assertEquals(200, info.height());
        assertFalse(info.animated());
    }

    @Test
    void flagsVp8xAnimationBit() {
        var info = WebpImageInspector.parse(vp8x(300, 200, true));
        assertEquals(300, info.width());
        assertEquals(200, info.height());
        assertTrue(info.animated());
    }

    @Test
    void flagsAnimatedContainerWithAnmfChunk() {
        var info = WebpImageInspector.parse(animatedWithAnmf(80, 60));
        assertEquals(80, info.width());
        assertEquals(60, info.height());
        assertTrue(info.animated());
    }

    @Test
    void rejectsCorruptStructures() {
        assertThrows(IllegalArgumentException.class, () -> WebpImageInspector.parse(tamperRiffSize(vp8l(10, 10))));
        assertThrows(IllegalArgumentException.class, () -> WebpImageInspector.parse(truncated(vp8l(10, 10), 19)));
        assertThrows(IllegalArgumentException.class, () -> WebpImageInspector.parse(firstChunkNotImage()));
        assertThrows(IllegalArgumentException.class, () -> WebpImageInspector.parse(corruptVp8lSignature(10, 10)));
        assertThrows(IllegalArgumentException.class, () -> WebpImageInspector.parse(new byte[]{'X', 'X', 'X', 'X'}));
    }

    @Test
    void rejectsTrailingBytesAfterLastChunk() {
        byte[] valid = vp8l(10, 10);
        byte[] trailing = java.util.Arrays.copyOf(valid, valid.length + 4);
        trailing[valid.length] = 0x00;
        trailing[valid.length + 1] = 0x00;
        trailing[valid.length + 2] = 0x00;
        trailing[valid.length + 3] = 0x00;
        assertThrows(IllegalArgumentException.class, () -> WebpImageInspector.parse(trailing));
    }

    @Test
    void parsesLargeCanvasWithin24BitRange() {
        // 24-bit canvas max = 0xFFFFFF + 1; the inspector reports it faithfully and
        // the caller (EventImageValidator) applies MAX_DIMENSION limits.
        var info = WebpImageInspector.parse(vp8x(16_777_216, 1, false));
        assertEquals(16_777_216, info.width());
        assertEquals(1, info.height());
        assertFalse(info.animated());
    }
}

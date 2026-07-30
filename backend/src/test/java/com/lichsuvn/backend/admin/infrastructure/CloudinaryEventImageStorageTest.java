package com.lichsuvn.backend.admin.infrastructure;

import com.lichsuvn.backend.admin.application.EventImageStorage;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CloudinaryEventImageStorageTest {
    @Test
    void uploadUsesExactServerIdNoFolderNoOverwriteAndMapsOnlyTypedFields() {
        AtomicReference<Map<String, Object>> captured = new AtomicReference<>();
        var storage = configured((bytes, options) -> {
            captured.set(options);
            return Map.of(
                    "public_id", "events/event-1/media/asset-1",
                    "asset_id", "provider-asset",
                    "version", 42L,
                    "secure_url", "https://res.cloudinary.com/demo/image/upload/v42/original",
                    "resource_type", "image",
                    "format", "png",
                    "width", 20,
                    "height", 10,
                    "bytes", 123,
                    "signature", "must-not-escape");
        }, (publicId, options) -> Map.of("result", "ok"));

        var result = storage.upload(new EventImageStorage.UploadCommand(
                new byte[]{1, 2, 3},
                "events/event-1/media/asset-1",
                "image/png"));

        assertEquals("events/event-1/media/asset-1", captured.get().get("public_id"));
        assertEquals(false, captured.get().get("overwrite"));
        assertEquals(false, captured.get().get("unique_filename"));
        assertEquals("image", captured.get().get("resource_type"));
        assertEquals("fl_force_strip", captured.get().get("transformation"));
        assertFalse(captured.get().containsKey("folder"));
        assertFalse(captured.get().containsKey("asset_folder"));
        assertEquals("provider-asset", result.providerAssetId());
        assertEquals(42L, result.providerVersion());
        assertEquals("png", result.format());
        assertEquals(20, result.width());
        assertEquals(10, result.height());
    }

    @Test
    void mismatchedProviderIdentityIsRejectedWithoutLeakingRawResponse() {
        var storage = configured((bytes, options) -> Map.of(
                "public_id", "events/other/media/wrong",
                "asset_id", "asset",
                "version", 1L,
                "secure_url", "https://res.cloudinary.com/demo/image/upload/v1/wrong",
                "resource_type", "image",
                "format", "png",
                "width", 1,
                "height", 1,
                "bytes", 1), (publicId, options) -> Map.of("result", "ok"));

        var error = assertThrows(EventImageStorage.EventImageStorageException.class,
                () -> storage.upload(new EventImageStorage.UploadCommand(
                        new byte[]{1}, "events/event-1/media/asset-1", "image/png")));
        assertEquals("EVENT_IMAGE_PROVIDER_RESPONSE_INVALID", error.code());
        assertFalse(error.getMessage().contains("events/other"));
    }

    @Test
    void providerJpgFormatIsCanonicalizedToValidatedJpeg() {
        var storage = configured((bytes, options) -> Map.of(
                "public_id", "events/event-1/media/asset-1",
                "asset_id", "provider-asset",
                "version", 42L,
                "secure_url", "https://res.cloudinary.com/demo/image/upload/v42/original",
                "resource_type", "image",
                "format", "jpg",
                "width", 20,
                "height", 10,
                "bytes", 123), (publicId, options) -> Map.of("result", "ok"));

        var result = storage.upload(new EventImageStorage.UploadCommand(
                new byte[]{1, 2, 3},
                "events/event-1/media/asset-1",
                "image/jpeg"));

        assertEquals("jpeg", result.format());
        assertEquals("image/jpeg", result.mimeType());
    }

    @Test
    void deliveryUrlsAreBackendGeneratedBoundedNoCropAndDeleteInvalidatesCdn() {
        AtomicReference<Map<String, Object>> deleteOptions = new AtomicReference<>();
        var storage = configured(
                (bytes, options) -> Map.of(),
                (publicId, options) -> {
                    deleteOptions.set(options);
                    return Map.of("result", "not found");
                });

        String thumbnail = storage.deliveryUrl(new EventImageStorage.DeliveryCommand(
                "events/event-1/thumbnail/11111111-1111-4111-8111-111111111111", 7L,
                EventImageStorage.DeliveryKind.THUMBNAIL));
        String gallery = storage.deliveryUrl(new EventImageStorage.DeliveryCommand(
                "events/event-1/media/22222222-2222-4222-8222-222222222222", null,
                EventImageStorage.DeliveryKind.GALLERY));

        assertTrue(thumbnail.contains("/c_limit,w_1600,h_1600/f_auto,q_auto/v7/"));
        assertTrue(gallery.contains("/c_limit,w_2400,h_2400/f_auto,q_auto/"));
        assertFalse(thumbnail.contains("c_fill"));
        assertEquals(EventImageStorage.DeleteOutcome.NOT_FOUND,
                storage.delete(new EventImageStorage.DeleteCommand(
                        "events/event-1/media/22222222-2222-4222-8222-222222222222")).outcome());
        assertEquals(true, deleteOptions.get().get("invalidate"));
        assertEquals("image", deleteOptions.get().get("resource_type"));
    }

    @Test
    void absentConfigurationKeepsApplicationCapabilityUnavailable() {
        var storage = new CloudinaryEventImageStorage(
                "", "", "", 30_000, null);
        assertFalse(storage.available());
        var error = assertThrows(EventImageStorage.EventImageStorageException.class,
                () -> storage.upload(new EventImageStorage.UploadCommand(
                        new byte[]{1}, "events/event-1/media/a", "image/png")));
        assertEquals("EVENT_IMAGE_UPLOAD_UNAVAILABLE", error.code());
    }

    @Test
    void credentialsRemainAvailableForCleanupWhenNewUploadsAreDisabled() {
        var storage = new CloudinaryEventImageStorage(
                "demo",
                "key",
                "secret",
                30_000,
                new CloudinaryEventImageStorage.Operations(
                        (bytes, options) -> Map.of(),
                        (publicId, options) -> Map.of("result", "ok")));

        assertTrue(storage.available());
        assertEquals(
                EventImageStorage.DeleteOutcome.DELETED,
                storage.delete(new EventImageStorage.DeleteCommand(
                        "events/event-1/media/asset")).outcome());
    }

    @Test
    void deleteClassifiesTransientProviderStatusWithoutExposingPayload() {
        var storage = configured(
                (bytes, options) -> Map.of(),
                (publicId, options) -> Map.of(
                        "error", Map.of(
                                "http_code", 503,
                                "message", "sensitive provider detail")));

        var error = assertThrows(EventImageStorage.EventImageStorageException.class,
                () -> storage.delete(new EventImageStorage.DeleteCommand(
                        "events/event-1/media/asset")));

        assertEquals("EVENT_IMAGE_PROVIDER_DELETE_FAILED", error.code());
        assertTrue(error.retryable());
        assertFalse(error.getMessage().contains("sensitive"));
    }

    @Test
    void deleteClassifiesClientProviderStatusAsTerminal() {
        var storage = configured(
                (bytes, options) -> Map.of(),
                (publicId, options) -> Map.of(
                        "error", Map.of("http_code", 400)));

        var error = assertThrows(EventImageStorage.EventImageStorageException.class,
                () -> storage.delete(new EventImageStorage.DeleteCommand(
                        "events/event-1/media/asset")));

        assertEquals("EVENT_IMAGE_PROVIDER_DELETE_FAILED", error.code());
        assertFalse(error.retryable());
    }

    private CloudinaryEventImageStorage configured(
            CloudinaryEventImageStorage.UploadOperation upload,
            CloudinaryEventImageStorage.DeleteOperation delete
    ) {
        return new CloudinaryEventImageStorage(
                "demo", "key", "secret", 30_000,
                new CloudinaryEventImageStorage.Operations(upload, delete));
    }
}

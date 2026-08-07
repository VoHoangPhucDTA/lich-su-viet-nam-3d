package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.lichsuvn.backend.admin.application.EventImageStorage;
import com.lichsuvn.backend.admin.application.TestWebpFactory;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.BatchOutcome;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.PlanDigest;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.UploadResult;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationRepository.FinalizeCommand;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationRepository.GalleryRow;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LegacyEventGalleryMigrationServiceTest {

    private static byte[] realPng(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private static byte[] realJpeg(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", out);
        return out.toByteArray();
    }

    private ObjectMapper objectMapper() {
        ObjectMapper mapper = new ObjectMapper();
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return mapper;
    }

    @Test
    void buildPlanProducesEligibleRowsAndDeterministicDigest(@TempDir Path tempDir) throws IOException {
        Path fileA = tempDir.resolve("alpha.png");
        Path fileB = tempDir.resolve("beta.jpg");
        Files.write(fileA, realPng(64, 64));
        Files.write(fileB, realJpeg(64, 64));

        LegacyEventGalleryMigrationRepository repository = mock(LegacyEventGalleryMigrationRepository.class);
        EventImageStorage storage = mock(EventImageStorage.class);
        LegacyEventGalleryMigrationService service = new LegacyEventGalleryMigrationService(
                repository,
                storage,
                objectMapper(),
                Clock.systemUTC(),
                tempDir
        );

        when(repository.loadLegacyGalleryRows()).thenReturn(List.of(
                new GalleryRow(
                        10L, "event-1", "image",
                        "/media/event-images/alpha.png",
                        null, null, null, null,
                        0, "active", false,
                        "local", "UNMANAGED", null,
                        null, null),
                new GalleryRow(
                        20L, "event-1", "image",
                        "/media/event-images/beta.jpg",
                        null, null, null, null,
                        1, "active", false,
                        "local", "UNMANAGED", null,
                        null, null)
        ));

        LegacyEventGalleryMigrationService.Plan plan = service.buildPlan("run-1");
        PlanDigest digest = plan.digest();
        assertEquals(2, digest.eligibleRowCount());
        assertEquals(0, digest.missingFileCount());
        assertEquals(0, digest.invalidImageCount());
        assertEquals(0, digest.unsupportedFormatCount());
        assertEquals(0, digest.alreadyManagedCount());
        assertEquals(2, plan.eligible().size());
        assertNotNull(plan.rollback());
        assertEquals(2, plan.rollback().entryCount());

        // second call with same runId produces identical digest
        LegacyEventGalleryMigrationService.Plan second = service.buildPlan("run-1");
        assertEquals(digest.hashDigest(), second.digest().hashDigest());

        // a different runId yields a different digest
        LegacyEventGalleryMigrationService.Plan other = service.buildPlan("run-2");
        assertNotEquals(digest.hashDigest(), other.digest().hashDigest());
    }

    @Test
    void buildPlanClassifiesMissingFileInvalidImageAndUnsupported(@TempDir Path tempDir) throws IOException {
        Path ok = tempDir.resolve("ok.png");
        Files.write(ok, realPng(64, 64));
        Path unsupported = tempDir.resolve("bad.png");
        Files.write(unsupported, new byte[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24});

        LegacyEventGalleryMigrationRepository repository = mock(LegacyEventGalleryMigrationRepository.class);
        EventImageStorage storage = mock(EventImageStorage.class);
        LegacyEventGalleryMigrationService service = new LegacyEventGalleryMigrationService(
                repository,
                storage,
                objectMapper(),
                Clock.systemUTC(),
                tempDir
        );

        when(repository.loadLegacyGalleryRows()).thenReturn(List.of(
                new GalleryRow(1L, "event-1", "image",
                        "/media/event-images/missing.png",
                        null, null, null, null,
                        0, "active", false,
                        "local", "UNMANAGED", null, null, null),
                new GalleryRow(2L, "event-1", "image",
                        "/media/event-images/ok.png",
                        null, null, null, null,
                        1, "active", false,
                        "local", "UNMANAGED", null, null, null),
                new GalleryRow(3L, "event-1", "image",
                        "/media/event-images/bad.png",
                        null, null, null, null,
                        2, "active", false,
                        "local", "UNMANAGED", null, null, null)
        ));

        LegacyEventGalleryMigrationService.Plan plan = service.buildPlan("run-1");
        assertEquals(0, plan.digest().missingFileCount());
        assertEquals(1, plan.digest().invalidImageCount());
        assertEquals(1, plan.digest().unsupportedFormatCount());
        assertEquals(1, plan.digest().eligibleRowCount());
    }

    @Test
    void buildPlanClassifiesStaticWebpAsEligible(@TempDir Path tempDir) throws IOException {
        Path file = tempDir.resolve("photo.webp");
        Files.write(file, TestWebpFactory.vp8l(32, 24));

        LegacyEventGalleryMigrationRepository repository = mock(LegacyEventGalleryMigrationRepository.class);
        EventImageStorage storage = mock(EventImageStorage.class);
        LegacyEventGalleryMigrationService service = new LegacyEventGalleryMigrationService(
                repository,
                storage,
                objectMapper(),
                Clock.systemUTC(),
                tempDir
        );
        when(repository.loadLegacyGalleryRows()).thenReturn(List.of(
                new GalleryRow(
                        41L, "event-webp", "image",
                        "/media/event-images/photo.webp",
                        null, null, null, null,
                        0, "active", false,
                        "local", "UNMANAGED", null, null, null)
        ));

        LegacyEventGalleryMigrationService.Plan plan = service.buildPlan("run-webp");
        assertEquals(1, plan.digest().eligibleRowCount());
        assertEquals(0, plan.digest().invalidImageCount());
        assertEquals(0, plan.digest().unsupportedFormatCount());
        assertEquals(0, plan.digest().missingFileCount());
        assertEquals("webp", plan.eligible().get(0).plannedFormat());
        assertEquals("image/webp", plan.eligible().get(0).plannedMimeType());
        assertEquals(32, plan.eligible().get(0).plannedWidth());
        assertEquals(24, plan.eligible().get(0).plannedHeight());
        assertTrue(plan.eligible().get(0).plannedPublicId()
                .startsWith("events/event-webp/media/"));
    }

    @Test
    void buildPlanRejectsPathTraversal(@TempDir Path tempDir) throws IOException {
        Path ok = tempDir.resolve("ok.png");
        Files.write(ok, realPng(64, 64));
        LegacyEventGalleryMigrationRepository repository = mock(LegacyEventGalleryMigrationRepository.class);
        EventImageStorage storage = mock(EventImageStorage.class);
        LegacyEventGalleryMigrationService service = new LegacyEventGalleryMigrationService(
                repository,
                storage,
                objectMapper(),
                Clock.systemUTC(),
                tempDir
        );
        when(repository.loadLegacyGalleryRows()).thenReturn(List.of(
                new GalleryRow(99L, "event-x", "image",
                        "/media/event-images/../etc/passwd",
                        null, null, null, null,
                        0, "active", false,
                        "local", "UNMANAGED", null, null, null)
        ));
        LegacyEventGalleryMigrationService.Plan plan = service.buildPlan("run-1");
        assertEquals(0, plan.digest().eligibleRowCount());
        assertEquals(1, plan.digest().missingFileCount());
        assertTrue(plan.eligible().isEmpty());
    }

    @Test
    void applyUploadsAndFinalizesPerRow(@TempDir Path tempDir) throws IOException {
        Path fileA = tempDir.resolve("a.png");
        Files.write(fileA, realPng(64, 64));

        LegacyEventGalleryMigrationRepository repository = mock(LegacyEventGalleryMigrationRepository.class);
        EventImageStorage storage = mock(EventImageStorage.class);
        LegacyEventGalleryMigrationService service = new LegacyEventGalleryMigrationService(
                repository,
                storage,
                objectMapper(),
                Clock.systemUTC(),
                tempDir
        );

        when(repository.loadLegacyGalleryRows()).thenReturn(List.of(
                new GalleryRow(50L, "event-z", "image",
                        "/media/event-images/a.png",
                        "cap", "alt", "src", "lic",
                        0, "active", false,
                        "local", "UNMANAGED", null, null, null)
        ));
        when(repository.finalizeRow(any(FinalizeCommand.class))).thenAnswer(inv -> {
            var command = inv.getArgument(0, FinalizeCommand.class);
            if (command.mediaId() == 50L) {
                return 1;
            }
            return 0;
        });
        when(storage.deliveryUrl(any(EventImageStorage.DeliveryCommand.class))).thenReturn(
                "https://res.cloudinary.com/dkzxh3jb9/image/upload/c_limit,w_2400,h_2400/f_auto,q_auto/v1/events/event-z/media/asset"
        );
        when(storage.upload(any(EventImageStorage.UploadCommand.class))).thenAnswer(invocation -> {
            var command = invocation.getArgument(0, EventImageStorage.UploadCommand.class);
            return new EventImageStorage.StoredImage(
                    command.publicId(),
                    "provider-asset-id",
                    1L,
                    "https://res.cloudinary.com/dkzxh3jb9/image/upload/v1/" + command.publicId(),
                    command.mimeType(),
                    "png",
                    command.bytes().length,
                    64,
                    64);
        });

        LegacyEventGalleryMigrationService.Plan plan = service.buildPlan("run-3");
        BatchOutcome outcome = service.apply(plan);
        assertEquals(1, outcome.affectedRows());
        assertEquals(0, outcome.uploadFailures());
        assertEquals(0, outcome.finalizeConflicts());
        assertEquals(UploadResult.UPLOADED_AND_FINALIZED, outcome.rowOutcomes().get(0).result());
        verify(storage, times(1)).upload(any(EventImageStorage.UploadCommand.class));
        verify(repository, times(1)).finalizeRow(any(FinalizeCommand.class));
    }

    @Test
    void applyDetectsRowStateDriftAndFinalizeConflicts(@TempDir Path tempDir) throws IOException {
        Path fileA = tempDir.resolve("drift.png");
        Files.write(fileA, realPng(64, 64));
        LegacyEventGalleryMigrationRepository repository = mock(LegacyEventGalleryMigrationRepository.class);
        EventImageStorage storage = mock(EventImageStorage.class);
        LegacyEventGalleryMigrationService service = new LegacyEventGalleryMigrationService(
                repository,
                storage,
                objectMapper(),
                Clock.systemUTC(),
                tempDir
        );

        when(repository.loadLegacyGalleryRows()).thenReturn(List.of(
                new GalleryRow(60L, "event-c", "image",
                        "/media/event-images/drift.png",
                        null, null, null, null,
                        0, "active", false,
                        "local", "UNMANAGED", null, null, null)
        ));

        LegacyEventGalleryMigrationService.Plan plan = service.buildPlan("run-4");
        Map<Long, GalleryRow> inventory = new HashMap<>(plan.inventoryById());
        inventory.put(60L, new GalleryRow(
                60L, "event-c", "image",
                "https://res.cloudinary.com/dkzxh3jb9/image/upload/v1/events/event-c/media/asset.png",
                null, null, null, null,
                0, "active", false,
                "object_storage", "READY", "cloudinary", "events/event-c/media/asset",
                "asset"));
        LegacyEventGalleryMigrationService.Plan mutated = new LegacyEventGalleryMigrationService.Plan(
                plan.digest(),
                plan.eligible(),
                plan.rollback(),
                inventory
        );

        BatchOutcome outcome = service.apply(mutated);
        assertEquals(0, outcome.affectedRows());
        assertEquals(1, outcome.finalizeConflicts());
        assertEquals(0, outcome.uploadFailures());
        verify(storage, never()).upload(any(EventImageStorage.UploadCommand.class));
        verify(repository, never()).finalizeRow(any(FinalizeCommand.class));
    }

    @Test
    void applyEnqueuesCleanupOnFinalizeConflict(@TempDir Path tempDir) throws IOException {
        Path file = tempDir.resolve("fail.png");
        Files.write(file, realPng(64, 64));
        LegacyEventGalleryMigrationRepository repository = mock(LegacyEventGalleryMigrationRepository.class);
        EventImageStorage storage = mock(EventImageStorage.class);
        LegacyEventGalleryMigrationService service = new LegacyEventGalleryMigrationService(
                repository,
                storage,
                objectMapper(),
                Clock.systemUTC(),
                tempDir
        );
        when(repository.loadLegacyGalleryRows()).thenReturn(List.of(
                new GalleryRow(70L, "event-q", "image",
                        "/media/event-images/fail.png",
                        null, null, null, null,
                        0, "active", false,
                        "local", "UNMANAGED", null, null, null)
        ));
        when(repository.finalizeRow(any(FinalizeCommand.class))).thenReturn(0);
        when(storage.deliveryUrl(any(EventImageStorage.DeliveryCommand.class))).thenReturn(
                "https://res.cloudinary.com/dkzxh3jb9/image/upload/c_limit,w_2400,f_auto,q_auto/v1/events/event-q/media/asset"
        );
        when(storage.upload(any(EventImageStorage.UploadCommand.class))).thenAnswer(invocation -> {
            var command = invocation.getArgument(0, EventImageStorage.UploadCommand.class);
            return new EventImageStorage.StoredImage(
                    command.publicId(),
                    "asset-id",
                    1L,
                    "https://res.cloudinary.com/dkzxh3jb9/image/upload/v1/" + command.publicId(),
                    command.mimeType(),
                    "png",
                    command.bytes().length,
                    64,
                    64);
        });

        LegacyEventGalleryMigrationService.Plan plan = service.buildPlan("run-5");
        BatchOutcome outcome = service.apply(plan);
        assertEquals(1, outcome.finalizeConflicts());
        assertNotEquals(UploadResult.UPLOADED_AND_FINALIZED,
                outcome.rowOutcomes().get(0).result());
        verify(repository, atLeastOnce()).armCleanup(any(), any(), any());
    }

    @Test
    void writeArtifactsProducesThreeFiles(@TempDir Path tempDir) throws IOException {
        Path file = tempDir.resolve("w.png");
        Files.write(file, realPng(64, 64));
        LegacyEventGalleryMigrationRepository repository = mock(LegacyEventGalleryMigrationRepository.class);
        EventImageStorage storage = mock(EventImageStorage.class);
        LegacyEventGalleryMigrationService service = new LegacyEventGalleryMigrationService(
                repository,
                storage,
                objectMapper(),
                Clock.systemUTC(),
                tempDir
        );
        when(repository.loadLegacyGalleryRows()).thenReturn(List.of(
                new GalleryRow(80L, "event-w", "image",
                        "/media/event-images/w.png",
                        null, null, null, null,
                        0, "active", false,
                        "local", "UNMANAGED", null, null, null)
        ));
        LegacyEventGalleryMigrationService.Plan plan = service.buildPlan("run-6");
        Path out = tempDir.resolve("artifacts");
        int totalBytes = service.writeArtifacts(plan, out);
        assertTrue(out.resolve("upload-plan.json").toFile().isFile());
        assertTrue(out.resolve("rollback-snapshot.json").toFile().isFile());
        assertTrue(out.resolve("summary.json").toFile().isFile());
        assertTrue(totalBytes > 0);
    }

    @Test
    void rejectsUrlTraversalAndNonImagePrefix() {
        LegacyEventGalleryMigrationRepository repository = mock(LegacyEventGalleryMigrationRepository.class);
        EventImageStorage storage = mock(EventImageStorage.class);
        Clock clock = Clock.systemUTC();
        LegacyEventGalleryMigrationService service = new LegacyEventGalleryMigrationService(
                repository, storage, objectMapper(), clock, Path.of("./tmp"));
        try {
            var method = LegacyEventGalleryMigrationService.class
                    .getDeclaredMethod("resolveLocalFile", String.class);
            method.setAccessible(true);
            assertNull(method.invoke(service, (Object) null));
            assertNull(method.invoke(service, "/other/path/x.png"));
            assertNull(method.invoke(service, "/media/event-images/"));
            assertNull(method.invoke(service, "/media/event-images/../etc/passwd"));
            assertNull(method.invoke(service, "/media/event-images/sub/file.png"));
        } catch (Exception exception) {
            assertTrue(false, "Should not throw: " + exception.getMessage());
        }
    }

    private static void assertNull(Object value) {
        org.junit.jupiter.api.Assertions.assertNull(value);
    }
}

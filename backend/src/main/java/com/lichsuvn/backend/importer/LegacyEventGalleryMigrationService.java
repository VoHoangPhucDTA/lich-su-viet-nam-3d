package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.application.AdminEventImageNaming;
import com.lichsuvn.backend.admin.application.EventImageStorage;
import com.lichsuvn.backend.admin.application.WebpImageInspector;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.BatchOutcome;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.EligibleRow;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.PlanDigest;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.RollbackEntry;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.RollbackSnapshot;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.RowOutcome;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationPlan.UploadResult;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationRepository.FinalizeCommand;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationRepository.GalleryRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Scaffolding for the local-gallery → managed Cloudinary migration
 * (Release G — Track B). Reuses the V42 {@link AdminEventImageNaming} contract
 * for public_id generation and {@link EventImageStorage} for signed multipart
 * uploads; the wiring produces one managed_asset_id and one Cloudinary asset per
 * {@code event_media} row.
 *
 * <p>Lifecycle:
 * <ol>
 *   <li>{@link #plan(String)} — read inventory, mint per-row UUIDs + V42 public_ids,
 *       validate local file magic bytes + dimensions + size, build deterministic
 *       {@link PlanDigest}. Run twice to confirm determinism. No DB write.</li>
 *   <li>{@link #apply(String)} — emit rollback snapshot, then bounded-concurrent
 *       upload + per-row CAS UPDATE; orphan Cloudinary assets (failed finalize)
 *       are enqueued on {@code event_media_storage_cleanup_tasks}; no batch DB
 *       transaction because upload latency cannot share one with DB writes.</li>
 *   <li>Idempotent re-run — any row already in {@code storage_state='READY',
 *       storage_provider='cloudinary'} is misclassified as a candidate and skipped
 *       rather than re-uploaded.</li>
 * </ol>
 *
 * <p>This service does <b>not</b> touch the 361 V42-canonical thumbnail rows. It
 * only migrates the 537 {@code /media/event-images/*} gallery rows whose
 * {@code storage_state='UNMANAGED'} and {@code is_thumbnail=FALSE}.
 */
@Service
@Profile("backfill-gallery-images")
public class LegacyEventGalleryMigrationService {

    private static final Logger log = LoggerFactory.getLogger(LegacyEventGalleryMigrationService.class);
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private static final int DEFAULT_MAX_RETRIES = 2;
    private static final long RETRY_BACKOFF_MILLIS = 1500L;
    private static final long CLEANUP_DELAY_MINUTES = 60L;
    private static final long MAX_IMAGE_BYTES = 10L * 1024L * 1024L;

    private final LegacyEventGalleryMigrationRepository repository;
    private final EventImageStorage imageStorage;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final Path localMediaRoot;

    @org.springframework.beans.factory.annotation.Autowired
    public LegacyEventGalleryMigrationService(
            LegacyEventGalleryMigrationRepository repository,
            EventImageStorage imageStorage,
            ObjectMapper objectMapper,
            Clock backfillClock
    ) {
        this(repository, imageStorage, objectMapper, backfillClock, defaultLocalMediaRoot());
    }

    LegacyEventGalleryMigrationService(
            LegacyEventGalleryMigrationRepository repository,
            EventImageStorage imageStorage,
            ObjectMapper objectMapper,
            Clock backfillClock,
            Path localMediaRoot
    ) {
        this.repository = repository;
        this.imageStorage = imageStorage;
        this.objectMapper = objectMapper;
        this.clock = backfillClock;
        this.localMediaRoot = localMediaRoot == null
                ? defaultLocalMediaRoot()
                : localMediaRoot.toAbsolutePath().normalize();
    }

    public Plan buildPlan(String runId) {
        if (runId == null || runId.isBlank()) {
            throw new IllegalArgumentException("runId must be set");
        }
        List<GalleryRow> inventory = repository.loadLegacyGalleryRows();
        List<EligibleRow> eligible = new ArrayList<>();
        List<String> missingFiles = new ArrayList<>();
        List<String> invalidImages = new ArrayList<>();
        List<String> unsupportedFormats = new ArrayList<>();
        List<String> alreadyManaged = new ArrayList<>();
        Map<String, String> hashToFormat = new HashMap<>();
        Map<String, List<String>> rowByPlannedPublicId = new LinkedHashMap<>();

        for (GalleryRow row : inventory) {
            Path filePath = resolveLocalFile(row.url());
            if (filePath == null) {
                missingFiles.add("mediaId=" + row.id() + " url=" + row.url());
                continue;
            }
            FileInspection inspection;
            try {
                inspection = inspectFile(filePath);
            } catch (IOException exception) {
                invalidImages.add("mediaId=" + row.id() + " error=" + exception.getMessage());
                continue;
            } catch (IllegalArgumentException illegalArgumentException) {
                unsupportedFormats.add("mediaId=" + row.id() + " reason=" + illegalArgumentException.getMessage());
                continue;
            }
            if (inspection == null) {
                invalidImages.add("mediaId=" + row.id());
                continue;
            }
            String managedAssetId = deterministicManagedAsset(runId, row.id());
            String publicId = AdminEventImageNaming.publicId(
                    row.eventId(),
                    AdminEventImageNaming.Kind.GALLERY,
                    UUID.fromString(managedAssetId));
            if (rowByPlannedPublicId.containsKey(publicId)) {
                throw new IllegalStateException("Duplicate planned public_id produced: " + publicId);
            }
            rowByPlannedPublicId.put(publicId, List.of(Long.toString(row.id())));
            hashToFormat.put(inspection.sha256, inspection.format);
            EligibleRow plan = new EligibleRow(
                    row.id(),
                    row.eventId(),
                    row.mediaType(),
                    row.url(),
                    row.url() == null ? "" : row.url().substring(row.url().lastIndexOf('/') + 1),
                    filePath,
                    row.caption(),
                    row.altText(),
                    row.sourceName(),
                    row.license(),
                    row.sortOrder(),
                    row.status(),
                    row.isThumbnail(),
                    row.storageType(),
                    row.storageState(),
                    row.storageProvider(),
                    row.storagePublicId(),
                    row.storageAssetId(),
                    row.url(),
                    managedAssetId,
                    publicId,
                    inspection.format,
                    inspection.mimeType,
                    inspection.fileSize,
                    inspection.sha256,
                    inspection.width,
                    inspection.height);
            eligible.add(plan);
            if ("object_storage".equals(row.storageType())) {
                alreadyManaged.add("mediaId=" + row.id());
            }
        }

        String digest = computePlanDigest(runId, eligible);
        List<String> bucket = buildBucket(missingFiles, invalidImages, unsupportedFormats,
                eligible, alreadyManaged);
        PlanDigest result = new PlanDigest(
                runId,
                eligible.size(),
                missingFiles.size(),
                invalidImages.size(),
                unsupportedFormats.size(),
                alreadyManaged.size(),
                hashToFormat.size(),
                digest,
                bucket);
        List<RollbackEntry> rollbackEntries = new ArrayList<>(eligible.size());
        for (EligibleRow r : eligible) {
            rollbackEntries.add(new RollbackEntry(
                    r.mediaId(),
                    r.eventId(),
                    r.oldUrl(),
                    r.oldStorageType(),
                    r.oldStorageState(),
                    r.oldStorageProvider(),
                    r.oldStoragePublicId(),
                    r.oldStorageAssetId(),
                    r.plannedManagedAssetId(),
                    r.plannedPublicId()));
        }
        RollbackSnapshot rollback = new RollbackSnapshot(runId, rollbackEntries.size(), rollbackEntries);
        Map<Long, GalleryRow> inventoryById = new HashMap<>();
        for (GalleryRow r : inventory) {
            inventoryById.put(r.id(), r);
        }
        return new Plan(result, eligible, rollback, inventoryById);
    }

    public BatchOutcome apply(Plan plan) {
        if (plan == null) {
            throw new IllegalArgumentException("plan must be set");
        }
        List<RowOutcome> outcomes = new ArrayList<>(plan.eligible().size());
        int uploadFailures = 0;
        int finalizeConflicts = 0;
        int cleanupEnqueued = 0;
        int alreadyManaged = 0;

        ExecutorService pool = newFixedThreadPool("gallery-migration", 3);
        try {
            Map<Long, CompletableFuture<RowOutcome>> futures = new java.util.LinkedHashMap<>();
            for (EligibleRow row : plan.eligible()) {
                futures.put(row.mediaId(),
                        CompletableFuture.supplyAsync(() -> applyOne(row, plan.inventoryById()), pool));
            }
            for (var entry : futures.entrySet()) {
                RowOutcome outcome = entry.getValue().join();
                outcomes.add(outcome);
                switch (outcome.result()) {
                    case ALREADY_MANAGED -> alreadyManaged++;
                    case UPLOAD_FAILED -> uploadFailures++;
                    case FINALIZE_CONFLICT -> finalizeConflicts++;
                    case CLEANUP_ENQUEUED -> cleanupEnqueued++;
                    default -> { /* handled below */ }
                }
            }
        } finally {
            pool.shutdownNow();
        }
        int affected = outcomes.stream()
                .filter(o -> o.result() == UploadResult.UPLOADED_AND_FINALIZED)
                .mapToInt(o -> 1)
                .sum();
        return new BatchOutcome(affected, alreadyManaged, uploadFailures, finalizeConflicts,
                cleanupEnqueued, outcomes);
    }

    public int writeArtifacts(Plan plan, Path outputDir) throws IOException {
        Files.createDirectories(outputDir);
        Path planJson = outputDir.resolve("upload-plan.json");
        Path rollbackJson = outputDir.resolve("rollback-snapshot.json");
        Path summaryJson = outputDir.resolve("summary.json");
        Files.writeString(planJson, objectMapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(toSerializablePlan(plan)));
        Files.writeString(rollbackJson, objectMapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(plan.rollback()));
        Files.writeString(summaryJson, objectMapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(plan.digest()));
        long planSize = Files.size(planJson);
        long rollbackSize = Files.size(rollbackJson);
        long summarySize = Files.size(summaryJson);
        return (int) Math.min(Integer.MAX_VALUE, planSize + rollbackSize + summarySize);
    }

    private RowOutcome applyOne(EligibleRow row, Map<Long, GalleryRow> inventoryById) {
        GalleryRow live = inventoryById.get(row.mediaId());
        if (live == null) {
            return new RowOutcome(row.mediaId(), row.eventId(), row.plannedManagedAssetId(),
                    UploadResult.FINALIZE_CONFLICT, null, "ROW_DISAPPEARED",
                    "Row disappeared between plan and apply");
        }
        if (!row.eventId().equals(live.eventId())
                || !row.oldUrl().equalsIgnoreCase(live.url())
                || !"UNMANAGED".equals(live.storageState())
                || !"local".equals(live.storageType())) {
            return new RowOutcome(row.mediaId(), row.eventId(), row.plannedManagedAssetId(),
                    UploadResult.FINALIZE_CONFLICT, null, "ROW_STATE_DRIFTED",
                    "Row did not match plan invariants at CAS time");
        }
        byte[] bytes;
        try {
            bytes = Files.readAllBytes(row.localFilePath());
        } catch (IOException ioException) {
            return new RowOutcome(row.mediaId(), row.eventId(), row.plannedManagedAssetId(),
                    UploadResult.UPLOAD_FAILED, null, "LOCAL_FILE_UNREADABLE",
                    ioException.getMessage());
        }
        if (bytes.length != row.plannedFileSize()) {
            return new RowOutcome(row.mediaId(), row.eventId(), row.plannedManagedAssetId(),
                    UploadResult.UPLOAD_FAILED, null, "LOCAL_FILE_SIZE_DRIFTED",
                    "Local file size drifted between plan and apply");
        }
        EventImageStorage.StoredImage stored = null;
        String lastError = null;
        for (int attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
            try {
                stored = imageStorage.upload(new EventImageStorage.UploadCommand(
                        bytes,
                        row.plannedPublicId(),
                        row.plannedMimeType(),
                        List.of("lsvn3d", "managed-event-media",
                                "event-" + row.eventId(), "role-media",
                                "release-g-gallery-migration"),
                        Map.of(
                                "managed_asset_id", row.plannedManagedAssetId(),
                                "event_id", row.eventId(),
                                "media_role", "media",
                                "source", "lsvn3d",
                                "migration", "release-g")));
                break;
            } catch (EventImageStorage.EventImageStorageException exception) {
                lastError = exception.code();
                if (!exception.retryable() || attempt == DEFAULT_MAX_RETRIES) {
                    return new RowOutcome(row.mediaId(), row.eventId(),
                            row.plannedManagedAssetId(),
                            UploadResult.UPLOAD_FAILED, null, exception.code(),
                            exception.getMessage());
                }
                try {
                    Thread.sleep(RETRY_BACKOFF_MILLIS * (1L << attempt));
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return new RowOutcome(row.mediaId(), row.eventId(),
                            row.plannedManagedAssetId(),
                            UploadResult.UPLOAD_FAILED, null, "INTERRUPTED",
                            "Upload retry interrupted");
                }
            }
        }
        if (stored == null) {
            return new RowOutcome(row.mediaId(), row.eventId(), row.plannedManagedAssetId(),
                    UploadResult.UPLOAD_FAILED, null, lastError, "Upload exhausted retries");
        }
        if (!row.plannedPublicId().equals(stored.publicId())
                || !row.plannedMimeType().equalsIgnoreCase(stored.mimeType())
                || !row.plannedFormat().equalsIgnoreCase(stored.format())
                || stored.width() != row.plannedWidth()
                || stored.height() != row.plannedHeight()) {
            enqueueCleanup(stored.publicId(), stored.providerAssetId());
            return new RowOutcome(row.mediaId(), row.eventId(), row.plannedManagedAssetId(),
                    UploadResult.FINALIZE_CONFLICT, stored.providerAssetId(),
                    "PROVIDER_RESPONSE_INVALID",
                    "Cloudinary response did not match plan invariants");
        }
        String deliveryUrl = imageStorage.deliveryUrl(new EventImageStorage.DeliveryCommand(
                stored.publicId(),
                stored.providerVersion(),
                EventImageStorage.DeliveryKind.GALLERY));
        if (!isSafeDeliveryUrl(deliveryUrl)) {
            enqueueCleanup(stored.publicId(), stored.providerAssetId());
            return new RowOutcome(row.mediaId(), row.eventId(), row.plannedManagedAssetId(),
                    UploadResult.FINALIZE_CONFLICT, stored.providerAssetId(),
                    "DELIVERY_URL_INVALID",
                    "Cloudinary delivery URL rejected by guard");
        }
        LocalDateTime uploadedAt = LocalDateTime.ofInstant(clock.instant(), DATABASE_ZONE);
        FinalizeCommand command = new FinalizeCommand(
                row.mediaId(),
                row.eventId(),
                row.plannedPublicId(),
                row.plannedManagedAssetId(),
                stored.providerAssetId(),
                stored.originalUrl(),
                stored.providerVersion(),
                stored.mimeType(),
                stored.format(),
                stored.byteSize(),
                row.plannedSha256(),
                stored.width(),
                stored.height(),
                deliveryUrl,
                uploadedAt);
        int affected = repository.finalizeRow(command);
        if (affected != 1) {
            enqueueCleanup(stored.publicId(), stored.providerAssetId());
            return new RowOutcome(row.mediaId(), row.eventId(), row.plannedManagedAssetId(),
                    UploadResult.FINALIZE_CONFLICT, stored.providerAssetId(),
                    "FINALIZE_CAS_MISS",
                    "Row state changed between CAS check and UPDATE");
        }
        return new RowOutcome(row.mediaId(), row.eventId(), row.plannedManagedAssetId(),
                UploadResult.UPLOADED_AND_FINALIZED, stored.providerAssetId(), null, null);
    }

    private void enqueueCleanup(String publicId, String providerAssetId) {
        try {
            LocalDateTime notBefore = LocalDateTime.ofInstant(
                    clock.instant().plusSeconds(CLEANUP_DELAY_MINUTES * 60L), DATABASE_ZONE);
            repository.armCleanup(publicId, providerAssetId, notBefore);
        } catch (RuntimeException exception) {
            log.warn("Cleanup enqueue failed for publicId={} assetId={} error={}",
                    publicId, providerAssetId, exception.getMessage());
        }
    }

    private static boolean isSafeDeliveryUrl(String url) {
        return url != null && url.startsWith("https://res.cloudinary.com/");
    }

    private static ExecutorService newFixedThreadPool(String prefix, int size) {
        AtomicInteger sequence = new AtomicInteger();
        ThreadFactory factory = runnable -> {
            Thread t = new Thread(runnable, prefix + "-" + sequence.incrementAndGet());
            t.setDaemon(true);
            return t;
        };
        return Executors.newFixedThreadPool(size, factory);
    }

    private static List<String> buildBucket(List<String> missing, List<String> invalid,
                                              List<String> unsupported,
                                              List<EligibleRow> eligible,
                                              List<String> alreadyManaged) {
        List<String> bucket = new ArrayList<>();
        bucket.add("MISSING_FILE=" + missing.size());
        bucket.add("INVALID_IMAGE=" + invalid.size());
        bucket.add("UNSUPPORTED_FORMAT=" + unsupported.size());
        bucket.add("ELIGIBLE=" + eligible.size());
        bucket.add("ALREADY_MANAGED_IGNORED=" + alreadyManaged.size());
        return Collections.unmodifiableList(bucket);
    }

    private static String computePlanDigest(String runId, List<EligibleRow> eligible) {
        eligible.sort((left, right) -> Long.compare(left.mediaId(), right.mediaId()));
        StringBuilder material = new StringBuilder();
        material.append("runId=").append(runId).append('|');
        for (EligibleRow r : eligible) {
            material.append(r.mediaId()).append('|')
                    .append(r.eventId()).append('|')
                    .append(r.oldUrl()).append('|')
                    .append(r.plannedManagedAssetId()).append('|')
                    .append(r.plannedPublicId()).append('|')
                    .append(r.plannedSha256()).append('|')
                    .append(r.plannedMimeType()).append('|')
                    .append(r.plannedWidth()).append('x').append(r.plannedHeight())
                    .append('\n');
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(material.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private Path resolveLocalFile(String url) {
        if (url == null) return null;
        String trimmed = url.trim().toLowerCase(Locale.ROOT);
        if (!trimmed.startsWith("/media/event-images/")) {
            return null;
        }
        String relative = trimmed.substring("/media/event-images/".length());
        if (relative.isBlank() || relative.contains("..") || relative.contains("/")
                || relative.contains("\\") || relative.contains("\0")) {
            return null;
        }
        return localMediaRoot.resolve(relative).normalize();
    }

    private FileInspection inspectFile(Path path) throws IOException {
        if (!Files.isRegularFile(path)) {
            throw new IOException("Not a regular file: " + path);
        }
        long size = Files.size(path);
        if (size <= 0 || size > MAX_IMAGE_BYTES) {
            throw new IllegalArgumentException("File size out of range: " + size);
        }
        byte[] head = new byte[24];
        try (var input = Files.newInputStream(path)) {
            int read = input.read(head);
            if (read < 12) {
                throw new IOException("File too short for magic-byte scan");
            }
        }
        String sha256;
        try (var stream = Files.newInputStream(path)) {
            sha256 = sha256Hex(stream);
        }
        String format;
        String mimeType;
        int width = 0;
        int height = 0;
        if (isPng(head)) {
            format = "png";
            mimeType = "image/png";
        } else if (isJpeg(head)) {
            format = "jpeg";
            mimeType = "image/jpeg";
        } else if (isWebp(head)) {
            format = "webp";
            mimeType = "image/webp";
        } else {
            throw new IllegalArgumentException("Unsupported image format");
        }
        if ("webp".equals(format)) {
            // The JDK's ImageIO has no WebP reader; dimensions come from the RIFF
            // chunk structure instead. Animated WebP is not eligible for migration.
            WebpImageInspector.WebpInfo info;
            try (var stream = Files.newInputStream(path)) {
                info = WebpImageInspector.parse(stream.readAllBytes());
            }
            if (info.animated()) {
                throw new IOException("Animated WebP is not supported by the gallery migration");
            }
            width = info.width();
            height = info.height();
        } else {
            try (var stream = Files.newInputStream(path)) {
                BufferedImage image = ImageIO.read(new ByteArrayInputStream(stream.readAllBytes()));
                if (image == null) {
                    throw new IOException("ImageIO cannot decode file");
                }
                width = image.getWidth();
                height = image.getHeight();
            }
        }
        return new FileInspection(sha256, format, mimeType, size, width, height);
    }

    private static boolean isPng(byte[] head) {
        return head.length >= 8
                && (head[0] & 0xff) == 0x89 && (head[1] & 0xff) == 0x50
                && (head[2] & 0xff) == 0x4E && (head[3] & 0xff) == 0x47
                && head[4] == 0x0D && head[5] == 0x0A && head[6] == 0x1A && head[7] == 0x0A;
    }

    private static boolean isJpeg(byte[] head) {
        return head.length >= 3
                && (head[0] & 0xff) == 0xFF
                && (head[1] & 0xff) == 0xD8
                && (head[2] & 0xff) == 0xFF;
    }

    private static boolean isWebp(byte[] head) {
        return head.length >= 12
                && head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F'
                && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P';
    }

    private static String sha256Hex(java.io.InputStream stream) throws IOException {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[8192];
            int read;
            while ((read = stream.read(buf)) > 0) {
                md.update(buf, 0, read);
            }
            return HexFormat.of().formatHex(md.digest());
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static String deterministicManagedAsset(String runId, long mediaId) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(runId.getBytes(StandardCharsets.UTF_8));
            md.update(Long.toString(mediaId).getBytes(StandardCharsets.UTF_8));
            byte[] digest = md.digest();
            // Force UUID v4-like shape: 8-4-4-4-12 hex chars
            String hex = HexFormat.of().formatHex(digest, 0, 16);
            StringBuilder sb = new StringBuilder(36);
            sb.append(hex.substring(0, 8)).append('-')
              .append(hex.substring(8, 12)).append('-')
              .append('4').append(hex.substring(13, 16)).append('-')
              .append('8').append(hex.substring(16, 19)).append('-')
              .append(hex.substring(20, 32));
            return sb.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static Path defaultLocalMediaRoot() {
        String override = System.getProperty("app.gallery.local-media-root",
                System.getenv().getOrDefault("GALLERY_LOCAL_MEDIA_ROOT", ""));
        if (!override.isBlank()) {
            return Paths.get(override).toAbsolutePath().normalize();
        }
        return Paths.get("frontend", "public", "media", "event-images")
                .toAbsolutePath().normalize();
    }

    private record FileInspection(String sha256, String format, String mimeType,
                                  long fileSize, int width, int height) {
    }

    public record Plan(
            PlanDigest digest,
            List<EligibleRow> eligible,
            RollbackSnapshot rollback,
            Map<Long, GalleryRow> inventoryById
    ) {
    }

    private Map<String, Object> toSerializablePlan(Plan plan) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("runId", plan.digest().runId());
        root.put("eligibleRowCount", plan.digest().eligibleRowCount());
        root.put("missingFileCount", plan.digest().missingFileCount());
        root.put("invalidImageCount", plan.digest().invalidImageCount());
        root.put("unsupportedFormatCount", plan.digest().unsupportedFormatCount());
        root.put("alreadyManagedIgnoredCount", plan.digest().alreadyManagedCount());
        root.put("planDigest", plan.digest().hashDigest());
        List<Map<String, Object>> rows = new ArrayList<>(plan.eligible().size());
        for (EligibleRow r : plan.eligible()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("mediaId", r.mediaId());
            row.put("eventId", r.eventId());
            row.put("url", r.oldUrl());
            row.put("plannedManagedAssetId", r.plannedManagedAssetId());
            row.put("plannedPublicId", r.plannedPublicId());
            row.put("plannedFormat", r.plannedFormat());
            row.put("plannedMimeType", r.plannedMimeType());
            row.put("plannedFileSize", r.plannedFileSize());
            row.put("plannedSha256", r.plannedSha256());
            row.put("plannedWidth", r.plannedWidth());
            row.put("plannedHeight", r.plannedHeight());
            row.put("localFileName", r.localFileName());
            row.put("localFilePath", r.localFilePath() == null ? null : r.localFilePath().toString());
            row.put("caption", r.caption());
            row.put("altText", r.altText());
            row.put("sourceName", r.sourceName());
            row.put("license", r.license());
            row.put("sortOrder", r.sortOrder());
            row.put("status", r.status());
            row.put("isThumbnail", r.isThumbnail());
            rows.add(row);
        }
        root.put("rows", rows);
        return root;
    }

    @SuppressWarnings("unused")
    private static Instant unused() { return Instant.EPOCH; }
}

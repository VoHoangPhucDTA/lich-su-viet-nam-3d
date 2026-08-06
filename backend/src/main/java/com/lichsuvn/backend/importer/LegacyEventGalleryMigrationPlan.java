package com.lichsuvn.backend.importer;

import java.nio.file.Path;
import java.util.List;

/**
 * Plan data classes for the local-gallery → managed Cloudinary migration
 * (Release G — Track B). One {@code EligibleRow} per
 * {@code event_media} row whose {@code url LIKE '/media/event-images/%'} and
 * whose {@code storage_state = 'UNMANAGED'} and {@code is_thumbnail = FALSE}.
 *
 * <p>Per release G authorization, this plan does NOT modify the 361 V42-canonical
 * thumbnail rows. Every row keeps its original id, event_id, media_type,
 * caption, alt_text, source_name, license, sort_order, status, is_thumbnail,
 * created_at; only the storage_* columns are updated in-place.
 */
public final class LegacyEventGalleryMigrationPlan {

    private LegacyEventGalleryMigrationPlan() {
    }

    /**
     * One {@code event_media} row that survives the inventory filter for migration.
     * The runner renews {@code managedAssetId} for each row at plan time so the
     * dry-run artifact is deterministic.
     */
    public record EligibleRow(
            long mediaId,
            String eventId,
            String mediaType,
            String localUrl,
            String localFileName,
            Path localFilePath,
            String caption,
            String altText,
            String sourceName,
            String license,
            int sortOrder,
            String status,
            boolean isThumbnail,
            String oldStorageType,
            String oldStorageState,
            String oldStorageProvider,
            String oldStoragePublicId,
            String oldStorageAssetId,
            String oldUrl,
            String plannedManagedAssetId,
            String plannedPublicId,
            String plannedFormat,
            String plannedMimeType,
            long plannedFileSize,
            String plannedSha256,
            int plannedWidth,
            int plannedHeight
    ) {
    }

    /**
     * Per-row outcome of the apply phase. The runner emits one entry per planned row.
     */
    public enum UploadResult {
        UPLOADED_AND_FINALIZED,
        ALREADY_MANAGED,
        UPLOAD_FAILED,
        FINALIZE_CONFLICT,
        CLEANUP_ENQUEUED
    }

    public record RowOutcome(
            long mediaId,
            String eventId,
            String managedAssetId,
            UploadResult result,
            String providerAssetId,
            String errorCode,
            String errorMessage
    ) {
    }

    public record BatchOutcome(
            int affectedRows,
            int alreadyManagedRows,
            int uploadFailures,
            int finalizeConflicts,
            int cleanupEnqueued,
            List<RowOutcome> rowOutcomes
    ) {
    }

    /**
     * Immutable plan digest produced by the dry-run. {@code hashDigest} is a SHA-256
     * over a canonical serialization of {@code eligibleRows} + plan invariants.
     */
    public record PlanDigest(
            String runId,
            int eligibleRowCount,
            int missingFileCount,
            int invalidImageCount,
            int unsupportedFormatCount,
            int alreadyManagedCount,
            int distinctFileHashes,
            String hashDigest,
            List<String> bucket
    ) {
    }

    /**
     * Rollback snapshot — one entry per planned row, capturing every old storage
     * column needed to restore the local state. The runner writes
     * {@code rollback-snapshot.json} inside the dry-run output directory.
     */
    public record RollbackEntry(
            long mediaId,
            String eventId,
            String oldUrl,
            String oldStorageType,
            String oldStorageState,
            String oldStorageProvider,
            String oldStoragePublicId,
            String oldStorageAssetId,
            String plannedManagedAssetId,
            String plannedPublicId
    ) {
    }

    public record RollbackSnapshot(
            String runId,
            int entryCount,
            List<RollbackEntry> entries
    ) {
    }
}

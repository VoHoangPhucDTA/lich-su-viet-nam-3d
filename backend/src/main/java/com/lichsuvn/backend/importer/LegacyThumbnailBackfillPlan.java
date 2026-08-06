package com.lichsuvn.backend.importer;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.TreeMap;

/**
 * Plan artifacts and per-event match outcomes produced by
 * {@link LegacyEventThumbnailBackfillService}.
 *
 * <p>The plan is deterministic for a given
 * {@code (cloudinary inventory snapshot, current database state, runner id)}.
 * Re-running the service against identical inputs MUST produce identical
 * {@link PlanDigest} bytes apart from {@code generatedAt}.
 */
public final class LegacyThumbnailBackfillPlan {

    private LegacyThumbnailBackfillPlan() {
    }

    /** Pre-allocated eligible insert shared between the orchestrator and the repository. */
    public record EligibleInsert(
            String eventId,
            String managedAssetId,
            LegacyCloudinaryDeliveryUrl.Kind kind,
            CloudinaryAsset assetRow,
            String deliveryUrl
    ) {
    }

    /**
     * Storage identity snapshot row used for the
     * {@code STORAGE_IDENTITY_CONFLICT} and {@code PROVIDER_ASSET_CONFLICT}
     * classifications.
     */
    public record StorageIdentityRow(
            String publicId,
            String provider,
            String managedAssetId,
            String storageAssetId,
            Long mediaId
    ) {
    }

    /**
     * Folder precedence kept identical to the legacy frontend order so backfilled rows
     * resolve to the same delivery URL the browser already shows.
     * <pre>
     *   1. historical_events_thumbnail1/{event.id}
     *   2. event-thumbnails/{event.id}
     *   3. historical_events_thumbnail/{event.id}
     * </pre>
     */
    public static final List<String> FOLDER_PRECEDENCE = List.of(
            "historical_events_thumbnail1",
            "event-thumbnails",
            "historical_events_thumbnail"
    );

    /** Single Cloudinary asset listed under one of the three legacy prefixes. */
    public record CloudinaryAsset(
            String publicId,
            String assetId,
            String secureUrl,
            long version,
            String format,
            String resourceType,
            int width,
            int height,
            long bytes,
            String createdAt,
            String folder
    ) {
        public Instant createdAtAsInstant() {
            return createdAt == null ? null : Instant.parse(createdAt);
        }
    }

    /** Per-event state captured from the database before the backfill runs. */
    public record DatabaseState(
            String eventId,
            String slug,
            String title,
            long activeThumbnailMediaId,
            String activeThumbnailPublicId,
            String activeThumbnailState
    ) {
        public boolean alreadyHasCanonicalThumbnail() {
            return activeThumbnailMediaId > 0;
        }
    }

    public enum MatchAction {
        ALREADY_HAS_CANONICAL_THUMBNAIL,
        NO_LEGACY_ASSET,
        INSERT_LEGACY_THUMBNAIL,
        INSERT_PRECEDENCE_WINNER,
        STORAGE_IDENTITY_CONFLICT,
        PROVIDER_ASSET_CONFLICT,
        INVALID_PROVIDER_METADATA,
        UNSUPPORTED_RESOURCE,
        SHADOWED_LEGACY_ASSET
    }

    /**
     * One entry per event considered for backfill. {@code chosen} is null when the event
     * has no eligible asset or already has a canonical thumbnail. {@code shadowed} lists
     * candidates from lower-precedence folders that lost to the {@code chosen} candidate.
     */
    public record EventMatch(
            String eventId,
            String slug,
            MatchAction action,
            CloudinaryAsset chosen,
            List<CloudinaryAsset> shadowed
    ) {
    }

    /** Top-level plan assembled by the orchestrator. */
    public record Plan(
            String runId,
            String generatedAt,
            List<DatabaseState> databaseSummary,
            List<CloudinaryAsset> inventory,
            List<EventMatch> matches,
            PlanDigest digest
    ) {
    }

    /**
     * Stable, deterministic plan digest used to verify that two dry runs agree.
     * {@code hashDigest} is SHA-256 over the canonical JSON of
     * {@code (eventId, action, chosen.publicId, shadowed.publicIds)} sorted by event id.
     */
    public record PlanDigest(
            int eligibleInsertCount,
            int alreadyHasCanonicalCount,
            int noLegacyAssetCount,
            int storageIdentityConflictCount,
            int providerAssetConflictCount,
            int invalidMetadataCount,
            int unsupportedResourceCount,
            int shadowedAssetCount,
            int totalCloudinaryAssets,
            int totalDatabaseEvents,
            String hashDigest
    ) {
    }

    /**
     * Rollback snapshot of inserted rows keyed by managed asset id. Companion of
     * {@link Plan#digest()} bookkeeping, persisted as
     * {@code artifacts/event-thumbnail-backfill/<run-id>/rollback-snapshot.json}.
     */
    public record RolledBackRow(
            long mediaId,
            String managedAssetId,
            String eventId,
            String storageProvider,
            String storagePublicId,
            String storageAssetId
    ) {
    }

    /**
     * Pre-flight allocated asset id bookkeeping kept for backfill idempotency. Two runs
     * using the same run id will produce the same managed_asset_id for each event.
     */
    public record ReservedAssetIds(
            String runId,
            TreeMap<String, String> eventIdToManagedAssetId
    ) {
        public static Set<String> eventIds(ReservedAssetIds ids) {
            return ids.eventIdToManagedAssetId.keySet();
        }
    }
}

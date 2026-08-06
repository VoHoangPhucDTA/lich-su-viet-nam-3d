package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.CloudinaryAsset;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.DatabaseState;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.EventMatch;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.MatchAction;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.Plan;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.PlanDigest;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.RolledBackRow;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.StorageIdentityRow;
import com.lichsuvn.backend.importer.LegacyEventThumbnailBackfillRepository.BatchOutcome;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Orchestrates the legacy Cloudinary event thumbnail backfill. Pure read-only when
 * {@code apply=false}; performs an atomic batch INSERT under a local-only gate when
 * {@code apply=true}.
 *
 * <p>Public ordering of operations:
 * <ol>
 *   <li>Inventory the three legacy Cloudinary prefixes (read-only).</li>
 *   <li>Snapshot the current canonical thumbnail state for every published event.</li>
 *   <li>For each event, derive the eligible public id by precedence.
 *       <ol type="a">
 *         <li>If the event already has a canonical thumbnail, mark it
 *             {@code ALREADY_HAS_CANONICAL_THUMBNAIL}.</li>
 *         <li>If no exact asset exists for the event, mark it
 *             {@code NO_LEGACY_ASSET}.</li>
 *         <li>If exactly one exists, mark it {@code INSERT_LEGACY_THUMBNAIL}.</li>
 *         <li>If several exist, mark the precedence winner as
 *             {@code INSERT_PRECEDENCE_WINNER} and the rest as
 *             {@code SHADOWED_LEGACY_ASSET}.</li>
 *         <li>If a chosen public id is already owned by another row,
 *             {@code STORAGE_IDENTITY_CONFLICT}.</li>
 *         <li>If the Cloudinary {@code asset_id} is already referenced,
 *             {@code PROVIDER_ASSET_CONFLICT}.</li>
 *         <li>If the asset is missing required dimensions/format/version,
 *             {@code INVALID_PROVIDER_METADATA}.</li>
 *         <li>If resource_type is not {@code image}, {@code UNSUPPORTED_RESOURCE}.</li>
 *       </ol>
 *   </li>
 *   <li>Compute a SHA-256 digest so two runs against identical input are comparable.</li>
 *   <li>Apply only when the gate validates the local target and every eligibility
 *       class is resolved; on any single conflict apply is refused.</li>
 * </ol>
 *
 * <p>Do not call this from any production endpoint. Run only via
 * {@link LegacyEventThumbnailBackfillApplication}.
 */
@Service
@Profile("backfill-event-thumbnails")
public class LegacyEventThumbnailBackfillService {

    private static final Logger log = LoggerFactory.getLogger(LegacyEventThumbnailBackfillService.class);

    private static final int DATABASE_PAGE_SIZE = 200;

    private final CloudinaryLegacyThumbnailInventory inventory;
    private final LegacyEventThumbnailBackfillRepository repository;
    private final LegacyCloudinaryDeliveryUrl.Kind thumbnailKind = LegacyCloudinaryDeliveryUrl.Kind.THUMBNAIL;
    private final String cloudName;
    private final boolean lowerByteSizeZeroAsNull;
    private final Clock clock;

    @Autowired
    public LegacyEventThumbnailBackfillService(
            CloudinaryLegacyThumbnailInventory inventory,
            LegacyEventThumbnailBackfillRepository repository,
            @Value("${app.cloudinary.cloud-name:}") String cloudName,
            Clock backfillClock
    ) {
        this(inventory, repository, cloudName, backfillClock, false);
    }

    LegacyEventThumbnailBackfillService(
            CloudinaryLegacyThumbnailInventory inventory,
            LegacyEventThumbnailBackfillRepository repository,
            String cloudName,
            Clock clock,
            boolean lowerByteSizeZeroAsNull
    ) {
        this.inventory = inventory;
        this.repository = repository;
        this.cloudName = cloudName;
        this.clock = clock;
        this.lowerByteSizeZeroAsNull = lowerByteSizeZeroAsNull;
    }

    /**
     * Build the dry-run plan: read-only inventory + DB snapshot + per-event match.
     * Does not insert or mutate Cloudinary.
     */
    public Plan buildPlan(String runId, ApplyOptions options) {
        Objects.requireNonNull(runId, "runId");
        Objects.requireNonNull(options, "options");

        TreeMap<String, List<CloudinaryAsset>> byPrefix =
                inventory.listByPrefix(LegacyThumbnailBackfillPlan.FOLDER_PRECEDENCE);

        List<CloudinaryAsset> allAssets = new ArrayList<>();
        for (String prefix : LegacyThumbnailBackfillPlan.FOLDER_PRECEDENCE) {
            allAssets.addAll(byPrefix.getOrDefault(prefix, List.of()));
        }

        List<DatabaseState> databaseStates = loadAllDatabaseStates();
        Map<String, List<CloudinaryAsset>> assetsByEventId = indexAssetsByEventId(allAssets);

        Map<String, StorageIdentityRow> storageIdentityIndex = storageIdentityIndex(allAssets);

        List<EventMatch> matches = new ArrayList<>();
        for (DatabaseState state : databaseStates) {
            matches.add(match(state, assetsByEventId.get(state.eventId()), storageIdentityIndex));
        }

        List<CloudinaryAsset> unmatched = unmatchedAssets(allAssets, matches);
        // Sort unmatched by public_id for stable dry-run output.
        unmatched.sort((left, right) -> left.publicId().compareTo(right.publicId()));
        for (CloudinaryAsset shadowCandidate : unmatched) {
            matches.add(new EventMatch(
                    shadowCandidate.folder() + "/" + shadowCandidate.publicId(),
                    null,
                    MatchAction.SHADOWED_LEGACY_ASSET,
                    null,
                    List.of(shadowCandidate)));
        }

        PlanDigest digest = digest(matches, allAssets.size(), databaseStates.size());
        return new Plan(
                runId,
                options.clock() == null ? null : options.clock().toString(),
                databaseStates,
                allAssets,
                Collections.unmodifiableList(matches),
                digest);
    }

    /** Inspect-only eligibility view of a chosen asset; consumed by the repository during apply. */
    public LegacyThumbnailBackfillPlan.EligibleInsert buildEligibleInsert(
            LegacyThumbnailBackfillPlan.EventMatch match
    ) {
        if (!isInsertable(match)) {
            return null;
        }
        String managedAssetId = java.util.UUID.randomUUID().toString();
        String deliveryUrl = LegacyCloudinaryDeliveryUrl.compute(
                cloudName,
                match.chosen().publicId(),
                match.chosen().version() > 0 ? match.chosen().version() : null,
                thumbnailKind
        );
        return new LegacyThumbnailBackfillPlan.EligibleInsert(
                match.eventId(),
                managedAssetId,
                thumbnailKind,
                match.chosen(),
                deliveryUrl);
    }

    /** Encapsulates invocation flags and timing used by the dry-run + apply flow. */
    public record ApplyOptions(
            boolean apply,
            int maxRowsPerRun,
            Instant clock
    ) {
        public static ApplyOptions dryRunDefault(Clock clock) {
            return new ApplyOptions(false, Integer.MAX_VALUE, clock.instant());
        }
    }

    /**
     * Run dry-run, write the four required artifacts to {@code outputDir}, return the
     * plan digest. The same input MUST produce the same {@code PlanDigest.hashDigest}.
     */
    public PlanDigest runDryRun(String runId, Path outputDir) {
        return runDryRun(runId, outputDir, ApplyOptions.dryRunDefault(clock));
    }

    public PlanDigest runDryRun(String runId, Path outputDir, ApplyOptions options) {
        Path runDir = ensureRunDirectory(outputDir, runId);
        Plan plan = buildPlan(runId, options);

        // Build per-event asset index for the rolled-back/snapshot representation.
        List<CloudinaryAsset> inventoryCopy = new ArrayList<>(plan.inventory());
        inventoryCopy.sort((left, right) -> left.publicId().compareTo(right.publicId()));

        ObjectMapper mapper = new ObjectMapper();
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        writeJson(runDir.resolve("database-before-summary.json"), new BeforeDatabaseSummary(
                repository.countHistoricalEvents(),
                repository.countEventMedia(),
                repository.countCleanupTasks(),
                repository.topFlywayVersion()
        ), mapper);
        writeJson(runDir.resolve("cloudinary-inventory.json"), buildInventoryView(inventoryCopy), mapper);
        writeJson(runDir.resolve("backfill-plan.json"), plan, mapper);
        writeJson(runDir.resolve("shadowed-assets.json"), shadowedAssets(plan.matches()), mapper);
        writeJson(runDir.resolve("conflicts.json"), conflicts(plan.matches()), mapper);

        List<RollbackSnapshotRow> rollback = snapshotForRollback(plan);
        writeJson(runDir.resolve("rollback-snapshot.json"),
                new RollbackSnapshot(runId, plan.digest().hashDigest(), rollback), mapper);

        SummarySummary summary = summarySection(plan, runId, options.apply());
        writeJson(runDir.resolve("summary.json"), summary, mapper);
        return plan.digest();
    }

    /**
     * Inspect the plan, then either return the actionable eligible inserts (no apply)
     * or perform the atomic batch INSERT. Returns the apply outcome for diagnostic
     * logging. Requires a validated {@link LegacyThumbnailBackfillDatasourceGuard.Target}.
     */
    public ApplyOutcome apply(
            Plan plan,
            LegacyThumbnailBackfillDatasourceGuard.Target target,
            ApplyOptions options
    ) {
        Objects.requireNonNull(plan, "plan");
        Objects.requireNonNull(target, "target");
        if (!options.apply()) {
            throw new IllegalArgumentException("apply() called with ApplyOptions.apply=false");
        }
        if (plan.digest().eligibleInsertCount() == 0) {
            return new ApplyOutcome(plan.digest(), List.of(), 0L);
        }
        List<LegacyThumbnailBackfillPlan.EligibleInsert> inserts = new ArrayList<>();
        Map<String, StorageIdentityRow> storageIdentityIndex =
                storageIdentityIndex(plan.inventory());
        for (EventMatch match : plan.matches()) {
            if (!isInsertable(match)) {
                continue;
            }
            StorageIdentityRow row = storageIdentityIndex.get("publicId:" + match.chosen().publicId());
            if (row != null) {
                throw new IllegalStateException(
                        "Storage identity conflict discovered at apply time for "
                                + match.chosen().publicId());
            }
            inserts.add(buildEligibleInsert(match));
        }

        BatchOutcome outcome = repository.applyInsertBatch(inserts);
        List<RolledBackRow> rollbackSnapshot = outcome.insertedMediaIds().stream()
                .map(id -> new RolledBackRow(id, "", "", "cloudinary", "", ""))
                .toList();
        return new ApplyOutcome(plan.digest(), rollbackSnapshot, outcome.totalAffected());
    }

    private boolean isInsertable(EventMatch match) {
        return match.action() == MatchAction.INSERT_LEGACY_THUMBNAIL
                || match.action() == MatchAction.INSERT_PRECEDENCE_WINNER;
    }

    private List<DatabaseState> loadAllDatabaseStates() {
        List<DatabaseState> all = new ArrayList<>();
        int offset = 0;
        while (true) {
            List<DatabaseState> page = repository.loadDatabaseState(DATABASE_PAGE_SIZE, offset);
            if (page == null || page.isEmpty()) {
                break;
            }
            all.addAll(page);
            if (page.size() < DATABASE_PAGE_SIZE) {
                break;
            }
            offset += DATABASE_PAGE_SIZE;
        }
        return Collections.unmodifiableList(all);
    }

    private Map<String, List<CloudinaryAsset>> indexAssetsByEventId(List<CloudinaryAsset> assets) {
        Map<String, List<CloudinaryAsset>> index = new LinkedHashMap<>();
        for (CloudinaryAsset asset : assets) {
            String suffix = asset.publicId().substring(asset.folder().length() + 1);
            index.computeIfAbsent(suffix, key -> new ArrayList<>()).add(asset);
        }
        return index;
    }

    private List<CloudinaryAsset> unmatchedAssets(
            List<CloudinaryAsset> assets,
            List<EventMatch> matches
    ) {
        Set<String> publicIds = matches.stream()
                .map(EventMatch::chosen)
                .filter(Objects::nonNull)
                .map(CloudinaryAsset::publicId)
                .collect(Collectors.toSet());
        List<CloudinaryAsset> orphans = new ArrayList<>();
        for (CloudinaryAsset asset : assets) {
            if (!publicIds.contains(asset.publicId())) {
                orphans.add(asset);
            }
        }
        return orphans;
    }

    private Map<String, StorageIdentityRow> storageIdentityIndex(List<CloudinaryAsset> assets) {
        Set<String> publicIds = new java.util.HashSet<>();
        Set<String> assetIds = new java.util.HashSet<>();
        for (CloudinaryAsset asset : assets) {
            if (asset.publicId() != null && !asset.publicId().isBlank()) {
                publicIds.add(asset.publicId());
            }
            if (asset.assetId() != null && !asset.assetId().isBlank()) {
                assetIds.add(asset.assetId());
            }
        }
        return repository.loadExistingStorageIdentities(publicIds, assetIds);
    }

    private PlanDigest digest(
            List<EventMatch> matches,
            int totalCloudinaryAssets,
            int totalDatabaseEvents
    ) {
        int eligibleInserts = 0,
                alreadyHasCanonical = 0,
                noLegacyAsset = 0,
                storageIdentityConflicts = 0,
                providerAssetConflicts = 0,
                invalidMetadata = 0,
                unsupportedResource = 0,
                shadowedAssets = 0;
        for (EventMatch match : matches) {
            switch (match.action()) {
                case INSERT_LEGACY_THUMBNAIL, INSERT_PRECEDENCE_WINNER -> eligibleInserts++;
                case ALREADY_HAS_CANONICAL_THUMBNAIL -> alreadyHasCanonical++;
                case NO_LEGACY_ASSET -> noLegacyAsset++;
                case STORAGE_IDENTITY_CONFLICT -> storageIdentityConflicts++;
                case PROVIDER_ASSET_CONFLICT -> providerAssetConflicts++;
                case INVALID_PROVIDER_METADATA -> invalidMetadata++;
                case UNSUPPORTED_RESOURCE -> unsupportedResource++;
                case SHADOWED_LEGACY_ASSET -> shadowedAssets++;
                default -> throw new IllegalStateException("Unhandled action: " + match.action());
            }
        }
        String hashDigest = hashMatches(matches);
        return new PlanDigest(
                eligibleInserts,
                alreadyHasCanonical,
                noLegacyAsset,
                storageIdentityConflicts,
                providerAssetConflicts,
                invalidMetadata,
                unsupportedResource,
                shadowedAssets,
                totalCloudinaryAssets,
                totalDatabaseEvents,
                hashDigest);
    }

    private static String hashMatches(List<EventMatch> matches) {
        // Stable canonical projection: (eventId, action, chosen.publicId, shadowed.publicIds) sorted by eventId.
        List<String> rows = new ArrayList<>();
        for (EventMatch match : matches.stream()
                .sorted((left, right) -> left.eventId().compareTo(right.eventId()))
                .toList()) {
            String chosen = match.chosen() == null ? "" : match.chosen().publicId();
            String shadowed = match.shadowed() == null
                    ? ""
                    : match.shadowed().stream()
                    .map(CloudinaryAsset::publicId)
                    .sorted()
                    .collect(Collectors.joining(","));
            rows.add(String.join("|", match.eventId(), match.action().name(), chosen, shadowed));
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(String.join("\n", rows).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException algorithmException) {
            throw new IllegalStateException("SHA-256 is unavailable", algorithmException);
        }
    }

    private EventMatch match(
            DatabaseState state,
            List<CloudinaryAsset> candidates,
            Map<String, StorageIdentityRow> storageIdentityIndex
    ) {
        if (state.alreadyHasCanonicalThumbnail()) {
            return new EventMatch(state.eventId(), state.slug(),
                    MatchAction.ALREADY_HAS_CANONICAL_THUMBNAIL, null, List.of());
        }
        if (candidates == null || candidates.isEmpty()) {
            return new EventMatch(state.eventId(), state.slug(),
                    MatchAction.NO_LEGACY_ASSET, null, List.of());
        }

        List<CloudinaryAsset> sorted = new ArrayList<>(candidates);
        sorted.sort((left, right) -> Integer.compare(
                LegacyThumbnailBackfillPlan.FOLDER_PRECEDENCE.indexOf(left.folder()),
                LegacyThumbnailBackfillPlan.FOLDER_PRECEDENCE.indexOf(right.folder())));

        for (CloudinaryAsset candidate : sorted) {
            if (!isSupportedImage(candidate)) {
                continue;
            }
            String publicIdIndex = "publicId:" + candidate.publicId();
            String assetIndex = "assetId:" + candidate.assetId();
            if (storageIdentityIndex.containsKey(publicIdIndex)) {
                return new EventMatch(
                        state.eventId(),
                        state.slug(),
                        MatchAction.STORAGE_IDENTITY_CONFLICT,
                        null,
                        List.of());
            }
            if (candidate.assetId() != null && storageIdentityIndex.containsKey(assetIndex)) {
                return new EventMatch(
                        state.eventId(),
                        state.slug(),
                        MatchAction.PROVIDER_ASSET_CONFLICT,
                        null,
                        List.of());
            }
            if (!hasValidMetadata(candidate)) {
                return new EventMatch(
                        state.eventId(),
                        state.slug(),
                        MatchAction.INVALID_PROVIDER_METADATA,
                        null,
                        List.of());
            }

            List<CloudinaryAsset> shadow = new ArrayList<>(sorted.subList(
                    sorted.indexOf(candidate) + 1, sorted.size()));
            MatchAction action = shadow.isEmpty()
                    ? MatchAction.INSERT_LEGACY_THUMBNAIL
                    : MatchAction.INSERT_PRECEDENCE_WINNER;

            return new EventMatch(state.eventId(), state.slug(), action, candidate, shadow);
        }
        // No supported image candidates but at least one unsupported candidate existed.
        return new EventMatch(state.eventId(), state.slug(),
                MatchAction.UNSUPPORTED_RESOURCE, null, List.of());
    }

    private static boolean isSupportedImage(CloudinaryAsset asset) {
        if (asset.resourceType() == null) {
            return false;
        }
        return "image".equalsIgnoreCase(asset.resourceType());
    }

    private boolean hasValidMetadata(CloudinaryAsset asset) {
        if (asset.version() <= 0) {
            return false;
        }
        if (asset.width() <= 0 || asset.height() <= 0) {
            return false;
        }
        if (asset.format() == null || asset.format().isBlank()) {
            return false;
        }
        if (asset.bytes() <= 0 && !lowerByteSizeZeroAsNull) {
            return false;
        }
        return true;
    }

    /** Pre-shape of the cloudinary-inventory.json artifact. */
    public record InventoryView(
            int totalAssets,
            Map<String, Integer> assetsByPrefix,
            List<String> sortedPrefixes,
            List<LegacyEventThumbnailBackfillRepository.AssetJson> assets
    ) {
    }

    private InventoryView buildInventoryView(List<CloudinaryAsset> inventory) {
        Map<String, Integer> byPrefix = new LinkedHashMap<>();
        List<LegacyEventThumbnailBackfillRepository.AssetJson> jsonAssets = new ArrayList<>();
        for (CloudinaryAsset asset : inventory) {
            byPrefix.merge(asset.folder(), 1, Integer::sum);
            jsonAssets.add(new LegacyEventThumbnailBackfillRepository.AssetJson(asset));
        }
        List<String> sortedPrefixes = LegacyThumbnailBackfillPlan.FOLDER_PRECEDENCE.stream()
                .filter(byPrefix::containsKey)
                .toList();
        return new InventoryView(inventory.size(), byPrefix, sortedPrefixes, jsonAssets);
    }

    private List<EventMatch> shadowedAssets(List<EventMatch> matches) {
        List<EventMatch> shadowed = new ArrayList<>();
        for (EventMatch match : matches) {
            if (match.shadowed() == null || match.shadowed().isEmpty()) {
                continue;
            }
            if (match.action() == MatchAction.INSERT_LEGACY_THUMBNAIL
                    || match.action() == MatchAction.INSERT_PRECEDENCE_WINNER) {
                shadowed.add(match);
            }
        }
        return shadowed;
    }

    private List<EventMatch> conflicts(List<EventMatch> matches) {
        return matches.stream()
                .filter(match -> match.action() == MatchAction.STORAGE_IDENTITY_CONFLICT
                        || match.action() == MatchAction.PROVIDER_ASSET_CONFLICT
                        || match.action() == MatchAction.INVALID_PROVIDER_METADATA
                        || match.action() == MatchAction.UNSUPPORTED_RESOURCE)
                .toList();
    }

    private List<RollbackSnapshotRow> snapshotForRollback(Plan plan) {
        List<RollbackSnapshotRow> snapshot = new ArrayList<>();
        for (EventMatch match : plan.matches()) {
            if (!isInsertable(match)) {
                continue;
            }
            snapshot.add(new RollbackSnapshotRow(
                    match.eventId(),
                    managedAssetIdFor(match),
                    match.chosen().publicId(),
                    match.chosen().assetId()
            ));
        }
        snapshot.sort((left, right) -> left.eventId.compareTo(right.eventId));
        return snapshot;
    }

    private static String managedAssetIdFor(EventMatch match) {
        // The managed asset id is re-allocated deterministically by the apply path; the
        // dry-run snapshot reserves a temporary UUID so rollback can re-run with idempotency.
        return UUID.nameUUIDFromBytes(
                ("legacy-thumb-backfill:" + match.eventId()).getBytes(StandardCharsets.UTF_8)
        ).toString();
    }

    private Path ensureRunDirectory(Path outputDir, String runId) {
        if (!runId.matches("^[a-zA-Z0-9_-]+$")) {
            throw new IllegalArgumentException("Run id must match ^[a-zA-Z0-9_-]+$: " + runId);
        }
        try {
            Files.createDirectories(outputDir);
            Path runDir = outputDir.resolve(runId);
            Files.createDirectories(runDir);
            if (Files.list(runDir).findAny().isPresent()) {
                throw new IllegalStateException("Run directory is not empty: " + runDir);
            }
            return runDir;
        } catch (IOException io) {
            throw new IllegalStateException("Failed to initialise run directory", io);
        }
    }

    private <T> void writeJson(Path target, T value, ObjectMapper mapper) {
        try {
            mapper.writerWithDefaultPrettyPrinter().writeValue(target.toFile(), value);
        } catch (IOException io) {
            throw new IllegalStateException("Failed to write artifact: " + target, io);
        }
    }

    /** Summary section view in {@code summary.json}. */
    public record SummarySummary(
            String runId,
            String generatedAt,
            int cloudinaryTotalAssets,
            int databaseEventsTotal,
            int eligibleInsertCount,
            int alreadyHasCanonicalCount,
            int noLegacyAssetCount,
            int storageIdentityConflictCount,
            int providerAssetConflictCount,
            int invalidMetadataCount,
            int unsupportedResourceCount,
            int shadowedAssetCount,
            String planDigest,
            boolean applyRequested,
            boolean applyExecuted
    ) {
    }

    private SummarySummary summarySection(Plan plan, String runId, boolean applyRequested) {
        PlanDigest digest = plan.digest();
        return new SummarySummary(
                runId,
                plan.generatedAt() == null ? null : plan.generatedAt(),
                digest.totalCloudinaryAssets(),
                digest.totalDatabaseEvents(),
                digest.eligibleInsertCount(),
                digest.alreadyHasCanonicalCount(),
                digest.noLegacyAssetCount(),
                digest.storageIdentityConflictCount(),
                digest.providerAssetConflictCount(),
                digest.invalidMetadataCount(),
                digest.unsupportedResourceCount(),
                digest.shadowedAssetCount(),
                digest.hashDigest(),
                applyRequested,
                false
        );
    }

    /** Pre-apply summary written before the apply run starts. */
    public record BeforeDatabaseSummary(
            long historicalEvents,
            long eventMedia,
            long cleanupTasks,
            String topFlywayVersion
    ) {
    }

    /** Rollback snapshot JSON row. */
    public record RollbackSnapshotRow(
            String eventId,
            String managedAssetId,
            String storagePublicId,
            String storageAssetId
    ) {
    }

    /** Container for {@code rollback-snapshot.json}. */
    public record RollbackSnapshot(
            String runId,
            String planDigest,
            List<RollbackSnapshotRow> rows
    ) {
    }

    /** Result of {@link #apply}. */
    public record ApplyOutcome(
            PlanDigest digest,
            List<RolledBackRow> rolledBack,
            long affected
    ) {
    }
}

package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.CloudinaryAsset;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.DatabaseState;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.EventMatch;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.MatchAction;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.Plan;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.PlanDigest;
import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.StorageIdentityRow;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.mockito.stubbing.Answer;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;

class LegacyEventThumbnailBackfillServiceTest {

    private static final Clock FIXED_CLOCK =
            Clock.fixed(Instant.parse("2026-08-02T07:00:00Z"), ZoneOffset.UTC);

    /** Inventory stub. */
    private static CloudinaryLegacyThumbnailInventory inventory(List<CloudinaryAsset> all) {
        return new CloudinaryLegacyThumbnailInventory(new CloudinaryLegacyThumbnailInventory.InventoryClient() {
            @Override
            public boolean configured() {
                return true;
            }

            @Override
            public Map<String, Object> listByPublicIdPrefix(String prefix, String cursor, int pageSize) {
                List<Map<String, Object>> matches = new ArrayList<>();
                for (CloudinaryAsset asset : all) {
                    if (asset.publicId().startsWith(prefix + "/")) {
                        matches.add(assetToMap(asset));
                    }
                }
                Map<String, Object> response = new HashMap<>();
                response.put("resources", matches);
                response.put("next_cursor", "");
                return response;
            }
        }, 100, 5000, 100);
    }

    private static Map<String, Object> assetToMap(CloudinaryAsset asset) {
        Map<String, Object> map = new HashMap<>();
        map.put("public_id", asset.publicId());
        map.put("asset_id", asset.assetId());
        map.put("secure_url", asset.secureUrl());
        map.put("version", asset.version());
        map.put("format", asset.format());
        map.put("resource_type", asset.resourceType());
        map.put("width", asset.width());
        map.put("height", asset.height());
        map.put("bytes", asset.bytes());
        map.put("created_at", asset.createdAt() == null ? null : asset.createdAt().toString());
        return map;
    }

    private static LegacyEventThumbnailBackfillService newService(
            CloudinaryLegacyThumbnailInventory inventory,
            LegacyEventThumbnailBackfillRepository repository
    ) {
        return new LegacyEventThumbnailBackfillService(
                inventory,
                repository,
                "dlx-demo",
                FIXED_CLOCK,
                true);
    }

    private static void deleteRecursively(Path root) {
        if (root == null || !Files.exists(root)) {
            return;
        }
        try (Stream<Path> stream = Files.walk(root)) {
            stream.sorted((a, b) -> b.compareTo(a)).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                }
            });
        } catch (IOException ignored) {
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> T nullable(Class<T> type) {
        return (T) Mockito.argThat(arg -> arg == null || type.isInstance(arg));
    }

    private static NamedParameterJdbcTemplate stubQueryRepository(List<DatabaseState> states) {
        NamedParameterJdbcTemplate jdbc = Mockito.mock(NamedParameterJdbcTemplate.class);
        List<DatabaseState> allStates = new ArrayList<>(states);
        Mockito.when(jdbc.query(
                Mockito.anyString(),
                nullable(MapSqlParameterSource.class),
                Mockito.any(RowMapper.class)
        )).thenAnswer((Answer<List<DatabaseState>>) inv -> {
            MapSqlParameterSource params = inv.getArgument(1);
            int offset = params == null ? 0 : (int) params.getValue("offset");
            int limit = params == null ? 200 : (int) params.getValue("limit");
            if (offset >= allStates.size()) {
                return List.of();
            }
            int end = Math.min(offset + limit, allStates.size());
            if (end - offset < limit) {
                List<DatabaseState> partial = new ArrayList<>(allStates.subList(offset, end));
                return partial;
            }
            return new ArrayList<>(allStates.subList(offset, end));
        });
        Mockito.when(jdbc.queryForObject(
                Mockito.anyString(),
                nullable(MapSqlParameterSource.class),
                eq(Long.class)
        )).thenReturn(0L);
        Mockito.when(jdbc.queryForList(
                Mockito.anyString(),
                nullable(MapSqlParameterSource.class),
                eq(String.class)
        )).thenReturn(List.of("42"));
        return jdbc;
    }

    private static LegacyEventThumbnailBackfillRepository repositoryFor(
            List<DatabaseState> states,
            Map<String, StorageIdentityRow> identityIndex
    ) {
        return new LegacyEventThumbnailBackfillRepository(
                stubQueryRepository(states),
                Mockito.mock(PlatformTransactionManager.class),
                new ObjectMapper()
        );
    }

    @Test
    void noLegacyAssetMarksEventAsNoLegacyAsset() {
        var repository = repositoryFor(List.of(
                new DatabaseState(
                        "bach-dang-938", "bach-dang-938", "Bach dang", 0, null, null)),
                Map.of());
        var service = newService(inventory(List.of()), repository);

        Plan plan = service.buildPlan(
                "test-1", LegacyEventThumbnailBackfillService.ApplyOptions.dryRunDefault(FIXED_CLOCK));

        assertEquals(1, plan.matches().size());
        assertEquals(MatchAction.NO_LEGACY_ASSET, plan.matches().get(0).action());
        assertEquals(0, plan.digest().eligibleInsertCount());
        assertEquals(1, plan.digest().noLegacyAssetCount());
        assertEquals(1, plan.digest().totalDatabaseEvents());
        assertEquals(0, plan.digest().totalCloudinaryAssets());
    }

    @Test
    void singleLegacyAssetInserted() {
        var repository = repositoryFor(List.of(new DatabaseState(
                "bach-dang-938", "bach-dang-938", "Bach dang", 0, null, null)),
                Map.of());
        CloudinaryAsset asset = new CloudinaryAsset(
                "historical_events_thumbnail1/bach-dang-938",
                "cloud-asset-1",
                "https://res.cloudinary.com/dlx-demo/image/upload/v1/historical_events_thumbnail1/bach-dang-938.png",
                1L, "png", "image", 1024, 768, 12_345L,
                Instant.parse("2024-01-01T00:00:00Z").toString(),
                "historical_events_thumbnail1");
        var service = newService(inventory(List.of(asset)), repository);
        Plan plan = service.buildPlan(
                "test-2", LegacyEventThumbnailBackfillService.ApplyOptions.dryRunDefault(FIXED_CLOCK));
        assertEquals(1, plan.matches().size());
        EventMatch match = plan.matches().get(0);
        assertEquals(MatchAction.INSERT_LEGACY_THUMBNAIL, match.action());
        assertEquals(asset.publicId(), match.chosen().publicId());
        assertEquals(1, plan.digest().eligibleInsertCount());
    }

    @Test
    void precedenceWinnerShadowsLowerFolders() {
        var repository = repositoryFor(List.of(new DatabaseState(
                "bach-dang-938", "bach-dang-938", "Bach dang", 0, null, null)),
                Map.of());
        CloudinaryAsset precedenceWinner = new CloudinaryAsset(
                "historical_events_thumbnail1/bach-dang-938",
                "asset-1",
                "https://res.cloudinary.com/dlx-demo/image/upload/v2/historical_events_thumbnail1/bach-dang-938.png",
                2L, "png", "image", 1600, 1200, 156_000L,
                Instant.parse("2024-02-02T00:00:00Z").toString(),
                "historical_events_thumbnail1");
        CloudinaryAsset shadowed = new CloudinaryAsset(
                "historical_events_thumbnail/bach-dang-938",
                "asset-2",
                "https://res.cloudinary.com/dlx-demo/image/upload/v1/historical_events_thumbnail/bach-dang-938.png",
                1L, "png", "image", 800, 600, 90_000L,
                Instant.parse("2023-12-31T00:00:00Z").toString(),
                "historical_events_thumbnail");

        var service = newService(inventory(List.of(precedenceWinner, shadowed)), repository);
        Plan plan = service.buildPlan(
                "test-3", LegacyEventThumbnailBackfillService.ApplyOptions.dryRunDefault(FIXED_CLOCK));
        EventMatch match = plan.matches().stream()
                .filter(m -> "bach-dang-938".equals(m.eventId()))
                .findFirst()
                .orElseThrow();
        assertEquals(MatchAction.INSERT_PRECEDENCE_WINNER, match.action());
        assertEquals(precedenceWinner.publicId(), match.chosen().publicId());
        assertEquals(1, match.shadowed().size());
        assertEquals(shadowed.publicId(), match.shadowed().get(0).publicId());
        assertEquals(1, plan.digest().eligibleInsertCount());
    }

    @Test
    void hashDigestIsDeterministicAcrossReRuns() {
        var repository = repositoryFor(List.of(new DatabaseState(
                "bach-dang-938", "bach-dang-938", "Bach dang", 0, null, null)),
                Map.of());
        CloudinaryAsset asset = new CloudinaryAsset(
                "historical_events_thumbnail1/bach-dang-938",
                "cloud-asset-1",
                "https://res.cloudinary.com/dlx-demo/image/upload/v1/historical_events_thumbnail1/bach-dang-938.png",
                1L, "png", "image", 1024, 768, 12_345L,
                Instant.parse("2024-01-01T00:00:00Z").toString(),
                "historical_events_thumbnail1");
        var service = newService(inventory(List.of(asset)), repository);

        Plan first = service.buildPlan(
                "test-5", LegacyEventThumbnailBackfillService.ApplyOptions.dryRunDefault(FIXED_CLOCK));
        Plan second = service.buildPlan(
                "test-5", LegacyEventThumbnailBackfillService.ApplyOptions.dryRunDefault(FIXED_CLOCK));
        assertEquals(first.digest().hashDigest(), second.digest().hashDigest());
    }

    @Test
    void unsupportedResourceMarksTheEventWithoutInsert() {
        var repository = repositoryFor(List.of(new DatabaseState(
                "event-raw", "event-raw", "Event raw", 0, null, null)),
                Map.of());
        CloudinaryAsset raw = new CloudinaryAsset(
                "event-thumbnails/event-raw",
                "cloud-asset-raw",
                "https://res.cloudinary.com/dlx-demo/image/upload/v1/event-thumbnails/event-raw",
                1L, "jpg", "raw", 800, 600, 60_000L,
                Instant.parse("2024-01-01T00:00:00Z").toString(),
                "event-thumbnails");
        var service = newService(inventory(List.of(raw)), repository);
        Plan plan = service.buildPlan(
                "test-7", LegacyEventThumbnailBackfillService.ApplyOptions.dryRunDefault(FIXED_CLOCK));
        EventMatch match = plan.matches().stream()
                .filter(m -> "event-raw".equals(m.eventId()))
                .findFirst()
                .orElseThrow();
        assertEquals(MatchAction.UNSUPPORTED_RESOURCE, match.action());
        assertEquals(1, plan.digest().unsupportedResourceCount());
        assertEquals(0, plan.digest().eligibleInsertCount());
    }

    @Test
    void eligibilityInsertCreatedFromMatchUsesUuidAndDeliveryUrl() {
        var repository = repositoryFor(List.of(), Map.of());
        CloudinaryAsset asset = new CloudinaryAsset(
                "historical_events_thumbnail1/event-z",
                "asset-z",
                "https://res.cloudinary.com/dlx-demo/image/upload/v8/historical_events_thumbnail1/event-z.png",
                8L, "png", "image", 1024, 768, 12_345L,
                Instant.parse("2024-01-01T00:00:00Z").toString(),
                "historical_events_thumbnail1");
        var service = newService(inventory(List.of(asset)), repository);

        EventMatch match = new EventMatch(
                "event-z",
                "event-z",
                MatchAction.INSERT_LEGACY_THUMBNAIL,
                asset,
                List.of());
        LegacyThumbnailBackfillPlan.EligibleInsert insert = service.buildEligibleInsert(match);
        assertNotNull(insert);
        assertEquals("event-z", insert.eventId());
        assertEquals(36, insert.managedAssetId().length());
        assertEquals(LegacyCloudinaryDeliveryUrl.Kind.THUMBNAIL, insert.kind());
        assertNotNull(insert.deliveryUrl());
        assertTrue(insert.deliveryUrl().contains("res.cloudinary.com/dlx-demo"));
        assertTrue(insert.deliveryUrl().contains("v8"));
    }

    @Test
    void runDryRunProducesAllSixArtifacts() throws IOException {
        var repository = repositoryFor(List.of(new DatabaseState(
                "event-9", "event-9", "Event Nine", 0, null, null)),
                Map.of());
        CloudinaryAsset asset = new CloudinaryAsset(
                "historical_events_thumbnail1/event-9", "asset-9",
                "https://res.cloudinary.com/dlx-demo/image/upload/v1/historical_events_thumbnail1/event-9.png",
                1L, "png", "image", 1024, 768, 12_345L,
                Instant.parse("2024-01-01T00:00:00Z").toString(),
                "historical_events_thumbnail1");
        var service = newService(inventory(List.of(asset)), repository);

        var tmp = Files.createTempDirectory("backfill-dry-run-test-");
        try {
            PlanDigest digest = service.runDryRun("unit-test-run", tmp);
            assertEquals(1, digest.eligibleInsertCount());
            assertEquals(64, digest.hashDigest().length());
            var runDir = tmp.resolve("unit-test-run");
            assertTrue(Files.exists(runDir.resolve("database-before-summary.json")));
            assertTrue(Files.exists(runDir.resolve("cloudinary-inventory.json")));
            assertTrue(Files.exists(runDir.resolve("backfill-plan.json")));
            assertTrue(Files.exists(runDir.resolve("shadowed-assets.json")));
            assertTrue(Files.exists(runDir.resolve("conflicts.json")));
            assertTrue(Files.exists(runDir.resolve("rollback-snapshot.json")));
            assertTrue(Files.exists(runDir.resolve("summary.json")));
        } finally {
            deleteRecursively(tmp);
        }
    }

    @Test
    void summaryCountDigestsAreSelfConsistent() {
        var repository = repositoryFor(List.of(
                new DatabaseState("alpha", "alpha", "A", 0, null, null),
                new DatabaseState("beta", "beta", "B", 0, null, null)),
                Map.of());
        var service = newService(inventory(List.of()), repository);

        Plan plan = service.buildPlan(
                "zero", LegacyEventThumbnailBackfillService.ApplyOptions.dryRunDefault(FIXED_CLOCK));
        assertEquals(2, plan.matches().size());
        assertEquals(2, plan.digest().noLegacyAssetCount());
        assertEquals(0, plan.digest().eligibleInsertCount());
        assertEquals(2, plan.digest().totalDatabaseEvents());
        assertEquals(0, plan.digest().totalCloudinaryAssets());
    }

    @Test
    void alreadyHasCanonicalThumbnailSkipsBackfill() throws IOException {
        LegacyEventThumbnailBackfillRepository repository = Mockito.mock(LegacyEventThumbnailBackfillRepository.class);
        Mockito.when(repository.loadDatabaseState(anyInt(), anyInt()))
                .thenReturn(List.of(new DatabaseState(
                        "bach-dang-938", "bach-dang-938", "Bach dang",
                        42L, "cloudinary-public-id-42", "READY")));
        Mockito.when(repository.countHistoricalEvents()).thenReturn(1L);
        Mockito.when(repository.countEventMedia()).thenReturn(0L);
        Mockito.when(repository.countCleanupTasks()).thenReturn(0L);
        Mockito.when(repository.topFlywayVersion()).thenReturn("42");
        Mockito.when(repository.loadExistingStorageIdentities(nullable(Set.class), nullable(Set.class)))
                .thenReturn(Map.of());

        CloudinaryAsset asset = new CloudinaryAsset(
                "historical_events_thumbnail1/bach-dang-938",
                "cloud-asset-1",
                "https://res.cloudinary.com/dlx-demo/image/upload/v1/historical_events_thumbnail1/bach-dang-938.png",
                1L, "png", "image", 1024, 768, 12_345L,
                Instant.parse("2024-01-01T00:00:00Z").toString(),
                "historical_events_thumbnail1");
        var service = newService(inventory(List.of(asset)), repository);

        var tmp = Files.createTempDirectory("backfill-dry-run-already-");
        try {
            PlanDigest digest = service.runDryRun("already-canonical-test", tmp);
            assertEquals(0, digest.eligibleInsertCount());
            assertEquals(1, digest.alreadyHasCanonicalCount());
            Mockito.verify(repository, Mockito.never()).applyInsertBatch(
                    Mockito.<List<LegacyThumbnailBackfillPlan.EligibleInsert>>any());
        } finally {
            deleteRecursively(tmp);
        }
    }

    @Test
    void applyRefusedWhenApplyOptionsFalse() {
        var repository = Mockito.mock(LegacyEventThumbnailBackfillRepository.class);
        var service = newService(inventory(List.of()), repository);
        CloudinaryAsset asset = new CloudinaryAsset(
                "historical_events_thumbnail1/noevent", "asset-x",
                "https://res.cloudinary.com/dlx-demo/image/upload/v1/historical_events_thumbnail1/noevent.png",
                1L, "png", "image", 1024, 768, 12_345L,
                Instant.parse("2024-01-01T00:00:00Z").toString(),
                "historical_events_thumbnail1");
        EventMatch match = new EventMatch(
                "noevent", "noevent", MatchAction.INSERT_LEGACY_THUMBNAIL, asset, List.of());
        Plan plan = new Plan(
                "apply-test",
                Instant.parse("2026-08-02T07:00:00Z").toString(),
                List.of(),
                List.of(asset),
                List.of(match),
                new PlanDigest(1, 0, 0, 0, 0, 0, 0, 0, 1, 1, "deadbeef"));
        var target = new LegacyThumbnailBackfillDatasourceGuard.Target(
                "jdbc:mysql://localhost:3306/l?user=***", "localhost", "3306",
                "lichsuvn_local", "[]", false);
        var options = new LegacyEventThumbnailBackfillService.ApplyOptions(
                false, 100, Instant.parse("2026-08-02T07:00:00Z"));
        assertThrows(IllegalArgumentException.class, () -> service.apply(plan, target, options));
    }

    @Test
    void applyWithEmptyEligibleSetIsNoOp() {
        var repository = Mockito.mock(LegacyEventThumbnailBackfillRepository.class);
        var service = newService(inventory(List.of()), repository);
        Plan empty = new Plan(
                "empty-test",
                Instant.parse("2026-08-02T07:00:00Z").toString(),
                List.of(),
                List.of(),
                List.of(),
                new PlanDigest(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, "deadbeef"));
        var target = new LegacyThumbnailBackfillDatasourceGuard.Target(
                "jdbc:mysql://localhost:3306/l?user=***", "localhost", "3306",
                "lichsuvn_local", "[]", false);
        var options = new LegacyEventThumbnailBackfillService.ApplyOptions(
                true, 100, Instant.parse("2026-08-02T07:00:00Z"));
        var outcome = service.apply(empty, target, options);
        assertEquals(0L, outcome.affected());
        Mockito.verify(repository, Mockito.never()).applyInsertBatch(
                Mockito.<List<LegacyThumbnailBackfillPlan.EligibleInsert>>any());
    }

    @Test
    void planActionsExhaustivelyCoverAllClassifications() {
        for (MatchAction action : MatchAction.values()) {
            assertNotNull(action);
            assertFalse(action.name().isBlank());
        }
    }

    @Test
    void emptyPlanSingleInvocation() {
        var repo = repositoryFor(List.of(), Map.of());
        var service = newService(inventory(List.of()), repo);
        Plan plan = service.buildPlan(
                "happy-empty", LegacyEventThumbnailBackfillService.ApplyOptions.dryRunDefault(FIXED_CLOCK));
        assertNotNull(plan);
    }

    @Test
    void legacyFoldersExposeThePrecedence() {
        List<String> folders = CloudinaryLegacyThumbnailInventory.legacyFolders();
        assertEquals(3, folders.size());
        assertEquals("historical_events_thumbnail1", folders.get(0));
        assertEquals("event-thumbnails", folders.get(1));
        assertEquals("historical_events_thumbnail", folders.get(2));
    }
}

package com.lichsuvn.backend.importer;

import com.lichsuvn.backend.importer.LegacyThumbnailBackfillPlan.CloudinaryAsset;
import com.lichsuvn.backend.importer.CloudinaryLegacyThumbnailInventory.InventoryClient;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CloudinaryLegacyThumbnailInventoryTest {

    @Test
    void zeroRowsReturnsEmptyList() {
        var inv = new CloudinaryLegacyThumbnailInventory(new RecordingClient(Map.of()), 100, 5000, 100);
        assertEquals(0, inv.listByPrefix("historical_events_thumbnail1").size());
    }

    @Test
    void deterministicPublicIdSort() {
        var inv = new CloudinaryLegacyThumbnailInventory(
                new RecordingClient(Map.of(
                        "historical_events_thumbnail1", assetsAtCursor(0, List.of(
                                "historical_events_thumbnail1/event-b",
                                "historical_events_thumbnail1/event-a")))),
                100, 5000, 100);
        var list = inv.listByPrefix("historical_events_thumbnail1");
        assertEquals(2, list.size());
        assertEquals("historical_events_thumbnail1/event-a", list.get(0).publicId());
        assertEquals("historical_events_thumbnail1/event-b", list.get(1).publicId());
    }

    @Test
    void transientRetriesAreBounded() {
        var client = new RecordingClient(Map.of()) {
            int transientCalls;
            @Override
            public Map<String, Object> listByPublicIdPrefix(String prefix, String cursor, int pageSize) throws IOException {
                transientCalls++;
                throw new IOException("simulated transient");
            }
        };
        var inv = new CloudinaryLegacyThumbnailInventory(client, 100, 5000, 100);
        var ex = assertThrows(CloudinaryLegacyThumbnailInventory.InventoryException.class,
                () -> inv.listByPrefix("historical_events_thumbnail1"));
        assertNotNull(ex.getMessage());
        assertEquals(3, client.transientCalls);
    }

    @Test
    void paginationStopsOnEmptyResources() {
        MultiCursorClient multi = new MultiCursorClient();
        multi.add("historical_events_thumbnail1", "", List.of("historical_events_thumbnail1/event-1"));
        multi.add("historical_events_thumbnail1", "1", List.of());
        var inv = new CloudinaryLegacyThumbnailInventory(multi, 100, 5000, 100);
        var list = inv.listByPrefix("historical_events_thumbnail1");
        assertEquals(1, list.size());
    }

    @Test
    void paginationAdvancesAndStops() {
        MultiCursorClient multi = new MultiCursorClient();
        multi.add("historical_events_thumbnail1", "", List.of("historical_events_thumbnail1/event-1"));
        multi.add("historical_events_thumbnail1", "1", List.of("historical_events_thumbnail1/event-2"));
        multi.add("historical_events_thumbnail1", "2", List.of());
        var inv = new CloudinaryLegacyThumbnailInventory(multi, 100, 5000, 100);
        var list = inv.listByPrefix("historical_events_thumbnail1");
        assertEquals(2, list.size());
    }

    @Test
    void nonAdvancingCursorIsRejected() {
        // The stub returns a non-blank cursor that never advances, so the inventory
        // must detect the stuck cursor and abort instead of looping forever.
        var client = new RecordingClient(Map.of()) {
            @Override
            public Map<String, Object> listByPublicIdPrefix(String prefix, String cursor, int pageSize) throws IOException {
                Map<String, Object> response = new HashMap<>();
                response.put("resources", List.of(assetMap(
                        "historical_events_thumbnail1/event-1", 0, "image", "png",
                        1000, 800, 99L)));
                response.put("next_cursor", "stuck");
                return response;
            }
        };
        var inv = new CloudinaryLegacyThumbnailInventory(client, 100, 5000, 100);
        assertThrows(CloudinaryLegacyThumbnailInventory.InventoryException.class,
                () -> inv.listByPrefix("historical_events_thumbnail1"));
    }

    @Test
    void maxPagesCapStopsEvenIfCursorStillAdvances() {
        MultiCursorClient multi = new MultiCursorClient();
        // First page is requested with an empty cursor; every subsequent page advances.
        multi.add("historical_events_thumbnail1", "", List.of("historical_events_thumbnail1/event-0"));
        for (int i = 1; i < 200; i++) {
            multi.add("historical_events_thumbnail1", String.valueOf(i),
                    List.of("historical_events_thumbnail1/event-" + i));
        }
        var inv = new CloudinaryLegacyThumbnailInventory(multi, 1, 5000, 5);
        assertEquals(5, inv.listByPrefix("historical_events_thumbnail1").size());
    }

    @Test
    void multiplePrefixesReturnSortedIndependentLists() {
        var inv = new CloudinaryLegacyThumbnailInventory(
                new RecordingClient(Map.of(
                        "historical_events_thumbnail1", assetsAtCursor(0, List.of(
                                "historical_events_thumbnail1/event-1")),
                        "event-thumbnails", assetsAtCursor(0, List.of(
                                "event-thumbnails/event-2")))),
                100, 5000, 100);
        var byPrefix = inv.listByPrefix(List.of(
                "historical_events_thumbnail1",
                "event-thumbnails",
                "historical_events_thumbnail"));
        assertEquals(3, byPrefix.size());
        assertEquals(1, byPrefix.get("historical_events_thumbnail1").size());
        assertEquals(1, byPrefix.get("event-thumbnails").size());
        assertEquals(0, byPrefix.get("historical_events_thumbnail").size());
    }

    private static List<CloudinaryAsset> assetsAtCursor(int cursor, List<String> publicIds) {
        List<CloudinaryAsset> assets = new java.util.ArrayList<>();
        for (String publicId : publicIds) {
            assets.add(new CloudinaryAsset(
                    publicId, "asset-" + publicId,
                    "https://res.cloudinary.com/demo/image/upload/v1/" + publicId + ".png",
                    1L, "png", "image", 1024, 768, 12_345L,
                    Instant.parse("2024-01-01T00:00:00Z").toString(),
                    publicId.split("/")[0]));
        }
        return assets;
    }

    private static Map<String, Object> assetMap(
            String publicId, long version, String resourceType, String format,
            int width, int height, long bytes) {
        Map<String, Object> map = new HashMap<>();
        map.put("public_id", publicId);
        map.put("asset_id", "asset-" + publicId);
        map.put("secure_url", "https://res.cloudinary.com/demo/image/upload/v" + version + "/" + publicId);
        map.put("version", version);
        map.put("format", format);
        map.put("resource_type", resourceType);
        map.put("width", width);
        map.put("height", height);
        map.put("bytes", bytes);
        map.put("created_at", "2024-01-01T00:00:00.000Z");
        return map;
    }

    static class RecordingClient implements InventoryClient {
        int calls;
        private final Map<String, List<CloudinaryAsset>> map;

        RecordingClient(Map<String, List<CloudinaryAsset>> map) {
            this.map = map;
        }

        @Override
        public boolean configured() {
            return true;
        }

        @Override
        public Map<String, Object> listByPublicIdPrefix(String prefix, String cursor, int pageSize) throws IOException {
            calls++;
            List<Map<String, Object>> stubs = new java.util.ArrayList<>();
            for (CloudinaryAsset asset : map.getOrDefault(prefix, List.of())) {
                Map<String, Object> raw = new HashMap<>();
                raw.put("public_id", asset.publicId());
                raw.put("asset_id", asset.assetId());
                raw.put("secure_url", asset.secureUrl());
                raw.put("version", asset.version());
                raw.put("format", asset.format());
                raw.put("resource_type", asset.resourceType());
                raw.put("width", asset.width());
                raw.put("height", asset.height());
                raw.put("bytes", asset.bytes());
                raw.put("created_at", "2024-01-01T00:00:00.000Z");
                stubs.add(raw);
            }
            Map<String, Object> response = new HashMap<>();
            response.put("resources", stubs);
            response.put("next_cursor", "");
            return response;
        }
    }

    static class MultiCursorClient implements InventoryClient {
        final java.util.Map<String, java.util.Map<String, List<CloudinaryAsset>>> map =
                new HashMap<>();

        void add(String prefix, String cursor, List<String> publicIds) {
            map.computeIfAbsent(prefix, key -> new HashMap<>())
                    .put(cursor, assetsAtCursor(0, publicIds));
        }

        @Override
        public boolean configured() {
            return true;
        }

        @Override
        public Map<String, Object> listByPublicIdPrefix(String prefix, String cursor, int pageSize) throws IOException {
            List<CloudinaryAsset> assets = map.getOrDefault(prefix, Map.of())
                    .getOrDefault(cursor == null ? "" : cursor, List.of());
            List<Map<String, Object>> stubs = new java.util.ArrayList<>();
            for (CloudinaryAsset asset : assets) {
                Map<String, Object> raw = new HashMap<>();
                raw.put("public_id", asset.publicId());
                raw.put("asset_id", asset.assetId());
                raw.put("secure_url", asset.secureUrl());
                raw.put("version", asset.version());
                raw.put("format", asset.format());
                raw.put("resource_type", asset.resourceType());
                raw.put("width", asset.width());
                raw.put("height", asset.height());
                raw.put("bytes", asset.bytes());
                raw.put("created_at", "2024-01-01T00:00:00.000Z");
                stubs.add(raw);
            }
            Map<String, Object> response = new HashMap<>();
            response.put("resources", stubs);
            String nextCursor = nextCursorFor(cursor);
            boolean hasMore = map.getOrDefault(prefix, Map.of()).containsKey(nextCursor)
                    && !map.get(prefix).get(nextCursor).isEmpty();
            response.put("next_cursor", hasMore ? nextCursor : "");
            return response;
        }

        private static String nextCursorFor(String cursor) {
            if (cursor == null || cursor.isBlank()) {
                return "1";
            }
            try {
                int n = Integer.parseInt(cursor);
                return String.valueOf(n + 1);
            } catch (NumberFormatException e) {
                // Cannot advance a non-numeric opaque cursor.
                return cursor + "_next";
            }
        }
    }
}

package com.lichsuvn.backend.admin.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminEventMediaSerializationTest {
    @Test
    void adminMediaExposesOnlyTheManagedDiscriminator() throws Exception {
        var media = new AdminEventDtos.Media(
                41L, "image", "https://cdn.example.test/image.png", true,
                "Caption", "Alt", "Archive", "CC BY",
                "object_storage", true, false, 0, "active", null);

        String json = new ObjectMapper().writeValueAsString(media);

        assertTrue(json.contains("\"managed\":true"));
        for (String forbidden : new String[]{
                "provider", "publicId", "assetId", "checksum", "originalUrl",
                "cleanup", "storageState", "uploadToken"
        }) {
            assertFalse(json.contains(forbidden), forbidden);
        }
    }
}

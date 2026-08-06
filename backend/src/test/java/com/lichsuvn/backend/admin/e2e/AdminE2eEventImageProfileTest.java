package com.lichsuvn.backend.admin.e2e;

import com.lichsuvn.backend.admin.application.EventImageStorage;
import com.lichsuvn.backend.admin.infrastructure.CloudinaryEventImageStorage;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.http.MediaType;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminE2eEventImageProfileTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(
                    CloudinaryEventImageStorage.class,
                    AdminE2eEventImageStorage.class,
                    AdminE2eEventImageController.class);

    @Test
    void adminE2eRegistersOnlyTheFakeStorageAndFixtureController() {
        runner.withInitializer(context ->
                        context.getEnvironment().setActiveProfiles("admin-e2e"))
                .run(context -> {
                    assertEquals(1, context.getBeansOfType(EventImageStorage.class).size());
                    assertTrue(context.getBean(EventImageStorage.class)
                            instanceof AdminE2eEventImageStorage);
                    assertFalse(context.containsBean("cloudinaryEventImageStorage"));
                    assertTrue(context.containsBean("adminE2eEventImageController"));

                    var response = context.getBean(AdminE2eEventImageController.class)
                            .image("a".repeat(64));
                    assertEquals(MediaType.IMAGE_PNG, response.getHeaders().getContentType());
                    assertNotNull(response.getBody());
                    assertArrayEquals(
                            new byte[]{(byte) 0x89, 0x50, 0x4e, 0x47},
                            Arrays.copyOf(response.getBody(), 4));
                });
    }

    @Test
    void defaultAndProductionLikeContextsNeverContainTheFakeOrFixtureController() {
        runner.run(context -> {
            assertTrue(context.getBean(EventImageStorage.class)
                    instanceof CloudinaryEventImageStorage);
            assertFalse(context.containsBean("adminE2eEventImageStorage"));
            assertFalse(context.containsBean("adminE2eEventImageController"));
        });
        runner.withInitializer(context ->
                        context.getEnvironment().setActiveProfiles("prod"))
                .run(context -> {
                    assertTrue(context.getBean(EventImageStorage.class)
                            instanceof CloudinaryEventImageStorage);
                    assertFalse(context.containsBean("adminE2eEventImageStorage"));
                    assertFalse(context.containsBean("adminE2eEventImageController"));
                });
    }
}

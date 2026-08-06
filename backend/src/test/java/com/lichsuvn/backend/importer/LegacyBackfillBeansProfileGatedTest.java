package com.lichsuvn.backend.importer;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Profile;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Enforces the convention that every Spring-managed bean added by the legacy
 * thumbnail backfill module is gated to
 * {@code @Profile("backfill-event-thumbnails")}. Without this guard the
 * {@code @Component}/{@code @Service}/{@code @Repository}/{@code @Configuration}
 * classes would be picked up by the {@code remote-production} web profile,
 * which has no {@code app.cloudinary.*} credentials configured and therefore
 * explodes during bean instantiation.
 *
 * <p>This is a regression test for the original
 * {@code No default constructor found on CloudinaryLegacyThumbnailInventory}
 * failure observed when running {@code mvn spring-boot:run}.
 */
class LegacyBackfillBeansProfileGatedTest {

    private static final Set<Class<?>> BEANS = Set.of(
            BackfillLifecycle.class,
            CloudinaryLegacyThumbnailInventory.class,
            LegacyEventThumbnailBackfillRepository.class,
            LegacyEventThumbnailBackfillRunner.class,
            LegacyEventThumbnailBackfillService.class,
            LegacyThumbnailBackfillDatasourceGuard.class);

    @Test
    void everyBackfillBeanIsProfileGatedToBackfillEventThumbnails() {
        for (Class<?> bean : BEANS) {
            Profile profile = bean.getAnnotation(Profile.class);
            assertNotNull(profile, bean.getName() + " is missing @Profile");
            for (String value : profile.value()) {
                assertTrue(
                        "backfill-event-thumbnails".equals(value),
                        bean.getName() + " must use the 'backfill-event-thumbnails' profile, saw '" + value + "'");
            }
        }
    }
}

package com.lichsuvn.backend.importer;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

import java.time.Clock;

/**
 * Tiny helper bean factory used by the legacy thumbnail backfill. Provides a default
 * UTC clock without introducing a self-referential dependency on itself. Marked
 * {@code @Primary} so a CLI-provided {@code Clock} (via Spring Boot auto-config) wins
 * when present.
 */
@Configuration
@Profile("backfill-event-thumbnails")
public class BackfillLifecycle {

    @Bean
    @Primary
    public Clock backfillClock() {
        return Clock.systemUTC();
    }
}

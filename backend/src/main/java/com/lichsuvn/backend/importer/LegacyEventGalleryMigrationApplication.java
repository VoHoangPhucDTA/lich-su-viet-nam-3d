package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

import java.time.Clock;
import java.util.Arrays;
import java.util.Locale;

public final class LegacyEventGalleryMigrationApplication {

    private static final String PROFILE = "backfill-gallery-images";

    private LegacyEventGalleryMigrationApplication() {
    }

    public static void main(String[] args) {
        try (ConfigurableApplicationContext ignored = run(args)) {
            // CommandLineRunner completes before run() returns.
        }
    }

    public static ConfigurableApplicationContext run(String... args) {
        SpringApplication application = new SpringApplication(ImportConfiguration.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        application.setAdditionalProfiles(PROFILE);
        return application.run(args);
    }

    public static boolean isRequested(String... args) {
        if (containsProfile(System.getProperty("spring.profiles.active"))
                || containsProfile(System.getenv("SPRING_PROFILES_ACTIVE"))) {
            return true;
        }
        return Arrays.stream(args)
                .filter(arg -> arg.startsWith("--spring.profiles.active="))
                .map(arg -> arg.substring(arg.indexOf('=') + 1))
                .anyMatch(LegacyEventGalleryMigrationApplication::containsProfile);
    }

    private static boolean containsProfile(String value) {
        return value != null && Arrays.stream(value.split(","))
                .map(p -> p.trim().toLowerCase(Locale.ROOT))
                .anyMatch(PROFILE::equals);
    }

    @Configuration(proxyBeanMethods = false)
    @Profile(PROFILE)
    @org.springframework.boot.autoconfigure.EnableAutoConfiguration(excludeName = {
            "org.springframework.boot.web.servlet.autoconfigure.WebMvcAutoConfiguration",
            "org.springframework.boot.web.embedded.tomcat.autoconfigure.EmbeddedTomcatAutoConfiguration",
            "org.springframework.boot.jetty.autoconfigure.JettyServerAutoConfiguration",
            "org.springframework.boot.reactor.netty.autoconfigure.ReactorNettyServerAutoConfiguration",
            "org.springframework.boot.actuate.autoconfigure.security.servlet.ManagementWebSecurityAutoConfiguration"
    })
    @Import({
            LegacyEventGalleryMigrationService.class,
            LegacyEventGalleryMigrationRepository.class,
            LegacyEventGalleryMigrationDatasourceGuard.class,
            com.lichsuvn.backend.admin.infrastructure.CloudinaryEventImageStorage.class,
            LegacyEventGalleryMigrationRunner.class
    })
    static class ImportConfiguration {

        @Bean
        @Primary
        public ObjectMapper galleryObjectMapper() {
            ObjectMapper mapper = new ObjectMapper();
            mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
            return mapper;
        }

        /**
         * The thumbnail backfill lifecycle bean is gated to
         * {@code backfill-event-thumbnails}; the gallery runner needs the same default
         * UTC clock under {@code backfill-gallery-images}, declared here so the
         * context starts without a CLI-provided {@code Clock}.
         */
        @Bean
        @Primary
        public Clock galleryBackfillClock() {
            return Clock.systemUTC();
        }
    }
}

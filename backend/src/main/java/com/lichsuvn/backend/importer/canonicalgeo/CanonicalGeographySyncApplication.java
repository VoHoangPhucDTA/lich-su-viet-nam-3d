package com.lichsuvn.backend.importer.canonicalgeo;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;

/**
 * Non-web entry point for the canonical-geo-sync profile. Dry-run by default;
 * apply requires all gates. Never writes without explicit gate flags.
 */
public final class CanonicalGeographySyncApplication {

    public static final String PROFILE = "canonical-geo-sync";

    private CanonicalGeographySyncApplication() {
    }

    public static void main(String[] args) {
        try (ConfigurableApplicationContext ignored = run(args)) {
            // CommandLineRunner completes before SpringApplication.run returns.
        }
    }

    public static ConfigurableApplicationContext run(String... args) {
        SpringApplication application = new SpringApplication(SyncConfiguration.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        application.setAdditionalProfiles(PROFILE);
        return application.run(args);
    }

    @Configuration(proxyBeanMethods = false)
    @Profile(PROFILE)
    @EnableAutoConfiguration(excludeName = {
            "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
            "org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration"
    })
    @Import({
            CanonicalGeographySyncRunner.class,
            CanonicalGeographySyncService.class,
            CanonicalGeographySyncRepository.class,
            CanonicalGeographyProjection.class,
            CanonicalGeographyDatasourceGuard.class
    })
    static class SyncConfiguration {

        /**
         * Phase C2-T2 wires a Jackson 2 {@link ObjectMapper} into the
         * canonical-sync Spring context only. Spring Boot 4.0.3 default
         * auto-configuration registers only Jackson 3
         * {@code tools.jackson.databind.json.JsonMapper}; the legacy Jackson
         * {@code com.fasterxml.jackson.databind.ObjectMapper} bean that
         * {@link CanonicalGeographyProjection} requires is therefore missing.
         *
         * <p>The bean is scoped to {@link #PROFILE} via the surrounding
         * {@code @Configuration} class; the main backend
         * {@code @SpringBootApplication} context is unaffected because its
         * profile filter rejects this nested configuration. Default Jackson 2
         * configuration is byte-stable for the projection's
         * {@code createObjectNode} / {@code createArrayNode} / {@code valueToTree}
         * factory calls. No modules, no features toggled, no qualifier needed
         * because exactly one Jackson 2 {@code ObjectMapper} exists in this
         * profile.
         */
        @Bean
        ObjectMapper canonicalGeoObjectMapper() {
            return new ObjectMapper();
        }
    }
}

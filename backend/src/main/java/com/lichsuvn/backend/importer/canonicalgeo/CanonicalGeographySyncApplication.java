package com.lichsuvn.backend.importer.canonicalgeo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
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
    }
}

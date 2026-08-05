package com.lichsuvn.backend.importer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

import java.util.Arrays;
import java.util.Locale;

/**
 * Non-web main entry for the one-off legacy thumbnail backfill runner. Invoked via
 * {@code java -jar backend.jar --spring.profiles.active=backfill-event-thumbnails}.
 *
 * <p>Mirrors {@code com.lichsuvn.backend.exam.dataset.ExamDatasetImportApplication}. We
 * skip Spring MVC auto-configuration so no web server boots, importer schedulers do not
 * run, and only the documented Spring beans are instantiated.
 */
public final class LegacyEventThumbnailBackfillApplication {

    private static final String PROFILE = "backfill-event-thumbnails";

    private LegacyEventThumbnailBackfillApplication() {
    }

    public static void main(String[] args) {
        try (ConfigurableApplicationContext ignored = run(args)) {
            // CommandLineRunner completes before SpringApplication.run returns.
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
                .filter(argument -> argument.startsWith("--spring.profiles.active="))
                .map(argument -> argument.substring(argument.indexOf('=') + 1))
                .anyMatch(LegacyEventThumbnailBackfillApplication::containsProfile);
    }

    private static boolean containsProfile(String value) {
        return value != null && Arrays.stream(value.split(","))
                .map(profile -> profile.trim().toLowerCase(Locale.ROOT))
                .anyMatch(PROFILE::equals);
    }

    @Configuration(proxyBeanMethods = false)
    @Profile(PROFILE)
    @EnableAutoConfiguration(excludeName = {
            "org.springframework.boot.web.servlet.autoconfigure.WebMvcAutoConfiguration",
            "org.springframework.boot.web.embedded.tomcat.autoconfigure.EmbeddedTomcatAutoConfiguration",
            "org.springframework.boot.jetty.autoconfigure.JettyServerAutoConfiguration",
            "org.springframework.boot.reactor.netty.autoconfigure.ReactorNettyServerAutoConfiguration",
            "org.springframework.boot.actuate.autoconfigure.security.servlet.ManagementWebSecurityAutoConfiguration"
    })
    @Import({
            LegacyEventThumbnailBackfillService.class,
            LegacyEventThumbnailBackfillRepository.class,
            CloudinaryLegacyThumbnailInventory.class,
            LegacyThumbnailBackfillDatasourceGuard.class,
            BackfillLifecycle.class,
            LegacyEventThumbnailBackfillRunner.class
    })
    static class ImportConfiguration {

        /**
         * ObjectMapper is auto-configured by spring-boot's web autoconfig; the
         * CLI excludes web MVC, so we declare a deterministic minimal bean here.
         */
        @Bean
        @Primary
        public ObjectMapper backfillObjectMapper() {
            ObjectMapper mapper = new ObjectMapper();
            mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
            return mapper;
        }
    }
}

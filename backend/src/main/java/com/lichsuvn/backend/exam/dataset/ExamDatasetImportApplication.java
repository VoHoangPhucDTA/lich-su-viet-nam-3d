package com.lichsuvn.backend.exam.dataset;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Profile;

import java.util.Arrays;
import java.util.Locale;

/** Non-web entry point for the explicit import-exams profile. */
public final class ExamDatasetImportApplication {
    private static final String PROFILE = "import-exams";

    private ExamDatasetImportApplication() {
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
                .anyMatch(ExamDatasetImportApplication::containsProfile);
    }

    private static boolean containsProfile(String value) {
        return value != null && Arrays.stream(value.split(","))
                .map(profile -> profile.trim().toLowerCase(Locale.ROOT))
                .anyMatch(PROFILE::equals);
    }

    @Configuration(proxyBeanMethods = false)
    @Profile(PROFILE)
    @EnableAutoConfiguration(excludeName = {
            "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
            "org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration"
    })
    @Import({ExamDatasetBundleLoader.class, ExamDatasetImportService.class, ExamDatasetImportRunner.class})
    static class ImportConfiguration {
    }
}

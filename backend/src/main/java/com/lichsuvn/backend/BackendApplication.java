package com.lichsuvn.backend;

import com.lichsuvn.backend.exam.dataset.ExamDatasetImportApplication;
import com.lichsuvn.backend.importer.LegacyEventGalleryMigrationApplication;
import com.lichsuvn.backend.importer.LegacyEventThumbnailBackfillApplication;
import io.github.cdimascio.dotenv.Dotenv;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.nio.file.Files;
import java.nio.file.Path;

@SpringBootApplication
public class BackendApplication {

	private static final String REMOTE_PRODUCTION_PROFILE = "remote-production";
	private static final String SPRING_PROFILES_ACTIVE = "spring.profiles.active";
	private static final String SPRING_PROFILES_ACTIVE_ENV = "SPRING_PROFILES_ACTIVE";
	private static final String SPRING_DATASOURCE_URL = "SPRING_DATASOURCE_URL";
	private static final String SPRING_DATASOURCE_URL_PROPERTY = "spring.datasource.url";

	public static void main(String[] args) {
		loadLocalDotenv();
		if (ExamDatasetImportApplication.isRequested(args)) {
			ExamDatasetImportApplication.main(args);
			return;
		}
		if (LegacyEventThumbnailBackfillApplication.isRequested(args)) {
			LegacyEventThumbnailBackfillApplication.main(args);
			return;
		}
		if (LegacyEventGalleryMigrationApplication.isRequested(args)) {
			LegacyEventGalleryMigrationApplication.main(args);
			return;
		}
		activateRemoteProductionProfileIfNeeded();
		SpringApplication.run(BackendApplication.class, args);
		System.out.println("Connect database sucessfully");
	}

	private static void activateRemoteProductionProfileIfNeeded() {
		if (hasText(System.getProperty(SPRING_PROFILES_ACTIVE)) || hasText(System.getenv(SPRING_PROFILES_ACTIVE_ENV))) {
			return;
		}

		String datasourceUrl = firstText(
				System.getProperty(SPRING_DATASOURCE_URL),
				System.getProperty(SPRING_DATASOURCE_URL_PROPERTY),
				System.getenv(SPRING_DATASOURCE_URL));
		if (isRemoteTidbUrl(datasourceUrl)) {
			System.setProperty(SPRING_PROFILES_ACTIVE, REMOTE_PRODUCTION_PROFILE);
		}
	}

	private static boolean isRemoteTidbUrl(String datasourceUrl) {
		if (!hasText(datasourceUrl)) {
			return false;
		}

		String normalizedUrl = datasourceUrl.toLowerCase();
		return normalizedUrl.contains("tidbcloud.com") || normalizedUrl.contains(".tidbcloud.com:4000/");
	}

	private static String firstText(String... values) {
		for (String value : values) {
			if (hasText(value)) {
				return value;
			}
		}
		return null;
	}

	private static boolean hasText(String value) {
		return value != null && !value.isBlank();
	}

	private static void loadLocalDotenv() {
		Path cwd = Path.of("").toAbsolutePath();
		Path dotenvDirectory = resolveDotenvDirectory(cwd);
		if (dotenvDirectory == null) {
			return;
		}

		Dotenv dotenv = Dotenv.configure()
				.directory(dotenvDirectory.toString())
				.ignoreIfMissing()
				.load();

		dotenv.entries().forEach(entry -> {
			String key = entry.getKey();
			if (System.getProperty(key) == null) {
				System.setProperty(key, entry.getValue());
			}
		});
	}

	private static Path resolveDotenvDirectory(Path cwd) {
		if (Files.exists(cwd.resolve(".env"))) {
			return cwd;
		}

		Path backendDir = cwd.resolve("backend");
		if (Files.exists(backendDir.resolve(".env"))) {
			return backendDir;
		}

		return null;
	}
}

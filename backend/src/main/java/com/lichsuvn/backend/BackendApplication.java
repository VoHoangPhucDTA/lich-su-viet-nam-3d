package com.lichsuvn.backend;

import io.github.cdimascio.dotenv.Dotenv;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.nio.file.Files;
import java.nio.file.Path;

@SpringBootApplication
public class BackendApplication {

	public static void main(String[] args) {
		loadLocalDotenv();
		SpringApplication.run(BackendApplication.class, args);
		System.out.println("Connect database sucessfully");
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

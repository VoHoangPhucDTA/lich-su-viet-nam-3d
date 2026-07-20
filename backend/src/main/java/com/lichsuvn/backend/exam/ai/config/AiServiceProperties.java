package com.lichsuvn.backend.exam.ai.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.net.URI;
import java.time.Duration;

@Validated
@ConfigurationProperties(prefix = "app.ai-service")
public record AiServiceProperties(
        boolean enabled,
        @NotNull URI baseUrl,
        @NotNull Duration connectTimeout,
        @NotNull Duration readTimeout,
        @NotBlank String generationPath,
        @NotBlank String healthPath,
        @NotBlank String provenancePath,
        @NotNull String internalToken,
        @Min(0) @Max(3) int maxStyleExamples
) {}

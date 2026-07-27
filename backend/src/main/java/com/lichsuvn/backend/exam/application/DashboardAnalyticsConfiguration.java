package com.lichsuvn.backend.exam.application;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.lichsuvn.backend.exam.api.dto.DashboardAnalyticsResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.Duration;

@Configuration
public class DashboardAnalyticsConfiguration {
    @Bean
    Clock dashboardAnalyticsClock() {
        return Clock.systemUTC();
    }

    @Bean
    Cache<String, DashboardAnalyticsResponse> dashboardAnalyticsCache(
            @Value("${exam.dashboard.cache-ttl-seconds:120}") long ttlSeconds,
            @Value("${exam.dashboard.cache-max-entries:500}") long maxEntries
    ) {
        return Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(Math.max(1, ttlSeconds)))
                .maximumSize(Math.max(1, maxEntries))
                .build();
    }
}

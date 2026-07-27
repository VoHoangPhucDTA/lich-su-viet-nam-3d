package com.lichsuvn.backend.exam.application;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class DashboardAnalyticsConfiguration {
    @Bean
    Clock dashboardAnalyticsClock() {
        return Clock.systemUTC();
    }
}

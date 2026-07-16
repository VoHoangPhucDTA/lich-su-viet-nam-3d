package com.lichsuvn.backend.tts.infrastructure;

import com.lichsuvn.backend.tts.application.TtsAssetWorkerSubmitter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

@Configuration
@EnableScheduling
public class TtsAssetWorkerConfig {
    @Bean(name = "ttsAssetWorkerExecutor")
    public ThreadPoolTaskExecutor ttsAssetWorkerExecutor(
            @Value("${app.tts.asset-worker-core-pool-size:1}") int corePoolSize,
            @Value("${app.tts.asset-worker-max-pool-size:2}") int maxPoolSize,
            @Value("${app.tts.asset-worker-queue-capacity:20}") int queueCapacity
    ) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("tts-asset-worker-");
        executor.initialize();
        return executor;
    }

    @Bean
    public TtsAssetWorkerSubmitter ttsAssetWorkerSubmitter(Executor ttsAssetWorkerExecutor) {
        return task -> {
            try {
                ttsAssetWorkerExecutor.execute(task);
            } catch (TaskRejectedException ex) {
                throw new RejectedExecutionException("TTS asset worker queue rejected the task", ex);
            }
        };
    }
}

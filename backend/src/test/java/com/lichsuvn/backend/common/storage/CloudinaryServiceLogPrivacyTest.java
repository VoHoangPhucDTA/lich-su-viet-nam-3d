package com.lichsuvn.backend.common.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(OutputCaptureExtension.class)
class CloudinaryServiceLogPrivacyTest {

    @Test
    void configuredInitializationDoesNotLogProviderConfiguration(CapturedOutput output) {
        String cloud = "phase11-cloud-sentinel";
        String key = "phase11-api-key-sentinel";
        String secret = "phase11-api-secret-sentinel";
        String avatar = "https://media.example.invalid/private-default";

        new CloudinaryService(cloud, key, secret, avatar);

        String logs = output.getAll();
        assertTrue(logs.contains("Cloudinary storage initialized"));
        assertFalse(logs.contains(cloud));
        assertFalse(logs.contains(key));
        assertFalse(logs.contains(secret));
        assertFalse(logs.contains(avatar));
    }
}

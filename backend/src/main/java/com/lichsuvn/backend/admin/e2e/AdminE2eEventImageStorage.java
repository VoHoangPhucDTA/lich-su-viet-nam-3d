package com.lichsuvn.backend.admin.e2e;

import com.lichsuvn.backend.admin.application.EventImageStorage;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

@Component
@Profile("admin-e2e")
public final class AdminE2eEventImageStorage implements EventImageStorage {
    @Override
    public boolean available() {
        return true;
    }

    @Override
    public StoredImage upload(UploadCommand command) {
        String format = switch (command.mimeType()) {
            case "image/jpeg" -> "jpg";
            case "image/webp" -> "webp";
            default -> "png";
        };
        String assetId = digest(command.publicId());
        return new StoredImage(
                command.publicId(),
                "admin-e2e-" + assetId,
                1L,
                "/api/admin-e2e/event-images/" + assetId,
                command.mimeType(),
                format,
                command.bytes().length,
                1,
                1
        );
    }

    @Override
    public DeleteResult delete(DeleteCommand command) {
        return new DeleteResult(DeleteOutcome.DELETED);
    }

    @Override
    public String deliveryUrl(DeliveryCommand command) {
        return "/api/admin-e2e/event-images/" + digest(command.publicId());
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(value.getBytes(StandardCharsets.UTF_8))
            );
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }
}

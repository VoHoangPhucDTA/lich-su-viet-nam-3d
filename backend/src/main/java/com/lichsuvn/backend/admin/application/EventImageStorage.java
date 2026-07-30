package com.lichsuvn.backend.admin.application;

public interface EventImageStorage {
    boolean available();

    StoredImage upload(UploadCommand command);

    DeleteResult delete(DeleteCommand command);

    String deliveryUrl(DeliveryCommand command);

    record UploadCommand(byte[] bytes, String publicId, String mimeType) {
        public UploadCommand {
            bytes = bytes.clone();
        }

        @Override
        public byte[] bytes() {
            return bytes.clone();
        }
    }

    record StoredImage(
            String publicId,
            String providerAssetId,
            long providerVersion,
            String originalUrl,
            String mimeType,
            String format,
            long byteSize,
            int width,
            int height
    ) {
    }

    record DeleteCommand(String publicId) {
    }

    record DeleteResult(DeleteOutcome outcome) {
    }

    enum DeleteOutcome {
        DELETED,
        NOT_FOUND
    }

    record DeliveryCommand(String publicId, Long providerVersion, DeliveryKind kind) {
    }

    enum DeliveryKind {
        THUMBNAIL,
        GALLERY
    }

    final class EventImageStorageException extends RuntimeException {
        private final String code;
        private final boolean retryable;

        public EventImageStorageException(String code, boolean retryable) {
            super("Event image storage operation failed");
            this.code = code;
            this.retryable = retryable;
        }

        public EventImageStorageException(String code, boolean retryable, Throwable cause) {
            super("Event image storage operation failed", cause);
            this.code = code;
            this.retryable = retryable;
        }

        public String code() {
            return code;
        }

        public boolean retryable() {
            return retryable;
        }
    }
}

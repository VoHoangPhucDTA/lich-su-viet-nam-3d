package com.lichsuvn.backend.admin.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lichsuvn.backend.admin.api.dto.AdminEventDtos;
import com.lichsuvn.backend.admin.api.dto.AdminEventImageDtos;
import com.lichsuvn.backend.admin.infrastructure.AdminEventImageRepository;
import com.lichsuvn.backend.admin.infrastructure.AdminEventMutationRepository;
import com.lichsuvn.backend.auth.security.UserPrincipal;
import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@PreAuthorize("hasAuthority('ROLE_admin')")
public class AdminEventImageUploadService {
    private static final Logger log = LoggerFactory.getLogger(AdminEventImageUploadService.class);
    static final int MAX_ACTIVE_RESERVATIONS = 3;
    private static final ZoneId DATABASE_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter VERSION_FORMATTER =
            new DateTimeFormatterBuilder().appendInstant(6).toFormatter();

    private final AdminEventImageRepository repository;
    private final AdminEventMutationRepository auditRepository;
    private final AdminEventReadService readService;
    private final EventImageValidator validator;
    private final EventImageStorage storage;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final int reservationMinutes;
    private final boolean uploadEnabled;

    @Autowired
    public AdminEventImageUploadService(
            AdminEventImageRepository repository,
            AdminEventMutationRepository auditRepository,
            AdminEventReadService readService,
            EventImageValidator validator,
            EventImageStorage storage,
            ObjectMapper objectMapper,
            PlatformTransactionManager transactionManager,
            @Value("${app.event-image-upload.reservation-minutes:10}") int reservationMinutes,
            @Value("${app.event-image-upload.enabled:false}") boolean uploadEnabled
    ) {
        this(repository, auditRepository, readService, validator, storage, objectMapper,
                new TransactionTemplate(transactionManager), Clock.system(DATABASE_ZONE),
                reservationMinutes, uploadEnabled);
    }

    public AdminEventImageUploadService(
            AdminEventImageRepository repository,
            AdminEventMutationRepository auditRepository,
            AdminEventReadService readService,
            EventImageValidator validator,
            EventImageStorage storage,
            ObjectMapper objectMapper,
            PlatformTransactionManager transactionManager,
            int reservationMinutes
    ) {
        this(repository, auditRepository, readService, validator, storage, objectMapper,
                new TransactionTemplate(transactionManager), Clock.system(DATABASE_ZONE),
                reservationMinutes, true);
    }

    AdminEventImageUploadService(
            AdminEventImageRepository repository,
            AdminEventMutationRepository auditRepository,
            AdminEventReadService readService,
            EventImageValidator validator,
            EventImageStorage storage,
            ObjectMapper objectMapper,
            TransactionTemplate transactions,
            Clock clock,
            int reservationMinutes
    ) {
        this(repository, auditRepository, readService, validator, storage, objectMapper,
                transactions, clock, reservationMinutes, true);
    }

    AdminEventImageUploadService(
            AdminEventImageRepository repository,
            AdminEventMutationRepository auditRepository,
            AdminEventReadService readService,
            EventImageValidator validator,
            EventImageStorage storage,
            ObjectMapper objectMapper,
            TransactionTemplate transactions,
            Clock clock,
            int reservationMinutes,
            boolean uploadEnabled
    ) {
        this.repository = repository;
        this.auditRepository = auditRepository;
        this.readService = readService;
        this.validator = validator;
        this.storage = storage;
        this.objectMapper = objectMapper;
        this.transactions = transactions;
        this.clock = clock;
        this.reservationMinutes = Math.max(2, Math.min(reservationMinutes, 60));
        this.uploadEnabled = uploadEnabled;
    }

    public AdminEventImageDtos.Capability capability() {
        boolean storageAvailable = storage.available();
        return new AdminEventImageDtos.Capability(
                uploadEnabled,
                storageAvailable,
                uploadEnabled && storageAvailable,
                EventImageValidator.MAX_BYTES,
                EventImageValidator.MAX_DIMENSION,
                EventImageValidator.MAX_PIXELS,
                MAX_ACTIVE_RESERVATIONS,
                List.of("jpeg", "png", "webp"));
    }

    public AdminEventImageDtos.UploadResponse upload(
            String eventId,
            MultipartFile file,
            String expectedUpdatedAt,
            String kindValue,
            String altText,
            String caption,
            String sourceName,
            String license,
            UserPrincipal principal
    ) {
        if (!uploadEnabled || !storage.available()) {
            throw new ApiException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "EVENT_IMAGE_UPLOAD_UNAVAILABLE",
                    "Managed event image upload is unavailable");
        }
        AdminEventImageNaming.Kind kind = parseKind(kindValue);
        LocalDateTime expected = parseVersion(expectedUpdatedAt);
        EventImageValidator.ValidatedEventImage image =
                validator.validate(file, altText, caption, sourceName, license);
        requireActor(principal);

        UUID assetId = UUID.randomUUID();
        String publicId = AdminEventImageNaming.publicId(eventId, kind, assetId);
        String uploadToken = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), DATABASE_ZONE);
        LocalDateTime expiresAt = now.plusMinutes(reservationMinutes);
        UploadReservation reservation = transactions.execute(status -> {
            var event = lockExactEvent(eventId, expected);
            if (repository.countMediaAndReservations(eventId)
                    >= AdminEventMediaMutationService.MAX_MEDIA_PER_EVENT) {
                bad("EVENT_MEDIA_LIMIT_REACHED");
            }
            if (repository.countActiveReservations(eventId) >= MAX_ACTIVE_RESERVATIONS) {
                throw new ApiException(
                        HttpStatus.CONFLICT,
                        "EVENT_IMAGE_RESERVATION_LIMIT_REACHED",
                        "Too many image uploads are already in progress");
            }
            int sort = repository.nextSortOrder(eventId);
            long mediaId = repository.insertReservation(new AdminEventImageRepository.Reservation(
                    eventId, assetId.toString(), publicId, uploadToken, principal.idBytes(),
                    sort, now, expiresAt, image));
            repository.armCleanup(publicId, expiresAt);
            return new UploadReservation(
                    mediaId, assetId.toString(), publicId, uploadToken, sort);
        });

        EventImageStorage.StoredImage stored;
        try {
            stored = storage.upload(new EventImageStorage.UploadCommand(
                    image.bytes(), publicId, image.mimeType(),
                    ownershipTags(eventId, kind), ownershipContext(eventId, assetId.toString(), kind)));
        } catch (EventImageStorage.EventImageStorageException exception) {
            HttpStatus status = "EVENT_IMAGE_UPLOAD_UNAVAILABLE".equals(exception.code())
                    ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;
            throw new ApiException(status, exception.code(), "Event image upload failed");
        }

        try {
            return transactions.execute(status -> finalizeUpload(
                    eventId, expectedUpdatedAt, expected, kind, image,
                    reservation, stored, principal));
        } catch (ApiException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "EVENT_IMAGE_FINALIZE_FAILED",
                    "The uploaded image could not be attached to the event");
        }
    }

    public Optional<AdminEventDtos.Detail> removeManagedIfPresent(
            String eventId,
            long mediaId,
            String expectedUpdatedAt,
            UserPrincipal principal
    ) {
        var existing = repository.findManagedMedia(mediaId);
        if (existing == null) {
            return Optional.empty();
        }
        LocalDateTime expected = parseVersion(expectedUpdatedAt);
        requireActor(principal);
        return Optional.ofNullable(transactions.execute(status -> {
            // Bounded within-transaction snapshot used by the diff-based guard
            // so a managed image removal cannot regress a legacy published
            // event by introducing a NEW ERROR that did not exist before.
            AdminEventDtos.Detail snapshot = readService.findEvent(eventId);
            lockExactEvent(eventId, expected);
            var locked = repository.lockReservation(mediaId);
            if (locked == null) {
                throw mediaNotFound();
            }
            if (!eventId.equals(locked.eventId())) {
                bad("EVENT_MEDIA_OWNERSHIP_MISMATCH");
            }
            if (!"READY".equals(locked.storageState())) {
                throw new ApiException(
                        HttpStatus.CONFLICT,
                        "EVENT_IMAGE_DELETE_IN_PROGRESS",
                        "Managed image deletion is already in progress");
            }
            if (!repository.bumpEventVersion(eventId, expected)) {
                throw conflict();
            }
            repository.markDeletePending(mediaId);
            normalizeOrder(eventId);
            repository.armCleanup(locked.publicId(),
                    LocalDateTime.ofInstant(clock.instant(), DATABASE_ZONE));
            AdminEventDtos.Detail detail = readService.findEventAfterMutation(eventId, snapshot);
            auditRepository.audit(
                    principal.idBytes(),
                    "event.managed_image_delete_requested",
                    eventId,
                    json(Map.of(
                            "mediaId", mediaId,
                            "expectedVersion", expectedUpdatedAt)),
                    json(Map.of(
                            "mediaId", mediaId,
                            "storageIdentityDigest", identityDigest(locked.publicId()),
                            "resultingVersion", version(detail))));
            return detail;
        }));
    }

    public AdminEventImageDtos.ReplacementResponse replace(
            String eventId,
            long mediaId,
            MultipartFile file,
            String expectedUpdatedAt,
            String altText,
            String caption,
            String sourceName,
            String license,
            UserPrincipal principal
    ) {
        if (!uploadEnabled || !storage.available()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "EVENT_IMAGE_UPLOAD_UNAVAILABLE", "Managed event image upload is unavailable");
        }
        LocalDateTime expected = parseVersion(expectedUpdatedAt);
        requireActor(principal);
        String validationAlt = altText == null ? "managed image" : altText;
        EventImageValidator.ValidatedEventImage image =
                validator.validate(file, validationAlt, caption, sourceName, license);

        ReplacementTarget preflight = transactions.execute(status ->
                lockReplacementTarget(eventId, mediaId, expected));
        UUID newAssetId = UUID.randomUUID();
        AdminEventImageNaming.Kind kind = preflight.thumbnail()
                ? AdminEventImageNaming.Kind.THUMBNAIL : AdminEventImageNaming.Kind.GALLERY;
        String publicId = AdminEventImageNaming.publicId(eventId, kind, newAssetId);
        EventImageStorage.StoredImage stored;
        try {
            stored = storage.upload(new EventImageStorage.UploadCommand(
                    image.bytes(), publicId, image.mimeType(),
                    ownershipTags(eventId, kind), ownershipContext(eventId, newAssetId.toString(), kind)));
        } catch (EventImageStorage.EventImageStorageException exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, exception.code(), "Event image upload failed");
        } catch (RuntimeException exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "EVENT_IMAGE_UPLOAD_FAILED", "Event image upload failed");
        }
        try {
            validateStored(publicId, image, stored);
        } catch (RuntimeException validationFailure) {
            if (!enqueueReplacementCompensation(mediaId, newAssetId.toString(), stored)) {
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "EVENT_IMAGE_REPLACEMENT_COMPENSATION_FAILED",
                        "The uploaded replacement image needs operator reconciliation");
            }
            if (validationFailure instanceof ApiException apiException) {
                throw apiException;
            }
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "EVENT_IMAGE_PROVIDER_RESPONSE_INVALID", "Event image upload failed");
        }

        try {
            return transactions.execute(status -> finalizeReplacement(
                    eventId, mediaId, expectedUpdatedAt, expected, image, newAssetId.toString(),
                    stored, altText, caption, sourceName, license, principal));
        } catch (RuntimeException failure) {
            if (!enqueueReplacementCompensation(mediaId, newAssetId.toString(), stored)) {
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "EVENT_IMAGE_REPLACEMENT_COMPENSATION_FAILED",
                        "The uploaded replacement image needs operator reconciliation");
            }
            if (failure instanceof ApiException apiException) {
                throw apiException;
            }
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "EVENT_IMAGE_REPLACEMENT_PERSISTENCE_FAILED",
                    "The replacement image could not be attached to the event");
        }
    }

    AdminEventImageDtos.UploadResponse finalizeUpload(
            String eventId,
            String expectedUpdatedAt,
            LocalDateTime expected,
            AdminEventImageNaming.Kind kind,
            EventImageValidator.ValidatedEventImage image,
            UploadReservation reservation,
            EventImageStorage.StoredImage stored,
            UserPrincipal principal
    ) {
        // Capture the within-transaction snapshot BEFORE we touch any state.
        // The diff-based guard compares this against the post-mutation read so
        // a managed image upload cannot regress a legacy published event that
        // already has unrelated incompleteness issues.
        AdminEventDtos.Detail snapshot = readService.findEvent(eventId);
        var event = repository.lockEvent(eventId);
        if (event == null) {
            throw new ApiException(
                    HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND", "Historical event not found");
        }
        var locked = repository.lockReservation(reservation.mediaId());
        if (locked == null
                || !eventId.equals(locked.eventId())
                || !reservation.assetId().equals(locked.assetId())
                || !reservation.publicId().equals(locked.publicId())) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "EVENT_IMAGE_RESERVATION_INVALID",
                    "Image upload reservation is no longer valid");
        }
        if ("READY".equals(locked.storageState())) {
            AdminEventDtos.Detail detail = readService.findEvent(eventId);
            return response(reservation.mediaId(), detail);
        }
        if (!event.updatedAt().equals(expected)) {
            throw conflict();
        }
        if (!reservation.uploadToken().equals(locked.uploadToken())
                || !"UPLOADING".equals(locked.storageState())
                || locked.uploadExpiresAt() == null
                || locked.uploadExpiresAt().isBefore(
                LocalDateTime.ofInstant(clock.instant(), DATABASE_ZONE))) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "EVENT_IMAGE_RESERVATION_EXPIRED",
                    "Image upload reservation expired");
        }
        if (!reservation.publicId().equals(stored.publicId())
                || !image.format().equalsIgnoreCase(stored.format())
                || stored.width() != image.width()
                || stored.height() != image.height()) {
            throw new ApiException(
                    HttpStatus.BAD_GATEWAY,
                    "EVENT_IMAGE_PROVIDER_RESPONSE_INVALID",
                    "Image storage returned inconsistent metadata");
        }
        boolean thumbnail = kind == AdminEventImageNaming.Kind.THUMBNAIL;
        if (!repository.bumpEventVersion(eventId, event.updatedAt())) {
            throw conflict();
        }
        if (thumbnail) {
            repository.clearThumbnails(eventId);
        }
        String deliveryUrl = storage.deliveryUrl(new EventImageStorage.DeliveryCommand(
                stored.publicId(),
                stored.providerVersion(),
                thumbnail
                        ? EventImageStorage.DeliveryKind.THUMBNAIL
                        : EventImageStorage.DeliveryKind.GALLERY));
        if (deliveryUrl == null) {
            throw new ApiException(
                    HttpStatus.BAD_GATEWAY,
                    "EVENT_IMAGE_PROVIDER_RESPONSE_INVALID",
                    "Image delivery URL could not be generated");
        }
        repository.finalizeReservation(
                reservation.mediaId(), stored, deliveryUrl, thumbnail,
                thumbnail ? 0 : reservation.sortOrder());
        if (thumbnail) {
            normalizeOrder(eventId);
        }
        AdminEventDtos.Detail detail = readService.findEventAfterMutation(eventId, snapshot);
        auditRepository.audit(
                principal.idBytes(),
                thumbnail ? "event.thumbnail_uploaded" : "event.media_image_uploaded",
                eventId,
                json(Map.of(
                        "kind", kind.name().toLowerCase(),
                        "expectedVersion", expectedUpdatedAt)),
                json(Map.of(
                        "mediaId", reservation.mediaId(),
                        "kind", kind.name().toLowerCase(),
                        "format", image.format(),
                        "mimeType", image.mimeType(),
                        "bytes", image.byteSize(),
                        "width", image.width(),
                        "height", image.height(),
                        "storageIdentityDigest", identityDigest(reservation.publicId()),
                        "resultingVersion", version(detail))));
        repository.completeCleanup(reservation.publicId());
        return response(reservation.mediaId(), detail);
    }

    private AdminEventImageDtos.ReplacementResponse finalizeReplacement(
            String eventId,
            long mediaId,
            String expectedUpdatedAt,
            LocalDateTime expected,
            EventImageValidator.ValidatedEventImage image,
            String newAssetId,
            EventImageStorage.StoredImage stored,
            String altText,
            String caption,
            String sourceName,
            String license,
            UserPrincipal principal
    ) {
        // Capture a within-transaction snapshot BEFORE any replacement mutes
        // the row; the diff-based guard compares this against the post-mutation
        // read. Managed image replacement cannot introduce a new sibling row,
        // so the snapshot is intentionally taken before `lockReplacementTarget`
        // to capture the original classification state.
        AdminEventDtos.Detail snapshot = readService.findEvent(eventId);
        ReplacementTarget old = lockReplacementTarget(eventId, mediaId, expected);
        validateStored(stored.publicId(), image, stored);
        String deliveryUrl = storage.deliveryUrl(new EventImageStorage.DeliveryCommand(
                stored.publicId(), stored.providerVersion(), old.thumbnail()
                        ? EventImageStorage.DeliveryKind.THUMBNAIL
                        : EventImageStorage.DeliveryKind.GALLERY));
        if (deliveryUrl == null) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "EVENT_IMAGE_PROVIDER_RESPONSE_INVALID", "Image delivery URL could not be generated");
        }
        if (!repository.bumpEventVersion(eventId, expected)) {
            throw conflict();
        }
        var metadata = new AdminEventImageRepository.ReplacementMetadata(
                caption == null ? old.caption() : trim(caption),
                altText == null ? old.altText() : trim(altText),
                sourceName == null ? old.sourceName() : trim(sourceName),
                license == null ? old.license() : trim(license));
        if (metadata.altText() == null || metadata.altText().codePoints().noneMatch(Character::isLetterOrDigit)) {
            bad("EVENT_IMAGE_ALT_TEXT_REQUIRED");
        }
        repository.replaceManagedStorage(old.row(), newAssetId, stored, deliveryUrl, image,
                principal.idBytes(), metadata);
        repository.armCleanup(old.publicId(), old.providerAssetId(), now());
        AdminEventDtos.Detail detail = readService.findEventAfterMutation(eventId, snapshot);
        auditRepository.audit(principal.idBytes(), "event.managed_image_replaced", eventId,
                json(Map.of("mediaId", mediaId, "expectedVersion", expectedUpdatedAt)),
                json(Map.of(
                        "mediaId", mediaId,
                        "oldManagedAssetId", old.managedAssetId(),
                        "newManagedAssetId", newAssetId,
                        "oldStorageIdentityDigest", identityDigest(old.publicId()),
                        "newStorageIdentityDigest", identityDigest(stored.publicId()),
                        "thumbnailPreserved", old.thumbnail(),
                        "resultingVersion", version(detail))));
        auditRepository.audit(principal.idBytes(), "event.managed_image_cleanup_enqueued", eventId,
                json(Map.of("mediaId", mediaId, "operation", "DELETE")),
                json(Map.of("oldManagedAssetId", old.managedAssetId(),
                        "storageIdentityDigest", identityDigest(old.publicId()), "result", "PENDING")));
        return new AdminEventImageDtos.ReplacementResponse(mediaId, version(detail), detail);
    }

    private ReplacementTarget lockReplacementTarget(String eventId, long mediaId, LocalDateTime expected) {
        lockExactEvent(eventId, expected);
        var row = repository.lockReplacementMedia(mediaId);
        if (row == null) {
            throw mediaNotFound();
        }
        if (!eventId.equals(row.eventId())) {
            bad("EVENT_MEDIA_OWNERSHIP_MISMATCH");
        }
        if (row.managedAssetId() == null || row.provider() == null || row.publicId() == null
                || "UNMANAGED".equals(row.storageState())) {
            throw new ApiException(HttpStatus.CONFLICT, "EVENT_MEDIA_NOT_MANAGED",
                    "Only a ready managed image can be replaced");
        }
        if (!"READY".equals(row.storageState()) || !"cloudinary".equals(row.provider())) {
            throw new ApiException(HttpStatus.CONFLICT, "EVENT_IMAGE_REPLACEMENT_IN_PROGRESS",
                    "Managed image is not ready for replacement");
        }
        return new ReplacementTarget(row);
    }

    private boolean enqueueReplacementCompensation(
            long mediaId, String newAssetId, EventImageStorage.StoredImage stored
    ) {
        try {
            transactions.executeWithoutResult(status ->
                    repository.armCleanup(stored.publicId(), stored.providerAssetId(), now()));
            return true;
        } catch (RuntimeException compensationFailure) {
            log.error("Managed image replacement compensation enqueue failed mediaId={} assetId={} publicId={}",
                    mediaId, newAssetId, stored.publicId());
            return false;
        }
    }

    private void validateStored(
            String expectedPublicId,
            EventImageValidator.ValidatedEventImage image,
            EventImageStorage.StoredImage stored
    ) {
        if (!expectedPublicId.equals(stored.publicId())
                || !image.format().equalsIgnoreCase(stored.format())
                || stored.width() != image.width()
                || stored.height() != image.height()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "EVENT_IMAGE_PROVIDER_RESPONSE_INVALID",
                    "Image storage returned inconsistent metadata");
        }
    }

    private List<String> ownershipTags(String eventId, AdminEventImageNaming.Kind kind) {
        return List.of("lsvn3d", "managed-event-media", "event-" + eventId,
                "role-" + kind.name().toLowerCase());
    }

    private Map<String, String> ownershipContext(
            String eventId, String assetId, AdminEventImageNaming.Kind kind
    ) {
        return Map.of(
                "managed_asset_id", assetId,
                "event_id", eventId,
                "media_role", kind.name().toLowerCase(),
                "source", "lsvn3d");
    }

    private LocalDateTime now() {
        return LocalDateTime.ofInstant(clock.instant(), DATABASE_ZONE);
    }

    private String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private AdminEventImageRepository.EventLock lockExactEvent(
            String eventId,
            LocalDateTime expected
    ) {
        var event = repository.lockEvent(eventId);
        if (event == null) {
            throw new ApiException(
                    HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND", "Historical event not found");
        }
        if (!event.updatedAt().equals(expected)) {
            throw conflict();
        }
        return event;
    }

    private void normalizeOrder(String eventId) {
        var ids = repository.visibleMediaIds(eventId);
        for (int index = 0; index < ids.size(); index++) {
            repository.updateOrder(ids.get(index), index);
        }
    }

    private AdminEventImageDtos.UploadResponse response(
            long mediaId,
            AdminEventDtos.Detail detail
    ) {
        return new AdminEventImageDtos.UploadResponse(
                mediaId, version(detail), detail);
    }

    private AdminEventImageNaming.Kind parseKind(String value) {
        return switch (value == null ? "" : value.trim().toLowerCase()) {
            case "thumbnail" -> AdminEventImageNaming.Kind.THUMBNAIL;
            case "gallery" -> AdminEventImageNaming.Kind.GALLERY;
            default -> throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "EVENT_IMAGE_KIND_INVALID",
                    "Image kind must be thumbnail or gallery");
        };
    }

    private LocalDateTime parseVersion(String value) {
        try {
            if (value == null
                    || !value.matches(
                    "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z")) {
                throw new IllegalArgumentException();
            }
            return LocalDateTime.ofInstant(
                    Instant.from(VERSION_FORMATTER.parse(value)), DATABASE_ZONE);
        } catch (Exception exception) {
            bad("INVALID_EXPECTED_VERSION");
            return null;
        }
    }

    private void requireActor(UserPrincipal principal) {
        if (principal == null || principal.idBytes() == null
                || principal.idBytes().length != 16) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN, "FORBIDDEN", "Admin actor is required");
        }
    }

    private String version(AdminEventDtos.Detail detail) {
        return VERSION_FORMATTER.format(detail.publication().updatedAt());
    }

    private String identityDigest(String publicId) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256")
                            .digest(publicId.getBytes(StandardCharsets.UTF_8)),
                    0,
                    12);
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Audit metadata serialization failed", exception);
        }
    }

    private ApiException conflict() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "EVENT_UPDATE_CONFLICT",
                "The event changed after it was loaded");
    }

    private ApiException mediaNotFound() {
        return new ApiException(
                HttpStatus.NOT_FOUND,
                "EVENT_MEDIA_NOT_FOUND",
                "Media not found");
    }

    private void bad(String code) {
        throw new ApiException(
                HttpStatus.BAD_REQUEST, code, "Invalid event image upload request");
    }

    static record UploadReservation(
            long mediaId,
            String assetId,
            String publicId,
            String uploadToken,
            int sortOrder
    ) {
    }

    private record ReplacementTarget(AdminEventImageRepository.ReplacementMedia row) {
        String managedAssetId() { return row.managedAssetId(); }
        String publicId() { return row.publicId(); }
        String providerAssetId() { return row.providerAssetId(); }
        String caption() { return row.caption(); }
        String altText() { return row.altText(); }
        String sourceName() { return row.sourceName(); }
        String license() { return row.license(); }
        boolean thumbnail() { return row.thumbnail(); }
    }
}

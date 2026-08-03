package com.lichsuvn.backend.common.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GlobalExceptionHandlerTest {
    @Test
    void multipartLimitUsesStableEventImage413Envelope() {
        var request = new MockHttpServletRequest();
        request.setRequestURI("/api/admin/events/event-1/media/images");

        var response = new GlobalExceptionHandler().handleMultipartTooLarge(
                new MaxUploadSizeExceededException(10L * 1024 * 1024),
                request);

        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, response.getStatusCode());
        assertEquals("EVENT_IMAGE_PAYLOAD_TOO_LARGE",
                response.getBody().code());
        assertEquals("/api/admin/events/event-1/media/images",
                response.getBody().data().path());
    }
}

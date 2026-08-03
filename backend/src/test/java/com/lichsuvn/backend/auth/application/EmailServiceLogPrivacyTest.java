package com.lichsuvn.backend.auth.application;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

@ExtendWith(OutputCaptureExtension.class)
class EmailServiceLogPrivacyTest {
    private static final String EMAIL_SENTINEL = "phase11-private@example.invalid";
    private static final String TOKEN_SENTINEL = "phase11-reset-token-sentinel";

    @Test
    void disabledMailLogsOnlyBoundedOperationName(CapturedOutput output) {
        EmailService service = new EmailService(mock(JavaMailSender.class), false, "");

        service.sendVerificationEmail(
                EMAIL_SENTINEL,
                "http://localhost/verify-email?token=" + TOKEN_SENTINEL,
                15);
        service.sendPasswordResetEmail(
                EMAIL_SENTINEL,
                "http://localhost/reset-password?token=" + TOKEN_SENTINEL);

        String logs = output.getAll();
        assertTrue(logs.contains("operation=verification"));
        assertTrue(logs.contains("operation=password_reset"));
        assertFalse(logs.contains(EMAIL_SENTINEL));
        assertFalse(logs.contains(TOKEN_SENTINEL));
        assertFalse(logs.contains("verify-email?token"));
        assertFalse(logs.contains("reset-password?token"));
    }

    @Test
    void mailFailureDoesNotLogExceptionMessageRecipientOrLink(CapturedOutput output) {
        JavaMailSender sender = mock(JavaMailSender.class);
        MimeMessage message = new MimeMessage(Session.getInstance(new Properties()));
        when(sender.createMimeMessage()).thenReturn(message);
        doThrow(new MailSendException(
                "delivery failed for " + EMAIL_SENTINEL + " token=" + TOKEN_SENTINEL))
                .when(sender).send(message);
        EmailService service = new EmailService(sender, true, "noreply@example.invalid");

        assertThrows(
                com.lichsuvn.backend.common.exception.ApiException.class,
                () -> service.sendVerificationEmail(
                        EMAIL_SENTINEL,
                        "http://localhost/verify-email?token=" + TOKEN_SENTINEL,
                        15));

        String logs = output.getAll();
        assertTrue(logs.contains("operation=verification"));
        assertTrue(logs.contains("errorType=MailSendException"));
        assertFalse(logs.contains(EMAIL_SENTINEL));
        assertFalse(logs.contains(TOKEN_SENTINEL));
        assertFalse(logs.contains("verify-email?token"));
    }
}

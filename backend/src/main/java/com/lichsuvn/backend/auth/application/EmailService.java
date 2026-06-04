package com.lichsuvn.backend.auth.application;

import com.lichsuvn.backend.common.exception.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class EmailService {
    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;
    private final boolean mailEnabled;
    private final String fromAddress;

    public EmailService(
            JavaMailSender mailSender,
            @Value("${app.mail.enabled:false}") boolean mailEnabled,
            @Value("${spring.mail.username:}") String fromAddress) {
        this.mailSender = mailSender;
        this.mailEnabled = mailEnabled;
        this.fromAddress = fromAddress;
    }

    public void sendVerificationEmail(String to, String link, long ttlMinutes) {
        String subject = "Xác minh tài khoản Lịch Sử Việt Nam 3D";
        String body = """
                Chào bạn,

                Cảm ơn bạn đã đăng ký Lịch Sử Việt Nam 3D.
                Vui lòng mở link bên dưới để xác minh tài khoản trong %d phút:

                %s

                Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.
                """.formatted(ttlMinutes, link);
        sendOrLog(to, subject, body, link, true);
    }

    public boolean isMailEnabled() {
        return mailEnabled;
    }

    public void sendPasswordResetEmail(String to, String link) {
        String subject = "Đặt lại mật khẩu Lịch Sử Việt Nam 3D";
        String body = """
                Chào bạn,

                Vui lòng mở link bên dưới để đặt lại mật khẩu:

                %s

                Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.
                """.formatted(link);
        sendOrLog(to, subject, body, link, false);
    }

    private void sendOrLog(String to, String subject, String body, String devLink, boolean failHard) {
        if (!mailEnabled) {
            log.info("Mail disabled; dev link for {}: {}", to, devLink);
            return;
        }
        if (!StringUtils.hasText(fromAddress)) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "MAIL_NOT_CONFIGURED",
                    "Mail sender is not configured");
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromAddress);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
        } catch (MailException ex) {
            log.error("Failed to send auth email to {}", to, ex);
            if (failHard) {
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "EMAIL_SEND_FAILED",
                        "Could not send verification email");
            }
        }
    }
}

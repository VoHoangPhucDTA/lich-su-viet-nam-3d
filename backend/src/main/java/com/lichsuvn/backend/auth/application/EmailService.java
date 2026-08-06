package com.lichsuvn.backend.auth.application;

import com.lichsuvn.backend.common.exception.ApiException;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class EmailService {
    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private static final String SYSTEM_NAME = "Lịch Sử Việt Nam 3D";
    private static final String SUPPORT_EMAIL = "lichsuvn3d@gmail.com";

    private static final String VERIFICATION_ICON_SVG =
        "<svg width=\"56\" height=\"56\" viewBox=\"0 0 56 56\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">"
        + "<rect x=\"4\" y=\"4\" width=\"48\" height=\"48\" rx=\"24\" fill=\"#f0e6d3\"/>"
        + "<rect x=\"4\" y=\"4\" width=\"48\" height=\"48\" rx=\"24\" stroke=\"#c9a84c\" stroke-width=\"2\" opacity=\"0.4\"/>"
        + "<path d=\"M28 16L28 28L36 32\" stroke=\"#c9a84c\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
        + "<circle cx=\"28\" cy=\"28\" r=\"12\" stroke=\"#c9a84c\" stroke-width=\"2\" fill=\"none\"/>"
        + "</svg>";

    private static final String PASSWORD_RESET_ICON_SVG =
        "<svg width=\"56\" height=\"56\" viewBox=\"0 0 56 56\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">"
        + "<rect x=\"4\" y=\"4\" width=\"48\" height=\"48\" rx=\"24\" fill=\"#f0e6d3\"/>"
        + "<rect x=\"4\" y=\"4\" width=\"48\" height=\"48\" rx=\"24\" stroke=\"#c9a84c\" stroke-width=\"2\" opacity=\"0.4\"/>"
        + "<rect x=\"20\" y=\"24\" width=\"16\" height=\"12\" rx=\"2\" stroke=\"#c9a84c\" stroke-width=\"2\" fill=\"none\"/>"
        + "<path d=\"M24 24V20C24 17.79 25.79 16 28 16C30.21 16 32 17.79 32 20V24\" stroke=\"#c9a84c\" stroke-width=\"2\" stroke-linecap=\"round\"/>"
        + "<circle cx=\"28\" cy=\"30\" r=\"1.5\" fill=\"#c9a84c\"/>"
        + "<path d=\"M28 34V31\" stroke=\"#c9a84c\" stroke-width=\"2\" stroke-linecap=\"round\"/>"
        + "</svg>";

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

    // ── Public API ────────────────────────────────────────────────────────

    public void sendVerificationEmail(String to, String link, long ttlMinutes) {
        String subject = "Xác thực tài khoản " + SYSTEM_NAME;
        String html = buildVerificationHtml(link, ttlMinutes);
        sendOrLog(to, subject, html, "verification", true);
    }

    public void sendPasswordResetEmail(String to, String link) {
        String subject = "Đặt lại mật khẩu " + SYSTEM_NAME;
        String html = buildPasswordResetHtml(link);
        sendOrLog(to, subject, html, "password_reset", false);
    }

    public boolean isMailEnabled() {
        return mailEnabled;
    }

    // ── HTML Template Builder ─────────────────────────────────────────────

    private String buildVerificationHtml(String link, long ttlMinutes) {
        String iconArea = "<div style=\"text-align: center; margin-bottom: 20px;\">"
                + VERIFICATION_ICON_SVG + "</div>";

        String heading = "<h1 style=\"margin: 0 0 10px 0; font-size: 22px; font-weight: 700; color: #2c211d;"
                + " font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
                + " text-align: center;\">"
                + "Xác thực tài khoản của bạn</h1>";

        String body = "<div style=\"margin-bottom: 28px; text-align: center;\">"
                + "<p style=\"margin: 0 0 6px 0; font-size: 16px; color: #655b54; line-height: 1.7;\">"
                + "Cảm ơn bạn đã đăng ký <strong style=\"color: #2c211d;\">" + SYSTEM_NAME + "</strong>.</p>"
                + "<p style=\"margin: 0; font-size: 16px; color: #655b54; line-height: 1.7;\">"
                + "Vui lòng nhấp vào nút bên dưới để xác thực địa chỉ email và hoàn tất đăng ký.</p>"
                + "</div>";

        String button = "<div style=\"text-align: center; margin-bottom: 28px;\">"
                + "<a href=\"" + link + "\""
                + " style=\"display: inline-block; padding: 14px 36px; background: #8b1e1e; color: #fffaf0;"
                + " text-decoration: none; font-size: 16px; font-weight: 700; border-radius: 8px;"
                + " box-shadow: 0 4px 14px rgba(139, 30, 30, 0.24);\">"
                + "Xác thực tài khoản</a></div>";

        String fallback = "<div style=\"margin-bottom: 24px; padding: 16px; background: #fbf7f0; border-radius: 8px;"
                + " border: 1px solid #eadfce; text-align: left;\">"
                + "<p style=\"margin: 0 0 6px 0; font-size: 13px; color: #756b63; font-weight: 500;\">"
                + "Nếu nút trên không hoạt động, hãy sao chép liên kết sau vào trình duyệt:</p>"
                + "<p style=\"margin: 0; font-size: 12px; color: #8b1e1e; word-break: break-all;"
                + " font-family: 'Courier New', monospace;\">" + link + "</p></div>";

        String expiry = "<div style=\"margin-bottom: 4px; padding: 14px 16px; background: #fff8e7; border-radius: 8px;"
                + " border: 1px solid #e5c979; text-align: left;\">"
                + "<p style=\"margin: 0; font-size: 13px; color: #76531f; line-height: 1.5;\">"
                + "<strong>Lưu ý:</strong> Liên kết này có hiệu lực trong <strong>" + ttlMinutes + " phút</strong>."
                + " Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p></div>";

        String content = iconArea + heading + body + button + fallback + expiry;
        return wrapInTemplate(content);
    }

    private String buildPasswordResetHtml(String link) {
        String iconArea = "<div style=\"text-align: center; margin-bottom: 20px;\">"
                + PASSWORD_RESET_ICON_SVG + "</div>";

        String heading = "<h1 style=\"margin: 0 0 10px 0; font-size: 22px; font-weight: 700; color: #2c211d;"
                + " font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
                + " text-align: center;\">"
                + "Đặt lại mật khẩu</h1>";

        String body = "<div style=\"margin-bottom: 28px; text-align: center;\">"
                + "<p style=\"margin: 0 0 6px 0; font-size: 16px; color: #655b54; line-height: 1.7;\">"
                + "Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản "
                + "<strong style=\"color: #2c211d;\">" + SYSTEM_NAME + "</strong>.</p>"
                + "<p style=\"margin: 0; font-size: 16px; color: #655b54; line-height: 1.7;\">"
                + "Nhấp vào nút bên dưới để tạo mật khẩu mới.</p></div>";

        String button = "<div style=\"text-align: center; margin-bottom: 28px;\">"
                + "<a href=\"" + link + "\""
                + " style=\"display: inline-block; padding: 14px 36px; background: #8b1e1e; color: #fffaf0;"
                + " text-decoration: none; font-size: 16px; font-weight: 700; border-radius: 8px;"
                + " box-shadow: 0 4px 14px rgba(139, 30, 30, 0.24);\">"
                + "Đặt lại mật khẩu</a></div>";

        String fallback = "<div style=\"margin-bottom: 24px; padding: 16px; background: #fbf7f0; border-radius: 8px;"
                + " border: 1px solid #eadfce; text-align: left;\">"
                + "<p style=\"margin: 0 0 6px 0; font-size: 13px; color: #756b63; font-weight: 500;\">"
                + "Nếu nút trên không hoạt động, hãy sao chép liên kết sau vào trình duyệt:</p>"
                + "<p style=\"margin: 0; font-size: 12px; color: #8b1e1e; word-break: break-all;"
                + " font-family: 'Courier New', monospace;\">" + link + "</p></div>";

        String expiry = "<div style=\"margin-bottom: 4px; padding: 14px 16px; background: #fff8e7; border-radius: 8px;"
                + " border: 1px solid #e5c979; text-align: left;\">"
                + "<p style=\"margin: 0; font-size: 13px; color: #76531f; line-height: 1.5;\">"
                + "<strong>Lưu ý:</strong> Liên kết này có hiệu lực trong <strong>30 phút</strong>."
                + " Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p></div>";

        String content = iconArea + heading + body + button + fallback + expiry;
        return wrapInTemplate(content);
    }

    private String wrapInTemplate(String content) {
        return "<!DOCTYPE html>\n"
                + "<html lang=\"vi\">\n"
                + "<head>\n"
                + "<meta charset=\"UTF-8\"/>\n"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>\n"
                + "<meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\"/>\n"
                + "<title>" + SYSTEM_NAME + "</title>\n"
                + "</head>\n"
                + "<body style=\"margin:0;padding:0;background:#f7f2e9;"
                + "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;\">\n"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\""
                + " style=\"background:#f7f2e9;min-width:100%;\">\n"
                + "<tr><td align=\"center\" style=\"padding:40px 16px;\">\n"

                // Header
                + "<table role=\"presentation\" width=\"100%\""
                + " style=\"max-width:600px;min-width:280px;\">\n"
                + "<tr><td align=\"center\""
                + " style=\"padding:28px 20px 22px;"
                + "background:linear-gradient(135deg,#8b1e1e 0%,#6f1818 55%,#561212 100%);"
                + "border:1px solid #d8b968;border-bottom:0;border-radius:16px 16px 0 0;\">\n"
                + "<svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\""
                + " xmlns=\"http://www.w3.org/2000/svg\" style=\"vertical-align:middle;\">\n"
                + "<path d=\"M4 19.5V4.5C4 3.12 5.12 2 6.5 2H20V20H6.5C5.12 20 4 18.88 4 17.5V4.5\""
                + " stroke=\"#c9a84c\" stroke-width=\"1.5\" stroke-linecap=\"round\""
                + " stroke-linejoin=\"round\" fill=\"none\"/>\n"
                + "<path d=\"M8 7H16\" stroke=\"#c9a84c\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n"
                + "<path d=\"M8 10.5H14\" stroke=\"#c9a84c\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n"
                + "</svg>\n"
                + "<span style=\"font-size:20px;font-weight:700;color:#fffaf0;"
                + "letter-spacing:0.5px;vertical-align:middle;margin-left:10px;\">"
                + SYSTEM_NAME + "</span>\n"
                + "</td></tr>\n"

                // Main content card
                + "<tr><td style=\"background:#fffdf8;padding:40px 32px;"
                + "border-left:1px solid #eadfce;border-right:1px solid #eadfce;\">\n"
                + content + "\n"
                + "</td></tr>\n"

                // Footer
                + "<tr><td style=\"background:linear-gradient(135deg,#6f1818 0%,#561212 100%);"
                + "padding:24px 32px;border:1px solid #d8b968;border-top:0;border-radius:0 0 16px 16px;text-align:center;\">\n"
                + "<p style=\"margin:0 0 8px 0;font-size:13px;color:#eadfce;line-height:1.6;\">"
                + "&copy; 2026 " + SYSTEM_NAME + ". Bản quyền thuộc về nhóm phát triển.<br/>\n"
                + "Đây là email tự động, vui lòng không trả lời.</p>\n"
                + "<p style=\"margin:0;font-size:12px;color:#d8c9b7;\">"
                + "Liên hệ: <a href=\"mailto:" + SUPPORT_EMAIL + "\""
                + " style=\"color:#c9a84c;text-decoration:none;\">" + SUPPORT_EMAIL + "</a></p>\n"
                + "</td></tr>\n"
                + "</table>\n"

                // Postscript
                + "<table role=\"presentation\" width=\"100%\""
                + " style=\"max-width:600px;min-width:280px;margin-top:16px;\">\n"
                + "<tr><td align=\"center\" style=\"padding:0 20px;\">\n"
                + "<p style=\"margin:0;font-size:11px;color:#8a7d72;line-height:1.5;\">"
                + "Email này được gửi tự động bởi " + SYSTEM_NAME + ". "
                + "Nếu bạn nhận được email này do nhầm lẫn, vui lòng bỏ qua.</p>\n"
                + "</td></tr>\n"
                + "</table>\n"
                + "</td></tr>\n"
                + "</table>\n"
                + "</body>\n"
                + "</html>";
    }

    // ── Sender ─────────────────────────────────────────────────────────────

    private void sendOrLog(String to, String subject, String htmlBody, String operation, boolean failHard) {
        if (!mailEnabled) {
            log.info("Mail disabled; auth email suppressed operation={}", operation);
            return;
        }
        if (!StringUtils.hasText(fromAddress)) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "MAIL_NOT_CONFIGURED",
                    "Mail sender is not configured");
        }

        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(mimeMessage);
            log.info("Auth email sent operation={}", operation);
        } catch (MailException | MessagingException ex) {
            log.error("Auth email failed operation={} errorType={}",
                    operation, ex.getClass().getSimpleName());
            if (failHard) {
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "EMAIL_SEND_FAILED",
                        "Could not send email. Please try again later.");
            }
        }
    }
}

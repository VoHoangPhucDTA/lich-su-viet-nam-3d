package com.lichsuvn.backend.auth.application;

import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Chính sách bảo mật mật khẩu áp dụng khi đăng ký và đặt lại mật khẩu.
 *
 * Yêu cầu:
 * - Tối thiểu 8 ký tự
 * - Ít nhất 1 chữ hoa (A-Z)
 * - Ít nhất 1 chữ thường (a-z)
 * - Ít nhất 1 chữ số (0-9)
 * - Ít nhất 1 ký tự đặc biệt (không phải chữ/số)
 *
 * Nếu mật khẩu không đạt yêu cầu, ném {@link ApiException} mã WEAK_PASSWORD.
 */
@Component
public class PasswordPolicy {
    public void validate(String password) {
        if (password == null
                || password.length() < 8
                || !password.matches(".*[A-Z].*")
                || !password.matches(".*[a-z].*")
                || !password.matches(".*\\d.*")
                || !password.matches(".*[^A-Za-z0-9].*")) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "WEAK_PASSWORD",
                    "Password must be at least 8 characters and include uppercase, lowercase, number, and special character"
            );
        }
    }
}

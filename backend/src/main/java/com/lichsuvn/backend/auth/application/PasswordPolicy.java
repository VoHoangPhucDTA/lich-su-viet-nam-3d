package com.lichsuvn.backend.auth.application;

import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

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

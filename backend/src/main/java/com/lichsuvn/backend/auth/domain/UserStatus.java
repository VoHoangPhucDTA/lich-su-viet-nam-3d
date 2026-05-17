package com.lichsuvn.backend.auth.domain;

/**
 * Các trạng thái hợp lệ của tài khoản người dùng (UserEntity.status).
 *
 * Sử dụng {@code UserStatus.ACTIVE.value()} thay vì hardcode chuỗi "active"
 * để tránh lỗi typo và dễ tìm kiếm trên toàn codebase.
 */
public enum UserStatus {

    /** Tài khoản vừa đăng ký, chưa xác thực email. */
    PENDING("pending"),

    /** Tài khoản đã xác thực email và có thể đăng nhập. */
    ACTIVE("active"),

    /** Tài khoản bị vô hiệu hoá bởi admin. */
    DISABLED("disabled");

    private final String value;

    UserStatus(String value) {
        this.value = value;
    }

    /** Trả về chuỗi lưu trong DB (ví dụ: "active"). */
    public String value() {
        return value;
    }

    /** Tiện ích so sánh: {@code UserStatus.ACTIVE.matches(user.getStatus())}. */
    public boolean matches(String statusValue) {
        return value.equals(statusValue);
    }
}

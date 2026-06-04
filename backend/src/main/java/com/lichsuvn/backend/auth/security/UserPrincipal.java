package com.lichsuvn.backend.auth.security;

import java.util.List;

public record UserPrincipal(
        String id,
        byte[] idBytes,
        String email,
        List<String> roles
) {
}

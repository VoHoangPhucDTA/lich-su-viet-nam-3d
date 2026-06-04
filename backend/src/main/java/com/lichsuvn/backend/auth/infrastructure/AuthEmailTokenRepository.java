package com.lichsuvn.backend.auth.infrastructure;

import com.lichsuvn.backend.auth.domain.AuthEmailTokenEntity;
import com.lichsuvn.backend.auth.domain.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AuthEmailTokenRepository extends JpaRepository<AuthEmailTokenEntity, Long> {
    Optional<AuthEmailTokenEntity> findByTokenHashAndTokenType(String tokenHash, String tokenType);

    List<AuthEmailTokenEntity> findByUserAndTokenTypeAndUsedAtIsNull(UserEntity user, String tokenType);
}

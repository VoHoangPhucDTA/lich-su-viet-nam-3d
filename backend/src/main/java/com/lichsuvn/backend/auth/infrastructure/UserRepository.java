package com.lichsuvn.backend.auth.infrastructure;

import com.lichsuvn.backend.auth.domain.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<UserEntity, byte[]> {
    Optional<UserEntity> findByEmail(String email);

    boolean existsByEmail(String email);
}

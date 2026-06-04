package com.lichsuvn.backend.auth.infrastructure;

import com.lichsuvn.backend.auth.domain.RoleEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RoleRepository extends JpaRepository<RoleEntity, Long> {
    Optional<RoleEntity> findByCode(String code);
}

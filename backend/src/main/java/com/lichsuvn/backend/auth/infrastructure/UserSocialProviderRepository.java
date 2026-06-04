package com.lichsuvn.backend.auth.infrastructure;

import com.lichsuvn.backend.auth.domain.UserSocialProviderEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserSocialProviderRepository extends JpaRepository<UserSocialProviderEntity, Long> {

    /**
     * Look up a specific social identity.
     * Used to detect Case C3: user already linked this Google/Facebook account.
     */
    Optional<UserSocialProviderEntity> findByProviderAndProviderId(String provider, String providerId);
}

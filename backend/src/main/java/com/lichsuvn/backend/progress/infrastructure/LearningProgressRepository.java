package com.lichsuvn.backend.progress.infrastructure;

import com.lichsuvn.backend.progress.domain.LearningProgressEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface LearningProgressRepository extends JpaRepository<LearningProgressEntity, Long> {
    Optional<LearningProgressEntity> findByUserIdAndScopeTypeAndScopeId(byte[] userId, String scopeType, String scopeId);

    @Modifying
    @Query(value = """
            INSERT INTO learning_progress (
                user_id, scope_type, scope_id, events_viewed, total_minutes, last_activity_at
            )
            VALUES (:userId, :scopeType, :scopeId, 1, :minutes, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
                events_viewed = events_viewed + 1,
                total_minutes = total_minutes + :minutes,
                last_activity_at = CURRENT_TIMESTAMP
            """, nativeQuery = true)
    void incrementProgress(
            @Param("userId") byte[] userId,
            @Param("scopeType") String scopeType,
            @Param("scopeId") String scopeId,
            @Param("minutes") int minutes
    );
}

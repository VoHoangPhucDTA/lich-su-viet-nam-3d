package com.lichsuvn.backend.exam.infrastructure;

import com.lichsuvn.backend.exam.domain.ExamAttemptEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExamAttemptRepository extends JpaRepository<ExamAttemptEntity, byte[]> {
    Optional<ExamAttemptEntity> findByUserIdAndSessionId(byte[] userId, String sessionId);

    List<ExamAttemptEntity> findByUserIdOrderBySubmittedAtDescCreatedAtDesc(byte[] userId, Pageable pageable);
}

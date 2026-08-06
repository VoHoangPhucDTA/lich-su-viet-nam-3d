package com.lichsuvn.backend.admin.application;

import com.lichsuvn.backend.common.exception.ApiException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.SQLException;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
import java.util.function.Supplier;

/**
 * Owns the transaction boundary for administrator account mutations. TiDB can
 * reject a concurrent shared-row write at commit, so the complete mutation is
 * retried in a fresh transaction a bounded number of times.
 */
@Component
public class AdminUserMutationTransactionRunner {
    private static final int MAX_ATTEMPTS = 3;
    private static final Set<Integer> RETRYABLE_TIDB_ERROR_CODES =
            Set.of(8002, 8022, 8028, 9007);

    private final TransactionTemplate transaction;

    public AdminUserMutationTransactionRunner(PlatformTransactionManager transactionManager) {
        this.transaction = new TransactionTemplate(transactionManager);
        this.transaction.setPropagationBehaviorName("PROPAGATION_REQUIRES_NEW");
    }

    public <T> T execute(Supplier<T> mutation) {
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                return transaction.execute(status -> {
                    T result = mutation.get();
                    if (result == null) {
                        throw new IllegalStateException(
                                "Admin user mutation transaction returned no result");
                    }
                    return result;
                });
            } catch (RuntimeException exception) {
                if (!isRetryableConflict(exception)) {
                    throw exception;
                }
                if (attempt == MAX_ATTEMPTS) {
                    throw new ApiException(
                            HttpStatus.CONFLICT,
                            "USER_UPDATE_CONFLICT",
                            "User version changed");
                }
            }
        }
        throw new IllegalStateException("Admin user mutation retry loop exhausted unexpectedly");
    }

    private boolean isRetryableConflict(Throwable exception) {
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        Throwable current = exception;
        while (current != null && seen.add(current)) {
            if (current instanceof ConcurrencyFailureException) {
                return true;
            }
            if (current instanceof SQLException sqlException
                    && ("40001".equals(sqlException.getSQLState())
                    || RETRYABLE_TIDB_ERROR_CODES.contains(sqlException.getErrorCode()))) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}

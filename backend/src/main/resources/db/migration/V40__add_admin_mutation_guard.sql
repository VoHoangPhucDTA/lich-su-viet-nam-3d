CREATE TABLE admin_mutation_guards (
    guard_key VARCHAR(64) NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT pk_admin_mutation_guards PRIMARY KEY (guard_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO admin_mutation_guards (guard_key, revision)
VALUES ('last_active_admin', 0);

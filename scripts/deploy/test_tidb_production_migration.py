from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


RUNNER_PATH = Path(__file__).with_name("tidb_production_migration.py")
SPEC = importlib.util.spec_from_file_location("tidb_production_migration", RUNNER_PATH)
assert SPEC is not None and SPEC.loader is not None
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)


def info_payload(
    *,
    current: str = "37",
    pending: tuple[str, ...] = ("38", "39", "40", "41"),
    database: str = "lichsuvn",
    flyway_version: str = "11.14.1",
) -> dict:
    migrations = [
        {
            "category": "Versioned",
            "version": str(version),
            "state": "Success",
        }
        for version in range(1, int(current) + 1)
    ]
    migrations.extend(
        {
            "category": "Versioned",
            "version": version,
            "state": "Pending",
        }
        for version in pending
    )
    return {
        "schemaVersion": current,
        "database": database,
        "flywayVersion": flyway_version,
        "migrations": migrations,
        "warnings": [],
        "operation": "info",
    }


class ProductionMigrationRunnerContractTest(unittest.TestCase):
    def test_runner_module_exists(self) -> None:
        runner = Path(__file__).with_name("tidb_production_migration.py")

        self.assertTrue(
            runner.is_file(),
            "The guarded production migration runner has not been implemented yet.",
        )

    def test_constants_pin_the_release_tool_and_target(self) -> None:
        self.assertEqual(runner.FLYWAY_IMAGE, "redgate/flyway:11.14.1")
        self.assertEqual(
            runner.APPROVED_IMAGE_DIGESTS[runner.FLYWAY_IMAGE],
            "sha256:174513cc63485ab931381b1cceb5c6adea2cf23284910770552cc8c945fb185d",
        )
        self.assertEqual(
            runner.APPROVED_IMAGE_DIGESTS[runner.MYSQL_CLIENT_IMAGE],
            "sha256:a532724022429812ec797c285c1b540a644c15e248579c6bfdf12a8fbaab4964",
        )
        self.assertEqual(runner.TARGET_VERSION, "41")
        self.assertEqual(runner.EXPECTED_CURRENT_VERSION, "37")
        self.assertEqual(
            runner.EXPECTED_PENDING_VERSIONS,
            ("38", "39", "40", "41"),
        )
        self.assertIn(
            "scripts/deploy/run-tidb-production-migration.cmd",
            runner.RELEASE_CHECK_PATHS,
        )

    def test_wrappers_use_python_isolated_mode(self) -> None:
        directory = Path(__file__).parent

        self.assertIn(
            "python -I",
            (directory / "run-tidb-production-migration.ps1").read_text(
                encoding="utf-8"
            ),
        )
        self.assertIn(
            "python -I",
            (directory / "run-tidb-production-migration.cmd").read_text(
                encoding="utf-8"
            ),
        )


class TargetAndApprovalGuardTest(unittest.TestCase):
    HOST = "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com"

    def valid_target(self) -> dict:
        target = runner.validate_target(
            host=self.HOST,
            port=4000,
            database="lichsuvn",
            target_identity="main",
            confirmation="main@gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com/lichsuvn:37->41",
        )
        return target

    def test_valid_target_returns_non_secret_confirmation(self) -> None:
        target = self.valid_target()

        self.assertEqual(target["database"], "lichsuvn")
        self.assertEqual(target["port"], 4000)
        self.assertNotIn("password", target["confirmation"].lower())

    def test_rehearsal_identity_is_rejected(self) -> None:
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_target(
                host=self.HOST,
                port=4000,
                database="lichsuvn",
                target_identity="admin-v39-rehearsal-clone",
                confirmation="admin-v39-rehearsal-clone@gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com/lichsuvn:37->41",
            )

    def test_non_main_identity_is_rejected_even_on_a_valid_host(self) -> None:
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_target(
                host=self.HOST,
                port=4000,
                database="lichsuvn",
                target_identity="production-primary",
                confirmation=f"production-primary@{self.HOST}/lichsuvn:37->41",
            )

    def test_wrong_database_and_confirmation_are_rejected(self) -> None:
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_target(
                host=self.HOST,
                port=4000,
                database="other_db",
                target_identity="main",
                confirmation="main@gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com/other_db:37->41",
            )
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_target(
                host=self.HOST,
                port=4000,
                database="lichsuvn",
                target_identity="main",
                confirmation="I-confirmed-the-wrong-target",
            )

    def test_migration_requires_every_operational_gate(self) -> None:
        common = {
            "backup_evidence": "backup-20260728",
            "restore_evidence": "restore-rehearsal-20260728",
            "two_active_admins": True,
            "backends_drained": True,
            "single_migration_owner": True,
            "maintenance_window": True,
            "rollback_owner": True,
            "runtime_security_verified": True,
            "execute_migrate": True,
        }
        runner.validate_approval_gates(**common)
        common["backends_drained"] = False
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_approval_gates(**common)

    def test_risk_accepted_minimal_gate_keeps_write_boundaries(self) -> None:
        runner.validate_risk_accepted_minimal_gate(
            risk_accepted_minimal=True,
            backends_drained=True,
            runtime_security_verified=True,
            execute_migrate=True,
        )
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_risk_accepted_minimal_gate(
                risk_accepted_minimal=True,
                backends_drained=False,
                runtime_security_verified=True,
                execute_migrate=True,
            )


class FlywayCommandAndSecretTest(unittest.TestCase):
    HOST = TargetAndApprovalGuardTest.HOST

    def test_command_is_pinned_and_allowlisted(self) -> None:
        command = runner.build_flyway_command(
            migration_dir=Path("backend/src/main/resources/db/migration"),
            operation="info",
        )

        joined = " ".join(command)
        self.assertIn("redgate/flyway:11.14.1", command)
        self.assertIn("-target=41", command)
        self.assertIn("-cleanDisabled=true", command)
        self.assertIn("-baselineOnMigrate=false", command)
        self.assertIn("-outOfOrder=false", command)
        self.assertIn("-skipExecutingMigrations=false", command)
        self.assertIn("-skipDefaultCallbacks=true", command)
        self.assertIn("-callbacks=", command)
        self.assertIn("--entrypoint", command)
        self.assertIn("sh", command)
        self.assertIn("lsvn3d-flyway-stdin", command)
        self.assertIn("-configFiles=\"$c\"", " ".join(command))
        self.assertNotIn("-configFiles=-", command)
        self.assertIn("REDGATE_DISABLE_TELEMETRY=true", command)
        self.assertIn("--pull=never", command)
        self.assertTrue(joined.endswith("info"))
        self.assertNotIn("repair", joined)
        with self.assertRaises(runner.MigrationGuardError):
            runner.build_flyway_command(Path("migrations"), "repair")

    def test_pre_migration_validate_ignores_only_pending_migrations(self) -> None:
        command = runner.build_flyway_command(Path("migrations"), "validate")
        self.assertIn("-ignoreMigrationPatterns=*:pending", command)
        self.assertEqual("validate", command[-1])

    def test_explicit_target_override_preserves_historical_default(self) -> None:
        default = runner.build_flyway_command(Path("migrations"), "info")
        release_e = runner.build_flyway_command(
            Path("migrations"), "info", target_version="42",
        )
        self.assertIn("-target=41", default)
        self.assertIn("-target=42", release_e)
        self.assertNotIn("-target=41", release_e)
        with self.assertRaisesRegex(runner.MigrationGuardError, "must be numeric"):
            runner.build_flyway_command(
                Path("migrations"), "info", target_version="latest",
            )

    def test_execution_can_use_an_immutable_digest_reference(self) -> None:
        digest = "sha256:" + ("a" * 64)
        flyway_command = runner.build_flyway_command(
            migration_dir=Path("migrations"),
            operation="migrate",
            image_ref=f"redgate/flyway@{digest}",
        )
        mysql_command = runner.build_mysql_command(
            image_ref=f"mysql@{digest}",
        )

        self.assertIn(f"redgate/flyway@{digest}", flyway_command)
        self.assertIn(f"mysql@{digest}", mysql_command)

    def test_credentials_are_only_in_stdin_config_not_command_arguments(self) -> None:
        config = runner.build_flyway_config(
            host=self.HOST,
            port=4000,
            database="lichsuvn",
            user="migration_user",
            password="not-a-real-secret",
        )
        command = runner.build_flyway_command(Path("migrations"), "migrate")

        self.assertIn("not-a-real-secret", config)
        self.assertNotIn("not-a-real-secret", " ".join(command))
        self.assertNotIn("flyway.password", " ".join(command))
        self.assertNotIn("\r", config)
        self.assertIn("[environments.default]", config)
        self.assertIn("[flyway]", config)
        self.assertIn('environment = "default"', config)
        self.assertIn("connectTimeout=15000", config)
        self.assertIn("socketTimeout=120000", config)
        self.assertIn("sslMode=VERIFY_IDENTITY", config)
        self.assertIn("tlsVersions=TLSv1.2,TLSv1.3", config)
        self.assertIn("fallbackToSystemTrustStore=true", config)
        self.assertIn("useSsl=true", config)
        self.assertIn("trustServerCertificate=false", config)
        self.assertIn("disableSslHostnameVerification=false", config)
        self.assertIn("enabledSslProtocolSuites=TLSv1.2,TLSv1.3", config)

    def test_secret_whitespace_is_preserved_in_stdin_payloads(self) -> None:
        password = "  secret-with-space \t"
        flyway_config = runner.build_flyway_config(
            host=self.HOST,
            port=4000,
            database="lichsuvn",
            user="migration_user",
            password=password,
        )
        mysql_payload = runner.build_mysql_payload(
            host=self.HOST,
            port=4000,
            database="lichsuvn",
            user="migration_user",
            password=password,
            sql="SELECT 1",
        )

        self.assertIn('password = "  secret-with-space \\t"', flyway_config)
        self.assertIn('password="  secret-with-space \t"', mysql_payload)
        self.assertIn("ssl-mode=VERIFY_IDENTITY", mysql_payload)
        self.assertIn(
            f"ssl-ca={runner.MYSQL_CA_BUNDLE}",
            mysql_payload,
        )
        self.assertIn("tls-version=TLSv1.2,TLSv1.3", mysql_payload)

    def test_mysql_payload_rejects_non_read_only_sql(self) -> None:
        base = {
            "host": self.HOST,
            "port": 4000,
            "database": "lichsuvn",
            "user": "migration_user",
            "password": "not-a-real-secret",
        }
        for sql in (
            "UPDATE users SET status='disabled'",
            "SELECT 1; DELETE FROM users",
            "SELECT 1 INTO OUTFILE '/tmp/leak'",
            "SELECT 1 FOR UPDATE",
            "/* injected */ SELECT 1",
        ):
            with self.subTest(sql=sql):
                with self.assertRaises(runner.MigrationGuardError):
                    runner.build_mysql_payload(**base, sql=sql)

    def test_mysql_payload_allows_bounded_select_script(self) -> None:
        payload = runner.build_mysql_payload(
            host=self.HOST,
            port=4000,
            database="lichsuvn",
            user="migration_user",
            password="not-a-real-secret",
            sql="SELECT 'a';\nSELECT 'b';",
        )
        self.assertIn("SELECT 'a';", payload)
        self.assertIn("SELECT 'b';", payload)

    def test_sensitive_output_is_redacted(self) -> None:
        text = (
            "jdbc:mysql://migration_user:not-a-real-secret@"
            "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/lichsuvn"
        )
        redacted = runner.redact_output(
            text,
            secrets=("not-a-real-secret", "migration_user"),
        )

        self.assertNotIn("not-a-real-secret", redacted)
        self.assertNotIn("migration_user", redacted)
        self.assertIn("[REDACTED]", redacted)

    def test_mysql_metadata_command_does_not_contain_credentials(self) -> None:
        command = runner.build_mysql_command()

        self.assertIn("mysql:8.0.36", command)
        self.assertNotIn("password", " ".join(command).lower())
        self.assertIn("--defaults-extra-file", " ".join(command))
        self.assertIn("--pull=never", command)
        self.assertIn("--connect-timeout=15", " ".join(command))
        self.assertIn(
            f"test -r {runner.MYSQL_CA_BUNDLE}",
            " ".join(command),
        )
        self.assertIn(
            f"test -s {runner.MYSQL_CA_BUNDLE}",
            " ".join(command),
        )
        self.assertIn("tr -d '\\015'", " ".join(command))

    def test_image_digest_guard_rejects_unpinned_or_mismatched_images(self) -> None:
        digest = "sha256:" + ("a" * 64)
        runner.validate_image_digest(digest, digest)
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_image_digest("", digest)
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_image_digest(digest, "sha256:" + ("b" * 64))

    def test_verified_image_returns_digest_reference(self) -> None:
        flyway_digest = runner.APPROVED_IMAGE_DIGESTS[runner.FLYWAY_IMAGE]
        mysql_digest = runner.APPROVED_IMAGE_DIGESTS[runner.MYSQL_CLIENT_IMAGE]
        responses = iter(
            [
                json.dumps([f"redgate/flyway@{flyway_digest}"]),
                json.dumps([f"mysql@{mysql_digest}"]),
            ]
        )

        class Completed:
            returncode = 0
            stderr = ""

            def __init__(self, stdout: str) -> None:
                self.stdout = stdout

        def fake_run(*_args, **_kwargs):
            return Completed(next(responses))

        with patch.object(runner.subprocess, "run", side_effect=fake_run):
            with patch.dict(
                "os.environ",
                {
                    "TIDB_PRODUCTION_FLYWAY_IMAGE_DIGEST": flyway_digest,
                    "TIDB_PRODUCTION_MYSQL_IMAGE_DIGEST": mysql_digest,
                },
                clear=False,
            ):
                refs = runner.verify_docker_images()

        self.assertEqual(
            refs["redgate/flyway:11.14.1"],
            f"redgate/flyway@{flyway_digest}",
        )
        self.assertEqual(refs["mysql:8.0.36"], f"mysql@{mysql_digest}")

    def test_operator_cannot_replace_the_release_approved_image_digest(self) -> None:
        unapproved = "sha256:" + ("b" * 64)

        with patch.dict(
            "os.environ",
            {
                "TIDB_PRODUCTION_FLYWAY_IMAGE_DIGEST": unapproved,
                "TIDB_PRODUCTION_MYSQL_IMAGE_DIGEST":
                    runner.APPROVED_IMAGE_DIGESTS[runner.MYSQL_CLIENT_IMAGE],
            },
            clear=False,
        ):
            with self.assertRaises(runner.MigrationGuardError):
                runner.verify_docker_images()

    def test_metadata_sql_is_read_only(self) -> None:
        sql = runner.build_metadata_sql(postflight=True).upper()

        for marker in (
            "@@GLOBAL.TIME_ZONE",
            "@@SESSION.TIME_ZONE",
            "@@CHARACTER_SET_DATABASE",
            "@@COLLATION_DATABASE",
            "@@SQL_MODE",
        ):
            self.assertIn(marker, sql)

        for keyword in (
            "INSERT",
            "UPDATE",
            "DELETE",
            "ALTER",
            "CREATE",
            "DROP",
            "TRUNCATE",
        ):
            self.assertNotRegex(sql, rf"\b{keyword}\b")

    def test_failed_external_command_redacts_secret(self) -> None:
        secret = "not-a-real-secret"

        def fake_executor(_command, _stdin):
            return runner.CommandResult(
                ("docker",),
                17,
                "",
                f"access denied for {secret}",
            )

        with self.assertRaises(runner.MigrationGuardError) as context:
            runner.run_external(
                ["docker", "run"],
                f"flyway.password={secret}\n",
                secrets=(secret,),
                executor=fake_executor,
            )
        self.assertNotIn(secret, str(context.exception))

    def test_flyway_json_root_must_be_an_object(self) -> None:
        result = runner.CommandResult(("docker",), 0, "[]", "")

        with self.assertRaises(runner.MigrationGuardError):
            runner._parse_json_output(result, ())

    def test_docker_child_does_not_inherit_database_password_variables(self) -> None:
        captured: dict[str, object] = {}

        class Completed:
            returncode = 0
            stdout = ""
            stderr = ""

        def fake_run(*args, **kwargs):
            captured["args"] = args
            captured["kwargs"] = kwargs
            return Completed()

        with patch.object(runner.subprocess, "run", side_effect=fake_run):
            with patch.dict(
                "os.environ",
                {
                    "TIDB_PRODUCTION_READ_USER": "private-read-user",
                    "TIDB_PRODUCTION_READ_PASSWORD": "secret-read",
                    "TIDB_PRODUCTION_MIGRATE_PASSWORD": "secret-migrate",
                    "TIDB_REHEARSAL_READ_PASSWORD": "secret-rehearsal",
                    "SAFE_OPERATOR_FLAG": "kept",
                },
                clear=False,
            ):
                runner._execute(["docker", "run"], "")

        child_env = captured["kwargs"]["env"]
        self.assertNotIn("TIDB_PRODUCTION_READ_USER", child_env)
        self.assertNotIn("TIDB_PRODUCTION_READ_PASSWORD", child_env)
        self.assertNotIn("TIDB_PRODUCTION_MIGRATE_PASSWORD", child_env)
        self.assertNotIn("TIDB_REHEARSAL_READ_PASSWORD", child_env)
        self.assertEqual(child_env["SAFE_OPERATOR_FLAG"], "kept")

    def test_remote_docker_context_is_rejected(self) -> None:
        with patch.dict(
            "os.environ",
            {"DOCKER_HOST": "tcp://remote.example:2375"},
            clear=False,
        ):
            with self.assertRaises(runner.MigrationGuardError):
                runner.validate_local_docker_environment()

    def test_stored_remote_docker_context_is_rejected(self) -> None:
        class Completed:
            returncode = 0
            stderr = ""

            def __init__(self, stdout: str) -> None:
                self.stdout = stdout

        responses = iter(
            (
                Completed("production-remote\n"),
                Completed(json.dumps("ssh://docker.example.test")),
            )
        )
        with patch.object(runner.subprocess, "run", side_effect=lambda *_a, **_k: next(responses)):
            with patch.dict(
                "os.environ",
                {
                    "DOCKER_HOST": "",
                    "DOCKER_CONTEXT": "",
                    "DOCKER_TLS_VERIFY": "",
                    "DOCKER_CERT_PATH": "",
                },
                clear=False,
            ):
                with self.assertRaises(runner.MigrationGuardError):
                    runner.validate_local_docker_environment()

    def test_local_docker_desktop_context_is_accepted(self) -> None:
        class Completed:
            returncode = 0
            stderr = ""

            def __init__(self, stdout: str) -> None:
                self.stdout = stdout

        responses = iter(
            (
                Completed("desktop-linux\n"),
                Completed(json.dumps("npipe:////./pipe/dockerDesktopLinuxEngine")),
            )
        )
        with patch.object(runner.subprocess, "run", side_effect=lambda *_a, **_k: next(responses)):
            with patch.dict(
                "os.environ",
                {
                    "DOCKER_HOST": "",
                    "DOCKER_CONTEXT": "",
                    "DOCKER_TLS_VERIFY": "",
                    "DOCKER_CERT_PATH": "",
                },
                clear=False,
            ):
                runner.validate_local_docker_environment()


class FlywayStateValidationTest(unittest.TestCase):
    def test_preflight_requires_exact_current_and_pending_set(self) -> None:
        result = runner.validate_flyway_info(info_payload())

        self.assertEqual(result["current_version"], "37")
        self.assertEqual(result["pending_versions"], ["38", "39", "40", "41"])

        invalid = info_payload(pending=("38", "39", "41"))
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_flyway_info(invalid)

    def test_failed_missing_future_or_out_of_order_state_is_rejected(self) -> None:
        invalid = info_payload()
        invalid["migrations"][0]["state"] = "Missing"
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_flyway_info(invalid)

        invalid = info_payload()
        invalid["migrations"][0]["state"] = "Failed"
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_flyway_info(invalid)

        invalid = info_payload()
        invalid["migrations"].append({"version": "", "state": "Pending"})
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_flyway_info(invalid)

        invalid = info_payload()
        invalid["migrations"].append("malformed")
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_flyway_info(invalid)

    def test_database_and_flyway_version_are_checked(self) -> None:
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_flyway_info(info_payload(database="wrong"))
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_flyway_info(info_payload(flyway_version="13.0.0"))

    def test_validate_and_migrate_results_are_strict(self) -> None:
        runner.validate_flyway_validate(
            {
                "validationSuccessful": True,
                "invalidMigrations": [],
                "database": "lichsuvn",
                "flywayVersion": "11.14.1",
                "operation": "validate",
                "warnings": [],
            }
        )
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_flyway_validate(
                {
                    "validationSuccessful": False,
                    "invalidMigrations": [{"version": "38"}],
                    "database": "lichsuvn",
                    "flywayVersion": "11.14.1",
                    "operation": "validate",
                    "warnings": [],
                }
            )

    def test_invalid_migration_diagnostic_is_reported_without_secret(self) -> None:
        with self.assertRaisesRegex(
            runner.MigrationGuardError,
            r"validation did not succeed.*38",
        ):
            runner.validate_flyway_validate(
                {
                    "validationSuccessful": False,
                    "invalidMigrations": [{"version": "38", "errorDetails": "checksum mismatch"}],
                    "database": "lichsuvn",
                    "flywayVersion": "11.14.1",
                    "operation": "validate",
                    "warnings": [],
                }
            )

    def test_warning_message_is_sanitized_for_operator_diagnosis(self) -> None:
        with self.assertRaisesRegex(
            runner.MigrationGuardError,
            r"unexpected warnings.*\[REDACTED\]",
        ):
            runner.validate_flyway_validate(
                {
                    "validationSuccessful": True,
                    "invalidMigrations": [],
                    "database": "lichsuvn",
                    "flywayVersion": "11.14.1",
                    "operation": "validate",
                    "warnings": [{"message": "password=not-a-secret"}],
                }
            )

    def test_absent_or_null_warnings_are_treated_as_empty(self) -> None:
        for warnings in (None,):
            payload = info_payload()
            payload["warnings"] = warnings
            runner.validate_flyway_info(payload)
        payload = info_payload()
        del payload["warnings"]
        runner.validate_flyway_info(payload)

        runner.validate_flyway_migrate(
            {
                "initialSchemaVersion": "37",
                "targetSchemaVersion": "41",
                "migrationsExecuted": 4,
                "migrations": [
                    {"version": version}
                    for version in ("38", "39", "40", "41")
                ],
                "database": "lichsuvn",
                "flywayVersion": "11.14.1",
                "operation": "migrate",
                "warnings": [],
            }
        )

        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_flyway_validate(
                {
                    "validationSuccessful": True,
                    "invalidMigrations": [],
                    "database": "lichsuvn",
                    "flywayVersion": "11.14.1",
                    "operation": "validate",
                    "warnings": [{"message": "unexpected"}],
                }
            )


class MigrationSourceAndMetadataTest(unittest.TestCase):
    def test_manifest_detects_modified_or_extra_migration(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migration_root = root / "migration"
            migration_root.mkdir()
            first = migration_root / "V1__first.sql"
            second = migration_root / "V2__second.sql"
            first.write_text("create table one;", encoding="utf-8")
            second.write_text("create table two;", encoding="utf-8")
            manifest = root / "manifest.sha256"
            first_hash = sha256(first.read_bytes()).hexdigest()
            second_hash = sha256(second.read_bytes()).hexdigest()
            manifest.write_text(
                f"{first_hash}  {first.name}\n{second_hash}  {second.name}\n",
                encoding="utf-8",
            )

            self.assertEqual(
                runner.verify_migration_manifest(
                    migration_root,
                    manifest,
                    expected_versions=(1, 2),
                ),
                ["V1__first.sql", "V2__second.sql"],
            )
            first.write_text("changed;", encoding="utf-8")
            with self.assertRaises(runner.MigrationGuardError):
                runner.verify_migration_manifest(
                    migration_root,
                    manifest,
                    expected_versions=(1, 2),
                )

    def test_manifest_checksum_is_independent_of_windows_line_endings(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migration_root = root / "migration"
            migration_root.mkdir()
            first = migration_root / "V1__first.sql"
            first.write_bytes(b"create table one;\r\n")
            manifest = root / "manifest.sha256"
            normalized_hash = sha256(b"create table one;\n").hexdigest()
            manifest.write_text(
                f"{normalized_hash}  {first.name}\n",
                encoding="utf-8",
            )

            self.assertEqual(
                runner.verify_migration_manifest(
                    migration_root,
                    manifest,
                    expected_versions=(1,),
                ),
                ["V1__first.sql"],
            )

    def test_flyway_staging_normalizes_line_endings_and_cleans_up(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "migration"
            manifest = Path(directory) / "manifest.sha256"
            source.mkdir()
            migration = source / "V1__first.sql"
            migration.write_bytes(b"SELECT 'kept\\r';\r\n")
            canonical_digest = sha256(b"SELECT 'kept\\r';\n").hexdigest()
            manifest.write_text(
                f"{canonical_digest}  {migration.name}\n",
                encoding="utf-8",
            )

            with runner.canonical_migration_directory(
                source,
                manifest_path=manifest,
                expected_versions=(1,),
            ) as staged:
                self.assertEqual(
                    (staged / migration.name).read_bytes(),
                    b"SELECT 'kept\\r';\n",
                )
                staged_path = staged

            self.assertFalse(staged_path.exists())

    def test_flyway_staging_rejects_a_manifest_mismatch_before_yield(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "migration"
            manifest = Path(directory) / "manifest.sha256"
            source.mkdir()
            migration = source / "V1__first.sql"
            migration.write_text("SELECT 1;\n", encoding="utf-8")
            manifest.write_text(
                f"{'0' * 64}  {migration.name}\n",
                encoding="utf-8",
            )

            with self.assertRaises(runner.MigrationGuardError):
                with runner.canonical_migration_directory(
                    source,
                    manifest_path=manifest,
                    expected_versions=(1,),
                ):
                    self.fail("invalid staged migration was yielded")

    def test_manifest_can_be_required_to_contain_the_release_version_set(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migration_root = root / "migration"
            migration_root.mkdir()
            manifest = root / "manifest.sha256"
            hashes = []
            for version in (1, 2):
                path = migration_root / f"V{version}__migration.sql"
                path.write_text(f"migration {version};", encoding="utf-8")
                hashes.append(
                    f"{sha256(path.read_bytes()).hexdigest()}  {path.name}"
                )
            manifest.write_text("\n".join(hashes) + "\n", encoding="utf-8")

            with self.assertRaises(runner.MigrationGuardError):
                runner.verify_migration_manifest(migration_root, manifest)
            self.assertEqual(
                runner.verify_migration_manifest(
                    migration_root,
                    manifest,
                    expected_versions=(1, 2),
                ),
                ["V1__migration.sql", "V2__migration.sql"],
            )

    def test_callback_files_are_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            callback = root / "beforeMigrate.sql"
            callback.write_text("select 1;", encoding="utf-8")

            self.assertEqual(runner.find_flyway_callbacks(root), [callback])

    def test_tidb_identity_and_schema_fingerprint_are_checked(self) -> None:
        metadata = {
            "server_version": "5.7.25-TiDB-v8.5.3",
            "version_comment": "TiDB Server",
            "database": "lichsuvn",
            "global_time_zone": "SYSTEM",
            "session_time_zone": "+00:00",
            "character_set_database": "utf8mb4",
            "collation_database": "utf8mb4_0900_ai_ci",
            "sql_mode": "STRICT_TRANS_TABLES",
            "active_admin_count": "2",
            "failed_migration_count": "0",
            "users_total": "5",
            "events_total": "361",
            "user_roles_total": "6",
            "roles_total": "3",
            "role_code_counts": "admin=1,student=1,teacher=1",
            "role_assignment_counts": "admin=2,student=3,teacher=1",
            "admin_role_assignment_count": "2",
            "event_status_counts": "draft=1,published=360",
            "user_status_counts": "active=5",
        }
        runner.validate_database_metadata(metadata)
        metadata["active_admin_count"] = "1"
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_database_metadata(metadata)
        metadata["active_admin_count"] = "2"
        metadata.pop("session_time_zone", None)
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_database_metadata(metadata)

    def test_postflight_requires_v41_schema_and_unchanged_counts(self) -> None:
        before = {
            "users_total": "5",
            "events_total": "361",
            "user_roles_total": "6",
            "roles_total": "3",
            "role_code_counts": "admin=1,student=1,teacher=1",
            "role_assignment_counts": "admin=2,student=3,teacher=1",
            "admin_role_assignment_count": "2",
            "active_admin_count": "2",
            "event_status_counts": "draft=1,published=360",
            "user_status_counts": "active=5",
        }
        after = {
            **before,
            "server_version": "5.7.25-TiDB-v8.5.3",
            "version_comment": "TiDB Server",
            "database": "lichsuvn",
            "global_time_zone": "SYSTEM",
            "session_time_zone": "+00:00",
            "character_set_database": "utf8mb4",
            "collation_database": "utf8mb4_0900_ai_ci",
            "sql_mode": "STRICT_TRANS_TABLES",
            "active_admin_count": "2",
            "failed_migration_count": "0",
            "historical_events_updated_at_type": "datetime",
            "historical_events_updated_at_precision": "6",
            "users_updated_at_type": "datetime",
            "users_updated_at_precision": "6",
            "users_auth_version_type": "bigint",
            "users_auth_version_nullable": "NO",
            "users_auth_version_default": "0",
            "auth_version_positive_count": "0",
            "admin_guard_rows": "1",
            "admin_guard_active_count": "2",
        }
        runner.validate_postflight_metadata(after, before)
        after["admin_guard_active_count"] = "1"
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_postflight_metadata(after, before)
        after["admin_guard_active_count"] = "2"
        after["users_auth_version_type"] = "bigint unsigned"
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_postflight_metadata(after, before)

    def test_evidence_is_bound_to_target_and_release(self) -> None:
        evidence = runner.build_evidence(
            mode="preflight",
            target={
                "target_identity": "main",
                "host": TargetAndApprovalGuardTest.HOST,
                "port": 4000,
                "database": "lichsuvn",
            },
            release_commit="a" * 40,
            flyway={},
            metadata={},
        )
        runner.validate_evidence_binding(
            evidence,
            target=evidence["target"],
            expected_release_commit="a" * 40,
        )
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_evidence_binding(
                evidence,
                target={**evidence["target"], "target_identity": "other"},
                expected_release_commit="a" * 40,
            )

    def test_evidence_has_integrity_digest_and_rejects_tampering(self) -> None:
        target = {
            "target_identity": "main",
            "host": TargetAndApprovalGuardTest.HOST,
            "port": 4000,
            "database": "lichsuvn",
        }
        metadata = {
            "server_version": "5.7.25-TiDB-v8.5.3",
            "version_comment": "TiDB Server",
            "database": "lichsuvn",
            "global_time_zone": "SYSTEM",
            "session_time_zone": "+00:00",
            "character_set_database": "utf8mb4",
            "collation_database": "utf8mb4_0900_ai_ci",
            "sql_mode": "STRICT_TRANS_TABLES",
            "active_admin_count": "2",
            "failed_migration_count": "0",
            "users_total": "5",
            "events_total": "361",
            "user_roles_total": "6",
            "roles_total": "3",
            "role_code_counts": "admin=1,student=1,teacher=1",
            "role_assignment_counts": "admin=2,student=3,teacher=1",
            "admin_role_assignment_count": "2",
            "event_status_counts": "draft=1,published=360",
            "user_status_counts": "active=5",
        }
        evidence = runner.build_evidence(
            mode="preflight",
            target=target,
            release_commit="a" * 40,
            flyway={
                "current_version": "37",
                "pending_versions": ["38", "39", "40", "41"],
                "database": "lichsuvn",
                "flyway_version": "11.14.1",
            },
            metadata=metadata,
        )
        runner.validate_evidence_integrity(evidence)
        runner.validate_evidence_binding(
            evidence,
            target=target,
            expected_release_commit="a" * 40,
            expected_evidence_sha256=evidence["evidence_sha256"],
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "evidence.json"
            path.write_text(
                json.dumps(evidence, sort_keys=True),
                encoding="utf-8",
            )
            self.assertEqual(runner._read_evidence(path), evidence)
        tampered = {**evidence, "metadata": {**metadata, "events_total": "362"}}
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_evidence_integrity(tampered)
        with self.assertRaises(runner.MigrationGuardError):
            runner.validate_evidence_binding(
                evidence,
                target=target,
                expected_release_commit="a" * 40,
                expected_evidence_sha256="0" * 64,
            )

    def test_preflight_evidence_requires_exact_flyway_state(self) -> None:
        target = {
            "target_identity": "main",
            "host": TargetAndApprovalGuardTest.HOST,
            "port": 4000,
            "database": "lichsuvn",
        }
        evidence = runner.build_evidence(
            mode="preflight",
            target=target,
            release_commit="a" * 40,
            flyway={
                "current_version": "36",
                "pending_versions": ["37", "38", "39", "40", "41"],
                "database": "lichsuvn",
                "flyway_version": "11.14.1",
            },
            metadata={},
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "evidence.json"
            path.write_text(json.dumps(evidence), encoding="utf-8")
            with self.assertRaises(runner.MigrationGuardError):
                runner._read_evidence(path)


class OfflineWorkflowAssemblyTest(unittest.TestCase):
    HOST = TargetAndApprovalGuardTest.HOST

    def test_preflight_uses_read_only_flyway_and_metadata_calls(self) -> None:
        calls: list[tuple[tuple[str, ...], str]] = []
        metadata = {
            "server_version": "5.7.25-TiDB-v8.5.3",
            "version_comment": "TiDB Server",
            "database": "lichsuvn",
            "global_time_zone": "SYSTEM",
            "session_time_zone": "+00:00",
            "character_set_database": "utf8mb4",
            "collation_database": "utf8mb4_0900_ai_ci",
            "sql_mode": "STRICT_TRANS_TABLES",
            "active_admin_count": "2",
            "failed_migration_count": "0",
            "users_total": "5",
            "events_total": "361",
            "user_roles_total": "6",
            "roles_total": "3",
            "role_code_counts": "admin=1,student=1,teacher=1",
            "role_assignment_counts": "admin=2,student=3,teacher=1",
            "admin_role_assignment_count": "2",
            "event_status_counts": "draft=1,published=360",
            "user_status_counts": "active=5",
        }

        def fake_executor(command, stdin):
            calls.append((tuple(command), stdin))
            if any(
                marker in argument
                for argument in command
                for marker in ("mysql:8.0.36", "mysql@sha256:")
            ):
                output = "\n".join(
                    f"{key}\t{value}" for key, value in metadata.items()
                )
            elif command[-1] == "info":
                output = json.dumps(info_payload())
            else:
                output = json.dumps(
                    {
                        "validationSuccessful": True,
                        "invalidMigrations": [],
                        "database": "lichsuvn",
                        "flywayVersion": "11.14.1",
                        "operation": "validate",
                        "warnings": [],
                    }
                )
            return runner.CommandResult(tuple(command), 0, output, "")

        target = runner.validate_target(
            host=self.HOST,
            port=4000,
            database="lichsuvn",
            target_identity="main",
            confirmation=f"main@{self.HOST}/lichsuvn:37->41",
        )
        with (
            patch.dict("os.environ", {}, clear=False),
            patch.object(runner, "local_check") as local_check,
            patch.object(runner, "canonical_migration_directory") as staging,
        ):
            staging.return_value.__enter__.return_value = Path("migrations")
            result = runner._run_preflight(
                repo_root=Path(__file__).parents[2],
                target=target,
                read_user="read_user",
                read_password="read_password",
                flyway_image="redgate/flyway@sha256:" + ("a" * 64),
                mysql_image="mysql@sha256:" + ("b" * 64),
                executor=fake_executor,
            )

        local_check.assert_called_once_with(Path(__file__).parents[2])
        self.assertEqual(result["flyway"]["current_version"], "37")
        self.assertEqual(len(calls), 3)
        self.assertTrue(all("read_password" not in " ".join(args) for args, _ in calls))
        self.assertTrue(any("read_password" in stdin for _, stdin in calls))
        self.assertTrue(
            any(
                any("redgate/flyway@sha256:" in argument for argument in args)
                for args, _ in calls
            )
        )
        self.assertTrue(
            any(
                any("mysql@sha256:" in argument for argument in args)
                for args, _ in calls
            )
        )

    def test_migration_account_validate_precedes_migrate(self) -> None:
        calls: list[str] = []

        def fake_executor(command, stdin):
            calls.append(command[-1])
            if command[-1] == "info":
                output = json.dumps(info_payload())
            elif command[-1] == "validate":
                output = json.dumps(
                    {
                        "validationSuccessful": True,
                        "invalidMigrations": [],
                        "database": "lichsuvn",
                        "flywayVersion": "11.14.1",
                        "operation": "validate",
                        "warnings": [],
                    }
                )
            else:
                output = json.dumps(
                    {
                        "initialSchemaVersion": "37",
                        "targetSchemaVersion": "41",
                        "migrationsExecuted": 4,
                        "migrations": [
                            {"version": version}
                            for version in ("38", "39", "40", "41")
                        ],
                        "database": "lichsuvn",
                        "flywayVersion": "11.14.1",
                        "operation": "migrate",
                        "warnings": [],
                    }
                )
            return runner.CommandResult(tuple(command), 0, output, "")

        with tempfile.TemporaryDirectory() as directory:
            result = runner.run_validated_migration(
                migration_dir=Path(directory),
                config="flyway.url=redacted\n",
                image_ref="redgate/flyway@sha256:" + ("a" * 64),
                secrets=("migration-password",),
                executor=fake_executor,
            )
        self.assertEqual(result["targetSchemaVersion"], "41")
        self.assertEqual(calls, ["info", "validate", "migrate"])


if __name__ == "__main__":
    unittest.main()

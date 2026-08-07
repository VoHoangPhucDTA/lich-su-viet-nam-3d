from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "tidb_rehearsal_v42_migration",
    HERE / "tidb_rehearsal_v42_migration.py",
)
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)

# Load the shared production runner under the same ``base`` alias it uses
# internally so contract tests can pin its primitives.
BASE_SPEC = importlib.util.spec_from_file_location(
    "tidb_production_migration",
    HERE / "tidb_production_migration.py",
)
assert BASE_SPEC and BASE_SPEC.loader
base = importlib.util.module_from_spec(BASE_SPEC)
sys.modules[BASE_SPEC.name] = base
BASE_SPEC.loader.exec_module(base)


class RehearsalTargetGuardTest(unittest.TestCase):
    HOST = "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com"
    PARENT_CLUSTER_ID = runner.EXPECTED_PRODUCTION_CLUSTER_ID
    BRANCH_NAME = "lichsuvn3d-admin-v42-rehearsal"
    BRANCH_ID = "bran-abc123456789"
    USER_PREFIX = "branchabc123456789"
    PRODUCTION_USER_PREFIX = "productionprefix"

    def target(self, **overrides: str | int) -> dict[str, object]:
        values: dict[str, object] = {
            "host": self.HOST,
            "port": 4000,
            "database": "lichsuvn",
            "parent_cluster_id": self.PARENT_CLUSTER_ID,
            "branch_name": self.BRANCH_NAME,
            "branch_id": self.BRANCH_ID,
            "user_prefix": self.USER_PREFIX,
            "production_user_prefix": self.PRODUCTION_USER_PREFIX,
            "confirmation": f"{self.BRANCH_ID}@{self.HOST}/lichsuvn:41->42",
        }
        values.update(overrides)
        return runner.validate_target(**values)

    def test_shared_gateway_and_production_parent_are_allowed(self) -> None:
        target = self.target()
        self.assertEqual(target["parent_cluster_id"], self.PARENT_CLUSTER_ID)
        self.assertEqual(target["branch_name"], self.BRANCH_NAME)
        self.assertEqual(target["branch_id"], self.BRANCH_ID)
        self.assertEqual(target["user_prefix"], self.USER_PREFIX)

    def test_missing_branch_id_is_rejected(self) -> None:
        with self.assertRaises(runner.RehearsalGuardError):
            self.target(branch_id="")

    def test_production_base_identity_cannot_be_used_as_branch(self) -> None:
        with self.assertRaises(runner.RehearsalGuardError):
            self.target(branch_id=self.PARENT_CLUSTER_ID)
        with self.assertRaises(runner.RehearsalGuardError):
            self.target(parent_cluster_id="different-production-cluster")

    def test_wrong_branch_id_is_rejected_by_confirmation(self) -> None:
        with self.assertRaises(runner.RehearsalGuardError):
            self.target(branch_id="bran-wrong123456")

    def test_shared_gateway_with_production_user_prefix_is_rejected(self) -> None:
        with self.assertRaises(runner.RehearsalGuardError):
            self.target(user_prefix=self.PRODUCTION_USER_PREFIX)

    def test_correct_branch_id_with_wrong_database_is_rejected(self) -> None:
        with self.assertRaises(runner.RehearsalGuardError):
            self.target(database="other_db")

    def test_branch_display_name_must_be_exact_rehearsal_name(self) -> None:
        with self.assertRaises(runner.RehearsalGuardError):
            self.target(branch_name="main")

    def test_missing_or_invalid_port_is_rejected(self) -> None:
        with self.assertRaises(runner.RehearsalGuardError):
            self.target(port=0)
        with patch.dict(runner.os.environ, {}, clear=True):
            with self.assertRaises(runner.RehearsalGuardError):
                runner.target_from_environment("unused", {})

    def test_malformed_confirmation_is_rejected(self) -> None:
        with self.assertRaises(runner.RehearsalGuardError):
            self.target(confirmation="main@host/lichsuvn:41->42")

    def test_sql_user_binding_requires_branch_prefix(self) -> None:
        runner.validate_sql_user_binding("branchabc123456789.reader", self.USER_PREFIX)
        with self.assertRaises(runner.RehearsalGuardError):
            runner.validate_sql_user_binding("productionprefix.reader", self.USER_PREFIX)


class IdentityEvidenceTest(unittest.TestCase):
    def evidence(self) -> dict[str, str]:
        return {
            "source": "ticloud",
            "state": "ACTIVE",
            "parent_cluster_id": runner.EXPECTED_PRODUCTION_CLUSTER_ID,
            "branch_id": "bran-abc123456789",
            "branch_name": "lichsuvn3d-admin-v42-rehearsal",
            "host": "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
            "database": "lichsuvn",
            "user_prefix": "branchabc123456789",
            "engine_version": "TiDB Server v8.5.3",
        }

    def write_evidence(self, value: dict[str, object]) -> tuple[Path, str, tempfile.TemporaryDirectory[str]]:
        directory = tempfile.TemporaryDirectory()
        path = Path(directory.name) / "identity.json"
        raw = (json.dumps(value, sort_keys=True) + "\n").encode()
        path.write_bytes(raw)
        return path, hashlib.sha256(raw).hexdigest(), directory

    def test_identity_evidence_requires_detached_digest_and_technical_ids(self) -> None:
        path, digest, directory = self.write_evidence(self.evidence())
        self.addCleanup(directory.cleanup)
        value = runner.load_identity_evidence(path, digest)
        self.assertEqual(value["branch_id"], "bran-abc123456789")
        with self.assertRaises(runner.RehearsalGuardError):
            runner.load_identity_evidence(path, "0" * 64)

    def test_identity_evidence_rejects_display_name_as_branch_id(self) -> None:
        value = self.evidence()
        value["branch_id"] = value["branch_name"]
        path, digest, directory = self.write_evidence(value)
        self.addCleanup(directory.cleanup)
        with self.assertRaises(runner.RehearsalGuardError):
            runner.load_identity_evidence(path, digest)

    def test_identity_evidence_rejects_non_string_fields(self) -> None:
        value = self.evidence()
        value["parent_cluster_id"] = 10427158774816979902
        path, digest, directory = self.write_evidence(value)
        self.addCleanup(directory.cleanup)
        with self.assertRaises(runner.RehearsalGuardError):
            runner.load_identity_evidence(path, digest)

    def test_identity_evidence_binds_parent_branch_host_database_and_prefix(self) -> None:
        path, digest, directory = self.write_evidence(self.evidence())
        self.addCleanup(directory.cleanup)
        identity = runner.load_identity_evidence(path, digest)
        target = runner.validate_target(
            host=identity["host"],
            port=4000,
            database=identity["database"],
            parent_cluster_id=identity["parent_cluster_id"],
            branch_name=identity["branch_name"],
            branch_id=identity["branch_id"],
            user_prefix=identity["user_prefix"],
            production_user_prefix="productionprefix",
            confirmation=f"{identity['branch_id']}@{identity['host']}/lichsuvn:41->42",
        )
        runner.validate_identity_binding(identity, target)
        target["branch_id"] = "bran-other123456"
        with self.assertRaises(runner.RehearsalGuardError):
            runner.validate_identity_binding(identity, target)


class RehearsalArtifactGuardTest(unittest.TestCase):
    def setUp(self) -> None:
        self.docker_executable = str(Path(sys.executable).resolve())
        self.docker_resolver = patch.object(
            runner.base,
            "resolve_docker_executable",
            return_value=self.docker_executable,
        )
        self.docker_resolver.start()
        self.addCleanup(self.docker_resolver.stop)

    def test_repository_manifest_is_exactly_v1_through_v42(self) -> None:
        repo_root = HERE.parents[1]
        migration_dir, manifest = runner.migration_paths(repo_root)
        files = runner.verify_manifest(migration_dir, manifest)
        self.assertEqual(len(files), 42)
        self.assertEqual(files[0], "V1__users_roles.sql")
        self.assertEqual(files[-1], "V42__add_managed_event_image_storage.sql")
        self.assertEqual(runner.find_callbacks(migration_dir), [])

    def test_flyway_command_allows_only_v42_and_no_destructive_modes(self) -> None:
        command = runner.build_flyway_command(
            Path("migrations"), "migrate", image_ref="redgate/flyway@sha256:" + "a" * 64
        )
        self.assertEqual(command[0], self.docker_executable)
        self.assertTrue(Path(command[0]).is_absolute())
        self.assertIn("--pull=never", command)
        self.assertIn("-target=42", command)
        self.assertNotIn("repair", command)
        self.assertNotIn("baseline", command)
        self.assertNotIn("clean", command)
        with self.assertRaises(runner.RehearsalGuardError):
            runner.build_flyway_command(Path("migrations"), "repair", image_ref="image")

    def test_manifest_rejects_modified_sql(self) -> None:
        repo_root = HERE.parents[1]
        migration_dir, manifest = runner.migration_paths(repo_root)
        with tempfile.TemporaryDirectory() as directory:
            staged = Path(directory) / "migration"
            staged.mkdir()
            for source in migration_dir.iterdir():
                (staged / source.name).write_bytes(source.read_bytes())
            changed = staged / "V42__add_managed_event_image_storage.sql"
            changed.write_bytes(changed.read_bytes() + b"\n")
            with self.assertRaises(runner.RehearsalGuardError):
                runner.verify_manifest(staged, manifest)


class RehearsalSchemaGuardTest(unittest.TestCase):
    def metadata(self) -> dict[str, str]:
        all_checks = ",".join(sorted(runner.CHECK_CONSTRAINTS))
        return {
            "server_version": "8.5.3-TiDB-v8.5.3",
            "version_comment": "TiDB Server (Apache License 2.0)",
            "database": "lichsuvn",
            "tls_version": "TLSv1.3",
            "tidb_enable_check_constraint": "1",
            "users_total": "2",
            "events_total": "3",
            "media_total": "4",
            "active_admin_count": "2",
            "failed_migration_count": "0",
            "v42_success_rows": "1",
            "v42_history_checksum": "-123456789",
            "managed_columns": ",".join(sorted(runner.MANAGED_COLUMNS)),
            "media_indexes": ",".join(sorted(runner.MEDIA_INDEXES)),
            "media_constraints": ",".join(sorted(runner.MEDIA_CONSTRAINTS)),
            "cleanup_table": "1",
            "cleanup_constraints": ",".join(sorted(runner.CLEANUP_CONSTRAINTS)),
            "check_constraints": all_checks,
            "tidb_check_constraints": all_checks,
        }

    def test_postflight_requires_all_schema_and_constraint_surfaces(self) -> None:
        runner.validate_metadata(self.metadata(), postflight=True)

    def test_postflight_rejects_count_drift(self) -> None:
        before = self.metadata()
        after = dict(before)
        after["media_total"] = "5"
        with self.assertRaises(runner.RehearsalGuardError):
            runner.validate_counts_unchanged(before, after)

    def test_postflight_rejects_absent_check_support(self) -> None:
        metadata = self.metadata()
        metadata["tidb_enable_check_constraint"] = "0"
        with self.assertRaises(runner.RehearsalGuardError):
            runner.validate_metadata(metadata, postflight=True)

    def test_postflight_binds_database_checksum_to_flyway_info(self) -> None:
        flyway_info = {
            "migrations": [
                {"version": "42", "state": "Success", "checksum": "-123456789"},
            ],
        }
        self.assertEqual(runner.flyway_v42_history_checksum(flyway_info), "-123456789")
        runner.validate_metadata(
            self.metadata(),
            postflight=True,
            expected_v42_history_checksum="-123456789",
        )
        with self.assertRaises(runner.RehearsalGuardError):
            runner.validate_metadata(
                self.metadata(),
                postflight=True,
                expected_v42_history_checksum="987654321",
            )

    def test_flyway_checksum_binding_rejects_missing_or_duplicate_v42(self) -> None:
        with self.assertRaises(runner.RehearsalGuardError):
            runner.flyway_v42_history_checksum({"migrations": []})
        with self.assertRaises(runner.RehearsalGuardError):
            runner.flyway_v42_history_checksum(
                {
                    "migrations": [
                        {"version": "42", "state": "Success", "checksum": "1"},
                        {"version": "42", "state": "Success", "checksum": "1"},
                    ],
                }
            )

    def test_v41_is_required_before_v42(self) -> None:
        envelope = {"operation": "info", "database": "lichsuvn", "flywayVersion": "11.14.1", "schemaVersion": "40", "migrations": []}
        with self.assertRaises(runner.RehearsalGuardError):
            runner.validate_flyway_info(envelope, current="41", pending=("42",))

    def test_only_v42_can_be_pending(self) -> None:
        migrations = [
            {"version": str(version), "state": "Success"} for version in range(1, 42)
        ] + [{"version": "42", "state": "Pending"}, {"version": "43", "state": "Pending"}]
        envelope = {"operation": "info", "database": "lichsuvn", "flywayVersion": "11.14.1", "schemaVersion": "41", "migrations": migrations}
        with self.assertRaises(runner.RehearsalGuardError):
            runner.validate_flyway_info(envelope, current="41", pending=("42",))

    def test_metadata_sql_is_select_only_and_checks_both_constraint_catalogs(self) -> None:
        sql = runner.metadata_sql()
        self.assertNotIn("INSERT", sql.upper())
        self.assertNotIn("UPDATE", sql.upper())
        self.assertIn("information_schema.CHECK_CONSTRAINTS", sql)
        self.assertIn("information_schema.TIDB_CHECK_CONSTRAINTS", sql)
        payload = runner.build_mysql_payload(
            host=RehearsalTargetGuardTest.HOST,
            port=4000,
            database="lichsuvn",
            user="branchabc123456789.reader",
            password="secret",
            sql=sql,
        )
        self.assertIn("SHOW STATUS LIKE 'Ssl_version'", payload)


class RehearsalEvidenceTest(unittest.TestCase):
    def test_evidence_digest_is_stable_for_same_payload(self) -> None:
        target = {
            "parent_cluster_id": runner.EXPECTED_PRODUCTION_CLUSTER_ID,
            "branch_name": "lichsuvn3d-admin-v42-rehearsal",
            "branch_id": "bran-abc123456789",
        "user_prefix": "branchabc123456789",
        "production_user_prefix": "productionprefix",
        "host": "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
            "port": 4000,
            "database": "lichsuvn",
        }
        payload = runner._evidence("preflight", target, {"current_version": "41"}, {"users_total": "2"})
        unsigned = dict(payload)
        digest = unsigned.pop("evidence_sha256")
        expected = runner.hashlib.sha256(
            json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        self.assertEqual(digest, expected)


class EmptySubprocessOutputFallbackTest(unittest.TestCase):
    """Spec §8 regression: stream-empty failure surfaces the
    EMPTY_SUBPROCESS_OUTPUT prefix instead of the prior swallow-empty
    `_error("")` path.  Three corner cases: both streams empty, both
    streams whitespace-only, and one substantive stream that must NOT
    trigger the empty fallback."""

    def _stub(self, *, returncode=2, stdout="", stderr=""):
        from tidb_rehearsal_v42_migration import CommandResult

        def executor(args, payload):
            return CommandResult(
                tuple(str(p) for p in args), returncode, stdout, stderr,
            )

        return executor

    def test_empty_stdout_and_stderr_yields_empty_subprocess_output(self):
        from tidb_rehearsal_v42_migration import run_external, RehearsalGuardError
        with self.assertRaises(RehearsalGuardError) as ctx:
            run_external(
                ["docker", "run", "--rm", "image"], "stdin",
                executor=self._stub(returncode=2, stdout="", stderr=""),
                stage="flyway_info",
            )
        text = str(ctx.exception)
        self.assertTrue(text.startswith("EMPTY_SUBPROCESS_OUTPUT:"), text)
        self.assertIn("stage=flyway_info", text)
        self.assertIn("outer_exit=2", text)

    def test_whitespace_only_output_yields_empty_subprocess_output(self):
        from tidb_rehearsal_v42_migration import run_external, RehearsalGuardError
        with self.assertRaises(RehearsalGuardError) as ctx:
            run_external(
                ["docker", "run", "--rm", "image"], "stdin",
                executor=self._stub(returncode=2, stdout="  \n", stderr="\t"),
                stage="mysql_identity_probe",
            )
        text = str(ctx.exception)
        self.assertTrue(text.startswith("EMPTY_SUBPROCESS_OUTPUT:"), text)
        self.assertIn("stage=mysql_identity_probe", text)
        self.assertIn("outer_exit=2", text)

    def test_run_flyway_default_stage_propagates_to_empty_fallback(self):
        """Without explicit stage=, run_flyway(operation='info') must
        default to stage='flyway_info' all the way through to the
        EMPTY_SUBPROCESS_OUTPUT body."""
        from pathlib import Path
        from tidb_rehearsal_v42_migration import run_flyway, CommandResult
        from unittest.mock import patch

        captured_stage: dict[str, str | None] = {"value": None}

        def capture_external(command, stdin, *, secrets=(), executor=None, stage=None):
            captured_stage["value"] = stage
            return CommandResult(tuple(str(p) for p in command), 2, "", "")

        with patch("tidb_rehearsal_v42_migration.run_external", side_effect=capture_external):
            try:
                run_flyway(
                    migration_dir=Path("/tmp/none"),
                    operation="info",
                    config="dummy",
                    image_ref="redgate/flyway:11.14.1@sha256:174513cc63485ab931381b1cceb5c6adea2cf23284910770552cc8c945fb185d",
                    secrets=("user", "pass"),
                )
            except Exception:
                # run_flyway calls base._parse_json_output on the stub
                # CommandResult, which may raise.  The captured stage
                # value is what the assertion inspects.
                pass
        self.assertEqual(captured_stage["value"], "flyway_info")

    def test_meaningful_output_passes_through_unchanged(self):
        from tidb_rehearsal_v42_migration import run_external, RehearsalGuardError
        with self.assertRaises(RehearsalGuardError) as ctx:
            run_external(
                ["docker", "run", "--rm", "image"], "stdin",
                executor=self._stub(returncode=2,
                                     stdout="real error from flyway", stderr=""),
                stage="flyway_info",
            )
        text = str(ctx.exception)
        self.assertFalse(text.startswith("EMPTY_SUBPROCESS_OUTPUT:"), text)
        self.assertIn("real error from flyway", text)


class MigrateAccountAliasContractTest(unittest.TestCase):
    """Section 2 alias contract.

    The legacy ``TIDB_REHEARSAL_MIGRATION_USER`` /
    ``TIDB_REHEARSAL_MIGRATION_PASSWORD`` alias has been removed because
    no external documentation references it and the orchestrator's
    ``build_sanitized_env`` never sets it.  The orchestrator's
    ``FORBIDDEN_FROM_CHILD_ENV`` keeps the legacy name as a defensive
    tripwire in case the alias is ever re-introduced.
    """

    def test_canonical_migrate_user_is_accepted(self) -> None:
        env = {
            "TIDB_REHEARSAL_MIGRATE_USER": "3c7ghu483vq9ynn.m0123abcd",
            "TIDB_REHEARSAL_MIGRATE_PASSWORD": "canonical-pass",
        }
        with patch.dict(runner.os.environ, env, clear=True):
            value = runner._env("TIDB_REHEARSAL_MIGRATE_USER", secret=True)
        self.assertEqual(value, "3c7ghu483vq9ynn.m0123abcd")

    def test_canonical_migrate_password_is_accepted(self) -> None:
        env = {
            "TIDB_REHEARSAL_MIGRATE_USER": "3c7ghu483vq9ynn.m0123abcd",
            "TIDB_REHEARSAL_MIGRATE_PASSWORD": "canonical-pass",
        }
        with patch.dict(runner.os.environ, env, clear=True):
            value = runner._env("TIDB_REHEARSAL_MIGRATE_PASSWORD", secret=True)
        self.assertEqual(value, "canonical-pass")

    def test_legacy_migration_user_alias_is_silently_rejected(self) -> None:
        env = {"TIDB_REHEARSAL_MIGRATION_USER": "3c7ghu483vq9ynn.m0123abcd"}
        with patch.dict(runner.os.environ, env, clear=True):
            with self.assertRaises(runner.RehearsalGuardError) as cm:
                runner._env("TIDB_REHEARSAL_MIGRATE_USER", secret=True)
        msg = str(cm.exception)
        self.assertIn("TIDB_REHEARSAL_MIGRATE_USER", msg)
        # The legacy alias name must not be referenced in the error:
        self.assertNotIn("TIDB_REHEARSAL_MIGRATION_USER", msg)

    def test_legacy_migration_password_alias_is_silently_rejected(self) -> None:
        env = {"TIDB_REHEARSAL_MIGRATION_PASSWORD": "legacy-pass"}
        with patch.dict(runner.os.environ, env, clear=True):
            with self.assertRaises(runner.RehearsalGuardError) as cm:
                runner._env("TIDB_REHEARSAL_MIGRATE_PASSWORD", secret=True)
        msg = str(cm.exception)
        self.assertIn("TIDB_REHEARSAL_MIGRATE_PASSWORD", msg)
        self.assertNotIn("TIDB_REHEARSAL_MIGRATION_PASSWORD", msg)

    def test_env_alias_helper_is_removed(self) -> None:
        # The helper that *enabled* the silent alias mismatch must not
        # be re-introduced under this name (defensive regression pin).
        self.assertFalse(hasattr(runner, "_env_alias"))


class SharedRunnerContractTest(unittest.TestCase):
    """Section 3: black-box pinning of the imported
    ``tidb_production_migration`` primitives.  These tests do not modify
    the production runner; they fail when the shared contract regresses.
    The tests use the rehearsal strict runner's existing public surface
    so they exercise real shape and real error handling.
    """

    def setUp(self) -> None:
        self.docker_executable = str(Path(sys.executable).resolve())
        self.base_docker_resolver = patch.object(
            base,
            "resolve_docker_executable",
            return_value=self.docker_executable,
        )
        self.runner_docker_resolver = patch.object(
            runner.base,
            "resolve_docker_executable",
            return_value=self.docker_executable,
        )
        self.base_docker_resolver.start()
        self.runner_docker_resolver.start()
        self.addCleanup(self.base_docker_resolver.stop)
        self.addCleanup(self.runner_docker_resolver.stop)

    def test_pinned_flyway_image(self) -> None:
        self.assertEqual(base.FLYWAY_IMAGE, "redgate/flyway:11.14.1")

    def test_pinned_mysql_client_image(self) -> None:
        self.assertEqual(base.MYSQL_CLIENT_IMAGE, "mysql:8.0.36")

    def test_sql_marker_is_immutable(self) -> None:
        self.assertEqual(base.SQL_MARKER, "__LSVN3D_SQL_PAYLOAD__")
        self.assertEqual(runner.SQL_MARKER, "__LSVN3D_SQL_PAYLOAD__")

    def test_mysql_ca_bundle_path_is_absolute_and_canonical(self) -> None:
        import os as _os
                # Cross-platform absolute-path check: the production runner pins the
        # Oracle-Linux Oracle-RHCSA ca-bundle path which is rooted at /.
        # `os.path.isabs` returns False on Windows for leading-slash paths,
        # so use the language-neutral literal claim.
        self.assertTrue(base.MYSQL_CA_BUNDLE.startswith("/"))
        self.assertTrue(base.MYSQL_CA_BUNDLE.endswith("ca-bundle.crt"))

    def test_command_result_is_frozen_dataclass_with_expected_fields(self) -> None:
        import dataclasses as _dc
        self.assertTrue(_dc.is_dataclass(base.CommandResult))
        names = {f.name for f in _dc.fields(base.CommandResult)}
        self.assertEqual(names, {"args", "returncode", "stdout", "stderr"})

    def test_build_flyway_command_keeps_no_pull_and_translates_target(self) -> None:
        cmd = runner.build_flyway_command(
            Path("/tmp/lsvn3d-v42-shared"),
            "migrate",
            image_ref=f"redgate/flyway:11.14.1@sha256:{'a' * 64}",
        )
        self.assertEqual(cmd[0], self.docker_executable)
        self.assertTrue(Path(cmd[0]).is_absolute())
        self.assertIn("--pull=never", cmd)
        # The strict runner must rewrite -target=41 to -target=42.
        self.assertIn("-target=42", cmd)
        self.assertNotIn("-target=41", cmd)

    def test_strict_runner_rejects_non_allowlisted_operations(self) -> None:
        for op in ("repair", "baseline", "clean", "", "INFO", "MIGRATE"):
            with self.assertRaises(runner.RehearsalGuardError):
                runner.build_flyway_command(Path("/tmp"), op, image_ref="x")

    def test_build_mysql_command_carries_image_ref_and_no_pull(self) -> None:
        image_ref = f"mysql:8.0.36@sha256:{'a' * 64}"
        cmd = base.build_mysql_command(image_ref=image_ref)
        self.assertEqual(cmd[0], self.docker_executable)
        self.assertTrue(Path(cmd[0]).is_absolute())
        self.assertIn(image_ref, cmd)
        self.assertIn("--pull=never", cmd)
        self.assertIn("-i", cmd)

    def test_redact_output_replaces_exact_secret_substring(self) -> None:
        out = base.redact_output("auth failed: pwd=secret_xyz", ["secret_xyz"])
        self.assertNotIn("secret_xyz", out)
        # Production runner redacts with [REDACTED] (not the orchestrator's
        # ***REDACTED*** marker).  Pin the production contract.
        self.assertIn("[REDACTED]", out)

    def test_redact_output_strips_jdbc_url_credentials(self) -> None:
        out = base.redact_output(
            "Flyway error jdbc:mysql://userX:pwdY@gateway.example/db?sslMode=ID"
        )
        self.assertNotIn("userX", out)
        self.assertNotIn("pwdY", out)
        self.assertIn("[REDACTED]", out)

    def test_read_only_sql_statements_rejects_ddl_dml(self) -> None:
        for stmt in (
            "CREATE TABLE x (id INT)",
            "DROP TABLE x",
            "INSERT INTO x VALUES (1)",
            "DELETE FROM x WHERE id=1",
        ):
            with self.assertRaises(base.MigrationGuardError):
                base._read_only_sql_statements(stmt)

    def test_read_only_sql_statements_rejects_unsafe_select_clauses(self) -> None:
        for clause in (
            "SELECT 1 FOR UPDATE",
            "SELECT 1 LOCK IN SHARE MODE",
            "SELECT 1 INTO OUTFILE '/tmp/x'",
            "SELECT LOAD_FILE('/tmp/x')",
            "SELECT SLEEP(10)",
        ):
            with self.assertRaises(base.MigrationGuardError):
                base._read_only_sql_statements(clause)

    def test_read_only_sql_statements_rejects_sql_comments(self) -> None:
        for stmt in (
            "SELECT 1; -- comment",
            "SELECT 1 /* block */",
            "SELECT 1 # MySQL",
        ):
            with self.assertRaises(base.MigrationGuardError):
                base._read_only_sql_statements(stmt)

    def test_read_only_sql_statements_accepts_benign_multi_select(self) -> None:
        stmts = base._read_only_sql_statements("SELECT 'a' AS k; SELECT 'b' AS k;")
        self.assertEqual(len(stmts), 2)
        self.assertEqual(stmts[0], "SELECT 'a' AS k")

    def test_validate_image_digest_returns_match_and_rejects_mismatch(self) -> None:
        good = f"sha256:{'a' * 64}"
        bad = f"sha256:{'b' * 64}"
        self.assertEqual(base.validate_image_digest(good, good), good)
        with self.assertRaises(base.MigrationGuardError):
            base.validate_image_digest(bad, good)

    def test_find_flyway_callbacks_returns_empty_on_clean_dir(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "V1__x.sql").write_bytes(b"")
            (d / "V2__y.sql").write_bytes(b"")
            self.assertEqual(base.find_flyway_callbacks(d), [])

    def test_find_flyway_callbacks_returns_non_empty_when_callback_present(self) -> None:
        # Positive-case regression guard: a callback file must surface.
        # CALLBACK_NAME = ^(before|after)[A-Za-z0-9_.-]*\.(sql|java|class)$
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "V1__x.sql").write_bytes(b"")
            (d / "beforeMigrate.sql").write_bytes(b"SELECT 1;\n")
            (d / "afterEachMigrate.sql").write_bytes(b"")
            (d / "V2__y.sql").write_bytes(b"")
            callbacks = base.find_flyway_callbacks(d)
            names = sorted(p.name for p in callbacks)
            self.assertEqual(names, ["afterEachMigrate.sql", "beforeMigrate.sql"])

    def test_strict_runner_find_callbacks_raises_when_callback_present(self) -> None:
        # Pair to the negative-case regression guard: the strict runner's
        # wrapper must translate a non-empty callbacks list into
        # RehearsalGuardError, not a silent pass.
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "V1__x.sql").write_bytes(b"")
            (d / "afterMigrate.sql").write_bytes(b"")
            with self.assertRaises(runner.RehearsalGuardError) as cm:
                runner.find_callbacks(d)
            self.assertIn("callbacks", str(cm.exception).lower())

    def test_normalise_state_lowercases_and_normalises_separators(self) -> None:
        self.assertEqual(base._normalise_state("Success"), "success")
        self.assertEqual(base._normalise_state("OUT_OF_ORDER"), "out of order")
        self.assertEqual(base._normalise_state(None), "")

    def test_validate_local_docker_environment_blocks_redis_url_vars(self) -> None:
        # The contract is: any of DOCKER_HOST/CONTEXT/TLS_VERIFY/CERT_PATH
        # being set must fail closed.  DOCKER_HOST is the representative case.
        with patch.dict(os.environ, {"DOCKER_HOST": "tcp://1.2.3.4:2375"}, clear=False):
            with self.assertRaises(base.MigrationGuardError) as cm:
                base.validate_local_docker_environment()
        self.assertIn("DOCKER_HOST", str(cm.exception))


if __name__ == "__main__":
    unittest.main()

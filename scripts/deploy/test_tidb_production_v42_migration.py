"""Unit tests for ``tidb_production_v42_migration``.

Tests are deterministic and never contact TiDB, Docker, ``ticloud`` or
any remote service.  All subprocess calls are mocked.

Coverage layout (matches the task spec):

  IdentityTest          -- cluster/branch/userPrefix/host/port/confirmation
  FlywayStateTest       -- V41+V42, V37, already-V42, more-than-V42-pending
  ManifestTest          -- V42 drift, callback, manifest-pin mismatch
  CommandSafetyTest     -- allowlist, repair/baseline/clean rejected, TLS,
                            --pull=never, empty subprocess, redaction,
                            stdin, image-digest
  PostflightTest        -- 18 columns, 6 CHK, cleanup table, count drift,
                            V42 history row, CHECK-support flag
  SharedBaseContractTest -- narrow compatibility pins on the imported base
                            helpers so any future refactor of
                            tidb_production_migration cannot silently
                            regress the V42 runner.
"""

from __future__ import annotations

import importlib.util
import io
import json
import hashlib
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch  # noqa: F401  -- kept for SharedBaseContractTest fidelity

HERE = Path(__file__).resolve().parent
SPEC_BASE = importlib.util.spec_from_file_location(
    "tidb_production_migration", HERE / "tidb_production_migration.py"
)
assert SPEC_BASE and SPEC_BASE.loader
base = importlib.util.module_from_spec(SPEC_BASE)
sys.modules[SPEC_BASE.name] = base
SPEC_BASE.loader.exec_module(base)

SPEC = importlib.util.spec_from_file_location(
    "tidb_production_v42_migration", HERE / "tidb_production_v42_migration.py"
)
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)


# ============================================================================
# IdentityTest
# ============================================================================


class IdentityTest(unittest.TestCase):
    """Production target-identity contract."""

    def _evidence(self, **overrides) -> dict[str, str]:
        base_evidence = {
            "source": "ticloud",
            "state": "ACTIVE",
            "cluster_id": runner.EXPECTED_PRODUCTION_CLUSTER_ID,
            "display_name": runner.EXPECTED_DISPLAY_NAME,
            "target_identity": runner.EXPECTED_TARGET_IDENTITY,
            "host": "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
            "database": runner.EXPECTED_DATABASE,
            "user_prefix": "RHVnC4pobyyHQJT",
            "engine_version": "TiDB Server v8.5.3",
            "collected_at": "2026-07-23T12:00:00Z",
        }
        base_evidence.update(overrides)
        return base_evidence

    def _write_evidence(self, directory: Path) -> tuple[Path, str]:
        evidence_dir = directory / "evidence"
        evidence_dir.mkdir(parents=True, exist_ok=True)
        evidence_path = evidence_dir / "identity-evidence.json"
        sha_path = evidence_dir / "identity-evidence.sha256"
        body = json.dumps(self._evidence(), separators=(",", ":"), sort_keys=True) + "\n"
        sha = runner.__loader__ if False else None  # placeholder for clarity
        import hashlib
        sha = hashlib.sha256(body.encode("utf-8")).hexdigest()
        evidence_path.write_bytes(body.encode("utf-8"))
        sha_path.write_text(sha + "\n", encoding="utf-8")
        return evidence_path, sha

    def test_exact_production_cluster_accepted(self) -> None:
        evidence = self._evidence()
        target = runner.validate_target(
            host=evidence["host"],
            port=4000,
            database=evidence["database"],
            display_name=evidence["display_name"],
            cluster_id=evidence["cluster_id"],
            target_identity=evidence["target_identity"],
            user_prefix=evidence["user_prefix"],
            confirmation=f"main@{evidence['host']}/{evidence['database']}:41->42",
        )
        self.assertEqual(target["cluster_id"], runner.EXPECTED_PRODUCTION_CLUSTER_ID)
        self.assertEqual(target["target_identity"], "main")
        self.assertEqual(target["database"], "lichsuvn")

    def test_wrong_display_name_rejected(self) -> None:
        evidence = self._evidence(display_name="wrong-display")
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_target(
                host=evidence["host"], port=4000, database=evidence["database"],
                display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
                target_identity=evidence["target_identity"],
                user_prefix=evidence["user_prefix"],
                confirmation=f"main@{evidence['host']}/{evidence['database']}:41->42",
            )

    def test_wrong_cluster_id_rejected(self) -> None:
        evidence = self._evidence(cluster_id="not-the-base-cluster")
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_target(
                host=evidence["host"], port=4000, database=evidence["database"],
                display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
                target_identity=evidence["target_identity"],
                user_prefix=evidence["user_prefix"],
                confirmation=f"main@{evidence['host']}/{evidence['database']}:41->42",
            )

    def test_technical_branch_id_rejected_as_cluster(self) -> None:
        evidence = self._evidence(cluster_id="bran-3uewl2rhirehfg67jczif3bet4")
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_target(
                host=evidence["host"], port=4000, database=evidence["database"],
                display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
                target_identity=evidence["target_identity"],
                user_prefix=evidence["user_prefix"],
                confirmation=f"main@{evidence['host']}/{evidence['database']}:41->42",
            )

    def test_rehearsal_user_prefix_rejected(self) -> None:
        evidence = self._evidence(user_prefix=runner.REHEARSAL_FIXTURE_PREFIX)
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_target(
                host=evidence["host"], port=4000, database=evidence["database"],
                display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
                target_identity=evidence["target_identity"],
                user_prefix=evidence["user_prefix"],
                confirmation=f"main@{evidence['host']}/{evidence['database']}:41->42",
            )

    def test_correct_shared_gateway_allowed(self) -> None:
        evidence = self._evidence()
        target = runner.validate_target(
            host=evidence["host"], port=4000, database=evidence["database"],
            display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
            target_identity=evidence["target_identity"],
            user_prefix=evidence["user_prefix"],
            confirmation=f"main@{evidence['host']}/{evidence['database']}:41->42",
        )
        self.assertEqual(target["host"], evidence["host"])

    def test_wrong_port_rejected(self) -> None:
        evidence = self._evidence()
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_target(
                host=evidence["host"], port=3306, database=evidence["database"],
                display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
                target_identity=evidence["target_identity"],
                user_prefix=evidence["user_prefix"],
                confirmation=f"main@{evidence['host']}/{evidence['database']}:41->42",
            )

    def test_wrong_database_rejected(self) -> None:
        evidence = self._evidence(database="not_lichsuvn")
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_target(
                host=evidence["host"], port=4000, database=evidence["database"],
                display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
                target_identity=evidence["target_identity"],
                user_prefix=evidence["user_prefix"],
                confirmation=f"main@{evidence['host']}/not_lichsuvn:41->42",
            )

    def test_non_tidbcloud_host_rejected(self) -> None:
        evidence = self._evidence(host="db.example.com")
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_target(
                host=evidence["host"], port=4000, database=evidence["database"],
                display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
                target_identity=evidence["target_identity"],
                user_prefix=evidence["user_prefix"],
                confirmation=f"main@{evidence['host']}/{evidence['database']}:41->42",
            )

    def test_v37_to_v41_confirmation_rejected(self) -> None:
        evidence = self._evidence()
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_target(
                host=evidence["host"], port=4000, database=evidence["database"],
                display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
                target_identity=evidence["target_identity"],
                user_prefix=evidence["user_prefix"],
                confirmation=f"main@{evidence['host']}/{evidence['database']}:37->41",
            )

    def test_placeholder_confirmation_rejected(self) -> None:
        evidence = self._evidence()
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_target(
                host=evidence["host"], port=4000, database=evidence["database"],
                display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
                target_identity=evidence["target_identity"],
                user_prefix=evidence["user_prefix"],
                confirmation="REPLACE-ME",
            )

    def test_target_identity_other_than_main_rejected(self) -> None:
        evidence = self._evidence(target_identity="rehearsal-branch")
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_target(
                host=evidence["host"], port=4000, database=evidence["database"],
                display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
                target_identity=evidence["target_identity"],
                user_prefix=evidence["user_prefix"],
                confirmation=f"main@{evidence['host']}/{evidence['database']}:41->42",
            )

    def test_identity_evidence_user_prefix_binding_rejects_rehearsal_account(self) -> None:
        evidence = self._evidence()
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_user_prefix_binding(
                identity=evidence,
                session_user=f"{runner.REHEARSAL_FIXTURE_PREFIX}.root@%",
            )

    def test_identity_evidence_user_prefix_binding_accepts_production_account(self) -> None:
        evidence = self._evidence(user_prefix="RHVnC4pobyyHQJT")
        runner.validate_user_prefix_binding(
            identity=evidence,
            session_user="RHVnC4pobyyHQJT.userread@%",
        )

    def test_engine_version_v851_required(self) -> None:
        # Write a complete, valid-shaped evidence file with a non-V8.5.3
        # engine_version, prove the runner rejects it on the engine
        # branch without falling through any earlier check.
        import hashlib as _hashlib
        evidence = self._evidence(engine_version="TiDB v9.0.0")
        body = (json.dumps(evidence, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")
        sha = _hashlib.sha256(body).hexdigest()
        with tempfile.TemporaryDirectory() as td:
            evidence_path = Path(td) / "identity-evidence.json"
            evidence_path.write_bytes(body)
            with self.assertRaises(runner.ProductionRunnerError) as cm:
                runner.load_identity_evidence(evidence_path, sha)
            self.assertIn(
                "engine_version", str(cm.exception).lower(),
                "the engine-version rejection must surface explicitly",
            )

    def test_accepted_confirmation_shape(self) -> None:
        evidence = self._evidence()
        expected = (
            f"main@{evidence['host']}/{evidence['database']}:41->42"
        )
        target = runner.validate_target(
            host=evidence["host"], port=4000, database=evidence["database"],
            display_name=evidence["display_name"], cluster_id=evidence["cluster_id"],
            target_identity=evidence["target_identity"],
            user_prefix=evidence["user_prefix"],
            confirmation=expected,
        )
        self.assertEqual(target["confirmation"], expected)


# ============================================================================
# FlywayStateTest
# ============================================================================


def _flyway_info(*, current: str, pending: Sequence[str], failed: bool = False,
                 unknown_extra: Sequence[str] = ()) -> dict[str, Any]:
    migrations = []
    applied = [str(version) for version in range(1, int(current) + 1)]
    for version in applied:
        migrations.append({
            "version": version, "description": "applied",
            "type": "SQL", "script": f"V{version}__x.sql",
            "checksum": 1, "installed_by": "tester",
            "installed_on": "2026-01-01",
            "execution_time": 0, "success": not failed,
            "state": "success" if not failed else "failed",
        })
    for version in pending:
        migrations.append({
            "version": str(version), "description": "pending",
            "type": "SQL", "script": f"V{version}__x.sql",
            "checksum": 1, "installed_by": "tester",
            "installed_on": "2026-01-01",
            "execution_time": 0, "success": False,
            "state": "pending",
        })
    for version in unknown_extra:
        migrations.append({
            "version": str(version), "description": "extra",
            "type": "SQL", "script": f"V{version}__x.sql",
            "checksum": 1, "installed_by": "tester",
            "installed_on": "2026-01-01",
            "execution_time": 0, "success": False,
            "state": "pending",
        })
    return {
        "operation": "info",
        "success": True,
        "database": "lichsuvn",
        "flywayVersion": "11.14.1",
        "schemaVersion": current,
        "migrations": migrations,
        "warnings": [],
    }


class FlywayStateTest(unittest.TestCase):
    def test_v41_with_v42_pending_accepted(self) -> None:
        info = _flyway_info(current="41", pending=("42",))
        state = runner.validate_flyway_info_for_v42(info)
        self.assertEqual(state["current_version"], "41")
        self.assertEqual(state["pending_versions"], ["42"])

    def test_already_v42_rejected_for_v42_info_call(self) -> None:
        # When current=42 is reported in info, the V42-specific wrapper
        # for the preflight / migrate mode expects pending=("42") but
        # current=42.  We expect the base validator to refuse because
        # the applied set is V1..V41 yet current=42 implies applied set
        # is V1..V42, so the contract is broken unless the operator
        # actually finished the migration.  For preflight, current=42
        # means we are already past the V42 transition.
        info = _flyway_info(current="42", pending=())
        with self.assertRaises(base.MigrationGuardError):
            runner.validate_flyway_info_for_v42(info)

    def test_v37_current_rejected(self) -> None:
        info = _flyway_info(current="37", pending=("38", "39", "40", "41", "42"))
        with self.assertRaises(base.MigrationGuardError):
            runner.validate_flyway_info_for_v42(info)

    def test_more_than_v42_pending_rejected(self) -> None:
        info = _flyway_info(current="41", pending=("42", "43"))
        with self.assertRaises(base.MigrationGuardError):
            runner.validate_flyway_info_for_v42(info)

    def test_failed_migration_rejected(self) -> None:
        info = _flyway_info(current="41", pending=("42",), failed=True)
        with self.assertRaises(base.MigrationGuardError):
            runner.validate_flyway_info_for_v42(info)

    def test_validate_failure_rejected(self) -> None:
        info = _flyway_info(current="41", pending=("42",))
        with self.assertRaises(base.MigrationGuardError):
            base.validate_flyway_validate({
                "operation": "validate",
                "database": "lichsuvn",
                "flywayVersion": "11.14.1",
                "validationSuccessful": False,
                "invalidMigrations": [],
                "warnings": [],
            })

    def test_migrate_validation_requires_v41_to_v42_only(self) -> None:
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_flyway_migrate_for_v42({
                "operation": "migrate",
                "success": True,
                "database": "lichsuvn",
                "flywayVersion": "11.14.1",
                "initialSchemaVersion": "40",
                "targetSchemaVersion": "42",
                "migrationsExecuted": 2,
                "migrations": [
                    {"version": "41"},
                    {"version": "42"},
                ],
                "warnings": [],
            })
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_flyway_migrate_for_v42({
                "operation": "migrate",
                "success": True,
                "database": "lichsuvn",
                "flywayVersion": "11.14.1",
                "initialSchemaVersion": "41",
                "targetSchemaVersion": "43",
                "migrationsExecuted": 1,
                "migrations": [{"version": "42"}],
                "warnings": [],
            })
        # happy path
        runner.validate_flyway_migrate_for_v42({
            "operation": "migrate",
            "success": True,
            "database": "lichsuvn",
            "flywayVersion": "11.14.1",
            "initialSchemaVersion": "41",
            "targetSchemaVersion": "42",
            "migrationsExecuted": 1,
            "migrations": [{"version": "42"}],
            "warnings": [],
        })


# ============================================================================
# ManifestTest
# ============================================================================


class ManifestTest(unittest.TestCase):
    def test_local_check_reports_v42_manifest_match(self) -> None:
        # Build a 42-entry manifest with bodies whose sha256 matches each
        # listed digest; copy the live V42 SQL body so the V42 entry match
        # holds without monkeypatching.
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            migration_rel = "backend/src/main/resources/db/migration"
            (d / "scripts/deploy").mkdir(parents=True, exist_ok=True)
            (d / migration_rel).mkdir(parents=True, exist_ok=True)
            lines: list[str] = []
            for i in range(1, 42):
                name = f"V{i}__x.sql"
                body = f"-- fixture V{i}\n".encode("utf-8")
                digest = hashlib.sha256(body).hexdigest()
                lines.append(f"{digest}  {name}")
                (d / migration_rel / name).write_bytes(body)
            v42_name = runner.EXPECTED_V42_SQL_FILE
            v42_live = (
                Path(__file__).resolve().parents[2]
                / "backend" / "src" / "main" / "resources" / "db" / "migration"
                / v42_name
            )
            v42_body = v42_live.read_bytes()
            self.assertEqual(
                hashlib.sha256(v42_body).hexdigest(),
                runner.EXPECTED_V42_SQL_SHA,
                "live V42 SQL content must already hash to the approved sha",
            )
            lines.append(f"{runner.EXPECTED_V42_SQL_SHA}  {v42_name}")
            (d / migration_rel / v42_name).write_bytes(v42_body)
            (d / "scripts/deploy/tidb-production-v42.sha256").write_text(
                "\n".join(lines) + "\n", encoding="utf-8"
            )
            result = runner.local_check(d)
            self.assertEqual(result["migration_count"], 42)
            self.assertTrue(result["v42_entry_sha256_match"])
            self.assertEqual(result["last_migration"], v42_name)

    def test_live_repository_local_check_passes(self) -> None:
        # Real-repository regression: the committed production V42 manifest
        # must verify against the actual checked-out V1..V42 SQL files,
        # not only a synthetic tempdir.  On Windows ``core.autocrlf=true``
        # checks most SQL files out with CRLF; the hasher must normalise
        # CRLF -> LF so the manifest (LF Git-blob hashes) matches.
        repo_root = Path(__file__).resolve().parents[2]
        result = runner.local_check(repo_root)
        self.assertEqual(result["migration_count"], 42)
        self.assertEqual(result["first_migration"], "V1__users_roles.sql")
        self.assertEqual(
            result["last_migration"], runner.EXPECTED_V42_SQL_FILE
        )
        self.assertTrue(result["v42_entry_sha256_match"])

    def test_crlf_working_tree_sql_matches_lf_manifest(self) -> None:
        # Windows line-ending regression: SQL files checked out with CRLF
        # must verify against a manifest that records LF (Git blob)
        # hashes.  This is the exact live-mismatch scenario reported by
        # the production V42 runner on V10..V41.
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            migration_rel = "backend/src/main/resources/db/migration"
            (d / "scripts/deploy").mkdir(parents=True, exist_ok=True)
            (d / migration_rel).mkdir(parents=True, exist_ok=True)
            lines: list[str] = []
            for i in range(1, 42):
                name = f"V{i}__x.sql"
                lf_body = f"-- fixture V{i}\n".encode("utf-8")
                digest = hashlib.sha256(lf_body).hexdigest()
                lines.append(f"{digest}  {name}")
                # Working-tree copy carries Windows CRLF endings.
                (d / migration_rel / name).write_bytes(
                    lf_body.replace(b"\n", b"\r\n")
                )
            v42_name = runner.EXPECTED_V42_SQL_FILE
            v42_live = (
                Path(__file__).resolve().parents[2]
                / "backend" / "src" / "main" / "resources" / "db" / "migration"
                / v42_name
            )
            v42_body = v42_live.read_bytes()
            self.assertEqual(
                hashlib.sha256(v42_body).hexdigest(),
                runner.EXPECTED_V42_SQL_SHA,
                "live V42 SQL content must already hash to the approved sha",
            )
            lines.append(f"{runner.EXPECTED_V42_SQL_SHA}  {v42_name}")
            (d / migration_rel / v42_name).write_bytes(v42_body)
            (d / "scripts/deploy/tidb-production-v42.sha256").write_text(
                "\n".join(lines) + "\n", encoding="utf-8"
            )
            result = runner.local_check(d)
            self.assertEqual(result["migration_count"], 42)
            self.assertTrue(result["v42_entry_sha256_match"])

    def test_callback_in_migration_source_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "scripts/deploy").mkdir(parents=True, exist_ok=True)
            (d / "backend/src/main/resources/db/migration").mkdir(parents=True, exist_ok=True)
            manifest_lines = ["e24949201f5d291e57b04472b3cda1d65811b26ea6a899a550f38ab70ff15a43  V42__add_managed_event_image_storage.sql"]
            manifest_lines.extend([f"{'0' * 64}  V{i}__x.sql" for i in range(1, 42)])
            (d / "scripts/deploy/tidb-production-v42.sha256").write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")
            for i in range(1, 42):
                (d / "backend/src/main/resources/db/migration" / f"V{i}__x.sql").write_bytes(b"")
            (d / "backend/src/main/resources/db/migration/V42__add_managed_event_image_storage.sql").write_bytes(b"")
            (d / "backend/src/main/resources/db/migration" / "afterEachMigrate.sql").write_bytes(b"")
            with self.assertRaises(runner.ProductionRunnerError):
                runner.local_check(d)

    def test_manifest_pin_drift_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            (d / "scripts/deploy").mkdir(parents=True, exist_ok=True)
            (d / "scripts/deploy/tidb-production-v42.sha256").write_bytes(b"corrupted")
            with self.assertRaises(runner.ProductionRunnerError):
                runner.local_check(d)


# ============================================================================
# CommandSafetyTest
# ============================================================================


class CommandSafetyTest(unittest.TestCase):
    def test_flyway_allowlist_rejects_repair(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(base.MigrationGuardError):
                base.build_flyway_command(
                    Path(td), "repair", image_ref="redgate/flyway@sha256:" + "a" * 64,
                )

    def test_flyway_allowlist_rejects_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(base.MigrationGuardError):
                base.build_flyway_command(
                    Path(td), "baseline", image_ref="redgate/flyway@sha256:" + "a" * 64,
                )

    def test_flyway_allowlist_rejects_clean(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(base.MigrationGuardError):
                base.build_flyway_command(
                    Path(td), "clean", image_ref="redgate/flyway@sha256:" + "a" * 64,
                )

    def test_flyway_allowlist_accepts_info_validate_migrate(self) -> None:
        # Allow ``-baselineOnMigrate`` flags (which contain the substring
        # 'baseline') but reject the subcommand keywords ``repair``,
        # ``baseline`` and ``clean`` as STANDALONE tokens in the argv.
        with tempfile.TemporaryDirectory() as td:
            for op in ("info", "validate", "migrate"):
                cmd = base.build_flyway_command(
                    Path(td), op, image_ref="redgate/flyway@sha256:" + "a" * 64,
                )
                cmd_str = " ".join(cmd)
                self.assertIn("--pull=never", cmd_str)
                self.assertIn("-i", cmd_str)
                self.assertIn(op, cmd_str)
                for forbidden in ("repair", "baseline", "clean"):
                    token_hits = [tok for tok in cmd if tok == forbidden]
                    self.assertEqual(
                        token_hits, [],
                        f"forbidden Flyway subcommand {forbidden!r} appeared "
                        f"as a standalone token in {cmd!r}",
                    )

    def test_mysql_command_carries_image_ref_and_stdin_flag(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            cmd = base.build_mysql_command(
                image_ref="mysql@sha256:" + "b" * 64,
            )
            cmd_str = " ".join(cmd)
            self.assertIn("mysql@sha256:" + "b" * 64, cmd_str)
            self.assertIn("--pull=never", cmd_str)
            self.assertIn("-i", cmd_str)

    def test_redact_output_uses_production_marker(self) -> None:
        redacted = base.redact_output(
            "jdbc:mysql://alice:secret123@gateway.example/lichsuvn",
            secrets=("secret123",),
        )
        self.assertIn("[REDACTED]", redacted)
        self.assertNotIn("secret123", redacted)

    def test_validate_image_digest_match_returns_digest(self) -> None:
        self.assertEqual(
            base.validate_image_digest(
                "sha256:" + "a" * 64, "sha256:" + "a" * 64,
            ),
            "sha256:" + "a" * 64,
        )

    def test_validate_image_digest_mismatch_rejected(self) -> None:
        with self.assertRaises(base.MigrationGuardError):
            base.validate_image_digest(
                "sha256:" + "a" * 64, "sha256:" + "b" * 64,
            )

    def test_validate_local_docker_environment_blocks_redirection(self) -> None:
        with patch.dict(os.environ, {"DOCKER_HOST": "tcp://1.2.3.4:2375"}, clear=False):
            with self.assertRaises(base.MigrationGuardError):
                base.validate_local_docker_environment()


# ============================================================================
# PostflightTest
# ============================================================================


def _metadata(*, before: dict[str, str]) -> dict[str, str]:
    base_metadata = {
        "server_version": "TiDB Server v8.5.3",
        "version_comment": "TiDB Server",
        "database": "lichsuvn",
        "global_time_zone": "UTC",
        "session_time_zone": "UTC",
        "character_set_database": "utf8mb4",
        "collation_database": "utf8mb4_bin",
        "sql_mode": "ONLY_FULL_GROUP_BY",
        "active_admin_count": "2",
        "failed_migration_count": "0",
        "users_total": "3",
        "events_total": "361",
        "user_roles_total": "5",
        "roles_total": "3",
        "admin_role_assignment_count": "2",
        "role_code_counts": "admin=1,user=1,guest=1",
        "role_assignment_counts": "admin=2,user=2,guest=1",
        "event_status_counts": "published=350,draft=11",
        "user_status_counts": "active=3",
        "users.auth_version": "5",
        "event_media_total": before.get("event_media_total", "0"),
        "session_user": "RHVnC4pobyyHQJT.userread@%",
        "session_user_prefix_verified": "1",
    }
    extra = {
        "v42_managed_columns": ",".join(sorted(runner.MANAGED_STORAGE_COLUMNS)),
        "v42_media_indexes": ",".join(sorted(runner.V42_EVENT_MEDIA_INDEXES)),
        "v42_fk_event_media_uploaded_by": "1",
        "v42_cleanup_table": "1",
        "v42_cleanup_constraints": ",".join(sorted(runner.V42_CLEANUP_CONSTRAINTS)),
        "v42_check_constraints": ",".join(sorted(runner.ALL_V42_CHECK_CONSTRAINTS)),
        "v42_tidb_check_constraints": ",".join(sorted(runner.ALL_V42_CHECK_CONSTRAINTS)),
        "tidb_enable_check_constraint": "1",
        "v42_success_rows": "1",
        "v42_history_checksum": "1234567",
        "session_user": "RHVnC4pobyyHQJT.userread@%",
    }
    base_metadata.update(extra)
    return base_metadata


class PostflightTest(unittest.TestCase):
    def test_v42_postflight_extras_accepts_correct_metadata(self) -> None:
        before = {
            "users_total": "3", "events_total": "361",
            "event_media_total": "0", "active_admin_count": "2",
        }
        runner.validate_v42_postflight_extras(_metadata(before=before), before=before)

    def test_missing_managed_column_rejected(self) -> None:
        before = {"users_total": "3", "events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        cols = {c for c in metadata["v42_managed_columns"].split(",") if c}
        cols.remove("managed_asset_id")
        metadata["v42_managed_columns"] = ",".join(cols)
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_missing_check_constraint_rejected(self) -> None:
        before = {"users_total": "3", "events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        cols = {c for c in metadata["v42_check_constraints"].split(",") if c}
        cols.discard("chk_event_media_storage_state")
        metadata["v42_check_constraints"] = metadata["v42_tidb_check_constraints"] = ",".join(cols)
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_disabled_check_support_rejected(self) -> None:
        before = {"users_total": "3", "events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        metadata["tidb_enable_check_constraint"] = "0"
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_count_drift_rejected(self) -> None:
        before = {"users_total": "3", "events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        metadata["users_total"] = "4"
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_more_than_one_v42_success_row_rejected(self) -> None:
        before = {"users_total": "3", "events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        metadata["v42_success_rows"] = "2"
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_absence_of_v42_history_checksum_rejected(self) -> None:
        before = {"users_total": "3", "events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        metadata["v42_history_checksum"] = ""
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)


# ============================================================================
# DocumentationContractTest
# ============================================================================


class DocumentationContractTest(unittest.TestCase):
    """Keep the production runbook aligned with runtime image identities."""

    def test_runbook_contains_exact_runtime_image_references(self) -> None:
        self.assertEqual(
            runner.APPROVED_FLYWAY_IMAGE_DIGEST,
            base.APPROVED_IMAGE_DIGESTS[base.FLYWAY_IMAGE],
        )
        self.assertEqual(
            runner.APPROVED_MYSQL_IMAGE_DIGEST,
            base.APPROVED_IMAGE_DIGESTS[base.MYSQL_CLIENT_IMAGE],
        )

        operator_digests = {
            "TIDB_PRODUCTION_FLYWAY_IMAGE_DIGEST": runner.APPROVED_FLYWAY_IMAGE_DIGEST,
            "TIDB_PRODUCTION_MYSQL_IMAGE_DIGEST": runner.APPROVED_MYSQL_IMAGE_DIGEST,
        }
        approved_by_image = {
            base.FLYWAY_IMAGE: runner.APPROVED_FLYWAY_IMAGE_DIGEST,
            base.MYSQL_CLIENT_IMAGE: runner.APPROVED_MYSQL_IMAGE_DIGEST,
        }

        def fake_inspect(command, **_kwargs):
            image = command[3]
            digest = approved_by_image[image]
            repository = image.rsplit(":", 1)[0]
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=json.dumps([f"{repository}@{digest}"]),
                stderr="",
            )

        with (
            patch.object(base, "_env", side_effect=operator_digests.__getitem__),
            patch.object(base.subprocess, "run", side_effect=fake_inspect),
        ):
            runtime_references = base.verify_docker_images()

        runbook = (
            HERE.parents[1] / "docs" / "admin" / "TIDB_PRODUCTION_V42_RUNBOOK.md"
        ).read_text(encoding="utf-8")
        for image, expected_reference in runtime_references.items():
            repository = image.rsplit(":", 1)[0]
            documented_references = set(
                re.findall(
                    rf"{re.escape(repository)}(?:\:[A-Za-z0-9._-]+)?"
                    rf"@sha256:[0-9a-f]{{64}}",
                    runbook,
                )
            )
            self.assertEqual(documented_references, {expected_reference})

        self.assertNotIn("sha256:174513cc63...?", runbook)
        self.assertNotIn("sha256:a532724022...?", runbook)


# ============================================================================
# ReleaseEEvidenceOrderingTest
# ============================================================================


class ReleaseEEvidenceOrderingTest(unittest.TestCase):
    """Evidence must fail before info/validate and be refreshed before migrate."""

    def test_preflight_evidence_gate_precedes_all_remote_commands(self) -> None:
        calls = []

        def forbidden_executor(command, payload):
            calls.append((command, payload))
            raise AssertionError("remote command must not execute")

        blocker = runner.release_e_evidence.EvidenceContractError(
            "BLOCKED_PRODUCTION_BACKUP_EVIDENCE", "backup expired"
        )
        with patch.object(runner, "validate_release_e_evidence", side_effect=blocker):
            with self.assertRaisesRegex(
                runner.release_e_evidence.EvidenceContractError,
                "BLOCKED_PRODUCTION_BACKUP_EVIDENCE: backup expired",
            ):
                runner.run_preflight(
                    repo_root=HERE.parents[1], target={}, identity={},
                    production_identity_evidence_sha256="a" * 64,
                    read_user="unused", read_password="unused",
                    executor=forbidden_executor,
                )
        self.assertEqual(calls, [])

    def test_expired_evidence_is_revalidated_immediately_before_migrate(self) -> None:
        blocker = runner.release_e_evidence.EvidenceContractError(
            "BLOCKED_PRODUCTION_BACKUP_EVIDENCE", "backup expired"
        )
        with (
            patch.object(runner, "validate_release_e_evidence", side_effect=blocker),
            patch.object(base, "run_flyway") as run_flyway,
        ):
            with self.assertRaisesRegex(
                runner.release_e_evidence.EvidenceContractError, "backup expired"
            ):
                runner.run_flyway_migrate_after_evidence_gate(
                    production_identity_evidence_sha256="a" * 64,
                    migration_dir=HERE, config="stdin config", image_ref="pinned@sha256:x",
                    secrets=("user", "password"), executor=lambda _c, _p: None,
                )
        run_flyway.assert_not_called()

    def test_local_check_is_independent_of_live_evidence(self) -> None:
        with patch.object(
            runner, "validate_release_e_evidence",
            side_effect=AssertionError("local-check touched live evidence"),
        ):
            result = runner.local_check(HERE.parents[1])
        self.assertTrue(result["v42_entry_sha256_match"])
        self.assertEqual(result["transition"], "41->42")

    def test_acknowledgement_only_cli_arguments_are_removed(self) -> None:
        options = {option for action in runner._parser()._actions for option in action.option_strings}
        self.assertNotIn("--backup-evidence", options)
        self.assertNotIn("--restore-evidence", options)


# ============================================================================
# SharedBaseContractTest -- narrow compatibility pins
# ============================================================================


class SharedBaseContractTest(unittest.TestCase):
    """Pin the narrow imported contract used by the V42 runner.

    Any future change to these private/public symbols of
    ``tidb_production_migration.py`` that breaks the V42 runner is
    caught here.
    """

    def test_required_constants_present(self) -> None:
        for name in ("FLYWAY_IMAGE", "MYSQL_CLIENT_IMAGE", "APPROVED_IMAGE_DIGESTS",
                     "MYSQL_CA_BUNDLE", "SQL_MARKER", "ALLOWED_FLYWAY_OPERATIONS",
                     "EVIDENCE_FORMAT_VERSION", "MAX_EVIDENCE_BYTES"):
            self.assertTrue(hasattr(base, name), f"base.{name} missing")

    def test_approved_image_digests_match_pinned_values(self) -> None:
        self.assertEqual(
            base.APPROVED_IMAGE_DIGESTS[base.FLYWAY_IMAGE],
            "sha256:174513cc63485ab931381b1cceb5c6adea2cf23284910770552cc8c945fb185d",
        )
        self.assertEqual(
            base.APPROVED_IMAGE_DIGESTS[base.MYSQL_CLIENT_IMAGE],
            "sha256:a532724022429812ec797c285c1b540a644c15e248579c6bfdf12a8fbaab4964",
        )

    def test_required_callable_export_for_runner_reuse(self) -> None:
        for name in (
            "build_flyway_command", "build_flyway_config",
            "build_mysql_payload", "build_mysql_command",
            "validate_image_digest", "verify_docker_images",
            "redact_output", "validate_local_docker_environment",
            "canonical_migration_directory", "verify_migration_manifest",
            "find_flyway_callbacks",
            "parse_mysql_metadata", "build_metadata_sql",
            "validate_database_metadata", "validate_postflight_metadata",
            "validate_operational_counts_unchanged",
            "run_flyway", "run_external", "_execute", "_parse_json_output",
            "_write_evidence", "_canonical_evidence_payload", "_evidence_sha256",
            "validate_evidence_integrity", "build_evidence", "validate_evidence_binding",
            "_read_evidence", "_migration_paths", "verify_release_checkout",
            "validate_approval_gates", "validate_risk_accepted_minimal_gate",
            "_read_only_sql_statements",
            "_validate_flyway_envelope", "_normalise_state", "_versioned_migrations",
            "_require_text", "_require_secret", "_escape_mysql_option", "_parse_port",
            "_sanitized_child_environment", "_docker_mount_source", "_toml_string",
        ):
            self.assertTrue(hasattr(base, name), f"base.{name} missing")
            self.assertTrue(callable(getattr(base, name)), f"base.{name} not callable")

    def test_rehearsal_prefix_constant_matches_rehearsal_runner(self) -> None:
        # The rehearsal runner script is the authoritative source for
        # the rehearsal fixture prefix; do not drift.  Search
        # case-insensitive because the rehearsal orchestrator folds the
        # userPrefix to lowercase (``prefix.casefold() == "3c7ghu483vq9ynn"``)
        # before the comparison.
        rehearsal_src = (HERE / "tidb_rehearsal_v42_orchestrate.py").read_text(encoding="utf-8")
        self.assertIn(
            runner.REHEARSAL_FIXTURE_PREFIX.lower(),
            rehearsal_src.lower(),
            "REHEARSAL_FIXTURE_PREFIX must match the rehearsal runner's "
            "USER_PREFIX_RX usage (case-insensitive)",
        )


if __name__ == "__main__":
    unittest.main()

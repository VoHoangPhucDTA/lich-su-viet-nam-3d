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

import ast
import copy
from datetime import datetime, timezone
import importlib.util
from contextlib import redirect_stderr
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
            "engine_version": "v8.5.3",
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

    def test_identity_loader_accepts_and_preserves_canonical_cli_value(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            evidence_path, sha = self._write_evidence(Path(td))
            loaded = runner.load_identity_evidence(evidence_path, sha)
            self.assertEqual(hashlib.sha256(evidence_path.read_bytes()).hexdigest(), sha)
        self.assertEqual(loaded["engine_version"], "v8.5.3")

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

    def test_invalid_cli_engine_blocks_before_any_subprocess(self) -> None:
        import hashlib as _hashlib
        evidence = self._evidence(engine_version="TiDB Serverless v8.5.3")
        body = (json.dumps(evidence, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")
        sha = _hashlib.sha256(body).hexdigest()
        with tempfile.TemporaryDirectory() as td:
            evidence_path = Path(td) / "identity-evidence.json"
            evidence_path.write_bytes(body)
            with patch.object(base.subprocess, "run") as external, redirect_stderr(io.StringIO()):
                exit_code = runner.main([
                    "--mode", "preflight", "--repo-root", str(HERE.parents[1]),
                    "--expected-release-commit", "unused",
                    "--identity-evidence", str(evidence_path),
                    "--identity-evidence-sha256", sha,
                ])
        self.assertEqual(exit_code, 2)
        external.assert_not_called()

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


class EngineVersionContractTest(unittest.TestCase):
    """Keep TiDB Cloud metadata distinct from SQL VERSION() output."""

    def test_sql_version_accepts_verified_tidb_serverless_form(self) -> None:
        self.assertEqual(
            runner.validate_sql_server_version("8.0.11-TiDB-v8.5.3-serverless"),
            "8.5.3",
        )

    def test_sql_version_rejects_wrong_or_unstructured_values(self) -> None:
        for value in (
            "8.0.11",
            "8.0.11-TiDB-v8.5.2-serverless",
            "8.0.11-TiDB-v8.5.4-serverless",
            "8.0.11-TiDB-v8.5.30-serverless",
            "8.0.11-v8.5.3-serverless",
            "prefix-8.0.11-TiDB-v8.5.3-serverless",
            "8.0.11-TiDB-v8.5.3-serverless-extra",
            "8.0.11-TiDB-v8.5.3-serverles",
            "8.0.11-TiDB-v8.5.3-serverless\n",
            "8.0.11-TiDB-v8.5.3-serverless\x00",
            "8.0.36-TiDB-v8.5.3-serverless",
            "8.0.11-TiDB-v8.5.3",
            "v8.5.3",
        ):
            with self.subTest(value=value):
                with self.assertRaises(runner.ProductionRunnerError):
                    runner.validate_sql_server_version(value)

    def test_wrong_sql_engine_blocks_before_shared_metadata_validation(self) -> None:
        with patch.object(base, "validate_database_metadata") as downstream:
            with self.assertRaises(runner.ProductionRunnerError):
                runner.validate_database_metadata_v42({
                    "server_version": "8.0.11-TiDB-v8.5.4-serverless",
                })
        downstream.assert_not_called()


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
    def setUp(self) -> None:
        self.docker_executable = str(Path(sys.executable).resolve())
        self.docker_resolver = patch.object(
            base,
            "resolve_docker_executable",
            return_value=self.docker_executable,
        )
        self.resolve_docker_executable = self.docker_resolver.start()
        self.addCleanup(self.docker_resolver.stop)

    def test_v42_flyway_wrapper_pins_target_for_every_allowed_operation(self) -> None:
        def executor(_command, _payload):
            return None

        for operation in ("info", "validate", "migrate"):
            with self.subTest(operation=operation):
                with patch.object(base, "run_flyway", return_value={}) as shared:
                    runner.run_flyway_v42(
                        migration_dir=Path("migrations"),
                        operation=operation,
                        config="stdin config",
                        image_ref="redgate/flyway@sha256:" + "a" * 64,
                        secrets=("user", "password"),
                        executor=executor,
                    )
                self.assertEqual(shared.call_args.kwargs["target_version"], "42")

    def test_v42_command_never_contains_source_version_as_target(self) -> None:
        for operation in ("info", "validate", "migrate"):
            with self.subTest(operation=operation):
                command = base.build_flyway_command(
                    Path("migrations"),
                    operation,
                    image_ref="redgate/flyway@sha256:" + "a" * 64,
                    target_version=runner.TARGET_VERSION,
                )
                self.assertEqual(command[0], self.docker_executable)
                self.assertTrue(Path(command[0]).is_absolute())
                self.assertIn("-target=42", command)
                self.assertNotIn("-target=41", command)

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
                self.assertEqual(cmd[0], self.docker_executable)
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
            self.assertEqual(cmd[0], self.docker_executable)
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

    def test_metadata_helper_uses_resolved_absolute_argv_without_shell(self) -> None:
        completed = subprocess.CompletedProcess(
            [self.docker_executable, "version"], 0, stdout="{}", stderr=""
        )
        with patch.object(base.subprocess, "run", return_value=completed) as invoke:
            base._run_docker_metadata_command(
                self.docker_executable,
                ["version"],
                operation="test-version",
                environment={"PATH": "sanitized-without-docker-directory"},
            )
        command = invoke.call_args.args[0]
        self.assertEqual(command[0], self.docker_executable)
        self.assertNotEqual(command[0].casefold(), "docker")
        self.assertFalse(invoke.call_args.kwargs.get("shell", False))


class V42DockerResolutionIntegrationTest(unittest.TestCase):
    """The standalone runner and every shared Docker probe use one resolver."""

    def tearDown(self) -> None:
        base.resolve_docker_executable.cache_clear()

    def test_one_cached_absolute_path_drives_context_images_and_commands(self) -> None:
        flyway_digest = base.APPROVED_IMAGE_DIGESTS[base.FLYWAY_IMAGE]
        mysql_digest = base.APPROVED_IMAGE_DIGESTS[base.MYSQL_CLIENT_IMAGE]

        with tempfile.TemporaryDirectory() as directory:
            docker_dir = Path(directory) / "Program Files" / "Docker CLI"
            docker_dir.mkdir(parents=True)
            docker_path = docker_dir / "docker.exe"
            docker_path.write_bytes(b"mock executable; never launched")
            expected_path = str(docker_path.resolve())
            commands: list[tuple[list[str], dict[str, object]]] = []

            def fake_run(command, **kwargs):
                argv = list(command)
                commands.append((argv, kwargs))
                if argv[1:3] == ["context", "show"]:
                    stdout = "desktop-linux\n"
                elif argv[1:3] == ["context", "inspect"]:
                    stdout = json.dumps("npipe:////./pipe/dockerDesktopLinuxEngine")
                elif argv[1] == "version":
                    stdout = json.dumps({"Os": "linux", "Arch": "amd64"})
                elif argv[1:3] == ["image", "inspect"]:
                    image = argv[3]
                    digest = {
                        base.FLYWAY_IMAGE: flyway_digest,
                        base.MYSQL_CLIENT_IMAGE: mysql_digest,
                    }[image]
                    repository = image.rsplit(":", 1)[0]
                    stdout = (
                        json.dumps([f"{repository}@{digest}"])
                        + "|linux|amd64"
                    )
                else:  # pragma: no cover - diagnostic guard for contract drift
                    raise AssertionError(f"unexpected Docker metadata argv: {argv!r}")
                return subprocess.CompletedProcess(argv, 0, stdout=stdout, stderr="")

            base.resolve_docker_executable.cache_clear()
            environment = {
                "PATH": str(docker_dir),
                "TIDB_PRODUCTION_FLYWAY_IMAGE_DIGEST": flyway_digest,
                "TIDB_PRODUCTION_MYSQL_IMAGE_DIGEST": mysql_digest,
            }
            with (
                patch.object(base.sys, "platform", "win32"),
                patch.dict(os.environ, environment, clear=True),
                patch.object(base.shutil, "which", return_value=expected_path) as which,
                patch.object(base.subprocess, "run", side_effect=fake_run),
            ):
                base.validate_local_docker_environment()
                verified = base.verify_docker_images()
                flyway_command = base.build_flyway_command(
                    Path(directory),
                    "info",
                    image_ref=verified[base.FLYWAY_IMAGE],
                    target_version=runner.TARGET_VERSION,
                )
                mysql_command = base.build_mysql_command(
                    image_ref=verified[base.MYSQL_CLIENT_IMAGE]
                )

            self.assertEqual(which.call_count, 1)
            self.assertEqual(flyway_command[0], expected_path)
            self.assertEqual(mysql_command[0], expected_path)
            self.assertTrue(commands)
            for argv, kwargs in commands:
                self.assertEqual(argv[0], expected_path)
                self.assertTrue(Path(argv[0]).is_absolute())
                self.assertFalse(kwargs.get("shell", False))
            self.assertEqual(
                verified[base.FLYWAY_IMAGE],
                f"redgate/flyway@{flyway_digest}",
            )
            self.assertEqual(
                verified[base.MYSQL_CLIENT_IMAGE],
                f"mysql@{mysql_digest}",
            )

    def test_standalone_runner_has_no_independent_docker_resolution_path(self) -> None:
        self.assertIs(runner.base, base)
        self.assertFalse(hasattr(runner, "resolve_docker_executable"))
        tree = ast.parse(Path(runner.__file__).read_text(encoding="utf-8"))
        direct_executable_literals = {
            node.value.casefold()
            for node in ast.walk(tree)
            if isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and node.value.casefold() in {"docker", "docker.exe"}
        }
        self.assertEqual(direct_executable_literals, set())


# ============================================================================
# BoundedMetadataContractTest
# ============================================================================


class BoundedMetadataContractTest(unittest.TestCase):
    VALID_OUTPUT = (
        "users_total\t20\n"
        "historical_events_total\t361\n"
        "event_media_total\t537\n"
        "active_admin_count\t2\n"
    )

    def test_sql_is_deterministic_aggregate_only_and_exactly_four_rows(self) -> None:
        sql = runner.bounded_metadata_sql_v42()
        self.assertEqual(sql, runner.bounded_metadata_sql_v42())
        statements = base._read_only_sql_statements(sql)
        self.assertEqual(len(statements), 4)
        for key in runner.V42_BOUNDED_COUNTS:
            self.assertEqual(sql.count(f"'{key}'"), 1)
        for keyword in (
            "INSERT", "UPDATE", "DELETE", "ALTER", "CREATE", "DROP",
            "TRUNCATE", "REPLACE", "INTO", "FOR UPDATE",
        ):
            self.assertNotRegex(sql, rf"(?i)\b{keyword}\b")
        self.assertNotRegex(sql, r",\s*(?:;|\))")
        self.assertNotIn("COALESCE", sql.upper())
        self.assertNotIn("IFNULL", sql.upper())
        self.assertIn("COUNT(DISTINCT u.id)", sql)
        self.assertIn("u.status='active'", sql)
        self.assertIn("r.code='admin'", sql)
        for statement in statements:
            self.assertRegex(statement, r"(?is)^SELECT\s+'[^']+',\s*COUNT\(")
            self.assertIn(" FROM ", statement.upper())

    def test_postflight_scalar_subqueries_are_closed_before_coalesce_default(self) -> None:
        sql = runner.metadata_sql_v42_postflight_extras()
        self.assertEqual(sql.count(")), '') AS v"), 1)
        self.assertNotIn("v42_history_checksum", sql)
        self.assertIn("v42_history_contract", sql)

    def test_valid_four_metric_result_is_accepted(self) -> None:
        self.assertEqual(
            runner.parse_bounded_metadata_counts(self.VALID_OUTPUT),
            {
                "users_total": "20",
                "historical_events_total": "361",
                "event_media_total": "537",
                "active_admin_count": "2",
            },
        )

    def test_duplicate_metric_is_rejected(self) -> None:
        with self.assertRaises(base.MigrationGuardError):
            runner.parse_bounded_metadata_counts(
                self.VALID_OUTPUT + "users_total\t20\n"
            )

    def test_missing_metric_is_rejected(self) -> None:
        with self.assertRaises(runner.ProductionRunnerError):
            runner.parse_bounded_metadata_counts(
                self.VALID_OUTPUT.replace("event_media_total\t537\n", "")
            )

    def test_unexpected_metric_or_extra_result_row_is_rejected(self) -> None:
        with self.assertRaises(runner.ProductionRunnerError):
            runner.parse_bounded_metadata_counts(
                self.VALID_OUTPUT + "unexpected_metric\t1\n"
            )

    def test_non_integer_and_negative_values_are_rejected(self) -> None:
        for value in ("", "1.0", "abc", "-1", "+1", " 1"):
            with self.subTest(value=value):
                output = self.VALID_OUTPUT.replace("users_total\t20", f"users_total\t{value}")
                with self.assertRaises((runner.ProductionRunnerError, base.MigrationGuardError)):
                    runner.parse_bounded_metadata_counts(output)

    def test_malformed_and_empty_output_are_rejected(self) -> None:
        for output in ("", "users_total 20\n"):
            with self.subTest(output=output):
                with self.assertRaises((runner.ProductionRunnerError, base.MigrationGuardError)):
                    runner.parse_bounded_metadata_counts(output)

    def test_shared_and_dedicated_counts_must_agree(self) -> None:
        shared = {
            "users_total": "20",
            "events_total": "361",
            "event_media_total": "537",
            "active_admin_count": "2",
        }
        bounded = runner.parse_bounded_metadata_counts(self.VALID_OUTPUT)
        merged = runner.merge_bounded_metadata_counts(shared, bounded)
        self.assertEqual(merged["historical_events_total"], "361")
        for key in (
            "users_total", "events_total", "event_media_total", "active_admin_count"
        ):
            bad = dict(shared)
            bad[key] = "999"
            with self.subTest(key=key):
                with self.assertRaises(runner.ProductionRunnerError):
                    runner.merge_bounded_metadata_counts(bad, bounded)

    def test_preflight_runs_bounded_counts_after_identity_info_and_validate(self) -> None:
        calls: list[str] = []
        core = {
            "users_total": "20",
            "events_total": "361",
            "event_media_total": "537",
            "active_admin_count": "2",
            "session_user": "production.read@%",
        }
        bounded = runner.parse_bounded_metadata_counts(self.VALID_OUTPUT)

        def flyway(**kwargs):
            calls.append(f"flyway:{kwargs['operation']}")
            return {}

        with (
            patch.object(
                runner,
                "validate_release_e_evidence",
                side_effect=lambda **_kwargs: calls.append("evidence"),
            ),
            patch.object(runner, "_verify_manifest_immutable", return_value=[]),
            patch.object(
                runner,
                "_migration_paths_v42",
                return_value=(Path("migrations"), Path("manifest")),
            ),
            patch.object(
                base,
                "verify_docker_images",
                return_value={base.FLYWAY_IMAGE: "flyway@digest"},
            ),
            patch.object(base, "build_flyway_config", return_value="config"),
            patch.object(base, "canonical_migration_directory") as staging,
            patch.object(runner, "run_flyway_v42", side_effect=flyway),
            patch.object(
                runner,
                "validate_flyway_info_for_v42",
                side_effect=lambda _value: calls.append("info-gate") or {},
            ),
            patch.object(
                base,
                "validate_flyway_validate",
                side_effect=lambda _value: calls.append("validate-gate"),
            ),
            patch.object(
                runner,
                "run_metadata_query",
                side_effect=lambda **_kwargs: calls.append("metadata") or core,
            ),
            patch.object(
                runner,
                "validate_database_metadata_v42",
                side_effect=lambda _value: calls.append("metadata-gate"),
            ),
            patch.object(
                runner,
                "validate_user_prefix_binding",
                side_effect=lambda **_kwargs: calls.append("identity-gate"),
            ),
            patch.object(
                runner,
                "run_bounded_metadata_query",
                side_effect=lambda **_kwargs: calls.append("bounded") or bounded,
            ),
        ):
            staging.return_value.__enter__.return_value = Path("migrations")
            result = runner.run_preflight(
                repo_root=Path("repo"),
                target={"host": "host", "port": 4000, "database": "lichsuvn"},
                identity={},
                production_identity_evidence_sha256="a" * 64,
                read_user="read",
                read_password="secret",
            )

        self.assertEqual(
            calls,
            [
                "evidence", "flyway:info", "info-gate", "flyway:validate",
                "validate-gate", "metadata", "metadata-gate", "identity-gate",
                "bounded",
            ],
        )
        self.assertEqual(result["metadata"]["historical_events_total"], "361")

    def test_metadata_failure_blocks_bounded_query_token_and_migrate(self) -> None:
        blocker = runner.ProductionRunnerError("metadata syntax failure")
        with (
            patch.object(runner, "run_preflight", side_effect=blocker) as preflight,
            patch.object(runner, "run_bounded_metadata_query") as bounded,
            patch.object(base, "verify_docker_images") as downstream,
        ):
            with self.assertRaisesRegex(
                runner.ProductionRunnerError, "metadata syntax failure"
            ):
                runner.run_migrate(
                    repo_root=Path("repo"),
                    target={},
                    identity={},
                    production_identity_evidence_sha256="a" * 64,
                    read_user="read",
                    read_password="read-secret",
                    migrate_user="migrate",
                    migrate_password="migrate-secret",
                )
        preflight.assert_called_once()
        bounded.assert_not_called()
        downstream.assert_not_called()

    def test_metadata_sql_failure_is_not_retried_or_replaced(self) -> None:
        blocker = base.MigrationGuardError("metadata SQL failed")
        target = {"host": "host", "port": 4000, "database": "lichsuvn"}
        with (
            patch.object(
                base,
                "verify_docker_images",
                return_value={base.MYSQL_CLIENT_IMAGE: "mysql@digest"},
            ),
            patch.object(base, "run_external", side_effect=blocker) as external,
        ):
            with self.assertRaisesRegex(base.MigrationGuardError, "metadata SQL failed"):
                runner.run_metadata_query(
                    target=target,
                    user="read",
                    password="secret",
                    executor=lambda _command, _payload: None,
                    postflight=False,
                )
        external.assert_called_once()


# ============================================================================
# ManagedStorageColumnContractTest
# ============================================================================


def _managed_storage_declarations(sql: str) -> list[tuple[str, str]]:
    first_statement = sql.split(";", 1)[0]
    declarations: list[tuple[str, str]] = []
    for line in first_statement.splitlines():
        match = re.fullmatch(
            r"\s*ADD COLUMN ([a-z][a-z0-9_]*) (.+?)(?:,)?\s*",
            line,
        )
        if match:
            declarations.append((match.group(1), match.group(2)))
    return declarations


EXPECTED_MANAGED_STORAGE_DECLARATIONS = (
    ("managed_asset_id", "CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL"),
    ("storage_provider", "VARCHAR(32) NULL"),
    ("storage_public_id", "VARCHAR(255) NULL"),
    ("storage_asset_id", "VARCHAR(255) NULL"),
    ("storage_original_url", "VARCHAR(1000) NULL"),
    ("storage_version", "BIGINT NULL"),
    ("storage_mime_type", "VARCHAR(100) NULL"),
    ("storage_format", "VARCHAR(16) NULL"),
    ("storage_byte_size", "BIGINT NULL"),
    ("storage_sha256", "CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL"),
    ("storage_width", "INT NULL"),
    ("storage_height", "INT NULL"),
    ("uploaded_by", "BINARY(16) NULL"),
    ("uploaded_at", "DATETIME(6) NULL"),
    ("storage_state", "VARCHAR(24) NOT NULL DEFAULT 'UNMANAGED'"),
    ("upload_token", "CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL"),
    ("upload_started_at", "DATETIME(6) NULL"),
    ("upload_expires_at", "DATETIME(6) NULL"),
)


def _information_schema_predicate(declaration: str) -> str:
    type_match = re.match(r"([A-Z]+)(?:\(([0-9]+)\))?", declaration)
    if type_match is None:
        raise ValueError(f"unsupported managed-storage declaration: {declaration}")
    data_type, size = type_match.groups()
    lowered_type = data_type.casefold()
    parts = [f"LOWER(data_type)='{lowered_type}'"]
    if data_type == "BIGINT":
        parts.append("LOWER(column_type) IN ('bigint','bigint(20)')")
    elif data_type == "INT":
        parts.append("LOWER(column_type) IN ('int','int(11)')")
    else:
        column_type = lowered_type + (f"({size})" if size else "")
        parts.append(f"LOWER(column_type)='{column_type}'")
    if data_type == "DATETIME":
        parts.append(f"datetime_precision={size}")
    parts.append(
        "is_nullable='NO'" if " NOT NULL" in declaration else "is_nullable='YES'"
    )
    default_match = re.search(r" DEFAULT '([^']*)'", declaration)
    if default_match is None:
        parts.append("column_default IS NULL")
    else:
        default_hex = default_match.group(1).encode("ascii").hex().upper()
        parts.extend(
            (
                "column_default IS NOT NULL",
                f"HEX(CAST(column_default AS CHAR))='{default_hex}'",
            )
        )
    if " CHARACTER SET ascii COLLATE ascii_bin" in declaration:
        parts.extend(
            (
                "LOWER(character_set_name)='ascii'",
                "LOWER(collation_name)='ascii_bin'",
            )
        )
    return " AND ".join(parts)


def _v3_event_media_declarations(sql: str) -> list[tuple[str, str]]:
    table = re.search(
        r"CREATE TABLE event_media \(\s*(.*?)\s*\) ENGINE=",
        sql,
        re.DOTALL,
    )
    if table is None:
        raise ValueError("V3 event_media declaration is missing")
    declarations: list[tuple[str, str]] = []
    for line in table.group(1).splitlines():
        match = re.fullmatch(
            r"\s*([a-z][a-z0-9_]*) (.+?)(?:,)?\s*",
            line,
        )
        if match:
            declarations.append((match.group(1), match.group(2)))
    return declarations


class ManagedStorageColumnContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration_path = (
            HERE.parents[1]
            / "backend" / "src" / "main" / "resources" / "db" / "migration"
            / runner.EXPECTED_V42_SQL_FILE
        )
        cls.migration_sql = cls.migration_path.read_text(encoding="utf-8")
        cls.v3_sql = (
            cls.migration_path.parent / "V3__event_support_tables.sql"
        ).read_text(encoding="utf-8")

    def test_ordered_contract_exactly_matches_authoritative_v42_sql(self) -> None:
        declarations = _managed_storage_declarations(self.migration_sql)
        names = [name for name, _declaration in declarations]
        self.assertEqual(len(names), 18)
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(names, list(runner.MANAGED_STORAGE_COLUMN_CONTRACT))
        self.assertEqual(declarations, list(EXPECTED_MANAGED_STORAGE_DECLARATIONS))
        self.assertEqual(len(runner.MANAGED_STORAGE_COLUMNS), 18)
        self.assertEqual(names.count("upload_expires_at"), 1)
        self.assertNotIn("storage_type", names)
        self.assertNotIn("storage_expires_at", names)

    def test_v3_defines_the_separate_legacy_storage_type_contract(self) -> None:
        declarations = _v3_event_media_declarations(self.v3_sql)
        self.assertEqual(len(declarations), 13)
        self.assertEqual(
            declarations[8],
            (
                "storage_type",
                "ENUM('local', 'external', 'object_storage') NOT NULL DEFAULT 'external'",
            ),
        )
        self.assertNotIn("storage_type", self.migration_sql)

    def test_contract_rejects_missing_or_duplicate_names(self) -> None:
        contract = runner.MANAGED_STORAGE_COLUMN_CONTRACT
        with self.assertRaisesRegex(ValueError, "exactly 18"):
            runner._validated_managed_storage_column_contract(contract[:-1])
        duplicate = contract[:-1] + (contract[-2],)
        with self.assertRaisesRegex(ValueError, "duplicate"):
            runner._validated_managed_storage_column_contract(duplicate)

    def test_all_types_nullability_and_defaults_are_exact(self) -> None:
        def require_contract(sql: str) -> None:
            declarations = _managed_storage_declarations(sql)
            if declarations != list(EXPECTED_MANAGED_STORAGE_DECLARATIONS):
                raise ValueError("managed-storage declaration contract mismatch")

        require_contract(self.migration_sql)
        declaration = "ADD COLUMN upload_expires_at DATETIME(6) NULL"
        for wrong in (
            "ADD COLUMN upload_expires_at TIMESTAMP(6) NULL",
            "ADD COLUMN upload_expires_at DATETIME(6) NOT NULL",
            "ADD COLUMN upload_expires_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6)",
        ):
            with self.subTest(wrong=wrong):
                with self.assertRaisesRegex(ValueError, "declaration contract mismatch"):
                    require_contract(self.migration_sql.replace(declaration, wrong))

    def test_generated_sql_uses_only_exact_v42_membership(self) -> None:
        sql = runner.metadata_sql_v42_postflight_extras()
        for name, declaration in EXPECTED_MANAGED_STORAGE_DECLARATIONS:
            self.assertEqual(sql.count(f"'{name}'"), 2)
            self.assertEqual(sql.count(f"column_name='{name}'"), 1)
            self.assertIn(
                f"(column_name='{name}' AND "
                f"{_information_schema_predicate(declaration)})",
                sql,
            )
        self.assertIn(
            f"AND column_name IN ({runner.MANAGED_STORAGE_COLUMN_SQL}))",
            sql,
        )
        self.assertIn(
            "GROUP_CONCAT(column_name ORDER BY column_name SEPARATOR ',')",
            sql,
        )
        self.assertIn("'upload_expires_at'", sql)
        self.assertNotIn("storage_type", sql)
        self.assertNotIn("storage_expires_at", sql)
        self.assertNotIn("column_name LIKE 'storage!_%' ESCAPE '!'", sql)
        self.assertNotIn("column_name LIKE 'upload!_%' ESCAPE '!'", sql)
        self.assertNotRegex(sql, r"column_name\s+LIKE\s+")
        self.assertIn("CASE WHEN COUNT(*)=0 THEN ''", sql)
        self.assertIn("WHEN COUNT(*)<>18", sql)
        self.assertIn("COUNT(DISTINCT column_name)<>18", sql)
        self.assertIn(
            "HEX(GROUP_CONCAT(column_name ORDER BY ordinal_position SEPARATOR ','))",
            sql,
        )
        expected_order_hex = (
            ",".join(runner.MANAGED_STORAGE_COLUMN_CONTRACT)
            .encode("ascii")
            .hex()
            .upper()
        )
        self.assertIn(f"<>'{expected_order_hex}'", sql)
        self.assertIn("__invalid_v42_managed_column_contract__", sql)
        self.assertEqual(sql.count("LOWER(data_type)="), 18)
        self.assertEqual(sql.count("LOWER(column_type)"), 18)
        self.assertEqual(sql.count("is_nullable="), 18)
        self.assertGreaterEqual(sql.count("column_default"), 18)
        self.assertIn(
            "column_name='storage_state' AND LOWER(data_type)='varchar' "
            "AND LOWER(column_type)='varchar(24)' AND is_nullable='NO' "
            "AND column_default IS NOT NULL "
            "AND HEX(CAST(column_default AS CHAR))='554E4D414E41474544'",
            sql,
        )
        self.assertIn(
            "column_name='upload_expires_at' AND LOWER(data_type)='datetime' "
            "AND LOWER(column_type)='datetime(6)' AND datetime_precision=6 "
            "AND is_nullable='YES' AND column_default IS NULL",
            sql,
        )
        self.assertTrue(base._read_only_sql_statements(sql))

    def test_rehearsal_diagnostics_use_the_same_exact_membership(self) -> None:
        spec = importlib.util.spec_from_file_location(
            "tidb_rehearsal_v42_orchestrate_contract_test",
            HERE / "tidb_rehearsal_v42_orchestrate.py",
        )
        assert spec and spec.loader
        rehearsal = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = rehearsal
        spec.loader.exec_module(rehearsal)

        sql = rehearsal._metadata_diag_sql()
        memberships = re.findall(r"column_name IN \(([^)]*)\)", sql)
        self.assertEqual(len(memberships), 2)
        for membership in memberships:
            names = tuple(re.findall(r"'([a-z][a-z0-9_]*)'", membership))
            self.assertEqual(names, runner.MANAGED_STORAGE_COLUMN_CONTRACT)
        self.assertNotRegex(sql, r"column_name\s+LIKE\s+")
        self.assertNotIn("storage_type", sql)
        self.assertNotIn("storage_expires_at", sql)


# ============================================================================
# PostflightTest
# ============================================================================


def _structured_record(*values: object | None) -> str:
    return ":".join(
        ("~" if value is None else "=" + str(value)).encode("utf-8").hex().upper()
        for value in values
    )


def _structured_values(value: str) -> list[str | None]:
    result: list[str | None] = []
    for token in value.split(":"):
        decoded = bytes.fromhex(token).decode("utf-8")
        result.append(None if decoded == "~" else decoded[1:])
    return result


def _replace_structured_field(
    metadata: dict[str, str], key: str, index: int, value: object | None
) -> None:
    fields = _structured_values(metadata[key])
    fields[index] = None if value is None else str(value)
    metadata[key] = _structured_record(*fields)


def _add_exact_v42_structured_metadata(metadata: dict[str, str]) -> None:
    for name, non_unique, columns in runner.V42_EVENT_MEDIA_INDEX_CONTRACT:
        metadata[f"v42_event_media_index_{name}"] = _structured_record(
            len(columns), len(columns), "event_media", name,
            1 if non_unique else 0, "BTREE",
            ",".join(str(i) for i in range(1, len(columns) + 1)),
            ",".join(columns),
        )
    name, table, source, referenced_table, referenced, update, delete = (
        runner.V42_EVENT_MEDIA_FK_CONTRACT
    )
    metadata["v42_event_media_fk_uploaded_by"] = _structured_record(
        len(source), len(source), name, table, ",".join(source), referenced_table,
        ",".join(referenced), update, delete,
    )
    metadata["v42_cleanup_table_contract"] = _structured_record(
        1, runner.V42_CLEANUP_TABLE, "BASE TABLE", "InnoDB", "utf8mb4_0900_ai_ci"
    )
    for ordinal, definition in enumerate(runner.V42_CLEANUP_COLUMN_CONTRACT, start=1):
        (
            column, data_type, column_types, nullable, default, charset, collation,
            precision, extra,
        ) = definition
        metadata[f"v42_cleanup_column_{column}"] = _structured_record(
            1, runner.V42_CLEANUP_TABLE, column, ordinal, data_type,
            column_types[0], nullable, default, charset, collation, precision, extra,
        )
    metadata["v42_cleanup_column_count"] = str(
        len(runner.V42_CLEANUP_COLUMN_CONTRACT)
    )
    for name, non_unique, columns in runner.V42_CLEANUP_INDEX_CONTRACT:
        metadata[f"v42_cleanup_index_{name.lower()}"] = _structured_record(
            len(columns), len(columns), runner.V42_CLEANUP_TABLE, name,
            1 if non_unique else 0, "BTREE",
            ",".join(str(i) for i in range(1, len(columns) + 1)),
            ",".join(columns),
        )
    metadata["v42_cleanup_index_count"] = str(len(runner.V42_CLEANUP_INDEX_CONTRACT))
    metadata["v42_cleanup_check_count"] = str(len(runner.V42_CLEANUP_CONSTRAINTS))
    metadata["v42_cleanup_foreign_keys"] = "0"
    metadata["v42_cleanup_initial_rows"] = "0"
    for name, table, expression in runner.V42_CHECK_CONTRACT:
        metadata[f"v42_check_{name}"] = _structured_record(
            1, runner.EXPECTED_DATABASE, None, name, expression, None
        )
        metadata[f"v42_tidb_check_{name}"] = _structured_record(
            1, runner.EXPECTED_DATABASE, table, name, expression, None
        )
        metadata[f"v42_show_create_check_{name}"] = _structured_record(
            1, table, name, expression, 0
        )
    metadata["v42_metadata_capability_strategy"] = "show_create"
    metadata["v42_metadata_enforcement_sources"] = ""
    metadata["v42_history_contract"] = _structured_record(
        1,
        runner.V42_FLYWAY_HISTORY_CONTRACT["version"],
        runner.V42_FLYWAY_HISTORY_CONTRACT["description"],
        runner.V42_FLYWAY_HISTORY_CONTRACT["script"],
        runner.V42_FLYWAY_HISTORY_CONTRACT["checksum"],
        runner.V42_FLYWAY_HISTORY_CONTRACT["success"],
    )
    metadata["v42_above_rows"] = "0"


def _metadata(*, before: dict[str, str]) -> dict[str, str]:
    base_metadata = {
        "server_version": "8.0.11-TiDB-v8.5.3-serverless",
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
        "historical_events_total": before.get("historical_events_total", "361"),
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
        "session_login_user": "RHVnC4pobyyHQJT.userread@%",
        "postflight_identity_sentinel": "1",
        "session_user_prefix_verified": "1",
    }
    extra = {
        "v42_managed_columns": ",".join(sorted(runner.MANAGED_STORAGE_COLUMNS)),
        "tidb_enable_check_constraint": "1",
        "session_user": "RHVnC4pobyyHQJT.userread@%",
    }
    base_metadata.update(extra)
    _add_exact_v42_structured_metadata(base_metadata)
    return base_metadata


def _capability_output(
    columns: dict[str, frozenset[str]] | None = None,
) -> str:
    source = columns or runner.observed_tidb_v853_metadata_capabilities().columns
    lines = []
    for table in sorted(source):
        for ordinal, column in enumerate(sorted(source[table]), start=1):
            lines.append(
                f"{table}\t{column}\t{ordinal}\tvarchar\tvarchar(64)\tYES"
            )
    return "\n".join(lines) + "\n"


def _capability_model_with_sources(
    *sources: str,
) -> runner.MetadataCapabilityModel:
    columns = {
        table: set(values)
        for table, values in runner.observed_tidb_v853_metadata_capabilities().columns.items()
    }
    for source in sources:
        columns[source].add("ENFORCED")
    return runner.validate_metadata_capabilities(
        {table: frozenset(values) for table, values in columns.items()}
    )


def _metadata_for_capabilities(
    before: dict[str, str], model: runner.MetadataCapabilityModel,
) -> dict[str, str]:
    metadata = _metadata(before=before)
    metadata["v42_metadata_capability_strategy"] = model.enforcement_strategy
    metadata["v42_metadata_enforcement_sources"] = ",".join(
        model.enforcement_sources
    )
    for name, table, _expression in runner.V42_CHECK_CONTRACT:
        standard_key = f"v42_check_{name}"
        tidb_key = f"v42_tidb_check_{name}"
        _replace_structured_field(
            metadata,
            standard_key,
            2,
            table if "TABLE_CONSTRAINTS" in model.enforcement_sources else None,
        )
        standard_sources = [
            source
            for source in ("CHECK_CONSTRAINTS", "TABLE_CONSTRAINTS")
            if source in model.enforcement_sources
        ]
        _replace_structured_field(
            metadata,
            standard_key,
            5,
            ",".join("YES" for _source in standard_sources) or None,
        )
        _replace_structured_field(
            metadata,
            tidb_key,
            5,
            "YES" if "TIDB_CHECK_CONSTRAINTS" in model.enforcement_sources else None,
        )
    return metadata


def _show_create_output(
    *, not_enforced: str | None = None, missing: str | None = None,
    wrong_expression: str | None = None, extra: bool = False,
) -> str:
    rows = []
    for table in runner.V42_SHOW_CREATE_TABLES:
        declarations = []
        for name, owner, expression in runner.V42_CHECK_CONTRACT:
            if owner != table or name == missing:
                continue
            observed = "1 = 1" if name == wrong_expression else expression
            suffix = " NOT ENFORCED" if name == not_enforced else ""
            declarations.append(
                f"CONSTRAINT `{name}` CHECK (({observed})){suffix}"
            )
        if extra and table == "event_media":
            declarations.append("CONSTRAINT `unexpected_check` CHECK ((1 = 1))")
        ddl = (
            f"CREATE TABLE `{table}` (`id` bigint NOT NULL,\\n  "
            + ",\\n  ".join(declarations)
            + "\\n) ENGINE=InnoDB"
        )
        rows.append(f"{table}\t{ddl}")
    return "\n".join(rows) + "\n"


class MetadataCapabilityContractTest(unittest.TestCase):
    def test_capability_query_is_exact_bounded_and_deterministic(self) -> None:
        sql = runner.metadata_capability_sql_v42()
        self.assertEqual(sql, runner.metadata_capability_sql_v42())
        self.assertNotIn("SELECT *", sql.upper())
        self.assertEqual(sql.count("information_schema.columns"), 1)
        self.assertIn(
            "TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE",
            sql,
        )
        self.assertIn("ORDER BY UPPER(TABLE_NAME),ORDINAL_POSITION,COLUMN_NAME", sql)
        for table in runner.V42_METADATA_CAPABILITY_OBJECTS:
            self.assertEqual(sql.count(f"'{table}'"), 1)
        for application_table in ("users", "event_media", "flyway_schema_history"):
            self.assertNotIn(f"FROM {application_table}", sql)
        self.assertTrue(base._read_only_sql_statements(sql))

    def test_observed_tidb_v853_capability_fixture_is_complete(self) -> None:
        model = runner.observed_tidb_v853_metadata_capabilities()
        self.assertEqual(set(model.columns), set(runner.V42_METADATA_CAPABILITY_OBJECTS))
        self.assertEqual(model.enforcement_sources, ())
        self.assertEqual(model.enforcement_strategy, "show_create")
        self.assertNotIn("ENFORCED", model.columns["TABLE_CONSTRAINTS"])
        self.assertNotIn("ENFORCED", model.columns["CHECK_CONSTRAINTS"])
        self.assertNotIn("ENFORCED", model.columns["TIDB_CHECK_CONSTRAINTS"])
        for table, required in runner.V42_METADATA_REQUIRED_COLUMNS.items():
            self.assertTrue(required.issubset(model.columns[table]), table)

    def test_capability_parser_accepts_exact_rows_and_rejects_shape_drift(self) -> None:
        expected = runner.observed_tidb_v853_metadata_capabilities()
        self.assertEqual(runner.parse_metadata_capability_rows(_capability_output()), expected)
        valid_lines = _capability_output().splitlines()
        mutations = (
            "\n".join(
                line
                for line in valid_lines
                if not line.startswith("COLUMNS\tTABLE_SCHEMA\t")
            ) + "\n",
            "\n".join(valid_lines + [valid_lines[0]]) + "\n",
            valid_lines[0].replace("\t", "|", 1) + "\n" + "\n".join(valid_lines[1:]) + "\n",
            valid_lines[0].replace(
                valid_lines[0].split("\t", 1)[0], "APPLICATION_TABLE", 1
            ) + "\n" + "\n".join(valid_lines[1:]) + "\n",
            "\n".join([valid_lines[1], valid_lines[0], *valid_lines[2:]]) + "\n",
        )
        for output in mutations:
            with self.subTest(output_length=len(output)):
                with self.assertRaises(runner.ProductionRunnerError):
                    runner.parse_metadata_capability_rows(output)

    def test_missing_required_table_or_column_fails_closed(self) -> None:
        observed = runner.observed_tidb_v853_metadata_capabilities().columns
        for table in runner.V42_METADATA_CAPABILITY_OBJECTS:
            missing_table = dict(observed)
            del missing_table[table]
            with self.subTest(table=table):
                with self.assertRaises(runner.ProductionRunnerError):
                    runner.validate_metadata_capabilities(missing_table)
        for table in ("COLUMNS", "TABLES", "STATISTICS", "KEY_COLUMN_USAGE", "REFERENTIAL_CONSTRAINTS"):
            missing_column = dict(observed)
            removed = next(iter(runner.V42_METADATA_REQUIRED_COLUMNS[table]))
            missing_column[table] = frozenset(observed[table] - {removed})
            with self.subTest(table=table, column=removed):
                with self.assertRaises(runner.ProductionRunnerError):
                    runner.validate_metadata_capabilities(missing_column)

    def test_capability_probe_uses_one_read_only_mysql_invocation(self) -> None:
        calls = []

        def executor(command, stdin):
            calls.append((tuple(command), stdin))
            return base.CommandResult(tuple(command), 0, _capability_output(), "")

        with patch.object(base, "resolve_docker_executable", return_value="C:/trusted/docker.exe"):
            model = runner.run_metadata_capability_query(
                target={"host": "prod.invalid", "port": 4000, "database": "lichsuvn"},
                user="read-user",
                password="read-password",
                executor=executor,
                image_ref="mysql@sha256:" + "a" * 64,
            )
        self.assertEqual(model.enforcement_strategy, "show_create")
        self.assertEqual(len(calls), 1)
        self.assertIn("--pull=never", calls[0][0])
        self.assertIn("--rm", calls[0][0])
        self.assertIn(runner.metadata_capability_sql_v42().strip(), calls[0][1])
        self.assertNotRegex(calls[0][1], r"(?i)\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b")

    def test_check_sql_selects_only_reviewed_available_enforcement_sources(self) -> None:
        observed = runner.observed_tidb_v853_metadata_capabilities()
        observed_sql = runner.metadata_sql_v42_postflight_extras(observed)
        self.assertNotRegex(observed_sql, r"(?i)\b(?:tc|cc|tcc)\.ENFORCED\b")
        self.assertNotIn("JOIN information_schema.TABLE_CONSTRAINTS tc", observed_sql)
        matrices = (
            (("TABLE_CONSTRAINTS",), ("tc.ENFORCED",)),
            (("CHECK_CONSTRAINTS",), ("cc.ENFORCED",)),
            (("TIDB_CHECK_CONSTRAINTS",), ("tcc.ENFORCED",)),
            (
                ("TABLE_CONSTRAINTS", "CHECK_CONSTRAINTS", "TIDB_CHECK_CONSTRAINTS"),
                ("tc.ENFORCED", "cc.ENFORCED", "tcc.ENFORCED"),
            ),
        )
        for sources, references in matrices:
            model = _capability_model_with_sources(*sources)
            sql = runner.metadata_sql_v42_postflight_extras(model)
            for source, alias in zip(
                runner.V42_METADATA_ENFORCEMENT_SOURCES,
                ("tc.ENFORCED", "cc.ENFORCED", "tcc.ENFORCED"),
                strict=True,
            ):
                self.assertEqual(
                    re.search(rf"(?i)\b{re.escape(alias)}\b", sql) is not None,
                    source in sources,
                )
            for reference in references:
                self.assertIn(reference, sql)

    def test_direct_enforcement_sources_pass_and_disagreement_fails(self) -> None:
        before = {
            "users_total": "3", "historical_events_total": "361",
            "event_media_total": "0", "active_admin_count": "2",
        }
        model = _capability_model_with_sources(
            "TABLE_CONSTRAINTS", "CHECK_CONSTRAINTS", "TIDB_CHECK_CONSTRAINTS"
        )
        metadata = _metadata_for_capabilities(before, model)
        result = runner.validate_v42_postflight_extras(
            metadata, before=before, capabilities=model
        )
        self.assertTrue(result["check_constraints"]["enforced"])
        changed = dict(metadata)
        name = runner.V42_CHECK_CONTRACT[0][0]
        _replace_structured_field(changed, f"v42_check_{name}", 5, "YES,NO")
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(
                changed, before=before, capabilities=model
            )

    def test_show_create_fallback_is_strict_and_never_invents_enforcement(self) -> None:
        proof = runner.parse_v42_show_create_output(_show_create_output())
        self.assertEqual(len(proof), 6)
        failures = (
            _show_create_output(not_enforced=runner.V42_CHECK_CONTRACT[0][0]),
            _show_create_output(missing=runner.V42_CHECK_CONTRACT[0][0]),
            _show_create_output(wrong_expression=runner.V42_CHECK_CONTRACT[0][0]),
            _show_create_output(extra=True),
            "event_media\tCREATE TABLE `event_media` (`id` bigint)\n",
        )
        for output in failures:
            with self.subTest(output_length=len(output)):
                with self.assertRaises(runner.ProductionRunnerError):
                    runner.parse_v42_show_create_output(output)

    def test_show_create_command_is_exact_digest_bound_and_shell_free(self) -> None:
        with patch.object(base, "resolve_docker_executable", return_value="C:/trusted/docker.exe"):
            command = runner._build_v42_show_create_command(
                image_ref="mysql@sha256:" + "a" * 64
            )
        self.assertEqual(command[0], "C:/trusted/docker.exe")
        self.assertIn("--pull=never", command)
        self.assertIn("--rm", command)
        self.assertNotIn("--raw", command[-1])
        self.assertNotIn("shell=True", " ".join(command))
        self.assertEqual(runner.v42_show_create_sql().count("SHOW CREATE TABLE"), 2)

    def test_generated_full_sql_matches_observed_capabilities(self) -> None:
        result = runner.validate_generated_metadata_sql_compatibility()
        self.assertEqual(result["capability_object_count"], 8)
        self.assertEqual(result["capability_query_count"], 1)
        self.assertEqual(result["check_statement_count"], 12)
        self.assertEqual(result["enforcement_strategy"], "show_create")
        self.assertEqual(result["unsupported_reference_count"], 0)
        sql = runner.metadata_sql_v42_postflight_extras()
        self.assertIn(
            "FROM information_schema.TIDB_CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()",
            sql,
        )
        self.assertNotIn(
            "FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()",
            sql,
        )

    def test_capability_failure_precedes_complex_metadata_flyway_and_evidence(self) -> None:
        with (
            patch.object(runner, "validate_release_e_postflight_evidence"),
            patch.object(runner, "_verify_manifest_immutable"),
            patch.object(runner, "_migration_paths_v42", return_value=(Path("m"), Path("manifest"))),
            patch.object(base, "verify_docker_images", return_value={
                base.FLYWAY_IMAGE: "flyway@digest",
                base.MYSQL_CLIENT_IMAGE: "mysql@digest",
            }),
            patch.object(
                runner,
                "run_metadata_capability_query",
                side_effect=runner.ProductionRunnerError("missing capability"),
            ),
            patch.object(runner, "run_metadata_query") as metadata_query,
            patch.object(runner, "run_flyway_v42") as flyway,
            patch.object(runner, "write_and_reload_v42_postflight_evidence") as writer,
        ):
            with self.assertRaises(runner.ProductionRunnerError):
                runner.run_postflight(
                    repo_root=Path("repo"),
                    target={"host": "prod.invalid", "port": 4000, "database": "lichsuvn"},
                    identity={"user_prefix": "RHVnC4pobyyHQJT"},
                    production_identity_evidence_sha256="a" * 64,
                    read_user="read",
                    read_password="secret",
                    before_evidence={"metadata": {}},
                    migration_installed_at_utc=datetime(2026, 8, 1, tzinfo=timezone.utc),
                )
        metadata_query.assert_not_called()
        flyway.assert_not_called()
        writer.assert_not_called()


class CheckMetadataSqlContractTest(unittest.TestCase):
    def test_generated_check_sql_is_deterministic_safe_and_exactly_bounded(self) -> None:
        sql = runner.metadata_sql_v42_postflight_extras()
        self.assertEqual(sql, runner.metadata_sql_v42_postflight_extras())
        contract = runner._validate_check_metadata_sql_contract(sql)
        self.assertEqual(
            contract,
            {
                "statement_count": 12,
                "aliases": list(runner.V42_CHECK_METADATA_FIELD_ALIASES),
                "constraint_count": 6,
                "view_count": 2,
                "enforcement_strategy": "show_create",
            },
        )
        self.assertEqual(sql.count("("), sql.count(")"))
        self.assertEqual(
            runner.V42_CHECK_METADATA_FIELD_ALIASES,
            (
                "row_count",
                "check_schema_values",
                "check_table_values",
                "check_constraint_names",
                "check_clause_values",
                "check_enforcement_values",
            ),
        )
        for alias in runner.V42_CHECK_METADATA_FIELD_ALIASES:
            self.assertRegex(alias, r"^[a-z][a-z0-9_]*$")
        self.assertEqual(len(set(runner.V42_CHECK_METADATA_FIELD_ALIASES)), 6)
        check_sql = "\n".join(
            line for line in sql.splitlines()
            if line.startswith("SELECT 'v42_check_")
            or line.startswith("SELECT 'v42_tidb_check_")
        )
        self.assertNotRegex(
            check_sql,
            r"(?i)\)\s+(?:AS\s+)?(?:schemas|tables|names|clauses|enforced_values)"
            r"(?:,|\s+FROM)",
        )
        self.assertEqual(sql.count("FROM information_schema.CHECK_CONSTRAINTS cc"), 6)
        self.assertEqual(
            check_sql.count("FROM information_schema.TIDB_CHECK_CONSTRAINTS"), 6
        )
        for name, table, _expression in runner.V42_CHECK_CONTRACT:
            standard = next(
                line for line in sql.splitlines()
                if line.startswith(f"SELECT 'v42_check_{name}',")
            )
            tidb = next(
                line for line in sql.splitlines()
                if line.startswith(f"SELECT 'v42_tidb_check_{name}',")
            )
            for statement in (standard, tidb):
                self.assertIn("CONSTRAINT_SCHEMA=DATABASE()", statement)
                self.assertIn(f"CONSTRAINT_NAME='{name}'", statement)
                self.assertIn("ORDER BY", statement)
            self.assertIn(f"TABLE_NAME='{table}'", tidb)
            self.assertNotIn("TABLE_CONSTRAINTS", standard)
            self.assertNotIn("tc.ENFORCED", standard)
            self.assertIn("GROUP_CONCAT(NULL) AS check_table_values", standard)
            self.assertIn("GROUP_CONCAT(NULL) AS check_enforcement_values", standard)
        self.assertTrue(base._read_only_sql_statements(sql))

    def test_structural_check_rejects_legacy_missing_duplicate_and_extra_aliases(self) -> None:
        sql = runner.metadata_sql_v42_postflight_extras()
        mutations = (
            sql.replace(" AS check_schema_values", " schemas", 1),
            sql.replace(" AS check_schema_values", " check_schema_values", 1),
            sql.replace(
                " AS check_schema_values,",
                " AS check_schema_values,MIN(CONSTRAINT_SCHEMA) AS extra_alias,",
                1,
            ),
            sql.replace(" AS check_table_values", " AS check_schema_values", 1),
        )
        for changed in mutations:
            with self.subTest(changed=changed != sql):
                self.assertNotEqual(changed, sql)
                with self.assertRaises(runner.ProductionRunnerError):
                    runner._validate_check_metadata_sql_contract(changed)

    def test_structural_check_rejects_separator_parenthesis_view_and_bounds_drift(self) -> None:
        sql = runner.metadata_sql_v42_postflight_extras()
        mutations = (
            sql.replace("AS check_schema_values,", "AS check_schema_values", 1),
            sql.replace("GROUP_CONCAT(DISTINCT cc.CONSTRAINT_SCHEMA)",
                        "GROUP_CONCAT(DISTINCT cc.CONSTRAINT_SCHEMA", 1),
            sql.replace("information_schema.CHECK_CONSTRAINTS cc",
                        "information_schema.TABLE_CONSTRAINTS cc", 1),
            sql.replace("AND tcc.TABLE_NAME='event_media' ", "", 1),
            sql.replace("AND cc.CONSTRAINT_NAME='chk_event_media_storage_state'", "1=1", 1),
        )
        for changed in mutations:
            with self.subTest(changed=changed != sql):
                self.assertNotEqual(changed, sql)
                with self.assertRaises(runner.ProductionRunnerError):
                    runner._validate_check_metadata_sql_contract(changed)

    def test_check_parser_uses_exact_reviewed_field_contract_without_fallback(self) -> None:
        valid = _structured_record(
            1,
            runner.EXPECTED_DATABASE,
            "event_media",
            "chk_event_media_storage_state",
            "storage_state IN ('READY')",
            "YES",
        )
        self.assertEqual(
            runner._parse_metadata_record(
                valid,
                key="check",
                fields=runner.V42_CHECK_METADATA_FIELD_ALIASES,
            ),
            (
                "1", runner.EXPECTED_DATABASE, "event_media",
                "chk_event_media_storage_state", "storage_state IN ('READY')", "YES",
            ),
        )
        for value in (None, "", valid.rsplit(":", 1)[0], valid + ":", "not-hex"):
            with self.subTest(value=value):
                with self.assertRaises(runner.ProductionRunnerError):
                    runner._parse_metadata_record(
                        value,
                        key="check",
                        fields=runner.V42_CHECK_METADATA_FIELD_ALIASES,
                    )
        for fields in (
            (),
            ("row_count", "row_count"),
            ("row_count", "schemas"),
            ("row_count", "unexpected_alias"),
        ):
            with self.subTest(fields=fields):
                with self.assertRaises(runner.ProductionRunnerError):
                    runner._parse_metadata_record(valid, key="check", fields=fields)


class PostflightTest(unittest.TestCase):
    def _raw_postflight_metadata(self) -> dict[str, str]:
        sql = (
            base.build_metadata_sql(postflight=True)
            + runner.metadata_sql_v42_postflight_extras()
        )
        keys = re.findall(r"(?m)^SELECT '([a-z][a-z0-9_]*)',", sql)
        valid = _metadata(before={
            "users_total": "3", "historical_events_total": "361",
            "event_media_total": "0", "active_admin_count": "2",
        })
        result = {key: valid.get(key, "0") for key in keys}
        result["v42_metadata_capability_strategy"] = "show_create"
        result["v42_metadata_enforcement_sources"] = ""
        for name, _table, _expression in runner.V42_CHECK_CONTRACT:
            key = f"v42_show_create_check_{name}"
            result[key] = valid[key]
        return result

    def _run_standalone_postflight_with_metadata(
        self, metadata: dict[str, str]
    ) -> None:
        with (
            patch.object(runner, "validate_release_e_postflight_evidence"),
            patch.object(runner, "_verify_manifest_immutable"),
            patch.object(
                runner,
                "_migration_paths_v42",
                return_value=(Path("migrations"), Path("manifest")),
            ),
            patch.object(
                base,
                "verify_docker_images",
                return_value={
                    base.FLYWAY_IMAGE: "flyway@digest",
                    base.MYSQL_CLIENT_IMAGE: "mysql@digest",
                },
            ),
            patch.object(
                runner,
                "run_metadata_capability_query",
                return_value=runner.observed_tidb_v853_metadata_capabilities(),
            ),
            patch.object(base, "build_flyway_config", return_value="config"),
            patch.object(base, "canonical_migration_directory") as staging,
            patch.object(runner, "run_flyway_v42", return_value={}),
            patch.object(
                base,
                "validate_flyway_info",
                return_value={
                    "current_version": "42",
                    "pending_versions": [],
                    "database": "lichsuvn",
                    "flyway_version": "11.14.1",
                },
            ),
            patch.object(base, "validate_flyway_validate"),
            patch.object(runner, "run_metadata_query", return_value=metadata),
        ):
            staging.return_value.__enter__.return_value = Path("staged")
            runner.run_postflight(
                repo_root=Path("repo"),
                target={"host": "production.invalid", "port": 4000, "database": "lichsuvn"},
                identity={"user_prefix": "RHVnC4pobyyHQJT"},
                production_identity_evidence_sha256="a" * 64,
                read_user="read",
                read_password="secret",
                before_evidence={"metadata": {}},
                migration_installed_at_utc=datetime(
                    2026, 8, 1, 13, 23, 42, tzinfo=timezone.utc
                ),
            )

    def test_v42_postflight_extras_accepts_correct_metadata(self) -> None:
        before = {
            "users_total": "3", "historical_events_total": "361",
            "event_media_total": "0", "active_admin_count": "2",
        }
        runner.validate_v42_postflight_extras(_metadata(before=before), before=before)

    def test_full_v3_plus_v42_table_selects_only_the_exact_delta(self) -> None:
        before = {
            "users_total": "3", "historical_events_total": "361",
            "event_media_total": "0", "active_admin_count": "2",
        }
        v3_path = (
            HERE.parents[1]
            / "backend" / "src" / "main" / "resources" / "db" / "migration"
            / "V3__event_support_tables.sql"
        )
        v3_columns = [
            name
            for name, _declaration in _v3_event_media_declarations(
                v3_path.read_text(encoding="utf-8")
            )
        ]
        full_table = v3_columns + list(runner.MANAGED_STORAGE_COLUMN_CONTRACT)
        self.assertEqual(len(full_table), 31)
        self.assertIn("storage_type", full_table)

        selected = [
            name for name in full_table if name in runner.MANAGED_STORAGE_COLUMNS
        ]
        self.assertEqual(selected, list(runner.MANAGED_STORAGE_COLUMN_CONTRACT))
        metadata = _metadata(before=before)
        metadata["v42_managed_columns"] = ",".join(sorted(selected))
        runner.validate_v42_postflight_extras(metadata, before=before)

        with_unrelated_history = full_table + ["historical_storage_note"]
        selected_again = [
            name
            for name in with_unrelated_history
            if name in runner.MANAGED_STORAGE_COLUMNS
        ]
        self.assertEqual(selected_again, selected)

    def test_missing_managed_column_rejected(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        cols = {c for c in metadata["v42_managed_columns"].split(",") if c}
        cols.remove("managed_asset_id")
        metadata["v42_managed_columns"] = ",".join(cols)
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_storage_type_cannot_replace_a_missing_v42_column(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        columns = set(runner.MANAGED_STORAGE_COLUMNS)
        columns.remove("upload_expires_at")
        columns.add("storage_type")
        metadata["v42_managed_columns"] = ",".join(sorted(columns))
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_duplicate_or_malformed_metadata_rows_are_rejected(self) -> None:
        value = ",".join(sorted(runner.MANAGED_STORAGE_COLUMNS))
        with self.assertRaises(base.MigrationGuardError):
            base.parse_mysql_metadata(
                f"v42_managed_columns\t{value}\n"
                f"v42_managed_columns\t{value}\n"
            )
        with self.assertRaises(base.MigrationGuardError):
            base.parse_mysql_metadata(f"v42_managed_columns {value}\n")

        duplicate = self._raw_postflight_metadata()
        duplicate["v42_managed_columns"] = f"{value},{next(iter(runner.MANAGED_STORAGE_COLUMNS))}"
        with self.assertRaisesRegex(runner.ProductionRunnerError, "duplicate column row"):
            self._run_standalone_postflight_with_metadata(duplicate)

        malformed = self._raw_postflight_metadata()
        malformed["v42_managed_columns"] = f"{value},"
        with self.assertRaisesRegex(runner.ProductionRunnerError, "malformed column name"):
            self._run_standalone_postflight_with_metadata(malformed)

    def test_wrong_definition_sentinel_and_unexpected_key_are_rejected(self) -> None:
        wrong_definition = self._raw_postflight_metadata()
        wrong_definition["v42_managed_columns"] = (
            "__invalid_v42_managed_column_contract__"
        )
        with self.assertRaisesRegex(runner.ProductionRunnerError, "malformed column name"):
            self._run_standalone_postflight_with_metadata(wrong_definition)

        unexpected = self._raw_postflight_metadata()
        unexpected["unexpected_parser_key"] = "1"
        with self.assertRaisesRegex(runner.ProductionRunnerError, "unexpected_parser_key"):
            self._run_standalone_postflight_with_metadata(unexpected)

    def test_old_wrong_expiration_column_is_rejected(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        columns = set(runner.MANAGED_STORAGE_COLUMNS)
        columns.remove("upload_expires_at")
        columns.add("storage_expires_at")
        metadata["v42_managed_columns"] = ",".join(sorted(columns))
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_missing_upload_expiration_column_is_rejected(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        columns = set(runner.MANAGED_STORAGE_COLUMNS)
        columns.remove("upload_expires_at")
        metadata["v42_managed_columns"] = ",".join(sorted(columns))
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_both_expiration_column_names_are_rejected(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        columns = set(runner.MANAGED_STORAGE_COLUMNS)
        columns.add("storage_expires_at")
        metadata["v42_managed_columns"] = ",".join(sorted(columns))
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_missing_check_constraint_rejected(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        metadata["v42_check_chk_event_media_storage_state"] = _structured_record(
            0, None, None, None, None, None
        )
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_disabled_check_support_rejected(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        metadata["tidb_enable_check_constraint"] = "0"
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_count_drift_rejected(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        metadata["users_total"] = "4"
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_more_than_one_v42_success_row_rejected(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        metadata["v42_history_contract"] = _structured_record(
            2, "42", runner.V42_FLYWAY_HISTORY_CONTRACT["description"],
            runner.EXPECTED_V42_SQL_FILE,
            runner.V42_FLYWAY_HISTORY_CONTRACT["checksum"], "1",
        )
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

    def test_failed_v42_history_is_rejected(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        metadata["failed_migration_count"] = "1"
        with self.assertRaises(base.MigrationGuardError):
            runner.validate_database_metadata_v42(metadata)

    def test_absence_of_v42_history_checksum_rejected(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        metadata["v42_history_contract"] = _structured_record(
            1, "42", runner.V42_FLYWAY_HISTORY_CONTRACT["description"],
            runner.EXPECTED_V42_SQL_FILE, None, "1",
        )
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)


# ============================================================================
# V42CompletePostflightContractTest
# ============================================================================


class V42CompletePostflightContractTest(unittest.TestCase):
    BEFORE = {
        "users_total": "3", "historical_events_total": "361",
        "event_media_total": "0", "active_admin_count": "2",
    }

    def metadata(self) -> dict[str, str]:
        return _metadata(before=self.BEFORE)

    def test_runtime_contracts_are_derived_from_the_immutable_v42_source(self) -> None:
        migration = (
            HERE.parents[1] / "backend" / "src" / "main" / "resources"
            / "db" / "migration" / runner.EXPECTED_V42_SQL_FILE
        ).read_text(encoding="utf-8")
        for name, non_unique, columns in runner.V42_EVENT_MEDIA_INDEX_CONTRACT:
            match = re.search(
                rf"CREATE\s+(UNIQUE\s+)?INDEX\s+{name}\s+ON\s+event_media\s*\(([^)]+)\)",
                migration,
                re.IGNORECASE | re.DOTALL,
            )
            self.assertIsNotNone(match, name)
            assert match is not None
            self.assertEqual(bool(match.group(1)), not non_unique)
            self.assertEqual(
                tuple(part.strip() for part in match.group(2).split(",")), columns
            )
        fk = runner.V42_EVENT_MEDIA_FK_CONTRACT
        self.assertRegex(
            re.sub(r"\s+", " ", migration),
            rf"CONSTRAINT {fk[0]} FOREIGN KEY \({fk[2][0]}\) "
            rf"REFERENCES {fk[3]} \({fk[4][0]}\) ON DELETE {fk[6]}",
        )
        cleanup_body = migration.split(
            f"CREATE TABLE {runner.V42_CLEANUP_TABLE} (", 1
        )[1].split(") ENGINE=", 1)[0]
        cleanup_names = tuple(
            re.findall(r"(?m)^\s{4}([a-z][a-z0-9_]*)\s+", cleanup_body)
        )
        self.assertEqual(
            cleanup_names,
            tuple(item[0] for item in runner.V42_CLEANUP_COLUMN_CONTRACT),
        )
        self.assertNotRegex(migration, rf"(?is)INSERT\s+INTO\s+{runner.V42_CLEANUP_TABLE}")
        normalised_source = runner._normalise_check_expression(migration)
        for name, table, expression in runner.V42_CHECK_CONTRACT:
            self.assertIn(name, migration)
            self.assertIn(table, migration)
            self.assertIn(runner._normalise_check_expression(expression), normalised_source)
        derived_description = runner.EXPECTED_V42_SQL_FILE.split("__", 1)[1][:-4].replace("_", " ")
        self.assertEqual(
            derived_description, runner.V42_FLYWAY_HISTORY_CONTRACT["description"]
        )

    def test_live_production_prefix_binding_is_fail_closed_and_sanitized(self) -> None:
        identity = {"user_prefix": "RHVnC4pobyyHQJT"}
        runner.validate_postflight_user_prefix_binding(
            identity=identity,
            session_user="RHVnC4pobyyHQJT.read@%",
            login_user="RHVnC4pobyyHQJT.read@127.0.0.1",
        )
        rejected = (
            "3c7ghU483VQ9Ynn.read@%",
            "restoreBranch.read@%",
            "wrongPrefix.read@%",
            "malformed-current-user",
        )
        for account in rejected:
            with self.subTest(account=account):
                with self.assertRaises(runner.ProductionRunnerError) as raised:
                    runner.validate_postflight_user_prefix_binding(
                        identity=identity, session_user=account, login_user=account
                    )
                self.assertNotIn(account, str(raised.exception))
                self.assertNotIn(account.split("@", 1)[0], str(raised.exception))

    def test_prefix_validation_precedes_flyway_and_schema_acceptance(self) -> None:
        sql = base.build_metadata_sql(postflight=True) + runner.metadata_sql_v42_postflight_extras()
        expected_keys = re.findall(r"(?m)^SELECT '([a-z][a-z0-9_]*)',", sql)
        valid = self.metadata()
        raw = {key: valid.get(key, "0") for key in expected_keys}
        raw["v42_metadata_capability_strategy"] = "show_create"
        raw["v42_metadata_enforcement_sources"] = ""
        for name, _table, _expression in runner.V42_CHECK_CONTRACT:
            raw[f"v42_show_create_check_{name}"] = valid[
                f"v42_show_create_check_{name}"
            ]
        order: list[str] = []
        with (
            patch.object(runner, "validate_release_e_postflight_evidence"),
            patch.object(runner, "_verify_manifest_immutable"),
            patch.object(runner, "_migration_paths_v42", return_value=(Path("m"), Path("manifest"))),
            patch.object(
                runner,
                "run_metadata_capability_query",
                return_value=runner.observed_tidb_v853_metadata_capabilities(),
            ),
            patch.object(runner, "run_metadata_query", side_effect=lambda **_kwargs: (order.append("metadata") or raw)),
            patch.object(runner, "validate_postflight_user_prefix_binding", side_effect=lambda **_kwargs: order.append("prefix")),
            patch.object(runner, "validate_database_metadata_v42"),
            patch.object(base, "verify_docker_images", return_value={
                base.FLYWAY_IMAGE: "flyway@digest",
                base.MYSQL_CLIENT_IMAGE: "mysql@digest",
            }),
            patch.object(base, "build_flyway_config", return_value="config"),
            patch.object(base, "canonical_migration_directory") as staging,
            patch.object(runner, "run_flyway_v42", return_value={}),
            patch.object(base, "validate_flyway_info", side_effect=lambda *_args, **_kwargs: (order.append("flyway") or {"current_version": "42", "pending_versions": [], "database": "lichsuvn", "flyway_version": "11.14.1"})),
            patch.object(base, "validate_flyway_validate"),
            patch.object(base, "validate_postflight_metadata"),
            patch.object(runner, "run_bounded_metadata_query", return_value=self.BEFORE),
            patch.object(runner, "validate_v42_postflight_extras", side_effect=lambda *_args, **_kwargs: (order.append("schema") or runner._expected_postflight_verification_summary())),
        ):
            staging.return_value.__enter__.return_value = Path("staged")
            runner.run_postflight(
                repo_root=Path("repo"), target={"host": "prod.invalid", "port": 4000, "database": "lichsuvn"},
                identity={"user_prefix": "RHVnC4pobyyHQJT"},
                production_identity_evidence_sha256="a" * 64,
                read_user="read", read_password="secret",
                before_evidence={"metadata": self.BEFORE},
                migration_installed_at_utc=datetime(2026, 8, 1, tzinfo=timezone.utc),
            )
        self.assertLess(order.index("metadata"), order.index("prefix"))
        self.assertLess(order.index("prefix"), order.index("flyway"))
        self.assertLess(order.index("prefix"), order.index("schema"))

    def test_event_media_index_contract_rejects_definition_drift(self) -> None:
        exact = self.metadata()
        runner.validate_v42_postflight_extras(exact, before=self.BEFORE)
        key = "v42_event_media_index_uk_event_media_managed_asset"
        cases = (
            (7, "wrong_column"),
            (6, "2"),
            (4, "1"),
            (0, "2"),
            (0, "0"),
        )
        for index, value in cases:
            with self.subTest(field=index, value=value):
                metadata = self.metadata()
                _replace_structured_field(metadata, key, index, value)
                with self.assertRaises(runner.ProductionRunnerError):
                    runner.validate_v42_postflight_extras(metadata, before=self.BEFORE)
        unrelated = self.metadata()
        _replace_structured_field(unrelated, key, 0, "0")
        unrelated["historical_event_media_index"] = _structured_record(
            1, 1, "event_media", "historical_index", 0, "BTREE", "1", "managed_asset_id"
        )
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(unrelated, before=self.BEFORE)

    def test_uploaded_by_fk_contract_rejects_relational_drift(self) -> None:
        key = "v42_event_media_fk_uploaded_by"
        cases = (
            (4, "wrong_source"), (5, "roles"), (6, "role_id"),
            (7, "CASCADE"), (8, "CASCADE"), (0, "2"), (0, "0"),
        )
        for index, value in cases:
            with self.subTest(field=index, value=value):
                metadata = self.metadata()
                _replace_structured_field(metadata, key, index, value)
                with self.assertRaises(runner.ProductionRunnerError):
                    runner.validate_v42_postflight_extras(metadata, before=self.BEFORE)

    def test_cleanup_table_contract_rejects_every_owned_drift_class(self) -> None:
        cases = (
            ("v42_cleanup_column_provider", 0, "0"),
            ("v42_cleanup_column_provider", 5, "varchar(64)"),
            ("v42_cleanup_column_provider", 6, "YES"),
            ("v42_cleanup_column_task_status", 7, "READY"),
            ("v42_cleanup_column_next_attempt_at", 10, "3"),
            ("v42_cleanup_index_primary", 0, "0"),
            ("v42_cleanup_index_uk_event_media_cleanup_identity", 7, "provider,operation,public_id"),
        )
        for key, index, value in cases:
            with self.subTest(key=key, field=index):
                metadata = self.metadata()
                _replace_structured_field(metadata, key, index, value)
                with self.assertRaises(runner.ProductionRunnerError):
                    runner.validate_v42_postflight_extras(metadata, before=self.BEFORE)
        for key, value in (
            ("v42_cleanup_column_count", "14"),
            ("v42_cleanup_index_count", "4"),
            ("v42_cleanup_check_count", "4"),
            ("v42_cleanup_foreign_keys", "1"),
            ("v42_cleanup_initial_rows", "1"),
        ):
            metadata = self.metadata()
            metadata[key] = value
            with self.assertRaises(runner.ProductionRunnerError):
                runner.validate_v42_postflight_extras(metadata, before=self.BEFORE)
        malformed = self.metadata()
        malformed["v42_cleanup_column_provider"] = "not-hex"
        with self.assertRaisesRegex(runner.ProductionRunnerError, "malformed"):
            runner.validate_v42_postflight_extras(malformed, before=self.BEFORE)

    def test_cleanup_created_at_accepts_tidb_v853_extra_contract_only(self) -> None:
        metadata = self.metadata()
        runner.validate_v42_postflight_extras(metadata, before=self.BEFORE)

        key = "v42_cleanup_column_created_at"
        for unsafe_extra in (
            "DEFAULT_GENERATED on update CURRENT_TIMESTAMP(6)",
            "on update CURRENT_TIMESTAMP(6)",
            "generated always",
        ):
            with self.subTest(extra=unsafe_extra):
                changed = self.metadata()
                _replace_structured_field(changed, key, 11, unsafe_extra)
                with self.assertRaisesRegex(
                    runner.ProductionRunnerError,
                    "cleanup column extra attributes mismatch for created_at",
                ):
                    runner.validate_v42_postflight_extras(
                        changed,
                        before=self.BEFORE,
                    )

        malformed = self.metadata()
        malformed[key] = "not-hex"
        with self.assertRaisesRegex(runner.ProductionRunnerError, "malformed"):
            runner.validate_v42_postflight_extras(malformed, before=self.BEFORE)

    def test_check_contract_accepts_cosmetic_tidb_variants_only(self) -> None:
        metadata = self.metadata()
        name = "chk_event_media_storage_state"
        cosmetic = (
            " ( ( `storage_state` In ( _utf8mb4'UNMANAGED', 'UPLOADING', "
            "'READY', 'DELETE_PENDING', 'DELETE_FAILED' ) ) ) "
        )
        _replace_structured_field(metadata, f"v42_check_{name}", 4, cosmetic)
        _replace_structured_field(metadata, f"v42_tidb_check_{name}", 4, cosmetic)
        runner.validate_v42_postflight_extras(metadata, before=self.BEFORE)

        semantic_drifts = (
            (f"v42_check_{name}", 2, runner.V42_CLEANUP_TABLE),
            (f"v42_check_{name}", 4, "storage_state <> 'INVALID'"),
            (f"v42_check_{name}", 4, "storage_state IN ('UNMANAGED','READY')"),
            (f"v42_check_{name}", 4, "storage_state IN ('UNMANAGED','UPLOADING','READY','DELETE_PENDING','DELETE_FAILED') OR 1=1"),
            (f"v42_check_{name}", 0, "2"),
            (f"v42_check_{name}", 0, "0"),
            (f"v42_check_{name}", 5, "NO"),
            (f"v42_tidb_check_{name}", 4, "storage_state IN ('UNMANAGED','READY')"),
        )
        for key, index, value in semantic_drifts:
            with self.subTest(key=key, field=index):
                changed = self.metadata()
                _replace_structured_field(changed, key, index, value)
                with self.assertRaises(runner.ProductionRunnerError):
                    runner.validate_v42_postflight_extras(changed, before=self.BEFORE)

    def test_flyway_history_contract_rejects_every_drift_class(self) -> None:
        key = "v42_history_contract"
        cases = (
            (4, "1234567"),
            (4, "-769202001"),
            (2, "wrong description"),
            (3, "V42__wrong.sql"),
            (0, "2"),
            (5, "0"),
        )
        for index, value in cases:
            with self.subTest(field=index, value=value):
                metadata = self.metadata()
                _replace_structured_field(metadata, key, index, value)
                with self.assertRaises(runner.ProductionRunnerError):
                    runner.validate_v42_postflight_extras(metadata, before=self.BEFORE)
        above = self.metadata()
        above["v42_above_rows"] = "1"
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(above, before=self.BEFORE)


# ============================================================================
# V42PreflightEvidenceContractTest
# ============================================================================


def _v42_preflight_identity() -> dict[str, str]:
    return {
        "source": "ticloud",
        "state": "ACTIVE",
        "cluster_id": runner.EXPECTED_PRODUCTION_CLUSTER_ID,
        "display_name": runner.EXPECTED_DISPLAY_NAME,
        "target_identity": runner.EXPECTED_TARGET_IDENTITY,
        "host": "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
        "database": runner.EXPECTED_DATABASE,
        "user_prefix": "RHVnC4pobyyHQJT",
        "engine_version": "v8.5.3",
        "collected_at": "2026-08-01T08:00:00Z",
    }


def _v42_preflight_target() -> dict[str, object]:
    identity = _v42_preflight_identity()
    return {
        "cluster_id": identity["cluster_id"],
        "display_name": identity["display_name"],
        "target_identity": identity["target_identity"],
        "host": identity["host"],
        "port": 4000,
        "database": identity["database"],
        "user_prefix": identity["user_prefix"],
    }


def _v42_preflight_metadata() -> dict[str, str]:
    metadata = {
        "server_version": "8.0.11-TiDB-v8.5.3-serverless",
        "version_comment": "TiDB Server",
        "database": "lichsuvn",
        "global_time_zone": "SYSTEM",
        "session_time_zone": "SYSTEM",
        "character_set_database": "utf8mb4",
        "collation_database": "utf8mb4_unicode_ci",
        "sql_mode": "STRICT_TRANS_TABLES",
        "active_admin_count": "2",
        "failed_migration_count": "0",
        "users_total": "20",
        "events_total": "361",
        "user_roles_total": "20",
        "roles_total": "3",
        "role_code_counts": "admin=1,student=1,teacher=1",
        "role_assignment_counts": "admin=2,student=18",
        "admin_role_assignment_count": "2",
        "event_status_counts": "published=361",
        "user_status_counts": "active=17,pending=3",
        "historical_events_total": "361",
        "event_media_total": "537",
        "session_user": "RHVnC4pobyyHQJT.read@%",
        "session_user_prefix_verified": "1",
        "tidb_enable_check_constraint": "1",
    }
    metadata.update(runner.V42_PREFLIGHT_ABSENT_SCHEMA_VALUES)
    return metadata


def _v42_preflight_payload() -> dict[str, object]:
    return runner.build_evidence_payload(
        mode="preflight",
        target=_v42_preflight_target(),
        release_commit="a" * 40,
        flyway={
            "current_version": "41",
            "pending_versions": ["42"],
            "database": "lichsuvn",
            "flyway_version": "11.14.1",
        },
        metadata=_v42_preflight_metadata(),
    )


def _resign_v42_preflight(payload: dict[str, object]) -> None:
    payload["evidence_sha256"] = base._evidence_sha256(payload)


def _write_v42_preflight(path: Path, payload: dict[str, object]) -> str:
    raw = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")
    path.write_bytes(raw)
    return hashlib.sha256(raw).hexdigest()


def _failure_inspection_payload() -> dict[str, object]:
    return {
        "classification": "BLOCKED_PRODUCTION_POSTFLIGHT",
        "release_commit": runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT,
        "target": {
            "cluster_id": runner.EXPECTED_PRODUCTION_CLUSTER_ID,
            "target_identity": runner.EXPECTED_TARGET_IDENTITY,
            "host": _v42_preflight_target()["host"],
            "port": 4000,
            "database": runner.EXPECTED_DATABASE,
        },
        "migrate_mode": {
            "attempt_count": 1,
            "started_at_utc": "2026-08-01T13:18:27.6777875Z",
            "ended_at_utc": "2026-08-01T13:25:19.0644045Z",
            "exit_code": 2,
            "migrate_contract_validation": "passed before postflight schema validation",
            "applied_version": "42",
            "description": "add managed event image storage",
            "installed_on": "2026-08-01T13:23:42.000000",
            "flyway_checksum": "-769202000",
        },
        "postflight": {
            "database": "lichsuvn",
            "server_version": "8.0.11-TiDB-v8.5.3-serverless",
            "sentinel": "1",
            "check_support": "1",
            "flyway_current": "42",
            "v42_success_rows": "1",
            "failed_count": "0",
            "above_v42_count": "0",
            "flyway_info_and_validate": "passed before schema-contract validation",
            "bounded_counts": {
                key: _v42_preflight_metadata()[key]
                for key in runner.V42_BOUNDED_COUNTS
            },
            "cleanup_task_total": "0",
        },
        "schema": {
            "actual_event_media_managed_columns": list(
                runner.MANAGED_STORAGE_COLUMN_CONTRACT
            ),
            "event_media_indexes": [
                "uk_event_media_managed_asset", "uk_event_media_storage_identity",
                "idx_event_media_managed_read", "idx_event_media_upload_expiry",
            ],
            "event_media_foreign_key": runner.V42_EVENT_MEDIA_FK,
            "cleanup_table": runner.V42_CLEANUP_TABLE,
            "cleanup_indexes": [
                "PRIMARY", "uk_event_media_cleanup_identity",
                "idx_event_media_cleanup_claim",
            ],
            "check_constraints": [
                "chk_event_media_storage_state", "chk_event_media_storage_byte_size",
                "chk_event_media_storage_dimensions",
                "chk_event_media_cleanup_operation", "chk_event_media_cleanup_status",
                "chk_event_media_cleanup_attempts",
            ],
            "check_constraints_present_in_both_tidb_metadata_views": True,
        },
        "postflight_blocker": {
            "observed_sql_column": "upload_expires_at",
            "incorrect_runner_expected_column": "storage_expires_at",
            "message": (
                "The committed postflight checker filters for storage_expires_at while V42 SQL "
                "creates upload_expires_at. No retry, repair, or manual schema change was performed."
            ),
        },
    }


def _write_failure_inspection(
    root: Path, payload: dict[str, object]
) -> tuple[Path, str, Path]:
    path = root / "failure-inspection.json"
    raw = (json.dumps(payload, indent=2) + "\n").encode("utf-8")
    path.write_bytes(raw)
    digest = hashlib.sha256(raw).hexdigest()
    detached = root / "failure-inspection.sha256"
    detached.write_text(f"{digest}  {path.name}\n", encoding="utf-8")
    return path, digest, detached


class V42PreflightEvidenceContractTest(unittest.TestCase):
    def _assert_rejected(self, payload: dict[str, object]) -> None:
        _resign_v42_preflight(payload)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preflight.json"
            file_sha = _write_v42_preflight(path, payload)
            with self.assertRaises((runner.ProductionRunnerError, base.MigrationGuardError)):
                runner._read_v42_preflight_evidence(path, file_sha)

    def test_v42_generated_artifact_is_accepted_and_bound(self) -> None:
        payload = _v42_preflight_payload()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preflight.json"
            file_sha = _write_v42_preflight(path, payload)
            loaded = runner.load_and_validate_v42_preflight_evidence(
                path,
                file_sha,
                target=_v42_preflight_target(),
                identity=_v42_preflight_identity(),
                expected_release_commit="a" * 40,
            )
        self.assertEqual(loaded["flyway"]["current_version"], "41")
        self.assertEqual(loaded["flyway"]["pending_versions"], ["42"])
        self.assertEqual(set(loaded["metadata"]), runner.V42_PREFLIGHT_METADATA_KEYS)

    def test_historical_and_unsafe_flyway_states_are_rejected(self) -> None:
        variants = {
            "release-d": {
                "current_version": "37", "pending_versions": ["38", "39", "40", "41"],
                "database": "lichsuvn", "flyway_version": "11.14.1",
            },
            "current-v40": {
                "current_version": "40", "pending_versions": ["41", "42"],
                "database": "lichsuvn", "flyway_version": "11.14.1",
            },
            "already-v42": {
                "current_version": "42", "pending_versions": [],
                "database": "lichsuvn", "flyway_version": "11.14.1",
            },
            "empty-pending": {
                "current_version": "41", "pending_versions": [],
                "database": "lichsuvn", "flyway_version": "11.14.1",
            },
            "v43-also-pending": {
                "current_version": "41", "pending_versions": ["42", "43"],
                "database": "lichsuvn", "flyway_version": "11.14.1",
            },
            "target-v41": {
                "current_version": "41", "pending_versions": ["41"],
                "database": "lichsuvn", "flyway_version": "11.14.1",
            },
            "target-v43": {
                "current_version": "41", "pending_versions": ["43"],
                "database": "lichsuvn", "flyway_version": "11.14.1",
            },
            "above-target": {
                "current_version": "41", "pending_versions": ["42"],
                "database": "lichsuvn", "flyway_version": "11.14.1",
                "v42_state": "Above Target",
            },
            "failed-validate-claim": {
                "current_version": "41", "pending_versions": ["42"],
                "database": "lichsuvn", "flyway_version": "11.14.1",
                "flyway_validate_passed": False,
            },
        }
        for name, flyway in variants.items():
            with self.subTest(name=name):
                payload = _v42_preflight_payload()
                payload["flyway"] = flyway
                self._assert_rejected(payload)

    def test_check_support_baseline_and_exact_metadata_shape_are_required(self) -> None:
        mutations = {
            "check-disabled": lambda m: m.__setitem__("tidb_enable_check_constraint", "0"),
            "missing-count": lambda m: m.pop("event_media_total"),
            "malformed-count": lambda m: m.__setitem__("users_total", "20.0"),
            "mismatched-count": lambda m: m.__setitem__("historical_events_total", "360"),
            "failed-history": lambda m: m.__setitem__("failed_migration_count", "1"),
            "v42-already-present": lambda m: m.__setitem__("v42_history_present", "1"),
            "unexpected-key": lambda m: m.__setitem__("unexpected", "value"),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                payload = _v42_preflight_payload()
                metadata = copy.deepcopy(payload["metadata"])
                mutate(metadata)
                payload["metadata"] = metadata
                self._assert_rejected(payload)

    def test_file_internal_target_release_and_schema_tampering_are_rejected(self) -> None:
        payload = _v42_preflight_payload()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "preflight.json"
            file_sha = _write_v42_preflight(path, payload)
            with self.assertRaises(runner.ProductionRunnerError):
                runner._read_v42_preflight_evidence(path, "0" * 64)
            path.write_bytes(path.read_bytes() + b"\n")
            with self.assertRaises(runner.ProductionRunnerError):
                runner._read_v42_preflight_evidence(path, file_sha)

        tampered = _v42_preflight_payload()
        tampered["metadata"]["users_total"] = "21"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preflight.json"
            file_sha = _write_v42_preflight(path, tampered)
            with self.assertRaises(base.MigrationGuardError):
                runner._read_v42_preflight_evidence(path, file_sha)

        for name, mutate in {
            "wrong-target": lambda p: p["target"].__setitem__("target_identity", "restore"),
            "wrong-host": lambda p: p["target"].__setitem__("host", "wrong.tidbcloud.com"),
            "wrong-database": lambda p: p["target"].__setitem__("database", "wrong"),
            "unexpected-schema": lambda p: p.__setitem__("schema", "release-d"),
            "unsupported-format": lambda p: p.__setitem__("format_version", 2),
        }.items():
            with self.subTest(name=name):
                changed = _v42_preflight_payload()
                mutate(changed)
                _resign_v42_preflight(changed)
                with tempfile.TemporaryDirectory() as directory:
                    path = Path(directory) / "preflight.json"
                    file_sha = _write_v42_preflight(path, changed)
                    with self.assertRaises((runner.ProductionRunnerError, base.MigrationGuardError)):
                        runner.load_and_validate_v42_preflight_evidence(
                            path,
                            file_sha,
                            target=_v42_preflight_target(),
                            identity=_v42_preflight_identity(),
                            expected_release_commit="a" * 40,
                        )

    def test_wrong_cluster_and_release_binding_are_rejected(self) -> None:
        payload = _v42_preflight_payload()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preflight.json"
            file_sha = _write_v42_preflight(path, payload)
            wrong_cluster = _v42_preflight_target()
            wrong_cluster["cluster_id"] = "other-cluster"
            with self.assertRaises(runner.ProductionRunnerError):
                runner.load_and_validate_v42_preflight_evidence(
                    path,
                    file_sha,
                    target=wrong_cluster,
                    identity=_v42_preflight_identity(),
                    expected_release_commit="a" * 40,
                )
            with self.assertRaises(base.MigrationGuardError):
                runner.load_and_validate_v42_preflight_evidence(
                    path,
                    file_sha,
                    target=_v42_preflight_target(),
                    identity=_v42_preflight_identity(),
                    expected_release_commit="b" * 40,
                )


class StandalonePostflightBindingContractTest(unittest.TestCase):
    def test_commits_are_exact_lowercase_full_sha(self) -> None:
        self.assertEqual(
            runner._require_exact_lower_commit("a" * 40, "commit"), "a" * 40
        )
        for value in (None, "a" * 39, "A" * 40, " " + "a" * 40, "a" * 40 + " "):
            with self.subTest(value=value):
                with self.assertRaises(runner.ProductionRunnerError):
                    runner._require_exact_lower_commit(value, "commit")

    def test_changed_path_allowlist_is_narrow_and_rejects_unsafe_contracts(self) -> None:
        shared_runner_path = "scripts/deploy/tidb_production_migration.py"
        self.assertIn(shared_runner_path, runner.POSTFLIGHT_LINEAGE_ALLOWED_PATHS)
        runner._validate_postflight_changed_paths(
            sorted(runner.POSTFLIGHT_LINEAGE_ALLOWED_PATHS)
        )
        unsafe = (
            "backend/src/main/resources/db/migration/V42__add_managed_event_image_storage.sql",
            "scripts/deploy/tidb-production-v42.sha256",
            "backend/src/main/resources/db/migration/afterMigrate.sql",
            "docs/admin/unrelated.md",
        )
        for path in unsafe:
            with self.subTest(path=path):
                with self.assertRaises(runner.ProductionRunnerError):
                    runner._validate_postflight_changed_paths([path])

    def test_shared_runner_lineage_is_exact_blob_pinned_not_symbol_allowlisted(self) -> None:
        shared_runner = Path(base.__file__).read_bytes()
        expected_sha = hashlib.sha256(shared_runner).hexdigest()
        self.assertRegex(
            runner.EXPECTED_POSTFLIGHT_SHARED_RUNNER_SHA256,
            r"^[0-9a-f]{64}$",
        )
        self.assertEqual(
            runner.EXPECTED_POSTFLIGHT_SHARED_RUNNER_SHA256,
            expected_sha,
        )
        self.assertFalse(
            hasattr(runner, "POSTFLIGHT_LINEAGE_ALLOWED_SHARED_RUNNER_SYMBOLS")
        )
        self.assertIn(
            "constant:EXPECTED_POSTFLIGHT_SHARED_RUNNER_SHA256",
            runner.POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS,
        )
        runner._validate_postflight_shared_runner_blob(shared_runner)
        mutated_shared_runner = bytearray(shared_runner)
        mutated_shared_runner[-1] ^= 0x01
        with self.assertRaisesRegex(
            runner.ProductionRunnerError, "shared production runner"
        ):
            runner._validate_postflight_shared_runner_blob(bytes(mutated_shared_runner))

    def test_protected_runner_contract_detects_target_confirmation_credentials_and_migrate(self) -> None:
        source = Path(runner.__file__).read_bytes()
        baseline = runner._python_protected_contract(source)
        self.assertEqual(len(baseline), 21)
        self.assertEqual(
            len(runner.POSTFLIGHT_LINEAGE_PROTECTED_CONSTANTS)
            + len(runner.POSTFLIGHT_LINEAGE_PROTECTED_FUNCTIONS),
            21,
        )
        mutations = (
            (b'EXPECTED_DATABASE = "lichsuvn"', b'EXPECTED_DATABASE = "other"'),
            (b'def _credentials(prefix:', b'def _credentials_changed(prefix:'),
            (b'def validate_target(', b'def validate_target_changed('),
            (b'def run_flyway_v42(', b'def run_flyway_v42_changed('),
            (b'def run_migrate(', b'def run_migrate_changed('),
        )
        for old, new in mutations:
            with self.subTest(old=old):
                changed = source.replace(old, new, 1)
                try:
                    changed_contract = runner._python_protected_contract(changed)
                except runner.ProductionRunnerError:
                    continue
                self.assertNotEqual(baseline, changed_contract)
        self.assertEqual(baseline, runner._python_protected_contract(source))

    def test_unrelated_production_runner_symbol_is_not_allowlisted(self) -> None:
        source = Path(runner.__file__).read_bytes()
        changed = source.replace(
            b'def local_check(repo_root: Path)',
            b'def unrelated_local_check(repo_root: Path)',
            1,
        )
        baseline = runner._python_runner_symbol_contract(source)
        mutated = runner._python_runner_symbol_contract(changed)
        changed_symbols = {
            key
            for key in set(baseline) | set(mutated)
            if baseline.get(key) != mutated.get(key)
        }
        self.assertTrue(changed_symbols)
        self.assertFalse(
            changed_symbols <= runner.POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS
        )

    def test_metadata_capability_lineage_inventory_is_exact_and_allowlisted(self) -> None:
        repo_root = HERE.parents[1]
        migration_source = runner._git_bytes(
            repo_root,
            [
                "show",
                f"{runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT}:"
                "scripts/deploy/tidb_production_v42_migration.py",
            ],
            "test migration-release runner",
        )
        current_source = Path(runner.__file__).read_bytes()
        baseline = runner._python_runner_symbol_contract(migration_source)
        current = runner._python_runner_symbol_contract(current_source)
        changed = {
            key
            for key in set(baseline) | set(current)
            if baseline.get(key) != current.get(key)
        }
        expected = frozenset(
            {
                "constant:V42_METADATA_CAPABILITY_OBJECTS",
                "constant:V42_METADATA_ENFORCEMENT_SOURCES",
                "constant:V42_METADATA_REQUIRED_COLUMNS",
                "constant:V42_SHOW_CREATE_TABLES",
                "constant:_TIDB_V853_OBSERVED_METADATA_COLUMNS",
                "function:_build_v42_show_create_command",
                "function:_build_v42_show_create_payload",
                "function:_encode_metadata_record",
                "function:_extract_show_create_check_expression",
                "function:_runtime_capability_model",
                "function:metadata_capability_sql_v42",
                "function:observed_tidb_v853_metadata_capabilities",
                "function:parse_metadata_capability_rows",
                "function:parse_v42_show_create_output",
                "function:run_metadata_capability_query",
                "function:run_metadata_query",
                "function:run_v42_show_create_query",
                "function:v42_show_create_sql",
                "function:validate_generated_metadata_sql_compatibility",
                "function:validate_metadata_capabilities",
            }
        )
        self.assertEqual(len(expected), 20)
        self.assertEqual(sum(item.startswith("constant:") for item in expected), 5)
        self.assertEqual(sum(item.startswith("function:") for item in expected), 15)
        self.assertEqual(changed - (runner.POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS - expected), expected)
        self.assertTrue(expected <= runner.POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS)
        self.assertTrue(expected <= set(current))

    def test_local_lineage_contract_rejects_missing_or_wildcard_capability_allowance(self) -> None:
        repo_root = HERE.parents[1]
        expected = {
            "function:metadata_capability_sql_v42",
            "function:run_metadata_capability_query",
            "function:run_v42_show_create_query",
        }
        with patch.object(
            runner,
            "POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS",
            runner.POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS - {next(iter(expected))},
        ):
            with self.assertRaises(runner.ProductionRunnerError):
                runner.local_check(repo_root)
        with patch.object(
            runner,
            "POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS",
            runner.POSTFLIGHT_LINEAGE_ALLOWED_RUNNER_SYMBOLS | {"function:*"},
        ):
            with self.assertRaises(runner.ProductionRunnerError):
                runner.local_check(repo_root)

    def test_failure_inspection_exact_bytes_commit_execution_and_preflight_binding(self) -> None:
        preflight = _v42_preflight_payload()
        preflight["release_commit"] = runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT
        _resign_v42_preflight(preflight)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path, digest, detached = _write_failure_inspection(
                root, _failure_inspection_payload()
            )
            loaded = runner.load_and_validate_v42_failure_inspection(
                path, digest, detached,
                target=_v42_preflight_target(),
                migration_release_commit=runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT,
                preflight_evidence=preflight,
            )
            self.assertEqual(loaded["artifact"]["migrate_mode"]["attempt_count"], 1)
            self.assertEqual(
                loaded["migration_installed_at_utc"].tzinfo, runner.timezone.utc
            )

            for mutation in ("commit", "attempt", "checker", "counts"):
                payload = _failure_inspection_payload()
                if mutation == "commit":
                    payload["release_commit"] = "0" * 40
                elif mutation == "attempt":
                    payload["migrate_mode"]["attempt_count"] = 2
                elif mutation == "checker":
                    payload["postflight_blocker"]["observed_sql_column"] = "other"
                else:
                    payload["postflight"]["bounded_counts"]["users_total"] = "21"
                changed, changed_sha, changed_detached = _write_failure_inspection(
                    root, payload
                )
                with self.subTest(mutation=mutation):
                    with self.assertRaises(runner.ProductionRunnerError):
                        runner.load_and_validate_v42_failure_inspection(
                            changed, changed_sha, changed_detached,
                            target=_v42_preflight_target(),
                            migration_release_commit=(
                                runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT
                            ),
                            preflight_evidence=preflight,
                        )

            path.write_bytes(path.read_bytes() + b"tamper")
            with self.assertRaises(runner.ProductionRunnerError):
                runner.load_and_validate_v42_failure_inspection(
                    path, digest, detached,
                    target=_v42_preflight_target(),
                    migration_release_commit=runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT,
                    preflight_evidence=preflight,
                )

    def test_wrong_migration_commit_and_non_ancestor_are_rejected(self) -> None:
        with self.assertRaisesRegex(runner.ProductionRunnerError, "approved V42"):
            runner.validate_postflight_release_lineage(
                HERE.parents[1], checkout_commit="a" * 40,
                migration_release_commit="b" * 40,
            )
        completed = subprocess.CompletedProcess(["git"], 1, b"", b"")
        with patch.object(runner, "_git_result", return_value=completed):
            with self.assertRaisesRegex(runner.ProductionRunnerError, "not an ancestor"):
                runner.validate_postflight_release_lineage(
                    HERE.parents[1], checkout_commit="a" * 40,
                    migration_release_commit=runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT,
                )

    def test_postflight_only_arguments_are_required_and_rejected_by_other_modes(self) -> None:
        stderr = io.StringIO()
        with redirect_stderr(stderr):
            missing = runner.main(["--mode", "postflight"])
            preflight = runner.main([
                "--mode", "preflight",
                "--expected-migration-release-commit",
                runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT,
            ])
            migrate = runner.main([
                "--mode", "migrate",
                "--expected-migration-release-commit",
                runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT,
            ])
        self.assertEqual((missing, preflight, migrate), (2, 2, 2))

    def test_postflight_backup_time_is_fixed_while_write_validator_uses_current_clock(self) -> None:
        installed = datetime(2026, 8, 1, 13, 23, 42, tzinfo=timezone.utc)
        with (
            patch.object(runner, "_env", return_value="evidence"),
            patch.object(
                runner.release_e_evidence,
                "validate_backup_evidence",
                return_value={"evidence_sha256": "b" * 64},
            ) as backup,
            patch.object(
                runner.release_e_evidence,
                "verify_restore_identity_evidence",
                return_value="c" * 64,
            ),
            patch.object(
                runner.release_e_evidence,
                "validate_restore_evidence",
                return_value={"evidence_sha256": "d" * 64},
            ) as restore,
        ):
            runner.validate_release_e_postflight_evidence(
                production_identity_evidence_sha256="a" * 64,
                migration_installed_at_utc=installed,
            )
        self.assertEqual(backup.call_args.kwargs["now_utc"], installed)
        self.assertEqual(restore.call_args.kwargs["now_utc"], installed)

        blocker = runner.release_e_evidence.EvidenceContractError(
            "BLOCKED_PRODUCTION_BACKUP_EVIDENCE", "backup expired"
        )
        with (
            patch.object(runner, "_env", return_value="evidence"),
            patch.object(
                runner.release_e_evidence, "validate_backup_evidence", side_effect=blocker
            ),
        ):
            with self.assertRaisesRegex(
                runner.release_e_evidence.EvidenceContractError, "backup expired"
            ):
                runner.validate_release_e_evidence(
                    production_identity_evidence_sha256="a" * 64
                )


# ============================================================================
# V42PostflightEvidenceContractTest
# ============================================================================


class V42PostflightEvidenceContractTest(unittest.TestCase):
    CHECKOUT = "a" * 40
    MIGRATION = runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT
    IDENTITY_SHA = "1" * 64
    BACKUP_SHA = "2" * 64
    RESTORE_SHA = "3" * 64
    PREFLIGHT_FILE_SHA = "4" * 64
    PREFLIGHT_INTERNAL_SHA = "5" * 64
    FAILURE_SHA = "6" * 64
    INSTALLED = datetime(2026, 8, 1, 13, 23, 42, tzinfo=timezone.utc)
    POSTFLIGHT_TIME = "2026-08-01T14:00:00Z"
    COUNTS = {
        "users_total": "3", "historical_events_total": "361",
        "event_media_total": "0", "active_admin_count": "2",
    }

    def payload(self) -> dict[str, object]:
        metadata = _metadata(before=self.COUNTS)
        return runner.build_standalone_postflight_evidence_payload(
            target=_v42_preflight_target(),
            checkout_commit=self.CHECKOUT,
            migration_release_commit=self.MIGRATION,
            production_identity_evidence_sha256=self.IDENTITY_SHA,
            backup_evidence_sha256=self.BACKUP_SHA,
            restore_evidence_sha256=self.RESTORE_SHA,
            preflight_file_sha256=self.PREFLIGHT_FILE_SHA,
            preflight_evidence_sha256=self.PREFLIGHT_INTERNAL_SHA,
            failure_inspection_file_sha256=self.FAILURE_SHA,
            migration_installed_at_utc=self.INSTALLED,
            flyway={
                "current_version": "42", "pending_versions": [],
                "database": "lichsuvn", "flyway_version": "11.14.1",
            },
            metadata=metadata,
            verification=runner._expected_postflight_verification_summary(),
            postflight_timestamp_utc=self.POSTFLIGHT_TIME,
        )

    def loader_arguments(self) -> dict[str, object]:
        return {
            "repo_root": HERE.parents[1],
            "target": _v42_preflight_target(),
            "expected_checkout_commit": self.CHECKOUT,
            "expected_migration_release_commit": self.MIGRATION,
            "expected_identity_evidence_sha256": self.IDENTITY_SHA,
            "expected_backup_evidence_sha256": self.BACKUP_SHA,
            "expected_restore_evidence_sha256": self.RESTORE_SHA,
            "expected_preflight_file_sha256": self.PREFLIGHT_FILE_SHA,
            "expected_preflight_evidence_sha256": self.PREFLIGHT_INTERNAL_SHA,
            "expected_failure_inspection_file_sha256": self.FAILURE_SHA,
            "expected_bounded_counts": self.COUNTS,
            "expected_migration_installed_at_utc": self.INSTALLED,
        }

    @staticmethod
    def write_fixture(directory: Path, value: dict[str, object]) -> tuple[Path, Path]:
        evidence_path = directory / "postflight.json"
        detached_path = directory / "postflight.sha256"
        body = runner.release_e_evidence.canonical_json_bytes(value, trailing_newline=True)
        evidence_path.write_bytes(body)
        detached_path.write_text(
            f"{hashlib.sha256(body).hexdigest()}  {evidence_path.name}\n",
            encoding="ascii",
            newline="",
        )
        return evidence_path, detached_path

    @staticmethod
    def resign(value: dict[str, object]) -> None:
        value["evidence_sha256"] = base._evidence_sha256(value)

    def test_builder_is_deterministic_bounded_and_secret_free(self) -> None:
        first = self.payload()
        second = self.payload()
        self.assertEqual(first, second)
        self.assertEqual(first["schema"], runner.V42_POSTFLIGHT_EVIDENCE_SCHEMA)
        serialized = json.dumps(first, sort_keys=True)
        for prohibited in (
            "RHVnC4pobyyHQJT.read", "read-secret", "TIDB_PRODUCTION_READ_PASSWORD",
            "mysql://", "jdbc:mysql://",
        ):
            self.assertNotIn(prohibited, serialized)
        self.assertNotIn("metadata", first)

    def test_atomic_writer_hashes_exact_bytes_and_immediately_reloads_once(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            evidence_path = Path(directory) / "postflight.json"
            detached_path = Path(directory) / "postflight.sha256"
            original_loader = runner.load_and_validate_v42_postflight_evidence
            with (
                patch.object(runner, "validate_postflight_release_lineage"),
                patch.object(
                    runner,
                    "load_and_validate_v42_postflight_evidence",
                    wraps=original_loader,
                ) as loader,
            ):
                result = runner.write_and_reload_v42_postflight_evidence(
                    evidence_path,
                    detached_path,
                    self.payload(),
                    loader_arguments=self.loader_arguments(),
                )
            loader.assert_called_once()
            raw = evidence_path.read_bytes()
            digest = hashlib.sha256(raw).hexdigest()
            self.assertEqual(result["file_sha256"], digest)
            self.assertEqual(
                detached_path.read_bytes(), f"{digest}  postflight.json\n".encode("ascii")
            )
            self.assertEqual(
                raw,
                runner.release_e_evidence.canonical_json_bytes(
                    self.payload(), trailing_newline=True
                ),
            )
            self.assertEqual(list(Path(directory).glob(".v42-postflight-*")), [])

    def test_write_failure_and_reload_failure_remove_all_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            evidence_path = root / "postflight.json"
            detached_path = root / "postflight.sha256"
            real_link = os.link
            calls = 0

            def fail_second_link(source, destination):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError("simulated detached publish failure")
                return real_link(source, destination)

            with patch.object(os, "link", side_effect=fail_second_link):
                with self.assertRaises(OSError):
                    runner.write_and_reload_v42_postflight_evidence(
                        evidence_path, detached_path, self.payload(),
                        loader_arguments=self.loader_arguments(),
                    )
            self.assertFalse(evidence_path.exists())
            self.assertFalse(detached_path.exists())
            self.assertEqual(list(root.glob(".v42-postflight-*")), [])

            with patch.object(
                runner,
                "load_and_validate_v42_postflight_evidence",
                side_effect=runner.ProductionRunnerError("reload failed"),
            ):
                with self.assertRaisesRegex(runner.ProductionRunnerError, "reload failed"):
                    runner.write_and_reload_v42_postflight_evidence(
                        evidence_path, detached_path, self.payload(),
                        loader_arguments=self.loader_arguments(),
                    )
            self.assertFalse(evidence_path.exists())
            self.assertFalse(detached_path.exists())
            self.assertEqual(list(root.glob(".v42-postflight-*")), [])

    def test_valid_loader_and_strict_semantic_mutations(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path, detached = self.write_fixture(Path(directory), self.payload())
            with patch.object(runner, "validate_postflight_release_lineage"):
                loaded = runner.load_and_validate_v42_postflight_evidence(
                    path, detached, **self.loader_arguments()
                )
            self.assertEqual(loaded["evidence"]["mode"], "postflight")

        mutations = (
            ("wrong schema", lambda value: value.__setitem__("schema", "wrong")),
            ("wrong mode", lambda value: value.__setitem__("mode", "preflight")),
            ("missing key", lambda value: value.pop("verification")),
            ("unexpected key", lambda value: value.__setitem__("unexpected", True)),
            ("checkout mismatch", lambda value: value["release_lineage"].__setitem__("checkout_commit", "b" * 40)),
            ("migration mismatch", lambda value: value["release_lineage"].__setitem__("migration_release_commit", "c" * 40)),
            ("artifact hash mismatch", lambda value: value["retained_evidence"].__setitem__("backup_evidence_sha256", "f" * 64)),
            ("attempt mismatch", lambda value: value["migration_execution"].__setitem__("historical_migrate_attempt_count", 2)),
            ("V42 state mismatch", lambda value: value["flyway"].__setitem__("state", "Pending")),
            ("schema verification false", lambda value: value["verification"]["check_constraints"].__setitem__("enforced", False)),
            ("count mismatch", lambda value: value["bounded_counts"].__setitem__("users_total", "4")),
            ("timestamp malformed", lambda value: value.__setitem__("postflight_timestamp_utc", "not-a-time")),
            ("timestamp before migrate", lambda value: value.__setitem__("postflight_timestamp_utc", "2026-08-01T13:00:00Z")),
        )
        for label, mutate in mutations:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                value = copy.deepcopy(self.payload())
                mutate(value)
                self.resign(value)
                path, detached = self.write_fixture(Path(directory), value)
                with patch.object(runner, "validate_postflight_release_lineage"):
                    with self.assertRaises(runner.ProductionRunnerError):
                        runner.load_and_validate_v42_postflight_evidence(
                            path, detached, **self.loader_arguments()
                        )

    def test_detached_internal_sha_and_lineage_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path, detached = self.write_fixture(Path(directory), self.payload())
            detached.write_text("0" * 64 + "  postflight.json\n", encoding="ascii")
            with self.assertRaisesRegex(runner.ProductionRunnerError, "detached SHA"):
                runner.load_and_validate_v42_postflight_evidence(
                    path, detached, **self.loader_arguments()
                )
        with tempfile.TemporaryDirectory() as directory:
            value = self.payload()
            value["evidence_sha256"] = "0" * 64
            path, detached = self.write_fixture(Path(directory), value)
            with self.assertRaisesRegex(runner.ProductionRunnerError, "internal evidence SHA"):
                runner.load_and_validate_v42_postflight_evidence(
                    path, detached, **self.loader_arguments()
                )
        with tempfile.TemporaryDirectory() as directory:
            path, detached = self.write_fixture(Path(directory), self.payload())
            with patch.object(
                runner,
                "validate_postflight_release_lineage",
                side_effect=runner.ProductionRunnerError("lineage mismatch"),
            ):
                with self.assertRaisesRegex(runner.ProductionRunnerError, "lineage mismatch"):
                    runner.load_and_validate_v42_postflight_evidence(
                        path, detached, **self.loader_arguments()
                    )

    def test_main_cannot_report_postflight_success_before_writer_reload(self) -> None:
        source = (HERE / "tidb_production_v42_migration.py").read_text(encoding="utf-8")
        postflight_branch = source.split('if args.mode == "postflight":', 2)[-1]
        self.assertLess(
            postflight_branch.index("write_and_reload_v42_postflight_evidence("),
            postflight_branch.index('_print({\n                "mode": "postflight"'),
        )


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
            if command[1] == "version":
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout=json.dumps({"Os": "linux", "Arch": "amd64"}),
                    stderr="",
                )
            image = command[3]
            digest = approved_by_image[image]
            repository = image.rsplit(":", 1)[0]
            return subprocess.CompletedProcess(
                command,
                0,
                stdout=json.dumps([f"{repository}@{digest}"]) + "|linux|amd64",
                stderr="",
            )

        with (
            patch.object(base, "_env", side_effect=operator_digests.__getitem__),
            patch.object(
                base,
                "resolve_docker_executable",
                return_value=str(Path(sys.executable).resolve()),
            ),
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

    def test_runbook_documents_trusted_docker_resolution_and_no_rerun(self) -> None:
        runbook = (
            HERE.parents[1] / "docs" / "admin" / "TIDB_PRODUCTION_V42_RUNBOOK.md"
        ).read_text(encoding="utf-8")
        for contract in (
            "### Docker CLI resolution contract",
            "trusted parent-process",
            "same validated absolute",
            "No shell or",
            "child-environment sanitization",
            "Linux/amd64",
            "``--pull=never``",
            "migrate must never be rerun",
            "standalone read-only postflight",
            "does not itself run that postflight or claim that it passed",
        ):
            self.assertIn(contract.casefold(), runbook.casefold())

    def test_runbook_documents_fail_closed_bounded_metadata_contract(self) -> None:
        runbook = (
            HERE.parents[1] / "docs" / "admin" / "TIDB_PRODUCTION_V42_RUNBOOK.md"
        ).read_text(encoding="utf-8")
        for key in runner.V42_BOUNDED_COUNTS:
            self.assertIn(f"``{key}``", runbook)
        self.assertIn("incomplete result is fail-closed", runbook)
        self.assertIn("there is no retry query", runbook)

    def test_runbook_documents_the_applied_v42_column_correction(self) -> None:
        runbook = (
            HERE.parents[1] / "docs" / "admin" / "TIDB_PRODUCTION_V42_RUNBOOK.md"
        ).read_text(encoding="utf-8")
        section = runbook.split(
            "### V42 managed-column migration-delta contract", 1
        )[1].split("Requires:", 1)[0]
        for name in runner.MANAGED_STORAGE_COLUMN_CONTRACT:
            self.assertIn(f"\n{name}\n", section)
        self.assertIn("``V3__event_support_tables.sql``", section)
        self.assertIn(
            "``ENUM('local','external','object_storage') NOT NULL DEFAULT 'external'``",
            section,
        )
        self.assertIn("approved V41 restore corroborated", section)
        self.assertIn("migration-delta checker", section)
        self.assertIn("not a complete", section)
        self.assertIn("broad ``storage_*`` or", section)
        self.assertIn("``upload_*`` matching is prohibited", section)
        self.assertIn("``storage_type``", section)
        self.assertIn("``upload_expires_at``", runbook)
        self.assertIn("``storage_expires_at``", runbook)
        self.assertIn("checker-only typo", runbook)
        self.assertIn("must never be rerun", runbook.casefold())
        self.assertIn("read-only postflight", runbook)
        self.assertIn("no manual DDL", runbook)
        self.assertIn("was not bypassed or modified", section)
        self.assertIn("no new identity-bound rehearsal query was run", section)

    def test_runbook_documents_separate_postflight_release_bindings(self) -> None:
        runbook = (
            HERE.parents[1] / "docs" / "admin" / "TIDB_PRODUCTION_V42_RUNBOOK.md"
        ).read_text(encoding="utf-8")
        self.assertIn(runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT, runbook)
        self.assertIn("``--expected-release-commit``", runbook)
        self.assertIn("``--expected-migration-release-commit``", runbook)
        self.assertIn("migration release must be an ancestor", runbook)
        self.assertIn("V1-V42 SQL", runbook)
        self.assertIn("zero ``migrate``", runbook)
        self.assertIn("``TIDB_PRODUCTION_MIGRATE_*``", runbook)
        self.assertIn("current clock", runbook)

    def test_runbook_documents_tidb_safe_check_metadata_alias_contract(self) -> None:
        runbook = (
            HERE.parents[1] / "docs" / "admin" / "TIDB_PRODUCTION_V42_RUNBOOK.md"
        ).read_text(encoding="utf-8")
        normalized = re.sub(r"\s+", " ", runbook).casefold()
        for phrase in (
            "SQL error 1064",
            "aggregate CHECK-metadata SELECT",
            "no live V42 schema result was accepted",
            "Flyway ``info`` and ``validate``",
            "did not follow",
            "no postflight evidence or detached SHA-256 was published",
            "exact parser field contract",
            "cross-bound by schema, owner table, constraint name and expression",
            "conservative expression normalizer",
            "migrate`` must never be rerun",
            "does not claim that final postflight has passed",
        ):
            self.assertIn(re.sub(r"\s+", " ", phrase).casefold(), normalized)
        for alias in runner.V42_CHECK_METADATA_FIELD_ALIASES[1:]:
            self.assertIn(f"``{alias}``", runbook)

    def test_runbook_documents_complete_postflight_and_evidence_contract(self) -> None:
        runbook = (
            HERE.parents[1] / "docs" / "admin" / "TIDB_PRODUCTION_V42_RUNBOOK.md"
        ).read_text(encoding="utf-8")
        for phrase in (
            "both ``CURRENT_USER()`` and ``USER()``",
            "shared TiDB gateway hostname is not sufficient identity proof",
            "complete V42 object contract",
            "default ``ON UPDATE RESTRICT``",
            "exactly zero foreign keys",
            "initial row count zero",
            "checksum ``-769202000``",
            runner.V42_POSTFLIGHT_EVIDENCE_SCHEMA,
            "``--evidence-detached-sha256``",
            "immediately reloads",
            "success is not reported before reload passes",
            "production postflight has not yet been run",
        ):
            self.assertIn(phrase.casefold(), runbook.casefold())


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

    def test_invalid_v42_artifact_blocks_migration_credential_access(self) -> None:
        payload = _v42_preflight_payload()
        payload["flyway"] = {
            "current_version": "37",
            "pending_versions": ["38", "39", "40", "41"],
            "database": "lichsuvn",
            "flyway_version": "11.14.1",
        }
        _resign_v42_preflight(payload)
        credential_prefixes: list[str] = []

        def credentials(prefix: str) -> tuple[str, str]:
            credential_prefixes.append(prefix)
            if prefix == "TIDB_PRODUCTION_MIGRATE":
                raise AssertionError("migration credentials were read")
            return "read", "read-secret"

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preflight.json"
            file_sha = _write_v42_preflight(path, payload)
            with (
                patch.object(runner, "load_identity_evidence", return_value=_v42_preflight_identity()),
                patch.object(base, "verify_release_checkout"),
                patch.object(base, "validate_local_docker_environment"),
                patch.object(runner, "_target_from_environment_and_evidence", return_value=_v42_preflight_target()),
                patch.object(runner, "validate_release_e_evidence"),
                patch.object(runner, "_credentials", side_effect=credentials),
                patch.object(runner, "run_preflight") as preflight,
                patch.object(runner, "run_migrate") as migrate,
                redirect_stderr(io.StringIO()),
            ):
                exit_code = runner.main([
                    "--mode", "migrate",
                    "--expected-release-commit", "a" * 40,
                    "--confirm-target", "main@gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com/lichsuvn:41->42",
                    "--identity-evidence", str(Path(directory) / "identity.json"),
                    "--identity-evidence-sha256", "b" * 64,
                    "--before-evidence", str(path),
                    "--before-evidence-sha256", file_sha,
                    "--two-active-admins", "--backends-drained",
                    "--single-migration-owner", "--maintenance-window",
                    "--rollback-owner", "--runtime-security-verified",
                    "--execute-migrate", "--risk-accepted-minimal",
                ])
        self.assertEqual(exit_code, 2)
        self.assertEqual(credential_prefixes, [])
        preflight.assert_not_called()
        migrate.assert_not_called()

    def test_valid_main_path_orders_artifact_and_live_gates_before_migrate_credentials(self) -> None:
        payload = _v42_preflight_payload()
        calls: list[str] = []
        original_loader = runner.load_and_validate_v42_preflight_evidence

        def load_artifact(*args, **kwargs):
            calls.append("artifact")
            return original_loader(*args, **kwargs)

        def credentials(prefix: str) -> tuple[str, str]:
            calls.append(f"credentials:{prefix}")
            return ("read", "read-secret") if prefix.endswith("READ") else ("migrate", "migrate-secret")

        pre_result = {
            "flyway": payload["flyway"],
            "metadata": payload["metadata"],
        }
        post_result = {
            "flyway": {
                "current_version": "42", "pending_versions": [],
                "database": "lichsuvn", "flyway_version": "11.14.1",
            },
            "metadata": payload["metadata"],
        }

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preflight.json"
            file_sha = _write_v42_preflight(path, payload)
            with (
                patch.object(runner, "load_identity_evidence", return_value=_v42_preflight_identity()),
                patch.object(base, "verify_release_checkout"),
                patch.object(base, "validate_local_docker_environment"),
                patch.object(runner, "_target_from_environment_and_evidence", return_value=_v42_preflight_target()),
                patch.object(
                    runner,
                    "validate_release_e_evidence",
                    side_effect=lambda **_kwargs: calls.append("release-evidence"),
                ),
                patch.object(runner, "load_and_validate_v42_preflight_evidence", side_effect=load_artifact),
                patch.object(runner, "_credentials", side_effect=credentials),
                patch.object(
                    runner,
                    "run_preflight",
                    side_effect=lambda **_kwargs: calls.append("live-preflight") or pre_result,
                ),
                patch.object(
                    runner,
                    "run_migrate",
                    side_effect=lambda **_kwargs: calls.append("migrate-workflow") or post_result,
                ) as migrate,
                patch.object(runner, "_print"),
            ):
                exit_code = runner.main([
                    "--mode", "migrate",
                    "--expected-release-commit", "a" * 40,
                    "--confirm-target", "main@gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com/lichsuvn:41->42",
                    "--identity-evidence", str(Path(directory) / "identity.json"),
                    "--identity-evidence-sha256", "b" * 64,
                    "--before-evidence", str(path),
                    "--before-evidence-sha256", file_sha,
                    "--two-active-admins", "--backends-drained",
                    "--single-migration-owner", "--maintenance-window",
                    "--rollback-owner", "--runtime-security-verified",
                    "--execute-migrate", "--risk-accepted-minimal",
                ])
        self.assertEqual(exit_code, 0)
        migrate.assert_called_once()
        migrate_credential = calls.index("credentials:TIDB_PRODUCTION_MIGRATE")
        self.assertLess(calls.index("artifact"), migrate_credential)
        self.assertLess(calls.index("live-preflight"), migrate_credential)
        self.assertLess(calls.index("release-evidence", calls.index("artifact") + 1), migrate_credential)
        self.assertGreater(calls.index("migrate-workflow"), migrate_credential)

    def test_postflight_failure_uses_read_credentials_and_cannot_migrate(self) -> None:
        payload = _v42_preflight_payload()
        payload["release_commit"] = runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT
        _resign_v42_preflight(payload)
        credential_prefixes: list[str] = []

        def credentials(prefix: str) -> tuple[str, str]:
            credential_prefixes.append(prefix)
            if prefix != "TIDB_PRODUCTION_READ":
                raise AssertionError("postflight accessed migration credentials")
            return "read", "read-secret"

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preflight.json"
            evidence_path = Path(directory) / "postflight.json"
            detached_path = Path(directory) / "postflight.sha256"
            file_sha = _write_v42_preflight(path, payload)
            with (
                patch.object(runner, "load_identity_evidence", return_value=_v42_preflight_identity()),
                patch.object(base, "verify_release_checkout"),
                patch.object(base, "validate_local_docker_environment"),
                patch.object(runner, "_target_from_environment_and_evidence", return_value=_v42_preflight_target()),
                patch.object(runner, "validate_postflight_release_lineage"),
                patch.object(
                    runner,
                    "load_and_validate_v42_failure_inspection",
                    return_value={
                        "migration_installed_at_utc": datetime(
                            2026, 8, 1, 13, 23, 42, tzinfo=timezone.utc
                        )
                    },
                ),
                patch.object(runner, "validate_release_e_postflight_evidence"),
                patch.object(runner, "_credentials", side_effect=credentials),
                patch.object(
                    runner,
                    "run_postflight",
                    side_effect=runner.ProductionRunnerError("schema gate failed"),
                ) as postflight,
                patch.object(runner, "run_migrate") as migrate,
                patch.object(base, "_write_evidence") as write_evidence,
                patch.object(
                    runner, "write_and_reload_v42_postflight_evidence"
                ) as artifact_writer,
                patch.object(
                    runner, "load_and_validate_v42_postflight_evidence"
                ) as artifact_loader,
                redirect_stderr(io.StringIO()),
            ):
                exit_code = runner.main([
                    "--mode", "postflight",
                    "--expected-release-commit", "a" * 40,
                    "--expected-migration-release-commit",
                    runner.APPROVED_V42_MIGRATION_RELEASE_COMMIT,
                    "--confirm-target", "main@gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com/lichsuvn:41->42",
                    "--identity-evidence", str(Path(directory) / "identity.json"),
                    "--identity-evidence-sha256", "b" * 64,
                    "--before-evidence", str(path),
                    "--before-evidence-sha256", file_sha,
                    "--failure-inspection", str(Path(directory) / "failure.json"),
                    "--failure-inspection-sha256", "c" * 64,
                    "--failure-inspection-detached-sha256",
                    str(Path(directory) / "failure.sha256"),
                    "--evidence-file", str(evidence_path),
                    "--evidence-detached-sha256",
                    str(detached_path),
                ])
            self.assertFalse(evidence_path.exists())
            self.assertFalse(detached_path.exists())
        self.assertEqual(exit_code, 2)
        self.assertEqual(credential_prefixes, ["TIDB_PRODUCTION_READ"])
        postflight.assert_called_once()
        migrate.assert_not_called()
        write_evidence.assert_not_called()
        artifact_writer.assert_not_called()
        artifact_loader.assert_not_called()

    def test_mocked_migrate_path_invokes_migrate_once_and_requires_postflight(self) -> None:
        operations: list[str] = []
        pre = {
            "flyway": _v42_preflight_payload()["flyway"],
            "metadata": _v42_preflight_metadata(),
        }
        post_metadata = _v42_preflight_metadata()
        bounded = {key: post_metadata[key] for key in runner.V42_BOUNDED_COUNTS}

        def flyway(**kwargs):
            operation = kwargs["operation"]
            operations.append(operation)
            if operation == "migrate":
                return {
                    "operation": "migrate",
                    "success": True,
                    "database": "lichsuvn",
                    "flywayVersion": "11.14.1",
                    "initialSchemaVersion": "41",
                    "targetSchemaVersion": "42",
                    "migrationsExecuted": 1,
                    "migrations": [{"version": "42"}],
                    "warnings": [],
                }
            return {}

        with (
            patch.object(runner, "run_preflight", return_value=pre) as preflight,
            patch.object(runner, "validate_user_prefix_binding"),
            patch.object(
                base,
                "verify_docker_images",
                return_value={base.FLYWAY_IMAGE: "flyway@digest"},
            ),
            patch.object(base, "build_flyway_config", return_value="config"),
            patch.object(runner, "_migration_paths_v42", return_value=(Path("migrations"), Path("manifest"))),
            patch.object(base, "canonical_migration_directory") as staging,
            patch.object(runner, "run_flyway_v42", side_effect=flyway),
            patch.object(runner, "validate_flyway_info_for_v42", return_value=pre["flyway"]),
            patch.object(
                base,
                "validate_flyway_info",
                return_value={
                    "current_version": "42", "pending_versions": [],
                    "database": "lichsuvn", "flyway_version": "11.14.1",
                },
            ),
            patch.object(base, "validate_flyway_validate"),
            patch.object(runner, "validate_release_e_evidence"),
            patch.object(runner, "run_metadata_query", return_value=post_metadata) as metadata_query,
            patch.object(runner, "validate_database_metadata_v42"),
            patch.object(base, "validate_postflight_metadata"),
            patch.object(runner, "run_bounded_metadata_query", return_value=bounded),
            patch.object(runner, "validate_v42_postflight_extras") as postflight_extras,
        ):
            staging.return_value.__enter__.return_value = Path("staged")
            result = runner.run_migrate(
                repo_root=Path("repo"),
                target=_v42_preflight_target(),
                identity=_v42_preflight_identity(),
                production_identity_evidence_sha256="a" * 64,
                read_user="read",
                read_password="read-secret",
                migrate_user="migrate",
                migrate_password="migrate-secret",
            )
        preflight.assert_called_once()
        self.assertEqual(operations.count("migrate"), 1)
        self.assertEqual(operations, ["info", "validate", "migrate", "info", "validate"])
        metadata_query.assert_called_once()
        postflight_extras.assert_called_once()
        self.assertEqual(result["flyway"]["current_version"], "42")
        self.assertTrue({"repair", "baseline", "clean"}.isdisjoint(operations))


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
                     "EVIDENCE_FORMAT_VERSION", "MAX_EVIDENCE_BYTES",
                     "DOCKER_METADATA_TIMEOUT_SECONDS",
                     "DOCKER_IMAGE_INSPECT_TIMEOUT_SECONDS",
                     "EXPECTED_DOCKER_SERVER_OS",
                     "EXPECTED_DOCKER_SERVER_ARCHITECTURE"):
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
            "_trusted_docker_search_path", "_validate_resolved_docker_executable",
            "resolve_docker_executable", "_run_docker_metadata_command",
            "_normalise_docker_architecture", "_validate_docker_daemon_platform",
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

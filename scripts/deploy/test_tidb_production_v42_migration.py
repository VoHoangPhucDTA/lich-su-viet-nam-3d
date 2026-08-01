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
        self.assertEqual(sql.count(")), '') AS v"), 5)

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


class ManagedStorageColumnContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.migration_path = (
            HERE.parents[1]
            / "backend" / "src" / "main" / "resources" / "db" / "migration"
            / runner.EXPECTED_V42_SQL_FILE
        )
        cls.migration_sql = cls.migration_path.read_text(encoding="utf-8")

    def test_ordered_contract_exactly_matches_authoritative_v42_sql(self) -> None:
        declarations = _managed_storage_declarations(self.migration_sql)
        names = [name for name, _declaration in declarations]
        self.assertEqual(len(names), 18)
        self.assertEqual(names, list(runner.MANAGED_STORAGE_COLUMN_CONTRACT))
        self.assertEqual(len(runner.MANAGED_STORAGE_COLUMNS), 18)
        self.assertEqual(names.count("upload_expires_at"), 1)
        self.assertNotIn("storage_expires_at", names)

    def test_contract_rejects_missing_or_duplicate_names(self) -> None:
        contract = runner.MANAGED_STORAGE_COLUMN_CONTRACT
        with self.assertRaisesRegex(ValueError, "exactly 18"):
            runner._validated_managed_storage_column_contract(contract[:-1])
        duplicate = contract[:-1] + (contract[-2],)
        with self.assertRaisesRegex(ValueError, "duplicate"):
            runner._validated_managed_storage_column_contract(duplicate)

    def test_upload_expiration_type_nullability_and_default_are_exact(self) -> None:
        def require_contract(sql: str) -> None:
            declarations = dict(_managed_storage_declarations(sql))
            if declarations.get("upload_expires_at") != "DATETIME(6) NULL":
                raise ValueError("upload_expires_at declaration contract mismatch")

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

    def test_generated_sql_uses_one_authoritative_contract_and_catches_extras(self) -> None:
        sql = runner.metadata_sql_v42_postflight_extras()
        for name in runner.MANAGED_STORAGE_COLUMN_CONTRACT:
            self.assertEqual(sql.count(f"'{name}'"), 1)
        self.assertIn("'upload_expires_at'", sql)
        self.assertNotIn("storage_expires_at", sql)
        self.assertIn("column_name LIKE 'storage!_%' ESCAPE '!'", sql)
        self.assertIn("column_name LIKE 'upload!_%' ESCAPE '!'", sql)


# ============================================================================
# PostflightTest
# ============================================================================


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
            "users_total": "3", "historical_events_total": "361",
            "event_media_total": "0", "active_admin_count": "2",
        }
        runner.validate_v42_postflight_extras(_metadata(before=before), before=before)

    def test_missing_managed_column_rejected(self) -> None:
        before = {"users_total": "3", "historical_events_total": "361",
                  "event_media_total": "0", "active_admin_count": "2"}
        metadata = _metadata(before=before)
        cols = {c for c in metadata["v42_managed_columns"].split(",") if c}
        cols.remove("managed_asset_id")
        metadata["v42_managed_columns"] = ",".join(cols)
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)

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
        cols = {c for c in metadata["v42_check_constraints"].split(",") if c}
        cols.discard("chk_event_media_storage_state")
        metadata["v42_check_constraints"] = metadata["v42_tidb_check_constraints"] = ",".join(cols)
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
        metadata["v42_success_rows"] = "2"
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
        metadata["v42_history_checksum"] = ""
        with self.assertRaises(runner.ProductionRunnerError):
            runner.validate_v42_postflight_extras(metadata, before=before)


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
        runner._validate_postflight_changed_paths(
            sorted(runner.POSTFLIGHT_LINEAGE_ALLOWED_PATHS)
        )
        unsafe = (
            "backend/src/main/resources/db/migration/V42__add_managed_event_image_storage.sql",
            "scripts/deploy/tidb-production-v42.sha256",
            "backend/src/main/resources/db/migration/afterMigrate.sql",
            "scripts/deploy/tidb_production_migration.py",
            "docs/admin/unrelated.md",
        )
        for path in unsafe:
            with self.subTest(path=path):
                with self.assertRaises(runner.ProductionRunnerError):
                    runner._validate_postflight_changed_paths([path])

    def test_protected_runner_contract_detects_target_confirmation_credentials_and_migrate(self) -> None:
        source = Path(runner.__file__).read_bytes()
        baseline = runner._python_protected_contract(source)
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
        self.assertIn("``upload_expires_at``", runbook)
        self.assertIn("``storage_expires_at``", runbook)
        self.assertIn("checker-only typo", runbook)
        self.assertIn("must not be rerun", runbook)
        self.assertIn("read-only postflight", runbook)
        self.assertIn("no manual DDL", runbook)

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
                ])
        self.assertEqual(exit_code, 2)
        self.assertEqual(credential_prefixes, ["TIDB_PRODUCTION_READ"])
        postflight.assert_called_once()
        migrate.assert_not_called()

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

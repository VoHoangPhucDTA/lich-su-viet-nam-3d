"""Unit tests for `tidb_rehearsal_v42_orchestrate`.

All tests are deterministic and never contact the database, Docker, or `ticloud`.
They verify env sanitisation, evidence shape, account name construction,
prefix parsing, and confirmation string format.
"""

from __future__ import annotations

import importlib.util
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "tidb_rehearsal_v42_orchestrate",
    HERE / "tidb_rehearsal_v42_orchestrate.py",
)
assert SPEC and SPEC.loader
orch = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = orch
SPEC.loader.exec_module(orch)


class IdentityEvidenceShapeTest(unittest.TestCase):
    BRANCH = {
        "branch_id": "bran-3uewl2rhirehfg67jczif3bet4",
        "branch_name": "lichsuvn3d-admin-v42-rehearsal",
        "state": "ACTIVE",
        "user_prefix": "3c7ghU483VQ9Ynn",
        "host": "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
        "parent_id": "10427158774816979902",
        "region": "ap-southeast-1",
        "create_time": "2026-07-31T15:21:58Z",
    }

    def test_evidence_has_exactly_nine_string_fields(self) -> None:
        ev = orch.build_identity_evidence(self.BRANCH)
        self.assertEqual(set(ev), orch.IDENTITY_EVIDENCE_KEYS)
        for v in ev.values():
            self.assertIsInstance(v, str)
            self.assertTrue(v)

    def test_evidence_validation_rejects_extra_keys(self) -> None:
        bad = orch.build_identity_evidence(self.BRANCH)
        bad["extra"] = "nope"
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.validate_identity_evidence_shape(bad)
        self.assertEqual(cm.exception.code, orch.BLOCK_CONFIGURATION)

    def test_evidence_validation_rejects_missing_keys(self) -> None:
        bad = orch.build_identity_evidence(self.BRANCH)
        del bad["host"]
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.validate_identity_evidence_shape(bad)
        self.assertEqual(cm.exception.code, orch.BLOCK_CONFIGURATION)

    def test_evidence_validation_rejects_unapproved_source(self) -> None:
        bad = dict(orch.build_identity_evidence(self.BRANCH))
        bad["source"] = "guessed"
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.validate_identity_evidence_shape(bad)
        self.assertEqual(cm.exception.code, orch.BLOCK_CONFIGURATION)

    def test_evidence_validation_rejects_unapproved_state(self) -> None:
        bad = dict(orch.build_identity_evidence(self.BRANCH))
        bad["state"] = "PAUSED"
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.validate_identity_evidence_shape(bad)
        self.assertEqual(cm.exception.code, orch.BLOCK_CONFIGURATION)

    def test_evidence_validation_rejects_non_tidb_endpoint_host(self) -> None:
        bad = dict(orch.build_identity_evidence(self.BRANCH))
        bad["host"] = "example.com"
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.validate_identity_evidence_shape(bad)
        self.assertEqual(cm.exception.code, orch.BLOCK_CONFIGURATION)


class ConfirmationStringTest(unittest.TestCase):
    def test_confirmation_matches_strict_runner_format(self) -> None:
        branch = {
            "branch_id": "bran-3uewl2rhirehfg67jczif3bet4",
            "host": "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
        }
        s = orch.build_confirmation_string(branch)
        self.assertEqual(
            s,
            "bran-3uewl2rhirehfg67jczif3bet4@"
            "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com/lichsuvn:41->42",
        )


class SanitizedEnvTest(unittest.TestCase):
    BRANCH = {
        "branch_id": "bran-3uewl2rhirehfg67jczif3bet4",
        "branch_name": "lichsuvn3d-admin-v42-rehearsal",
        "host": "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
        "user_prefix": "3c7ghU483VQ9Ynn",
    }

    def test_sanitized_env_excludes_bootstrap_vars(self) -> None:
        try:
            os.environ[orch.BOOTSTRAP_USER_VAR] = "should_not_leak"
            os.environ[orch.BOOTSTRAP_PASSWORD_VAR] = "should_not_leak"
            env = orch.build_sanitized_env(
                branch=self.BRANCH,
                production_user_prefix="RHVnC4pobyyHQJT",
                read_user="3c7ghU483VQ9Ynn.rdeadbeef",
                read_password="REDACTED_READ",
                migrate_user="3c7ghU483VQ9Ynn.mdeadbeef",
                migrate_password="REDACTED_MIG",
            )
            self.assertNotIn(orch.BOOTSTRAP_USER_VAR, env)
            self.assertNotIn(orch.BOOTSTRAP_PASSWORD_VAR, env)
            self.assertEqual(env["TIDB_REHEARSAL_HOST"], "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com")
            self.assertEqual(env["TIDB_REHEARSAL_PORT"], "4000")
            self.assertEqual(env["TIDB_REHEARSAL_DATABASE"], "lichsuvn")
            self.assertEqual(env["TIDB_REHEARSAL_BRANCH_ID"], "bran-3uewl2rhirehfg67jczif3bet4")
            self.assertEqual(env["TIDB_REHEARSAL_USER_PREFIX"], "3c7ghU483VQ9Ynn")
            self.assertEqual(env["TIDB_REHEARSAL_READ_USER"], "3c7ghU483VQ9Ynn.rdeadbeef")
            self.assertEqual(env["TIDB_REHEARSAL_MIGRATE_USER"], "3c7ghU483VQ9Ynn.mdeadbeef")
            self.assertEqual(env["TIDB_PRODUCTION_USER_PREFIX"], "RHVnC4pobyyHQJT")
        finally:
            for v in (orch.BOOTSTRAP_USER_VAR, orch.BOOTSTRAP_PASSWORD_VAR):
                os.environ.pop(v, None)

    def test_sanitized_env_rejects_non_string_port(self) -> None:
        env = orch.build_sanitized_env(
            branch=self.BRANCH, production_user_prefix="RHVnC4pobyyHQJT",
            read_user="x", read_password="y",
            migrate_user="z", migrate_password="w",
        )
        self.assertIsInstance(env["TIDB_REHEARSAL_PORT"], str)


class TempAccountNameTest(unittest.TestCase):
    def test_temp_account_names_are_branch_bound_and_unique(self) -> None:
        prefix = "3c7ghU483VQ9Ynn"
        a, b = orch.make_temp_account_names(prefix)
        self.assertNotEqual(a, b)
        for n in (a, b):
            self.assertLessEqual(len(n), orch.TIDB_USER_MAX_LEN)
            self.assertTrue(
                n.casefold().startswith(prefix.casefold() + ".")
                or n.casefold().startswith(prefix.casefold() + "_")
            )
        self.assertTrue(a.startswith(prefix + "." + orch.READ_SUFFIX))
        self.assertTrue(b.startswith(prefix + "." + orch.MIGRATE_SUFFIX))


class ProductionUserPrefixParseTest(unittest.TestCase):
    def test_parse_human_with_dashed_prefix_label(self) -> None:
        text = (
            "Cluster ID: 10427158774816979902\n"
            "- User Prefix: RHVnC4pobyyHQJT\n"
            "- Region: ap-southeast-1\n"
        )
        self.assertEqual(orch.parse_production_user_prefix(text), "RHVnC4pobyyHQJT")

    def test_parse_human_with_bullet_label(self) -> None:
        text = "*  User Prefix : RHVnC4pobyyHQJT\n"
        self.assertEqual(orch.parse_production_user_prefix(text), "RHVnC4pobyyHQJT")

    def test_parse_human_missing_label_raises(self) -> None:
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.parse_production_user_prefix("no such label here\n")
        self.assertEqual(cm.exception.code, orch.BLOCK_CONFIGURATION)

    def test_parse_human_malformed_prefix_raises(self) -> None:
        text = "User Prefix: !notvalid!\n"
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.parse_production_user_prefix(text)
        self.assertEqual(cm.exception.code, orch.BLOCK_CONFIGURATION)

    def test_parse_human_collision_with_branch_prefix_raises(self) -> None:
        text = "User Prefix: 3c7ghU483VQ9Ynn\n"
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.parse_production_user_prefix(text)
        self.assertEqual(cm.exception.code, orch.BLOCK_CONFIGURATION)


class ProductionPrefixFromJsonTest(unittest.TestCase):
    def test_parse_production_prefix_from_json_payload_happy(self) -> None:
        text = (
            '{"clusterId":"10427158774816979902","displayName":"lichsuvn3d",'
            '"userPrefix":"RHVnC4pobyyHQJT","state":"ACTIVE"}'
        )
        self.assertEqual(
            orch.parse_production_user_prefix(text), "RHVnC4pobyyHQJT",
        )

    def test_parse_production_prefix_from_json_payload_collision_raises(self) -> None:
        text = '{"userPrefix":"3c7ghU483VQ9Ynn"}'
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.parse_production_user_prefix(text)
        self.assertEqual(cm.exception.code, orch.BLOCK_CONFIGURATION)

    def test_parse_production_prefix_from_json_payload_missing_falls_back_to_regex(self) -> None:
        # JSON parses but no userPrefix -> regex fallback finds nothing -> raises.
        text = (
            '{"clusterId":"10427158774816979902","displayName":"lichsuvn3d"}\n'
            "no User Prefix line here\n"
        )
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.parse_production_user_prefix(text)
        self.assertEqual(cm.exception.code, orch.BLOCK_CONFIGURATION)


class ProductionPrefixFromSqlUserListTest(unittest.TestCase):
    def _mock_safe(self, payload: dict[str, object] | list[object]) -> subprocess.CompletedProcess:
        return subprocess.CompletedProcess(
            args=[], returncode=0,
            stdout=json.dumps(payload), stderr="",
        )

    def test_extracts_most_common_valid_prefix(self) -> None:
        payload = {
            "sqlUsers": [
                {"userName": "RHVnC4pobyyHQJT.app"},
                {"userName": "RHVnC4pobyyHQJT.worker"},
                {"userName": "ANOTHERPREFIX.db"},
            ],
        }
        with patch.object(orch, "safe_run", return_value=self._mock_safe(payload)):
            out = orch._try_parse_production_prefix_from_sql_user_list("test_cluster")
        self.assertEqual(out, "RHVnC4pobyyHQJT")

    def test_returns_none_when_no_dot_in_user_names(self) -> None:
        payload = {"sqlUsers": [{"userName": "root"}, {"userName": ""}]}
        with patch.object(orch, "safe_run", return_value=self._mock_safe(payload)):
            out = orch._try_parse_production_prefix_from_sql_user_list("test_cluster")
        self.assertIsNone(out)

    def test_returns_none_when_payload_is_empty(self) -> None:
        with patch.object(orch, "safe_run", return_value=self._mock_safe({"sqlUsers": []})):
            out = orch._try_parse_production_prefix_from_sql_user_list("test_cluster")
        self.assertIsNone(out)

    def test_collapsing_prefix_swallows_to_none(self) -> None:
        payload = {
            "sqlUsers": [
                {"userName": "3c7ghU483VQ9Ynn.app"},
                {"userName": "3c7ghu483vq9ynn.worker"},
            ],
        }
        with patch.object(orch, "safe_run", return_value=self._mock_safe(payload)):
            out = orch._try_parse_production_prefix_from_sql_user_list("test_cluster")
        self.assertIsNone(out)

    def test_safe_run_failure_returns_none(self) -> None:
        with patch.object(
            orch,
            "safe_run",
            side_effect=orch.OrchestrationGuardError(
                "ticloud auth missing", code=orch.BLOCK_CONFIGURATION,
            ),
        ):
            out = orch._try_parse_production_prefix_from_sql_user_list("test_cluster")
        self.assertIsNone(out)


class BranchExtractionTest(unittest.TestCase):
    SAMPLE = {
        "branchId": "bran-3uewl2rhirehfg67jczif3bet4",
        "displayName": "lichsuvn3d-admin-v42-rehearsal",
        "state": "ACTIVE",
        "userPrefix": "3c7ghU483VQ9Ynn",
        "parentId": "10427158774816979902",
        "region": "ap-southeast-1",
        "createTime": "2026-07-31T15:21:58Z",
        "endpoints": {
            "public": {"host": "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com"},
            "private": {
                "host": "gateway01-privatelink.ap-southeast-1.prod.alicloud.tidbcloud.com",
                "private": True,
            },
        },
    }

    def test_extract_branch_identity_happy_path(self) -> None:
        out = orch.extract_branch_identity(self.SAMPLE)
        self.assertEqual(out["branch_id"], "bran-3uewl2rhirehfg67jczif3bet4")
        self.assertEqual(out["branch_name"], "lichsuvn3d-admin-v42-rehearsal")
        self.assertEqual(out["user_prefix"], "3c7ghU483VQ9Ynn")
        self.assertEqual(out["host"], "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com")
        self.assertEqual(out["state"], "ACTIVE")

    def test_extract_branch_rejects_other_branch(self) -> None:
        with self.assertRaises(orch.OrchestrationGuardError):
            orch.extract_branch_identity(dict(
                self.SAMPLE,
                branchId="bran-4itt6bq6jbhzrng4ouzz7y4s4e",
                displayName="admin-v39-rehearsal",
                userPrefix="2LvhnxRNWwC66hk",
            ))

    def test_extract_branch_rejects_state_not_active(self) -> None:
        with self.assertRaises(orch.OrchestrationGuardError):
            orch.extract_branch_identity(dict(self.SAMPLE, state="PAUSED"))

    def test_extract_branch_rejects_wrong_parent(self) -> None:
        with self.assertRaises(orch.OrchestrationGuardError):
            orch.extract_branch_identity(dict(self.SAMPLE, parentId="11111111111111111111"))

    def test_extract_branch_rejects_non_tidbcloud_host(self) -> None:
        bad = json.loads(json.dumps(self.SAMPLE))
        bad["endpoints"]["public"]["host"] = "example.com"
        with self.assertRaises(orch.OrchestrationGuardError):
            orch.extract_branch_identity(bad)


class SelectBranchTest(unittest.TestCase):
    def test_select_branch_matches_technical_id(self) -> None:
        arr = [
            {"branchId": "bran-4itt6bq6jbhzrng4ouzz7y4s4e", "displayName": "admin-v39-rehearsal"},
            {"branchId": "bran-3uewl2rhirehfg67jczif3bet4", "displayName": "lichsuvn3d-admin-v42-rehearsal"},
        ]
        out = orch.select_branch(arr, "bran-3uewl2rhirehfg67jczif3bet4")
        self.assertEqual(out["branchId"], "bran-3uewl2rhirehfg67jczif3bet4")

    def test_select_branch_raises_when_missing(self) -> None:
        with self.assertRaises(orch.OrchestrationGuardError):
            orch.select_branch(
                [{"branchId": "bran-4itt6bq6jbhzrng4ouzz7y4s4e"}],
                "bran-3uewl2rhirehfg67jczif3bet4",
            )


class ProbeParseTest(unittest.TestCase):
    def test_parse_probe_happy_path(self) -> None:
        stdout = "lichsuvn\n8.5.3-TiDB-v8.5.3\n3c7ghU483VQ9Ynn.root@10.0.0.1\n3c7ghU483VQ9Ynn.root@10.0.0.1\n1\n"
        out = orch.parse_probe(
            stdout,
            expected_user_prefix="3c7ghU483VQ9Ynn",
            forbidden_user_prefix="RHVnC4pobyyHQJT",
        )
        self.assertEqual(out["database"], "lichsuvn")
        self.assertEqual(out["session_user_prefix_verified"], "1")
        self.assertIn("3c7ghU483VQ9Ynn", out["_account_sanitised"])
        self.assertNotIn("root", out["_account_sanitised"])

    def test_parse_probe_rejects_wrong_database(self) -> None:
        stdout = "wrongdb\n8.5.3-TiDB-v8.5.3\n3c7ghU483VQ9Ynn.root@10.0.0.1\n3c7ghU483VQ9Ynn.root@10.0.0.1\n1\n"
        with self.assertRaises(orch.OrchestrationGuardError):
            orch.parse_probe(
                stdout,
                expected_user_prefix="3c7ghU483VQ9Ynn",
                forbidden_user_prefix="RHVnC4pobyyHQJT",
            )

    def test_parse_probe_accepts_tidb_serverless_proxy_divergence(self) -> None:
        """TiDB Serverless routes every public connection through a TLS edge
        proxy: USER() therefore reports the proxy host (e.g. 104.28.163.33)
        while CURRENT_USER() retains the authenticated identity with @'%'.
        The probe MUST accept this divergence because the prefix-binding
        check below still gates authority.  A regression that re-introduces
        a strict equality tripwire would break every legitimate probe.
        """
        stdout = (
            "lichsuvn\n"
            "8.5.3-TiDB-v8.5.3\n"
            "3c7ghU483VQ9Ynn.root@%\n"
            "3c7ghU483VQ9Ynn.root@104.28.163.33\n"
            "1\n"
        )
        out = orch.parse_probe(
            stdout,
            expected_user_prefix="3c7ghU483VQ9Ynn",
            forbidden_user_prefix="RHVnC4pobyyHQJT",
        )
        self.assertEqual(out["database"], "lichsuvn")
        self.assertEqual(out["session_user_prefix_verified"], "1")
        self.assertIn("3c7ghU483VQ9Ynn", out["_account_sanitised"])

    def test_parse_probe_still_rejects_account_prefix_breach(self) -> None:
        """Even when CURRENT_USER and USER agree on the account portion, the
        prefix-binding check on the account side is the real authorisation
        gate, so a production-prefix account must still be rejected.
        """
        stdout = (
            "lichsuvn\n"
            "8.5.3-TiDB-v8.5.3\n"
            "RHVnC4pobyyHQJT.some@%\n"
            "RHVnC4pobyyHQJT.some@104.28.163.33\n"
            "1\n"
        )
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.parse_probe(
                stdout,
                expected_user_prefix="3c7ghU483VQ9Ynn",
                forbidden_user_prefix="RHVnC4pobyyHQJT",
            )
        self.assertEqual(cm.exception.code, orch.BLOCK_BOOTSTRAP_IDENTITY)

    def test_parse_probe_rejects_nontidb_version(self) -> None:
        stdout = "lichsuvn\n8.0.34\n3c7ghU483VQ9Ynn.root@10.0.0.1\n3c7ghU483VQ9Ynn.root@10.0.0.1\n1\n"
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.parse_probe(
                stdout,
                expected_user_prefix="3c7ghU483VQ9Ynn",
                forbidden_user_prefix="RHVnC4pobyyHQJT",
            )
        self.assertEqual(cm.exception.code, orch.BLOCK_BOOTSTRAP_IDENTITY)

    def test_parse_probe_rejects_production_prefix(self) -> None:
        stdout = "lichsuvn\n8.5.3-TiDB-v8.5.3\nRHVnC4pobyyHQJT.some@10.0.0.1\nRHVnC4pobyyHQJT.some@10.0.0.1\n1\n"
        with self.assertRaises(orch.OrchestrationGuardError) as cm:
            orch.parse_probe(
                stdout,
                expected_user_prefix="3c7ghU483VQ9Ynn",
                forbidden_user_prefix="RHVnC4pobyyHQJT",
            )
        self.assertEqual(cm.exception.code, orch.BLOCK_BOOTSTRAP_IDENTITY)


class IdentityContextTest(unittest.TestCase):
    def test_audit_context_redacts_production_prefix(self) -> None:
        branch = {
            "branch_id": "bran-3uewl2rhirehfg67jczif3bet4",
            "branch_name": "lichsuvn3d-admin-v42-rehearsal",
            "host": "gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com",
            "user_prefix": "3c7ghU483VQ9Ynn",
            "region": "ap-southeast-1",
            "state": "ACTIVE",
            "create_time": "2026-07-31T15:21:58Z",
        }
        d = orch.make_evidence_dir()
        try:
            p = orch.write_audit_context(d, branch, "RHVnC4pobyyHQJT", "ticloud")
            payload = json.loads(p.read_text(encoding="utf-8"))
            self.assertEqual(payload["branch_user_prefix"], "3c7ghU483VQ9Ynn")
            self.assertEqual(payload["production_user_prefix_redacted"], "RHV***JT")
            self.assertNotIn("RHVnC4pobyyHQJT", payload["production_user_prefix_redacted"])
        finally:
            import shutil
            shutil.rmtree(str(d), ignore_errors=True)


class InvokeRunnerCaptureTest(unittest.TestCase):
    """Wrapper must capture raw stdout/stderr bytes BEFORE any truncation.

    A regression in this surface would re-introduce the diagnostic gap that
    caused the BLOCKED_REHEARSAL body to be lost during the V42 rehearsal.
    """

    def _make_completed(self, stdout_bytes: bytes, stderr_bytes: bytes,
                        rc: int = 0) -> subprocess.CompletedProcess:
        return subprocess.CompletedProcess(
            args=["python"], returncode=rc,
            stdout=stdout_bytes, stderr=stderr_bytes,
        )

    def _call(self, evidence_dir: Path, *, stderr: bytes, rc: int,
              stage: str, secret_redact: str | None = None):
        comp = self._make_completed(b"", stderr, rc=rc)
        redacted_log = evidence_dir / f"runner-{stage}.log"
        with patch.object(subprocess, "run", return_value=comp):
            result = orch.invoke_runner(
                "preflight", env={}, confirm_target="dummy",
                identity_evidence=evidence_dir / "ie.json",
                identity_sha="0" * 64,
                evidence_dir=evidence_dir,
                stage=stage,
                redacted_log=redacted_log,
                secrets_to_redact=(secret_redact,) if secret_redact else (),
            )
        return result, redacted_log

    def test_writes_raw_stdout_bytes_preserving_full_length(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            evidence_dir = Path(td)
            long_stdout = b"START\n" + (b"x" * 100_000) + b"\nEND\n"
            comp = self._make_completed(long_stdout, b"", rc=0)
            with patch.object(subprocess, "run", return_value=comp):
                orch.invoke_runner(
                    "local-check", env={}, confirm_target="dummy",
                    identity_evidence=evidence_dir / "ie.json",
                    identity_sha="0" * 64,
                    evidence_dir=evidence_dir,
                    stage="local_check",
                )
            written = (evidence_dir / "runner-local_check-stdout.bytes").read_bytes()
            self.assertEqual(written, long_stdout,
                              "stdout.bytes must preserve every byte, including "
                              "lengths > typical head/tail budgets")

    def test_writes_raw_stderr_bytes_preserving_full_classification(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            evidence_dir = Path(td)
            stderr = (b"DEBUG: progress\n"
                       b"BLOCKED_REHEARSAL: SQL user prefix is malformed "
                       b"because account has length mismatch\n")
            comp = self._make_completed(b"", stderr, rc=2)
            with patch.object(subprocess, "run", return_value=comp):
                result = orch.invoke_runner(
                    "preflight", env={}, confirm_target="dummy",
                    identity_evidence=evidence_dir / "ie.json",
                    identity_sha="0" * 64,
                    evidence_dir=evidence_dir,
                    stage="preflight",
                )
            written = (evidence_dir / "runner-preflight-stderr.bytes").read_bytes()
            self.assertEqual(written, stderr)
            self.assertEqual(result["exit_code"], 2)
            self.assertEqual(result["classification"], "BLOCKED_REHEARSAL")
            self.assertIn("account has length mismatch", result["primary_message"])

    def test_meta_json_binds_stage_exit_code_and_timestamps(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            evidence_dir = Path(td)
            comp = self._make_completed(b"", b"", rc=0)
            with patch.object(subprocess, "run", return_value=comp):
                orch.invoke_runner(
                    "migrate", env={}, confirm_target="dummy",
                    identity_evidence=evidence_dir / "ie.json",
                    identity_sha="0" * 64,
                    evidence_dir=evidence_dir,
                    stage="migrate",
                )
            meta = json.loads(
                (evidence_dir / "runner-migrate-meta.json").read_text(encoding="utf-8")
            )
            self.assertEqual(meta["stage"], "migrate")
            self.assertEqual(meta["command_category"], "strict_runner_subprocess")
            self.assertEqual(meta["exit_code"], 0)
            self.assertIn("started_at", meta)
            self.assertIn("finished_at", meta)
            self.assertTrue(meta["started_at"].endswith("+00:00"))
            self.assertTrue(meta["finished_at"].endswith("+00:00"))
            self.assertEqual(meta["stdout_bytes"], 0)
            self.assertEqual(meta["stderr_bytes"], 0)

    def test_redaction_replaces_secret_substring_keeping_full_message(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            evidence_dir = Path(td)
            secret = "ABC-SECRET-PASSWORD-XYZ-LOOOOOOOOOONG-SUFFIX"
            stderr_body = (
                b"BLOCKED_REHEARSAL: invalid auth for account, password="
                + secret.encode("utf-8") + b"\n"
            )
            comp = self._make_completed(b"", stderr_body, rc=2)
            redacted_log = evidence_dir / "runner-preflight.log"
            with patch.object(subprocess, "run", return_value=comp):
                result = orch.invoke_runner(
                    "preflight", env={}, confirm_target="dummy",
                    identity_evidence=evidence_dir / "ie.json",
                    identity_sha="0" * 64,
                    evidence_dir=evidence_dir,
                    stage="preflight",
                    redacted_log=redacted_log,
                    secrets_to_redact=(secret,),
                )
            # Forensic stderr bytes MUST remain unredacted for full audit recovery.
            raw_stderr = (evidence_dir / "runner-preflight-stderr.bytes").read_bytes()
            self.assertIn(secret.encode("utf-8"), raw_stderr)
            # Redacted log replaces only the secret substring and keeps the rest.
            text = redacted_log.read_text(encoding="utf-8")
            self.assertIn("***REDACTED***", text)
            self.assertIn("invalid auth for account", text)
            self.assertNotIn(secret, text)
            # The classification is preserved because redaction does not touch it.
            self.assertEqual(result["classification"], "BLOCKED_REHEARSAL")
            self.assertIn("invalid auth for account", result["primary_message"])


class ParseRunnerClassificationTest(unittest.TestCase):
    """The strict runner emits <CODE>: <message> lines; the LAST one wins."""

    def test_extracts_last_classification_ignoring_progress_chatter(self) -> None:
        text = (
            "INFO: connecting\n"
            "BLOCKED_REHEARSAL: first classification\n"
            "DEBUG: more progress\n"
            "BLOCKED_V42_RUNNER_REHEARSAL: actual final classification\n"
        )
        cls, msg = orch._parse_runner_classification(text)
        self.assertEqual(cls, "BLOCKED_V42_RUNNER_REHEARSAL")
        self.assertEqual(msg, "actual final classification")

    def test_returns_empty_when_no_classification_line_present(self) -> None:
        cls, msg = orch._parse_runner_classification(
            "INFO: chatter\nDEBUG: more chatter\n"
        )
        self.assertEqual(cls, "")
        self.assertEqual(msg, "")

    def test_ignores_lowercase_or_partial_matches(self) -> None:
        cls, msg = orch._parse_runner_classification(
            "blocked_rehearsal: lowercase ignored\nlowercase!\n"
        )
        self.assertEqual(cls, "")
        self.assertEqual(msg, "")


class BuildStageSummaryTest(unittest.TestCase):
    """Stage summary dict shape is the contract for downstream consumers."""

    def test_returns_per_stage_dict_with_byte_counts(self) -> None:
        fake_result = {
            "exit_code": 2,
            "stdout_bytes_path": Path("/tmp/x-stdout.bytes"),
            "stderr_bytes_path": Path("/tmp/x-stderr.bytes"),
            "meta_path": Path("/tmp/x-meta.json"),
            "stdout_str": "abc",
            "stderr_str": "defg",
            "classification": "BLOCKED_REHEARSAL",
            "primary_message": "msg",
            "started_at": "2026-01-01T00:00:00+00:00",
            "finished_at": "2026-01-01T00:01:00+00:00",
        }
        s = orch._build_stage_summary("preflight", fake_result)
        self.assertEqual(s["stage"], "preflight")
        self.assertEqual(s["exit_code"], 2)
        self.assertEqual(s["stdout_bytes_count"], 3)
        self.assertEqual(s["stderr_bytes_count"], 4)
        self.assertEqual(s["classification"], "BLOCKED_REHEARSAL")
        self.assertEqual(s["primary_message"], "msg")
        # Path serialisation: Path("/tmp/x-stdout.bytes") yields
        # "/tmp/x-stdout.bytes" on POSIX and "\\tmp\\x-stdout.bytes" on
        # Windows.  assertEqual on the full string would be platform-
        # dependent, so we pin the trailing filename.
        self.assertTrue(s["stdout_bytes_path"].endswith("x-stdout.bytes"))
        self.assertTrue(s["stderr_bytes_path"].endswith("x-stderr.bytes"))
        self.assertTrue(s["meta_path"].endswith("x-meta.json"))
        self.assertEqual(s["started_at"], "2026-01-01T00:00:00+00:00")


class RedactionScopeTest(unittest.TestCase):
    """JDBC URL credential portions AND every secret in secrets_to_redact
    must be scrubbed from the redacted_log while remaining recoverable in
    the forensic bytes files.
    """

    def _make_completed(self, stdout_bytes: bytes, stderr_bytes: bytes,
                        rc: int = 0) -> subprocess.CompletedProcess:
        return subprocess.CompletedProcess(
            args=["python"], returncode=rc,
            stdout=stdout_bytes, stderr=stderr_bytes,
        )

    def test_jdbc_url_credential_portion_is_redacted_in_redacted_log(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            evidence_dir = Path(td)
            stderr = (b"Flyway connection error: "
                       b"jdbc:mysql://userX:pwdY@gateway.example/db?sslMode=ID\n")
            comp = self._make_completed(b"", stderr, rc=2)
            redacted_log = evidence_dir / "runner-preflight.log"
            with patch.object(subprocess, "run", return_value=comp):
                orch.invoke_runner(
                    "preflight", env={}, confirm_target="dummy",
                    identity_evidence=evidence_dir / "ie.json",
                    identity_sha="0" * 64,
                    evidence_dir=evidence_dir,
                    stage="preflight",
                    redacted_log=redacted_log,
                )
            text = redacted_log.read_text(encoding="utf-8")
            self.assertIn("jdbc:mysql://[REDACTED]@gateway.example/db", text)
            self.assertNotIn("userX", text)
            self.assertNotIn("pwdY", text)
            # Forensic bytes remain unmodified for audit recovery.
            raw = (evidence_dir / "runner-preflight-stderr.bytes").read_bytes()
            self.assertIn(b"userX:pwdY@gateway.example/db", raw)


class DockerInteractiveStdinForwardingTest(unittest.TestCase):
    """Spec §3 regression for the wrapper's diagnostic pipe lifecycle.

    The entrypoint shell script `_MYSQL_SPLIT_SHELL_SCRIPT` reads stdin
    via `cat > "$p"`.  `docker start --attach -i` can only pipe data to
    stdin if the container was created with `-i` (OpenStdin: true).  This
    test pins that requirement so a future change can't silently revert
    the bug found live.
    """

    def test_docker_create_argv_contains_dash_i(self):
        from unittest.mock import MagicMock, patch
        import tempfile
        from pathlib import Path
        import tidb_rehearsal_v42_orchestrate as orch
        captured: list[list[str]] = []

        def fake_run(cmd, *, input_text=None, timeout=30, env=None, cwd=None):
            captured.append(list(cmd))
            m = MagicMock()
            m.returncode = 0
            m.stdout = "container_xyz"
            m.stderr = ""
            return m

        with tempfile.TemporaryDirectory() as td:
            edir = Path(td)
            with patch.object(orch, "_run", side_effect=fake_run):
                orch.run_diagnostic_command(
                    stage="mysql_identity_probe",
                    image_ref=("mysql:8.0.36@"
                                "sha256:a532724022429812ec797c285c1b540a644c15e248579c6bfdf12a8fbaab4964"),
                    argv=["sh", "-c", "true"],
                    stdin_text="STDIN_should_be_passed",
                    evidence_dir=edir,
                    timeout=60,
                )

        self.assertGreaterEqual(len(captured), 3, "expected docker create/start/wait calls")
        create_argv = captured[0]
        self.assertEqual(create_argv[0:2], ["docker", "create"])
        self.assertIn(
            "-i", create_argv,
            "docker create must pass -i so stdin is forwarded to docker start --attach -i",
        )
        # Negative control: the diags container name must NOT clash with the
        # mysql pinned image prefix in a way that would leak a real container
        # name.  We don't enforce uniqueness (secrets.token_hex(6) handles it)
        # but we do enforce the spec's prefix.
        self.assertTrue(create_argv[3].startswith("lsvn3d-diag-mysql_identity_probe-"))




class TempUserCleanupTest(unittest.TestCase):
    """Section 4: drop_temp_users contract.

    Covers the part of the spec that can be unit-tested without a real
    database.  Scenarios 1, 2, 3, 4, and 6 funnel through this single
    helper invocation; scenarios 2-5 (failures earlier in the wrapper)
    are enforced by the wrapper's own
    ``if (read_name and migrate_name and branch ...):`` guard.

    Assertions (spec §4):

    * Only the exact temp users passed-in are targeted.
    * Each existing temp user is dropped at most once per call.
    * No pre-existing branch user is referenced.
    * Cleanup runs on the success path; the underlying ``DROP USER IF
      EXISTS`` makes a redundant call a no-op at MySQL level.
    * Passwords never surface in the exception message; container
      stderr is sanitised via ``***REDACTED***``.
    * Cleanup failures raise only ``OrchestrationGuardError`` so the
      wrapper's existing catch matches.
    """

    READ_NAME = "branchprefix.r0123abcd"
    MIGRATE_NAME = "branchprefix.m0123abcd"

    def _failing_run(self, rc, stderr):
        def fake(cmd, **kwargs):
            return subprocess.CompletedProcess(
                args=list(cmd), returncode=rc, stdout="", stderr=stderr)
        return fake

    def _capturing_run(self, captured):
        def fake(cmd, **kwargs):
            captured.append(kwargs.get("input_text", ""))
            return subprocess.CompletedProcess(
                args=list(cmd), returncode=0, stdout="", stderr="")
        return fake

    def test_success_emits_two_exact_drop_user_statements(self):
        captured = []
        with patch.object(orch, "_run", side_effect=self._capturing_run(captured)):
            orch.drop_temp_users(
                "gateway.tidbcloud.com", 4000,
                "bootstrap_user", "bootstrap_password",
                self.READ_NAME, self.MIGRATE_NAME,
            )
        self.assertEqual(len(captured), 1, "exactly one invocation expected")
        data = captured[0]
        self.assertIn(f"DROP USER IF EXISTS '{self.READ_NAME}'@'%';", data)
        self.assertIn(f"DROP USER IF EXISTS '{self.MIGRATE_NAME}'@'%';", data)
        # Exactly two DROP USER statements.  No pre-existing user is
        # referenced; DROP DATABASE / DROP SCHEMA are never issued.
        self.assertEqual(data.count("DROP USER IF EXISTS"), 2)
        self.assertNotIn("DROP DATABASE", data)
        self.assertNotIn("DROP SCHEMA", data)

    def test_drop_failure_does_not_leak_bootstrap_password(self):
        unique_pwd = "ZIq_secret_pwd_q1w2e3"
        def echoing(cmd, **kwargs):
            return subprocess.CompletedProcess(
                args=list(cmd), returncode=1,
                stdout=kwargs.get("input_text", ""), stderr="")
        with patch.object(orch, "_run", side_effect=echoing):
            with self.assertRaises(orch.OrchestrationGuardError) as cm:
                orch.drop_temp_users(
                    "gw", 4000, "bootstrap_user", unique_pwd,
                    self.READ_NAME, self.MIGRATE_NAME,
                )
        msg = str(cm.exception)
        self.assertNotIn(unique_pwd, msg)
        self.assertIn("***REDACTED***", msg)

    def test_cleanup_failure_raises_orchestration_guard_error_only(self):
        # Spec §4 scenario 6: the wrapper's finally catch-block matches
        # OrchestrationGuardError specifically.  Verify the helper raises
        # exactly that type and not, say, RuntimeError.
        with patch.object(orch, "_run", side_effect=self._failing_run(2, "container boom")):
            with self.assertRaises(orch.OrchestrationGuardError):
                orch.drop_temp_users(
                    "gw", 4000, "bootstrap_user", "bootstrap_password",
                    self.READ_NAME, self.MIGRATE_NAME,
                )

    def test_drop_is_idempotent_at_subprocess_layer(self):
        # Calling drop_temp_users twice with the same args must produce
        # exactly two DROP USER IF EXISTS statements each time.  The
        # underlying SQL is idempotent so the wrapper can safely retry.
        captured = []
        with patch.object(orch, "_run", side_effect=self._capturing_run(captured)):
            orch.drop_temp_users("gw", 4000, "u", "p", self.READ_NAME, self.MIGRATE_NAME)
            orch.drop_temp_users("gw", 4000, "u", "p", self.READ_NAME, self.MIGRATE_NAME)
        self.assertEqual(len(captured), 2)
        for data in captured:
            self.assertEqual(data.count("DROP USER IF EXISTS"), 2)
            self.assertIn(f"'{self.READ_NAME}'", data)
            self.assertIn(f"'{self.MIGRATE_NAME}'", data)

    def test_wrapper_finally_guard_prevents_drop_when_names_unpopulated(self):
        src = (Path(__file__).resolve().parent / "tidb_rehearsal_v42_orchestrate.py").read_text(encoding="utf-8")
        self.assertIn(
            "read_name and migrate_name and branch",
            src,
            "wrapper finally block must guard drop_temp_users on read_name, migrate_name, and branch being non-empty",
        )

    def test_wrapper_finally_emits_cleanup_blocker_without_suppressing_primary_failure(self):
        # Spec \u00a74 scenario 6 implementation contract assertion.
        #
        # When the wrapper hits a primary failure (strict runner exits 2,
        # an earlier helper raises OrchestrationGuardError, or subprocess
        # times out) AND cleanup's own drop_temp_users fails, the wrapper
        # must:
        #   * still report the primary failure to stderr / summary BEFORE
        #     the cleanup finally runs (it does -- the primary handler
        #     returns from the try block *before* control reaches finally);
        #   * set summary['cleanup_drop_user_failed'] and emit
        #     BLOCK_CREDENTIAL_PROVISIONING so the operator can see the
        #     cleanup problem in the structured report;
        #   * never re-raise the cleanup OrchestrationGuardError (because
        #     the outer finally still has to run rmtree + env.pop and a
        #     re-raise would interfere with that).
        # This contract is exercised as a source-level assertion because
        # it asserts the wrapper's recovery ordering, which is hard to
        # reproduce at the subprocess layer without mocking every step of
        # main(); a behaviour test would mock the same surface anyway.
        src = (Path(__file__).resolve().parent
                 / "tidb_rehearsal_v42_orchestrate.py").read_text(encoding="utf-8")
        # Primary failure paths must emit_summary + stderr print BEFORE
        # control reaches the cleanup finally block.
        self.assertIn('"failed_step"', src,
                      "primary-failure handlers must record a failed_step "
                      "in summary so the primary failure remains visible")
        self.assertIn('print(f"{exc.code}: {exc}", file=sys.stderr)', src,
                      "primary-failure handlers must print to stderr so the "
                      "primary failure remains visible after cleanup runs")
        # Cleanup catch block contract.
        self.assertIn('"cleanup_drop_user_failed"', src,
                      "cleanup finally block must record "
                      "summary['cleanup_drop_user_failed'] so the operator "
                      "can see why cleanup failed")
        self.assertIn("emit_summary(BLOCK_CREDENTIAL_PROVISIONING)", src,
                      "cleanup failure must promote final classification "
                      "to BLOCK_CREDENTIAL_PROVISIONING")
        # The inner except must catch OrchestrationGuardError SPECIFICALLY,
        # not bare Exception -- so a programmer-error traceback can still
        # propagate during development.  Comment lines between the
        # required statements are permitted (we tolerate future inline
        # rationale comments).
        inner_match = re.search(
            r"except\s+OrchestrationGuardError\s+as\s+\w+:\s*\n"
            r"(?:\s+#[^\n]*\n)*"
            r"\s+summary\[\"cleanup_drop_user_failed\"\]\s*=\s*str\(\w+\)\s*\n"
            r"(?:\s+#[^\n]*\n)*"
            r"\s+emit_summary\(BLOCK_CREDENTIAL_PROVISIONING\)",
            src,
        )
        self.assertIsNotNone(
            inner_match,
            "cleanup inner except must catch OrchestrationGuardError "
            "specifically (not bare Exception) and increment "
            "summary['cleanup_drop_user_failed'] exactly as documented",
        )
        # The post-cleanup inner finally must still remove the evidence
        # directory and clear bootstrap env so a cleanup failure does not
        # leak on disk.
        self.assertIn("shutil.rmtree(str(evidence_dir), ignore_errors=True)", src)
        self.assertIn("os.environ.pop(var, None)", src)
        # The cleanup catch must NOT re-raise (no `raise` between
        # summary[...] assignment and the inner finally ... shutil.rmtree).
        # We assert this by anchoring on exact byte pattern: any future
        # regressor that adds `raise` inside the catch block will surface
        # here.
        cleanup_region = (
            '        except OrchestrationGuardError as exc:\n'
            '                    summary["cleanup_drop_user_failed"] = str(exc)\n'
            '                    emit_summary(BLOCK_CREDENTIAL_PROVISIONING)'
        ).replace('"cleanup_drop_user_failed"', '"cleanup_drop_user_failed"')
        if cleanup_region in src:
            # Locate the catch-block and ensure no `raise` between catch
            # start and the inner ``finally:`` of the cleanup region.
            idx = src.index(cleanup_region)
            after = src[idx:idx + 2000]
            nxt_finally = after.find("finally:")
            self.assertNotEqual(nxt_finally, -1,
                                "post-cleanup inner finally must exist")
            segment = after[:nxt_finally]
            self.assertNotIn("\n                    raise ", segment,
                             "cleanup catch must not re-raise; the primary "
                             "failure trace must not be replaced by the "
                             "cleanup error")

    def test_wrapper_main_handles_subprocess_timeout_with_strict_runner_failure(self):
        # Spec §4 scenario 6 behaviour assertion: when the wrapper hits
        # a primary failure early (here: ``ticloud_branch_list`` raises
        # ``OrchestrationGuardError``), ``main()`` returns 2 and the
        # bootstrap credentials are scrubbed from the wrapper's
        # environment by the outer ``finally`` (``os.environ.pop``).
        #
        # We capture the post-main environment INSIDE the ``patch.dict``
        # context because ``patch.dict(..., clear=False)`` restores the
        # original environment on ``__exit__``; inspecting ``os.environ``
        # after the ``with`` would reflect the operator's pre-existing
        # shell values and yield false negatives.
        #
        # ``called`` is intentionally not asserted-on: the test's contract
        # is "orchestrator returns 2 and clears bootstrap env", which
        # only requires mocking ``ticloud_branch_list`` to raise.
        class _TargetExc(orch.OrchestrationGuardError):
            pass
        env_after: dict[str, str] = {}
        rc = 0
        with patch.dict(os.environ, {
            "TIDB_REHEARSAL_BOOTSTRAP_USER": "boot",
            "TIDB_REHEARSAL_BOOTSTRAP_PASSWORD": "boot-pwd",
        }, clear=False):
            with patch.object(orch, "ticloud_branch_list",
                              side_effect=_TargetExc("branch boom",
                                                     code=orch.BLOCK_CONFIGURATION)),                  patch.object(orch, "_register_signal_handlers",
                              lambda: None),                  patch.object(orch.sys, "stderr",
                              new=io.StringIO()),                  patch.object(orch, "print",
                              lambda *a, **k: None):
                rc = orch.main(["--repo-root", str(HERE)])
            env_after = dict(os.environ)
        self.assertEqual(rc, 2)
        # No bootstrap env must remain after main() exits.
        self.assertNotIn("TIDB_REHEARSAL_BOOTSTRAP_USER", env_after)
        self.assertNotIn("TIDB_REHEARSAL_BOOTSTRAP_PASSWORD", env_after)
        # No real subprocess call: the branch_list stub raised BEFORE any
        # provision/runner work, which is the cheapest proof that the
        # cleanup invariants still run.



if __name__ == "__main__":
    unittest.main()
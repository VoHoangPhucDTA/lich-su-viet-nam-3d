"""Local-only tests for the Release E backup/restore evidence contract."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import tidb_release_e_v42_evidence as evidence


NOW = datetime(2026, 8, 1, 6, 0, 0, tzinfo=timezone.utc)
IDENTITY_SHA = "a" * 64
RESTORE_IDENTITY_SHA = "c" * 64


class EvidenceFixture(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.backup_capture = self.root / "backup-source.png"
        self.restore_capture = self.root / "restore-active.png"
        self.restore_identity = self.root / "restore-identity.json"
        self.backup_capture.write_bytes(b"real backup capture bytes")
        self.restore_capture.write_bytes(b"real restore capture bytes")
        self.restore_identity.write_bytes(b'{"authenticated":true}\n')

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _write(self, name: str, value, *, canonical: bool = True):
        path = self.root / f"{name}.json"
        detached = self.root / f"{name}.sha256"
        if canonical:
            raw = evidence.canonical_json_bytes(value, trailing_newline=True)
        else:
            raw = value if isinstance(value, bytes) else str(value).encode("utf-8")
        path.write_bytes(raw)
        detached.write_bytes(
            f"{hashlib.sha256(raw).hexdigest()}  {path.name}\n".encode("ascii")
        )
        return path, detached

    def _backup(self):
        return evidence.build_backup_evidence(
            generated_at_utc="2026-08-01T05:00:00Z",
            source_cluster_id=evidence.EXPECTED_CLUSTER_ID,
            source_display_name=evidence.EXPECTED_DISPLAY_NAME,
            target_identity=evidence.EXPECTED_TARGET_IDENTITY,
            database=evidence.EXPECTED_DATABASE,
            backup_type=evidence.EXPECTED_BACKUP_TYPE,
            backup_time_utc="2026-07-31T18:00:15Z",
            backup_state=evidence.EXPECTED_BACKUP_STATE,
            expires_at_utc="2026-08-01T18:00:15Z",
            capture_path=self.backup_capture,
            production_identity_evidence_sha256=IDENTITY_SHA,
        )

    def _validate_backup(self, value):
        path, detached = self._write("backup", value)
        return evidence.validate_backup_evidence(
            path, detached, capture_path=self.backup_capture,
            production_identity_evidence_sha256=IDENTITY_SHA, now_utc=NOW,
        )

    def _restore(self):
        return {
            "schema": evidence.RESTORE_SCHEMA,
            "generated_at_utc": "2026-08-01T05:30:00Z",
            "source_backup_evidence_sha256": "b" * 64,
            "source_cluster_id": evidence.EXPECTED_CLUSTER_ID,
            "source_database": evidence.EXPECTED_DATABASE,
            "restore_cluster_id": "10427158774816970001",
            "restore_display_name": "release-e-restore-isolated",
            "restore_project_id": "project-restore-001",
            "restore_state": evidence.EXPECTED_RESTORE_STATE,
            "restore_region": evidence.EXPECTED_RESTORE_REGION,
            "restore_engine_version": "v8.5.3",
            "restore_database": evidence.EXPECTED_DATABASE,
            "restore_created_at_utc": "2026-08-01T02:00:00Z",
            "restore_capture_path_basename": self.restore_capture.name,
            "restore_capture_sha256": evidence.sha256_file(
                self.restore_capture, error_factory=lambda reason: AssertionError(reason)
            ),
            "restore_identity_evidence_sha256": RESTORE_IDENTITY_SHA,
            "restore_prefix_match": True,
            "production_prefix_rejected": True,
            "rehearsal_prefix_rejected": True,
            "flyway_current_version": "41",
            "flyway_validate_passed": True,
            "failed_migration_count": 0,
            "v42_history_row_count": 0,
            "check_support_enabled": True,
            "users_total": 3,
            "historical_events_total": 361,
            "event_media_total": 0,
            "active_admin_count": 2,
            "production_not_overwritten": True,
            "validated_at_utc": "2026-08-01T05:15:00Z",
        }

    def _validate_restore(self, value):
        path, detached = self._write("restore", value)
        return evidence.validate_restore_evidence(
            path, detached, capture_path=self.restore_capture,
            source_backup_evidence_sha256="b" * 64,
            restore_identity_evidence_sha256=RESTORE_IDENTITY_SHA,
            now_utc=NOW,
        )


class BackupEvidenceTest(EvidenceFixture):
    def test_valid_automatic_backup_and_deterministic_fallback_accepted(self):
        value = self._backup()
        result = self._validate_backup(value)
        self.assertEqual(result["evidence"]["backup_id_source"], "deterministic_capture_binding")
        self.assertNotIn("technical_backup_id", result["evidence"])

    def test_source_type_and_state_fail_closed(self):
        cases = (
            ("source_cluster_id", "wrong", "wrong source cluster"),
            ("database", "other", "wrong database"),
            ("backup_type", "manual", "unsupported backup type"),
            ("backup_state", "RUNNING", "not SUCCEEDED"),
        )
        for field, replacement, reason in cases:
            with self.subTest(field=field):
                value = self._backup()
                value[field] = replacement
                if field in evidence.BACKUP_IDENTITY_KEYS:
                    value["backup_identity"] = evidence.deterministic_backup_identity(value)
                with self.assertRaisesRegex(evidence.EvidenceContractError, reason):
                    self._validate_backup(value)

    def test_timestamp_and_expiration_rules(self):
        cases = (
            ("backup_time_utc", "2026-08-02T00:00:00Z", "future"),
            ("expires_at_utc", "2026-07-31T17:00:00Z", "not later"),
            ("expires_at_utc", "2026-08-01T05:59:59Z", "expired"),
        )
        for field, replacement, reason in cases:
            with self.subTest(reason=reason):
                value = self._backup()
                value[field] = replacement
                value["backup_identity"] = evidence.deterministic_backup_identity(value)
                with self.assertRaisesRegex(evidence.EvidenceContractError, reason):
                    self._validate_backup(value)

    def test_capture_and_identity_bindings(self):
        value = self._backup()
        value["capture_sha256"] = "d" * 64
        with self.assertRaisesRegex(evidence.EvidenceContractError, "capture SHA mismatch"):
            self._validate_backup(value)
        value = self._backup()
        value["production_identity_evidence_sha256"] = "e" * 64
        with self.assertRaisesRegex(evidence.EvidenceContractError, "production identity SHA mismatch"):
            self._validate_backup(value)
        value = self._backup()
        value["backup_identity"] = "f" * 64
        with self.assertRaisesRegex(evidence.EvidenceContractError, "capture binding mismatch"):
            self._validate_backup(value)

    def test_detached_mismatch_and_arbitrary_acknowledgement_rejected(self):
        path, detached = self._write("backup", self._backup())
        detached.write_bytes(f"{'0' * 64}  {path.name}\n".encode("ascii"))
        with self.assertRaisesRegex(evidence.EvidenceContractError, "detached SHA mismatch"):
            evidence.validate_backup_evidence(
                path, detached, capture_path=self.backup_capture,
                production_identity_evidence_sha256=IDENTITY_SHA, now_utc=NOW,
            )
        path, detached = self._write("ack", b"backup complete", canonical=False)
        with self.assertRaisesRegex(evidence.EvidenceContractError, "schema JSON is invalid"):
            evidence.validate_backup_evidence(
                path, detached, capture_path=self.backup_capture,
                production_identity_evidence_sha256=IDENTITY_SHA, now_utc=NOW,
            )


class RestoreEvidenceTest(EvidenceFixture):
    def test_fully_validated_restore_accepted(self):
        self.assertEqual(
            self._validate_restore(self._restore())["evidence"]["flyway_current_version"],
            "41",
        )

    def test_restore_identity_sha_and_raw_cli_engine_are_preserved(self):
        identity = {"engine_version": "v8.5.3", "source": "ticloud"}
        identity_path, identity_detached = self._write("restore-identity", identity)
        identity_sha = evidence.verify_restore_identity_evidence(
            identity_path, identity_detached
        )
        value = self._restore()
        value["restore_identity_evidence_sha256"] = identity_sha
        path, detached = self._write("restore", value)
        result = evidence.validate_restore_evidence(
            path, detached, capture_path=self.restore_capture,
            source_backup_evidence_sha256="b" * 64,
            restore_identity_evidence_sha256=identity_sha, now_utc=NOW,
        )
        self.assertEqual(result["evidence"]["restore_engine_version"], "v8.5.3")
        self.assertIn(b'"restore_engine_version":"v8.5.3"', path.read_bytes())
        self.assertNotIn(b"TiDB Serverless v8.5.3", path.read_bytes())

    def test_restore_identity_and_target_fail_closed(self):
        cases = (
            ("restore_cluster_id", evidence.EXPECTED_CLUSTER_ID, "equals production"),
            ("restore_cluster_id", "bran-123456", "rehearsal branch"),
            ("restore_state", "CREATING", "not ACTIVE"),
            ("restore_engine_version", "TiDB v8.4.0", "wrong restore engine"),
            ("restore_database", "other", "wrong restore database"),
        )
        for field, replacement, reason in cases:
            with self.subTest(field=field):
                value = self._restore()
                value[field] = replacement
                with self.assertRaisesRegex(evidence.EvidenceContractError, reason):
                    self._validate_restore(value)

    def test_boolean_validation_gates_fail_closed(self):
        for field in (
            "restore_prefix_match", "production_prefix_rejected",
            "rehearsal_prefix_rejected", "flyway_validate_passed",
            "production_not_overwritten",
        ):
            with self.subTest(field=field):
                value = self._restore()
                value[field] = False
                with self.assertRaisesRegex(evidence.EvidenceContractError, f"{field} must be true"):
                    self._validate_restore(value)

    def test_flyway_history_and_counts_fail_closed(self):
        cases = (
            ("flyway_current_version", "40", "not V41"),
            ("flyway_current_version", "42", "not V41"),
            ("failed_migration_count", 1, "nonzero"),
            ("v42_history_row_count", 1, "V42 history row"),
            ("users_total", -1, "non-negative integer"),
        )
        for field, replacement, reason in cases:
            with self.subTest(field=field, replacement=replacement):
                value = self._restore()
                value[field] = replacement
                with self.assertRaisesRegex(evidence.EvidenceContractError, reason):
                    self._validate_restore(value)

    def test_source_capture_and_detached_bindings_fail_closed(self):
        value = self._restore()
        value["source_backup_evidence_sha256"] = ""
        with self.assertRaisesRegex(evidence.EvidenceContractError, "lowercase SHA-256"):
            self._validate_restore(value)
        value = self._restore()
        value["restore_capture_sha256"] = "d" * 64
        with self.assertRaisesRegex(evidence.EvidenceContractError, "restore capture SHA mismatch"):
            self._validate_restore(value)
        path, detached = self._write("restore", self._restore())
        detached.write_bytes(f"{'0' * 64}\n".encode("ascii"))
        with self.assertRaisesRegex(evidence.EvidenceContractError, "detached SHA mismatch"):
            evidence.validate_restore_evidence(
                path, detached, capture_path=self.restore_capture,
                source_backup_evidence_sha256="b" * 64,
                restore_identity_evidence_sha256=RESTORE_IDENTITY_SHA, now_utc=NOW,
            )


class CanonicalAndOutputTest(EvidenceFixture):
    def test_canonical_newline_and_exact_detached_formats(self):
        value = self._backup()
        path, detached = self._write("backup", value)
        self.assertTrue(path.read_bytes().endswith(b"\n"))
        self.assertFalse(path.read_bytes().endswith(b"\n\n"))
        evidence.verify_detached_sha256(path, detached)
        for malformed in (
            "A" * 64, "a" * 63, f"{'a' * 64}\nextra\n",
        ):
            with self.subTest(malformed=malformed[:8]):
                detached.write_bytes(malformed.encode("ascii"))
                with self.assertRaises(evidence.EvidenceContractError):
                    evidence.verify_detached_sha256(path, detached)

    def test_writer_refuses_repository_output_and_overwrite(self):
        repo_root = self.root / "repo"
        repo_root.mkdir()
        with self.assertRaisesRegex(evidence.EvidenceContractError, "outside repository"):
            evidence.write_evidence(
                self._backup(), repo_root / "backup.json", repo_root / "backup.sha256",
                repo_root=repo_root,
            )
        outside = self.root / "outside"
        outside.mkdir()
        evidence_path = outside / "backup.json"
        detached = outside / "backup.sha256"
        # Use a sibling as the declared repository so outputs are truly outside it.
        digest = evidence.write_evidence(
            self._backup(), evidence_path, detached, repo_root=repo_root,
        )
        self.assertEqual(digest, hashlib.sha256(evidence_path.read_bytes()).hexdigest())
        with self.assertRaisesRegex(evidence.EvidenceContractError, "overwrite"):
            evidence.write_evidence(
                self._backup(), evidence_path, detached, repo_root=repo_root,
            )


class SourceSpecificEngineVersionTest(unittest.TestCase):
    def test_canonical_cloud_metadata_is_accepted(self) -> None:
        self.assertEqual(evidence.parse_tidb_cloud_engine_version("v8.5.3"), "8.5.3")

    def test_noncanonical_or_wrong_cloud_metadata_is_rejected(self) -> None:
        for value in (
            "v8.5.2", "v8.5.4", "v8.5", "v8.5.30",
            "prefix-v8.5.3", "v8.5.3-suffix", "TiDB Serverless v8.5.3",
        ):
            with self.subTest(value=value):
                with self.assertRaises(evidence.EngineVersionContractError):
                    evidence.parse_tidb_cloud_engine_version(value)

    def test_sql_server_form_is_parsed_only_after_full_structure_match(self) -> None:
        self.assertEqual(
            evidence.parse_tidb_sql_server_version("8.0.36-TiDB-v8.5.3"),
            "8.5.3",
        )
        for value in (
            "8.0.36-TiDB-v8.5.2", "8.0.36-TiDB-v8.5.4", "8.0.36",
            "arbitrary v8.5.3 text", "v8.5.3",
        ):
            with self.subTest(value=value):
                with self.assertRaises(evidence.EngineVersionContractError):
                    evidence.parse_tidb_sql_server_version(value)


if __name__ == "__main__":
    unittest.main()

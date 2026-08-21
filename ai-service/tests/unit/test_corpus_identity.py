from pathlib import Path

from app.corpus.identity import canonical_jsonl_sha256


def write_bytes(path: Path, value: bytes) -> str:
    path.write_bytes(value)
    return canonical_jsonl_sha256(path)


def test_canonical_jsonl_hash_same_for_lf_and_crlf(tmp_path: Path) -> None:
    path = tmp_path / "corpus.jsonl"
    lf_hash = write_bytes(path, b'{"id":1}\n{"id":2}\n')
    crlf_hash = write_bytes(path, b'{"id":1}\r\n{"id":2}\r\n')
    assert crlf_hash == lf_hash


def test_canonical_jsonl_hash_same_for_lf_and_lone_cr_equivalent_lines(
    tmp_path: Path,
) -> None:
    path = tmp_path / "corpus.jsonl"
    lf_hash = write_bytes(path, b'{"id":1}\n{"id":2}\n')
    cr_hash = write_bytes(path, b'{"id":1}\r{"id":2}\r')
    assert cr_hash == lf_hash


def test_canonical_jsonl_hash_changes_when_content_changes(tmp_path: Path) -> None:
    path = tmp_path / "corpus.jsonl"
    original = write_bytes(path, b'{"event":"938"}\n')
    changed = write_bytes(path, b'{"event":"939"}\r\n')
    assert changed != original


def test_canonical_jsonl_hash_changes_when_record_order_changes(tmp_path: Path) -> None:
    path = tmp_path / "corpus.jsonl"
    original = write_bytes(path, b'{"id":1}\n{"id":2}\n')
    reordered = write_bytes(path, b'{"id":2}\r\n{"id":1}\r\n')
    assert reordered != original


def test_canonical_jsonl_hash_changes_when_record_is_added_or_removed(
    tmp_path: Path,
) -> None:
    path = tmp_path / "corpus.jsonl"
    one = write_bytes(path, b'{"id":1}\n')
    two = write_bytes(path, b'{"id":1}\r\n{"id":2}\r\n')
    empty = write_bytes(path, b"")
    assert len({one, two, empty}) == 3


def test_canonical_jsonl_hash_preserves_escaped_newline_bytes(tmp_path: Path) -> None:
    path = tmp_path / "corpus.jsonl"
    escaped_lf = write_bytes(path, b'{"text":"a\\nb"}\n')
    escaped_crlf = write_bytes(path, b'{"text":"a\\r\\nb"}\r\n')
    assert escaped_crlf != escaped_lf

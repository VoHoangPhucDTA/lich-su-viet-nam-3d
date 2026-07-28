"""Deterministic, source-traceable Fact Context construction."""

import re

from app.retrieval.models import FactContext, RetrievalResult


def _pages(result: RetrievalResult) -> str:
    if result.page_start is None and result.page_end is None:
        return "unknown"
    if result.page_start == result.page_end or result.page_end is None:
        return str(result.page_start)
    if result.page_start is None:
        return str(result.page_end)
    return f"{result.page_start}-{result.page_end}"


def _header(result: RetrievalResult, source_number: int) -> str:
    return (
        f"[SOURCE {source_number}]\n"
        f"chunkId: {result.chunk_id}\n"
        f"documentId: {result.document_id}\n"
        f"grade: {result.grade}\n"
        f"lesson: {result.lesson_number} - {result.lesson_title}\n"
        f"section: {result.section_title}\n"
        f"pages: {_pages(result)}\n\n"
    )


def _sentence_prefix(text: str, budget: int) -> str:
    if budget <= 0:
        return ""
    prefix = text[:budget]
    boundaries = [match.end() for match in re.finditer(r"[.!?…](?:\s|$)", prefix)]
    if boundaries:
        return prefix[: boundaries[-1]].rstrip()
    return prefix.rstrip()


def build_fact_context(
    results: list[RetrievalResult], *, max_chars: int, max_chunks: int
) -> FactContext:
    if max_chars <= 0 or max_chunks <= 0:
        raise ValueError("Fact Context limits must be positive")
    blocks: list[str] = []
    source_ids: list[str] = []
    truncated = len(results) > max_chunks
    for result in results[:max_chunks]:
        header = _header(result, len(blocks) + 1)
        separator = "\n\n" if blocks else ""
        block = header + result.text.strip()
        projected = len(separator) + len(block)
        used = len("".join(blocks)) + (2 * max(0, len(blocks) - 1))
        remaining = max_chars - used
        if projected <= remaining:
            blocks.append(block)
            source_ids.append(result.chunk_id)
            continue
        truncated = True
        if not blocks and len(header) < remaining:
            content = _sentence_prefix(result.text.strip(), remaining - len(header))
            if content:
                blocks.append(header + content)
                source_ids.append(result.chunk_id)
        break
    text = "\n\n".join(blocks)
    return FactContext(
        text=text,
        source_chunk_ids=source_ids,
        included_chunks=len(source_ids),
        truncated=truncated,
        character_count=len(text),
    )

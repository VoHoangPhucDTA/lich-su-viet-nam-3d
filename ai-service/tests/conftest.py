from typing import Any

import pytest


@pytest.fixture
def corpus_record() -> dict[str, Any]:
    return {
        "chunkId": "chunk-001",
        "documentId": "document-001",
        "grade": 10,
        "book": "Kết nối tri thức với cuộc sống",
        "subject": "Lịch sử",
        "lessonNumber": 1,
        "lessonTitle": "Bài học mẫu",
        "titleMayBeTruncated": False,
        "sourcePageId": "100",
        "sourceFile": "lesson.html",
        "sourceMarkdown": "lesson.md",
        "sectionPath": ["Mục 1"],
        "sectionTitle": "Mục 1",
        "pageStart": 1,
        "pageEnd": 1,
        "contentTypes": ["knowledge"],
        "text": "Nội dung lịch sử hợp lệ.",
        "markdown": "Nội dung lịch sử hợp lệ.",
        "embeddingTitle": "Lịch sử lớp 10 — Bài học mẫu",
        "embeddingText": "Lịch sử lớp 10 — Bài học mẫu\n\nNội dung.",
        "sourceBlockIds": ["block-001"],
        "wordCount": 5,
        "charCount": 26,
        "containsPendingReview": False,
        "reviewIssueIds": [],
        "ragEligible": True,
        "sourceMarkdownSha256": "a" * 64,
        "chunkHash": "b" * 64,
        "chunkingVersion": "structure-v2",
    }

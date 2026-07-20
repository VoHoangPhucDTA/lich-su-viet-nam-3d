from pathlib import Path

from app.retrieval.models import RetrievalFilters
from app.retrieval.retriever import ChromaRetriever
from app.vectorstore.chroma_client import (
    close_persistent_client,
    create_collection,
    create_persistent_client,
)


COLLECTION_METADATA = {
    "corpusSha256": "a" * 64,
    "embeddingModel": "fake-embedding-model",
    "embeddingDimension": 768,
    "formatterVersion": "fake-document-v1",
    "chunkingVersion": "structure-v2",
    "distanceMetric": "cosine",
    "sourceType": "sgk-kntt-history",
}


def _metadata(document_id: str, grade: int, lesson: int) -> dict[str, object]:
    return {
        "documentId": document_id,
        "grade": grade,
        "lessonNumber": lesson,
        "lessonTitle": f"Bài {lesson}",
        "sectionTitle": "Mục kiến thức",
        "sectionPath": "Bài > Mục kiến thức",
        "contentTypes": "knowledge",
        "chunkHash": "b" * 64,
        "containsPendingReview": False,
    }


def test_fake_768_query_filters_orders_and_reopens_persistent_chroma(
    tmp_path: Path,
) -> None:
    persist_dir = tmp_path / "chroma"
    client = create_persistent_client(persist_dir)
    collection = create_collection(
        client,
        name="retrieval-integration",
        metadata=COLLECTION_METADATA,
        distance_metric="cosine",
    )
    collection.add(
        ids=["near", "far", "other-grade"],
        embeddings=[
            [1.0] + [0.0] * 767,
            [0.6, 0.8] + [0.0] * 766,
            [1.0] + [0.0] * 767,
        ],
        documents=["Nội dung gần", "Nội dung xa", "Lớp khác"],
        metadatas=[
            _metadata("doc-near", 12, 6),
            _metadata("doc-far", 12, 6),
            _metadata("doc-other", 11, 6),
        ],
    )
    close_persistent_client(client)

    retriever = ChromaRetriever(
        persist_dir=persist_dir,
        collection_name="retrieval-integration",
        expected_metadata=COLLECTION_METADATA,
        distance_metric="cosine",
    )
    results = retriever.retrieve(
        [1.0] + [0.0] * 767,
        RetrievalFilters(grade=12, lessonNumber=6),
        candidate_count=3,
    )

    assert [result.chunk_id for result in results] == ["near", "far"]
    assert all(result.grade == 12 and result.lesson_number == 6 for result in results)
    assert results[0].distance < results[1].distance
    assert (persist_dir / "chroma.sqlite3").is_file()

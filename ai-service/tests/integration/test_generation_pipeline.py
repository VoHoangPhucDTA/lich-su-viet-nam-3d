from pathlib import Path

from app.config import Settings
from app.generation.fake import FakeGenerationProvider
from app.generation.models import GeneratedQuestion, GenerationRequest
from app.generation.schemas import GeneratedQuestionBatch
from app.generation.service import GenerationService
from tests.unit.test_generation import StubRetrieval, question, retrieval_response


def test_fake_retrieval_to_fake_generation_has_no_persistence(tmp_path: Path) -> None:
    settings = Settings(
        _env_file=None,
        gemini_generation_model="fake-generation-model",
        chroma_persist_dir=tmp_path / "unused-chroma",
        chroma_report_dir=tmp_path / "unused-reports",
        embedding_output_dir=tmp_path / "unused-embeddings",
    )
    service = GenerationService(
        settings=settings,
        retrieval_service=StubRetrieval(retrieval_response()),  # type: ignore[arg-type]
        provider=FakeGenerationProvider([GeneratedQuestionBatch(questions=[question()])]),
    )
    response = service.generate(GenerationRequest(query="x", count=1))
    assert response.metadata.generated_count == 1
    assert not (tmp_path / "unused-chroma").exists()
    assert list(tmp_path.iterdir()) == []

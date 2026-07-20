from app.embedding.fake import FakeEmbeddingProvider


def test_fake_provider_is_deterministic_and_has_configured_dimension() -> None:
    provider = FakeEmbeddingProvider(dimension=7)

    first = provider.embed_documents(["một", "hai"])
    second = provider.embed_documents(["một"])

    assert first[0] == second[0]
    assert first[0] != first[1]
    assert all(len(vector) == 7 for vector in first)

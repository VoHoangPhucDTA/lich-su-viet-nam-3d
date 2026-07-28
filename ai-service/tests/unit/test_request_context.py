import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import Request, Response

from app.core.request_context import current_request_id, request_context_middleware


def request_with_id(request_id: str) -> Request:
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/context-test",
            "raw_path": b"/context-test",
            "query_string": b"",
            "root_path": "",
            "headers": [(b"x-request-id", request_id.encode("ascii"))],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
            "state": {},
        }
    )


def test_request_context_sets_echoes_and_resets_after_success() -> None:
    observed: list[str] = []

    async def call_next(_request: Request) -> Response:
        observed.append(current_request_id())
        return Response(status_code=204)

    response = asyncio.run(
        request_context_middleware(request_with_id("request-success"), call_next)
    )

    assert observed == ["request-success"]
    assert response.headers["X-Request-ID"] == "request-success"
    assert current_request_id() == ""


def test_request_context_resets_after_exception() -> None:
    async def call_next(_request: Request) -> Response:
        assert current_request_id() == "request-error"
        raise RuntimeError("expected failure")

    with pytest.raises(RuntimeError, match="expected failure"):
        asyncio.run(
            request_context_middleware(request_with_id("request-error"), call_next)
        )

    assert current_request_id() == ""


def test_nested_request_context_restores_outer_binding() -> None:
    observations: list[str] = []

    async def inner_call_next(_request: Request) -> Response:
        observations.append(current_request_id())
        return Response()

    async def outer_call_next(_request: Request) -> Response:
        observations.append(current_request_id())
        await request_context_middleware(
            request_with_id("request-inner"),
            inner_call_next,
        )
        observations.append(current_request_id())
        return Response()

    asyncio.run(
        request_context_middleware(
            request_with_id("request-outer"),
            outer_call_next,
        )
    )

    assert observations == ["request-outer", "request-inner", "request-outer"]
    assert current_request_id() == ""


def test_async_tasks_do_not_share_request_context() -> None:
    async def worker(request_id: str) -> tuple[str, str]:
        seen: list[str] = []

        async def call_next(_request: Request) -> Response:
            seen.append(current_request_id())
            await asyncio.sleep(0)
            seen.append(current_request_id())
            return Response()

        await request_context_middleware(request_with_id(request_id), call_next)
        return seen[0], seen[1]

    async def run_workers() -> list[tuple[str, str]]:
        return list(
            await asyncio.gather(
                worker("request-task-a"),
                worker("request-task-b"),
            )
        )

    assert asyncio.run(run_workers()) == [
        ("request-task-a", "request-task-a"),
        ("request-task-b", "request-task-b"),
    ]
    assert current_request_id() == ""


def test_threads_do_not_share_request_context() -> None:
    barrier = threading.Barrier(2)

    def worker(request_id: str) -> tuple[str, str]:
        async def call_next(_request: Request) -> Response:
            before = current_request_id()
            barrier.wait(timeout=2)
            return Response(headers={"observed-request-id": before})

        response = asyncio.run(
            request_context_middleware(request_with_id(request_id), call_next)
        )
        return response.headers["observed-request-id"], current_request_id()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(
            executor.map(worker, ["request-thread-a", "request-thread-b"])
        )

    assert results == [
        ("request-thread-a", ""),
        ("request-thread-b", ""),
    ]
    assert current_request_id() == ""

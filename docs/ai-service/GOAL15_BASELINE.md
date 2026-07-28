# Goal 15A — AI Service baseline

Ngày đo: 2026-07-28

Repository: `D:/KLTN/lich-su-viet-nam-3d`

Branch: `fix/ai-service`
Commit tại thời điểm đo: `16b223eead89630ec038853ae4cda490a86959c6`

## Phạm vi và nguyên tắc

Goal 15A chỉ bổ sung công cụ đo và ghi baseline. Không sửa logic runtime, corpus,
embedding artifact hoặc production Chroma. Các lỗi Ruff/Mypy được ghi nhận để xử lý
ở work package sau, không được sửa trong WP0.

## Tooling đã ghim

Các phiên bản đã được xác minh tồn tại trên PyPI và cài thành công trong Python 3.10.11:

```text
pytest==8.4.2
pytest-cov==6.0.0
ruff==0.9.6
mypy==1.15.0
coverage==7.15.2  (transitive dependency của pytest-cov)
```

PyPI references:

- https://pypi.org/project/pytest-cov/6.0.0/
- https://pypi.org/project/ruff/0.9.6/
- https://pypi.org/project/mypy/1.15.0/

## Test baseline trước khi thêm tooling

Command:

```powershell
python -m pytest tests/unit tests/integration -q
```

Kết quả nguyên văn tóm tắt của pytest:

```text
223 passed, 3 skipped, 9 warnings in 12.55s
```

Coverage command trước tooling:

```powershell
python -m pytest --cov=app --cov-report=term-missing -q
```

Kết quả:

```text
ERROR: unrecognized arguments: --cov=app --cov-report=term-missing
```

Lint/type commands trước tooling:

```powershell
python -m ruff check app scripts tests
python -m mypy app
```

Kết quả:

```text
No module named ruff
No module named mypy
```

## Cấu hình WP0

- `requirements-dev.txt`: thêm `pytest-cov`, `ruff`, `mypy` với version pin ở trên.
- `pytest.ini`: bật `--strict-markers -p no:cacheprovider`; chỉ nâng
  `DeprecationWarning` từ module `app.*` thành lỗi.
- `pyproject.toml`: cấu hình Ruff (E/F/I/UP/B/SIM/RUF, line length 110) và Mypy
  Python 3.10 với `ignore_missing_imports=true`.

## Regression sau khi bật tooling

Commands:

```powershell
python -m pytest tests/unit tests/integration -q
python -m pytest -q
```

Kết quả:

```text
tests/unit + tests/integration: 223 passed, 3 skipped, 9 warnings in 12.70s
full suite: 223 passed, 3 skipped, 9 warnings in 19.68s
```

Baseline trước/sau tooling không thay đổi số pass/skip.

## Coverage sau khi bật pytest-cov

Command:

```powershell
python -m pytest --cov=app --cov-report=term-missing -q
```

Kết quả tổng: `3837 statements`, `433 missed`, `89%`.

| Module | Statements | Miss | Coverage |
| --- | ---: | ---: | ---: |
| `app/__init__.py` | 0 | 0 | 100% |
| `app/api/router.py` | 10 | 0 | 100% |
| `app/api/__init__.py` | 0 | 0 | 100% |
| `app/api/routes/__init__.py` | 0 | 0 | 100% |
| `app/api/routes/generation.py` | 48 | 11 | 77% |
| `app/api/routes/health.py` | 45 | 5 | 89% |
| `app/api/routes/provenance.py` | 32 | 10 | 69% |
| `app/api/routes/retrieval.py` | 45 | 11 | 76% |
| `app/config.py` | 114 | 3 | 97% |
| `app/core/deadline.py` | 58 | 3 | 95% |
| `app/core/__init__.py` | 0 | 0 | 100% |
| `app/core/exceptions.py` | 12 | 2 | 83% |
| `app/core/logging.py` | 5 | 0 | 100% |
| `app/core/request_context.py` | 35 | 3 | 91% |
| `app/core/runtime.py` | 213 | 23 | 89% |
| `app/corpus/loader.py` | 28 | 2 | 93% |
| `app/corpus/__init__.py` | 0 | 0 | 100% |
| `app/corpus/models.py` | 39 | 0 | 100% |
| `app/corpus/validator.py` | 41 | 6 | 85% |
| `app/dependencies.py` | 22 | 1 | 95% |
| `app/e2e/deterministic.py` | 60 | 5 | 92% |
| `app/e2e/__init__.py` | 0 | 0 | 100% |
| `app/embedding/__init__.py` | 3 | 0 | 100% |
| `app/embedding/base.py` | 18 | 1 | 94% |
| `app/embedding/checkpoint.py` | 86 | 6 | 93% |
| `app/embedding/fake.py` | 23 | 3 | 87% |
| `app/embedding/formatter.py` | 46 | 2 | 96% |
| `app/embedding/gemini.py` | 154 | 11 | 93% |
| `app/embedding/models.py` | 62 | 0 | 100% |
| `app/embedding/service.py` | 156 | 17 | 89% |
| `app/evaluation/__init__.py` | 2 | 0 | 100% |
| `app/evaluation/retrieval_experiment.py` | 450 | 84 | 81% |
| `app/generation/duplicate_checker.py` | 28 | 1 | 96% |
| `app/generation/evaluation.py` | 135 | 22 | 84% |
| `app/generation/fake.py` | 18 | 3 | 83% |
| `app/generation/gemini.py` | 119 | 25 | 79% |
| `app/generation/models.py` | 140 | 10 | 93% |
| `app/generation/parser.py` | 13 | 1 | 92% |
| `app/generation/prompt_builder.py` | 13 | 0 | 100% |
| `app/generation/repair.py` | 6 | 0 | 100% |
| `app/generation/schemas.py` | 4 | 0 | 100% |
| `app/generation/service.py` | 159 | 29 | 82% |
| `app/generation/validators.py` | 67 | 7 | 90% |
| `app/generation/__init__.py` | 0 | 0 | 100% |
| `app/main.py` | 25 | 0 | 100% |
| `app/provenance/models.py` | 68 | 2 | 97% |
| `app/provenance/__init__.py` | 0 | 0 | 100% |
| `app/provenance/service.py` | 54 | 9 | 83% |
| `app/retrieval/context_builder.py` | 46 | 6 | 87% |
| `app/retrieval/__init__.py` | 2 | 0 | 100% |
| `app/retrieval/evaluation.py` | 267 | 22 | 92% |
| `app/retrieval/filters.py` | 17 | 1 | 94% |
| `app/retrieval/models.py` | 221 | 12 | 95% |
| `app/retrieval/retriever.py` | 122 | 15 | 88% |
| `app/retrieval/service.py` | 137 | 14 | 90% |
| `app/schemas/common.py` | 17 | 0 | 100% |
| `app/schemas/corpus.py` | 13 | 0 | 100% |
| `app/schemas/__init__.py` | 0 | 0 | 100% |
| `app/vectorstore/artifact_validator.py` | 141 | 33 | 77% |
| `app/vectorstore/__init__.py` | 2 | 0 | 100% |
| `app/vectorstore/chroma_client.py` | 25 | 0 | 100% |
| `app/vectorstore/index_service.py` | 116 | 12 | 90% |
| `app/vectorstore/metadata_mapper.py` | 9 | 0 | 100% |
| `app/vectorstore/models.py` | 42 | 0 | 100% |

## Ruff baseline

Command:

```powershell
python -m ruff check app scripts tests
```

Result: exit code `1`, `185 errors`; `58` are marked fixable by Ruff. These are
baseline findings only. No Ruff finding was changed in Goal 15A.

## Mypy baseline

Command:

```powershell
python -m mypy app
```

Result: exit code `1`, `202 errors` across `20 files`. The dominant existing class
of findings is construction of Pydantic models with camelCase aliases while the
static constructor signature exposes snake_case fields. No Mypy finding was changed
in Goal 15A.

## Reproducibility identity

```text
Python: 3.10.11
pytest: 8.4.2
pytest-cov: 6.0.0
ruff: 0.9.6
mypy: 1.15.0
coverage: 7.15.2
HEAD: 16b223eead89630ec038853ae4cda490a86959c6
branch: fix/ai-service
```

Working-tree state at measurement contained only the WP0 files inside the AI
Service scope (`requirements-dev.txt`, `pytest.ini`, and new `pyproject.toml`),
plus the pre-existing dirty baseline outside that scope.

## WP0 conclusion

Tooling is installed and reproducible, coverage is now measurable, and the full
regression remains `223 passed, 3 skipped`. Ruff and Mypy findings are intentionally
left for later work packages; Goal 15A does not claim lint/type cleanliness.

## Goal 15C / WP2 — typed contracts and pure evaluation helpers

Scope locked before implementation:

```text
app/retrieval/models.py
app/retrieval/context_builder.py
app/retrieval/evaluation.py
app/generation/evaluation.py
app/generation/validators.py
app/generation/duplicate_checker.py
```

The comparable `python -m mypy app` baseline was `202 errors in 20 files`.
After WP2 it is `162 errors in 14 files`, a reduction of 40 errors (19.80%).
The exact WP2 scope reports no Mypy issues when checked as the explicit target
set. No Mypy configuration, suppression, `Any`, `cast`, or `type: ignore` was
added.

WP2 cleaned internal model construction by using Python field names while
preserving the existing camelCase aliases at serialization boundaries. It also
introduced explicit evaluation/cache-mode Literal aliases and narrowed one
optional retrieval lookup without changing metric formulas, ordering, default
values, validators, or report keys.

Verification:

```text
Ruff: 0 errors
pytest: 223 passed, 3 skipped
coverage app: 3409 covered / 3838 statements, 429 missed, 88.82%
compileall app scripts: passed
production Chroma: 414 records, gemini-embedding-2, 768 dimensions, cosine
```

Remaining typing debt is intentionally deferred: provider/external adapters to
WP3, runtime/deadline/lifecycle to WP4, and route/CLI boundaries to WP5.

## Goal 15D / WP3 — provider boundaries and orchestration services

Scope locked before implementation:

```text
app/embedding/models.py
app/embedding/service.py
app/generation/models.py
app/generation/gemini.py
app/retrieval/retriever.py
app/evaluation/retrieval_experiment.py
app/generation/service.py
app/retrieval/service.py
app/provenance/service.py
app/e2e/deterministic.py
```

The comparable `python -m mypy app` baseline was `162 errors in 14 files`.
After WP3 it is `31 errors in 6 files`, a reduction of 131 errors (80.86%).
The remaining errors are confined to `app/core` (3, WP4) and `app/api` (28,
WP5). The explicit WP3 scope reports zero Mypy issues.

External SDK and Chroma values are kept untrusted at their adapter boundaries,
narrowed with guarded access, and converted to validated domain models before
entering orchestration services. Minimal service/collection Protocols describe
only the operations consumed by those services. Provider retry, key rotation,
deadline clamp, timeout units, Chroma ranking, pending-review filtering, prompt,
and public aliases remain unchanged.

WP3 added no `Any`, `cast`, or `type: ignore`. Existing boundary-local `Any`
remains in the Google SDK/Chroma adapters and the retrieval experiment's JSON
boundary; it is not returned into domain services. `GenerationOutputError` now
always exposes typed `raw_output`, malformed Chroma nested result lists fail
closed, and the deterministic generation provider accepts the same optional
deadline/timeout call contract used by orchestration.

Verification:

```text
provider/model tests: 42 passed
Chroma/retrieval/runtime tests: 54 passed
orchestration/provenance tests: 42 passed
retrieval experiment tests: 8 passed
deterministic E2E tests: 2 passed
Ruff: 0 errors
pytest: 236 passed, 3 skipped
coverage app: 3452 covered / 3868 statements, 416 missed, 89.25%
compileall app scripts: passed
production Chroma: 414 records, gemini-embedding-2, 768 dimensions, cosine
```

Coverage increased by 43 covered statements and 0.43 percentage points from
the WP2 baseline (88.82%); missed statements decreased by 13. Runtime resource
lifecycle/request-context typing is deferred to Goal 15E / WP4. API route and
CLI boundary typing remains deferred to WP5.

## Goal 15E / WP4 — core runtime and request-context typing

Scope locked before implementation:

```text
app/core/request_context.py
app/core/runtime.py
```

The comparable `python -m mypy app` baseline was `31 errors in 6 files`: three
core errors (`return-value`, `unused-ignore`, and `assignment`) plus 28 API-route
errors. After WP4, the explicit core scope reports no issues and full-app Mypy
reports `28 errors in 4 files`, all under `app/api/routes`.

The request correlation `ContextVar[str]` retains its empty-string default and
UUID/request-header policy. The middleware callback and response are now typed
without changing the `finally`-based token reset or response-header mutation.
Regression tests prove reset after success and exception, nested restoration,
and isolation across concurrent asyncio tasks and worker threads.

Runtime service resources and provider factory callbacks now use their existing
domain Protocols instead of propagating `Any`. Optional resources have typed,
fail-closed require helpers. Startup state transitions, partial-client cleanup,
app-state keys, provider thread-local ownership, service construction counters,
deep readiness, and idempotent shutdown remain unchanged.

No `Any`, `cast`, or `type: ignore` was added. Existing `Any` remains only at
the Chroma client/collection and thread-local SDK wrapper boundaries. One stale
`type: ignore[arg-type]` was removed after the deterministic retrieval service
conformed to the WP3 Protocol.

Verification:

```text
request-context and health tests: 11 passed
runtime lifecycle and resilience tests: 38 passed
scoped Mypy: 0 errors in 2 files
full app Mypy: 28 errors in 4 API-route files
Ruff: 0 errors
pytest: 242 passed, 3 skipped
coverage app: 3471 covered / 3884 statements, 413 missed, 89.37%
compileall app scripts: passed
production Chroma: 414 records, gemini-embedding-2, 768 dimensions, cosine
```

Coverage increased by 19 covered statements and 0.12 percentage points from
the WP3 baseline (89.25%); missed statements decreased by three. The remaining
28 API-route errors are deferred to Goal 15F / WP5.

## Goal 15F / WP5 — FastAPI route typing and contract preservation

Scope locked before implementation:

```text
app/api/routes/generation.py
app/api/routes/retrieval.py
app/api/routes/provenance.py
app/api/routes/health.py
```

The comparable `python -m mypy app` baseline was `28 errors in 4 files`:
four in generation, four in retrieval, thirteen in provenance, and seven in
health (`call-arg`: 19, `arg-type`: 7, `assignment`: 2). After WP5, both the
explicit route scope and the full `app` target report no Mypy issues, a
reduction of 28 errors (100%). Mypy configuration was not changed.

Internal Pydantic construction now uses snake_case Python field names while
the existing aliases continue to serialize camelCase JSON. Generation and
retrieval routes use explicitly typed service callables and keyword argument
maps at the dynamic signature-compatibility boundary. Their synchronous
cancellation adapters still call Starlette's asynchronous
`Request.is_disconnected` from the AnyIO worker thread, and regression tests
prove that the deadline and fail-closed disconnect signal reach both services.
Provenance narrows the already validated grade to its `Literal[10, 11, 12]`
domain type. Deep health narrows the app-scoped runtime resource without
creating a new service or client.

No `Any`, `cast`, or `type: ignore` was added. Route paths and methods,
dependency injection and internal-token authentication, request-ID behavior,
request defaults, response models and aliases, status/error mappings,
readiness semantics, retrieval/provenance ordering, and generation output
remain unchanged. Contract tests cover snake_case construction with camelCase
wire aliases, OpenAPI path/method/response references, auth, closed-runtime
responses, shallow/deep health behavior, and deadline/cancellation propagation.

Verification:

```text
scoped Mypy: 0 errors in 4 files
full app Mypy: 0 errors in 65 source files
Ruff: 0 errors
pytest: 247 passed, 3 skipped
coverage app: 3489 covered / 3897 statements, 408 missed, 89.53%
compileall app scripts: passed
production Chroma: 414 records, gemini-embedding-2, 768 dimensions, cosine
```

Coverage increased by 18 covered statements and 0.16 percentage points from
the WP4 baseline (89.37%); missed statements decreased by five.

The measurement-only `python -m mypy app scripts --show-error-codes` baseline
for Goal 15G is `90 errors in 5 script files`: 88 `call-arg`, one `arg-type`,
and one `no-redef`. The affected files are `scripts/query_retrieval.py` (3),
`scripts/evaluate_retrieval_legacy.py` (73), `scripts/generate_quiz.py` (4),
`scripts/evaluate_generation.py` (6), and
`scripts/build_teacher_evaluation_sample.py` (4). No script was modified in
WP5. Goal 15G / WP6 should eliminate this remaining CLI/script typing debt
without changing command-line contracts or evaluation behavior.

## Goal 15G / WP6 — CLI and evaluation script typing

Scope locked before implementation:

```text
Evaluation scripts:
- scripts/evaluate_generation.py
- scripts/evaluate_retrieval_legacy.py
- scripts/build_teacher_evaluation_sample.py

Inspection/maintenance scripts:
- scripts/query_retrieval.py
- scripts/generate_quiz.py

Experiment scripts: none
Direct typed helper dependencies: none
```

The comparable `python -m mypy app scripts` baseline was `90 errors in 5
script files`: 88 `call-arg`, one `arg-type`, and one `no-redef`. After WP6,
the explicit five-script scope and the full `app scripts` target report no
Mypy issues. `python -m mypy app` remains clean. This is a reduction of 90
errors (100%) without changing Mypy configuration.

The two manual CLIs continue to parse their existing `argparse.Namespace`
inside `main`, then immediately construct typed request models; the namespace
does not escape into evaluation or service logic, so no additional CLI-config
framework was introduced. Internal Pydantic constructors now use snake_case
Python field names, while `model_dump(by_alias=True)` and all existing JSON
keys remain camelCase. JSON input continues to be validated by the existing
Pydantic/type-adapter/tooling boundaries, and artifact serialization, paths,
indentation, UTF-8 behavior, schema versions, checksums, and overwrite behavior
remain unchanged.

Legacy retrieval evaluation now types its fixed filter-mode tuple and its
cache-mode-to-evaluation-mode mapping with the existing Literal contracts. The
renamed failure/retrieval loop variables remove the `no-redef` finding without
changing iteration order. No metric formula, denominator, rounding rule,
benchmark role, cache/filter mode, failure preservation, or exit-code decision
was changed. No `Any`, `cast`, or `type: ignore` was added.

CLI regression tests cover help and required-argument exit codes, defaults,
choices, explicit argv, UTF-8/Windows-style paths, validation before service
creation, snake_case construction with camelCase wire aliases, all legacy
evaluation-mode mappings, offline teacher-sample preflight, and fail-closed
provider approval on cache miss. No test or verification command called Gemini.

Verification:

```text
five-script scoped Mypy: 0 errors in 5 files
full app Mypy: 0 errors in 65 source files
full app + scripts Mypy: 0 errors in 77 source files
direct CLI contract tests: 12 passed
direct evaluation/tooling tests: 49 passed
Ruff: 0 errors
pytest: 259 passed, 3 skipped
app-only coverage: 3491 covered / 3897 statements, 406 missed, 89.58%
app + scripts coverage: 3753 covered / 4526 statements, 773 missed, 82.92%
compileall app scripts: passed
offline teacher preflight: 36 items, providerCalled=false
production Chroma: 414 records, gemini-embedding-2, 768 dimensions, cosine
```

App-only coverage increased by two covered statements and 0.05 percentage
points from the WP5 baseline (89.53%); missed statements decreased by two.
Goal 15H / WP7 is the next action: wire the now-clean Ruff, full Mypy, pytest,
and coverage requirements into CI without weakening local configuration or
uploading secrets/runtime artifacts.

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

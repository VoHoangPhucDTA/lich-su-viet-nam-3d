# Teammate docs handoff

## 1. What changed since the old thesis snapshot

OLD: RAG was described mainly through 36 retrieval queries, generation quality lacked a same-case baseline, Bạch Đằng 939 remained an unresolved example, the timeline lacked a visible exact-year control, and several test totals were older snapshots.

FINAL: the UI has a visible exact-year control and deterministic initial camera alignment; RAG-01 has a 60-case retrieval benchmark plus a separate 27-task paired generation benchmark; RAG-02 blocks covered critical factual conflicts at runtime; and final frontend/AI gates are 1232 and 394 passing tests respectively.

## 2. UI changes

- Exact-year input is visible and accepts signed integers within the current runtime model range (approximately 500 TCN–2023).
- `0` is rendered as “Công Nguyên”; positive years use decimal year; BCE uses TCN wording.
- Valid years with no event remain selected. Invalid text/float/out-of-range input shows validation and is not silently clamped.
- Enter and explicit action are supported; URL/reload state is preserved; the timeline slider remains.
- Cesium initial `setView` uses deterministic heading/pitch/roll. Sidebar-open and sidebar-collapsed alignment passed, without continuous forced recenter.
- Event sidebar search/category/grade filters already existed; do not describe them as new timeline filters.

## 3. Backend/security changes

- Password change/reset increments `authVersion`; an old token is rejected on its next protected request.
- All six exam modes use server-authoritative answer checking/scoring. No public canonical answer-key datasets are required.
- Safe claim: “No canonical answer-key leakage was found in the reviewed public artifacts.”
- Final accepted backend evidence: compile PASS; focused audit 47/47 PASS; full suite 733 tests, 0 failures, 2 Docker/Testcontainers environment errors, 87 skipped. Do not write 733/733 PASS.

## 4. AI/RAG changes

- The AI module is supplementary to a core-first/modular product.
- RAG contribution: canonical corpus identity, Chroma retrieval, deterministic fact context, prompt/schema contracts, source provenance, bounded repair, paired evaluation, and factual guard integration.
- This is a system-engineering contribution, not a new RAG algorithm.
- Gemini remains the generation/embedding provider dependency; Viettel TTS is a separate conditional integration. FPT.AI is not the active repository provider.

## 5. New evaluation numbers

Paste-ready Vietnamese wording:

> Bộ đánh giá truy xuất cố định gồm 60 trường hợp, trong đó 59 trường hợp thông thường được tính điểm và 1 trường hợp kiểm soát thiếu ngữ cảnh. Kết quả đạt Hit@1 = 88,14%, Hit@3 = 98,31%, Hit@5 = 100% và MRR = 93,36%. Đánh giá chất lượng sinh được tách riêng với 27 tác vụ ghép cặp trên cùng trường hợp, tạo 54 đầu ra. Sau thẩm định ngữ nghĩa có đối chiếu nguồn, nhánh RAG đạt 23/27 (85,19%), còn nhánh chỉ dùng Gemini đạt 13/27 (48,15%), chênh lệch tuyệt đối +37,04 điểm phần trăm. Kết quả ghép cặp gồm 10 trường hợp RAG thắng, 0 trường hợp Gemini-only thắng, 13 trường hợp cả hai đạt và 4 trường hợp cả hai không đạt.

Remember: 60 = retrieval cases; 27 = generation tasks; 54 = outputs. Do not write “RAG was tested 60 generation times.” The exact p-value `0.001953125`, if used, must be labeled exploratory on a fixed small benchmark.

## 6. RAG-02 factual guard

The final runtime uses a 10-fact `critical_facts_v1` registry covering COUNT, DATE, PERSON and YEAR. It validates two layers: retrieved source context and generated question/answer/explanation. A fake source claiming 939 conflicts with the registry and is blocked even if the generated output says 938. The normal path has zero repair; an invalid attempt may use at most one existing bounded repair; final invalid output becomes controlled failure and is not served.

Safe wording: “bounded runtime factual guard for covered critical facts.” This is not a universal historical fact checker.

## 7. GIS wording correction

OLD: language implying GADM reconstructs historical administrative boundaries.

FINAL: an optional/lazy 34-unit modern administrative GeoJSON reference, with source and disclaimer; GADM is the default source. It is not period-correct historical-boundary reconstruction, and `license_status` remains `UNVERIFIED`.

## 8. Performance wording correction

OLD: 77.4% was presented as a final optimization benefit.

FINAL: a nested-lazy Cesium experiment reduced one bundle measurement but worsened runtime behavior, so it was reverted. Route-level lazy loading remains. Final status is `NO_SAFE_MEANINGFUL_IMPROVEMENT_REVERTED`.

## 9. Remaining limitations

- No learner educational-effectiveness user/control study.
- The educational benefit of 3D has not been experimentally proven.
- Gemini and Viettel remain external dependencies.
- The RAG benchmark is fixed/small and is not universal Vietnamese-history coverage.
- RAG-02 covers only 10 curated critical facts.
- Exam-source academic provenance remains incomplete.
- Modern GADM is not historical-boundary reconstruction; license is unverified.
- PERF-01 produced no safe meaningful improvement and was reverted.

## 10. Exact thesis sections/slides to update

- Chapter 3: data/corpus identity, retrieval method, paired generation evaluation, factual-validation method, fixed-benchmark boundaries.
- Chapter 4: final architecture/UML showing React/Cesium → Spring → FastAPI; Chroma retrieval and Gemini generation; bounded repair + factual guard + registry; Viettel TTS separately.
- Chapter 5: exact-year/camera UI, server-authoritative exam security, rule-based dashboard recommendation, final test tables, RAG results.
- Chapter 6: technical contribution and all remaining limitations/future learner study.
- PPT: problem/solution, architecture, UI correction, RAG evaluation, factual guard, test summary, limitations/future work.

## 11. Screenshots that should be recaptured

- Map page with sidebar open.
- Visible exact-year input.
- BCE example within the supported runtime range; do not use `-938` as live-data proof.
- “Công Nguyên” state if practical.
- Sidebar collapsed with centered map.
- Dashboard rule-based weakness/developing recommendation.
- AI controlled failure only through a safe offline/mock reproducible path.

No screenshot is verified merely because it is listed.

## 12. Claims that must NOT appear

- RAG is universally superior to Gemini, guarantees correctness, or covers all Vietnamese history.
- All hallucinations are solved; all historical facts are automatically verified; 100% accuracy.
- 60 generation runs, or 394 benchmark queries.
- ML/adaptive/AI dashboard personalization.
- Fully offline/local-first/AI-independent deployment.
- Instant push logout of every device after password change.
- Historical GADM boundary reconstruction.
- Final 77.4% performance improvement.
- Proven educational effectiveness of 3D.

# Kế hoạch thực thi mức khóa luận

## Phân loại deliverable

| Hạng mục | Phân loại |
|---|---|
| Canonical/legacy parser và target validation | `REQUIRED_FOR_IMPLEMENTATION` |
| Provider status, camera snapshot/restore, session cleanup | `REQUIRED_FOR_IMPLEMENTATION` |
| Four supported types + unsupported two + error/fallback | `REQUIRED_FOR_IMPLEMENTATION` |
| Unit/integration/accessibility acceptance | `REQUIRED_FOR_IMPLEMENTATION` |
| Data audit report và coverage table | `REQUIRED_FOR_THESIS` |
| Functional/technical/user evaluation evidence | `REQUIRED_FOR_THESIS` |
| Component/sequence/state/data-flow diagrams | `REQUIRED_FOR_THESIS` |
| Screenshot point/multi-region/mixed/error và demo checklist | `REQUIRED_FOR_THESIS` |
| Performance budget benchmark/staging report | `RECOMMENDED` |
| Typed backend terrain endpoint | `RECOMMENDED` nếu audit cho thấy raw contract không đủ |
| Historical boundary dataset, 3D battlefield reconstruction, auto-tour | `FUTURE_WORK` |

## Thứ tự triển khai và evidence

1. **Baseline/decision gate:** lưu Git status, typecheck/test/lint baseline, scope và blocker token/live DB.
2. **Contract/target:** lưu type definitions, fixture matrix, parser tests, audit reason codes.
3. **Provider/resource:** lưu env-name policy, provider state/error screenshots, network/CSP check và resource counts.
4. **State/camera:** lưu state machine, sequence diagrams enter/exit, race/cancel/restore tests và camera tolerance.
5. **Region/UX:** lưu GADM resolver report, MultiPolygon bounds case, popup keyboard/mobile screenshots, approved disclaimer.
6. **Integration:** lưu regression matrix `/map`, deep-link/parent-child/year/grade/close cases, 10-cycle cleanup result.
7. **Audit/evaluation:** chạy read-only audit được phê duyệt, user study nếu khả thi, technical measurements và limitations.
8. **Thesis packaging:** freeze commit/version, appendices, figures, tables, demo fallback and reproducibility README.

## Quality gates

**Q1 — Data safety:** mọi coordinate validate; region render resolve; unsupported type không CTA; malformed có diagnostic.

**Q2 — Runtime:** provider/error/fallback rõ; latest-wins; no stale setState; camera restore; resource counts ổn định qua ≥10 session.

**Q3 — Learning UX:** học sinh hiểu CTA/point-region/modern-boundary disclaimer; keyboard/mobile/reduced-motion pass.

**Q4 — Reproducibility:** test command, browser/GPU/network, token environment name, GeoJSON version, audit snapshot/hash và fixture IDs được lưu; không lưu secret/raw payload nhạy cảm.

**Q5 — Thesis claims:** mỗi kết luận phân biệt technical value, educational applicability, contribution và limitation; không claim learning gain khi chỉ có usability.

## Danh sách bằng chứng cần thu thập

- Component, sequence enter/exit, state machine, data-flow và camera lifecycle diagrams.
- Bảng sáu geo type, target/eligibility, audit coverage và unresolved reason codes.
- Test report functional/technical/accessibility, baseline-vs-regression lint.
- Performance marks P50/P95, browser/device/network matrix, resource cleanup counts.
- Screenshot point, multi-point, multi-polygon, mixed, error/fallback, modern-boundary disclaimer.
- User task log đã ẩn danh, questionnaire, completion/time/errors và open feedback.
- Deployment checklist token restriction, quota, CSP, base path, HTTPS, CORS, cache, timeout.

## Definition of done

Module chỉ được gọi là “hoàn thành cho khóa luận” khi implementation gates Q1–Q3 pass, evidence Q4 được lưu, phần đánh giá đã chạy hoặc ghi rõ vì sao chưa chạy, và Q5 được review. Nếu token/live data/deploy path chưa sẵn sàng, trạng thái phải là “prototype/conditional”, có fallback demo và blocker, không phải production-ready.

## Hướng phát triển sau khóa luận

Typed backend contract/versioning, historical boundary datasets, temporal terrain, richer multi-event comparison, adaptive mobile performance và controlled learning experiment là future work. Không đưa chúng vào MVP bằng cách âm thầm mở rộng scope.

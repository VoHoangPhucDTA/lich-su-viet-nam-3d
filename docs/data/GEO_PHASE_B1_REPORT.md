# Geo Phase B1 Report

## Baseline

- Branch: `main`
- Initial HEAD: `77529865cba7941d17872a2d6246409d034ed076`
- Initial `core_events.jsonl` SHA-256: `4674284BED8BE87E01045DF88DB90B8C4898FE0CC8A1C63BAAAAE5D1A3C1F1F9`
- The working tree was already dirty before B1. Those pre-existing changes were outside the Stage 4/Stage 4B files changed here and were not modified.

## Root causes confirmed from code

1. `stage4_common.normalize_text()` removed administrative tokens everywhere. Therefore `Hà Tĩnh` normalized to `ha`, and that ambiguous token entered the GADM alias lookup.
2. `prepare_indexes.build_gadm_index()` stored exact and phrase aliases in one insertion-ordered dictionary without collision validation.
3. `build_final_events.province_from_text()` returned the first whole-word alias found after exact lookup, making the result depend on dictionary order instead of longest-match semantics.
4. A geocoded point carried `provinceName`, and `build_map_data()` promoted that parent province into operational `provinceNames`. The later `markers + provinceNames -> mixed` rule therefore overproduced `mixed`.
5. The old classifier emitted legacy `polygon`, silently converted invalid overrides to `no_location`, did not deduplicate equal-coordinate markers, and cleared operational geometry only for `no_location`.
6. Event `hoi-nghi-thanh-lap-dang-cong-san-viet-nam` contains `Cửu Long` meaning Kowloon/Hong Kong, while the global dictionary maps the same text to the Mekong Delta. This requires an event-scoped decision, not a global dictionary change.

## Files changed

- `crawData/stage4_assemble/geo_contract.py`
- `crawData/stage4_assemble/stage4_common.py`
- `crawData/stage4_assemble/prepare_indexes.py`
- `crawData/stage4_assemble/build_final_events.py`
- `crawData/stage4_assemble/config/manual_geotype_override.json`
- `crawData/stage4_assemble/validate_stage4.py`
- `crawData/stage4_assemble/test_geo_contract.py`
- `crawData/stage4b_curate_tree/validate_curated_tree.py`
- `crawData/stage4b_curate_tree/test_geo_contract_stage4b.py`
- `docs/data/GEO_PHASE_B1_REPORT.md`

## Canonical classifier after B1

The centralized `infer_operational_geography()` classifier uses only operational markers, explicit region targets, a confirmed nationwide signal, and an optional validated override.

| Condition | Canonical geoType | Operational result |
|---|---|---|
| Confirmed nationwide signal | `nationwide` | markers and regions cleared |
| No marker and no region | `no_location` | no operational geometry |
| One unique marker, no region | `point` | primary `marker`, empty `markers[]` |
| At least two unique markers, no region | `multi_point` | `marker == markers[0]` |
| No marker, at least one explicit region | `multi_polygon` | one or more GADM targets |
| Marker plus independent explicit region | `mixed` | marker(s) and region target(s) |

The classifier never emits `polygon`, `single_point`, `multi_region`, or another legacy fallback. An invalid or contradictory forced type raises `GeographyContractError`.

## Normalization and matching

- Legacy `normalize_text()` remains unchanged for slug, dedup, and non-geography behavior.
- New `normalize_geo_text()` removes administrative words only as leading prefixes. `Hà Tĩnh` remains `ha tinh`; `Tỉnh Hà Tĩnh` also becomes `ha tinh`.
- GADM indexes now expose separate `exactLookup` and `phraseLookup` maps.
- Matching checks exact normalized phrase first, then whole-phrase candidates ordered by token count and character length.
- Equal-priority candidates targeting different provinces raise an ambiguity error instead of selecting by dictionary order.
- Alias `ha` is rejected; valid short names such as `Huế` remain accepted.
- Index construction raises on normalized alias collisions.
- The legacy `lookup` key remains for one release as reader compatibility. Cached indexes were not modified in B1.

## Parent province handling

A point may retain `parentProvinceName` only as internal administrative provenance. It is not appended to operational `provinceNames` or `gadmRefs`. Only an explicit province/region mention or a manual override can create a polygon target. No final JSON schema field was added.

## Contextual Cửu Long handling

`manual_geotype_override.json` now contains an override keyed by stable event ID `hoi-nghi-thanh-lap-dang-cong-san-viet-nam`.

- The overview type is `no_location` because Kowloon/Hong Kong is outside the supported Vietnam layer.
- The false marker near `10, 105.7` is cleared.
- `Cửu Long`, `Hương Cảng (Trung Quốc)`, `Hồng Công`, and other raw mentions remain in `historicalLocations`.
- The global `Cửu Long` dictionary entry is unchanged, so genuine Mekong Delta events are unaffected.
- A read-only fixture against the real Stage 3 row and current cache produced `no_location` with no marker or GADM target.

## Duplicate marker coordinates

- Marker identity uses `{lat, lng}` rounded to six decimal places.
- Equal-coordinate markers collapse to one target in stable source order.
- Alternate marker names remain in `historicalLocations`.
- Equal-coordinate names therefore cannot create a false `multi_point`.
- Invalid/non-finite coordinates are not guessed or silently discarded; validation reports them.

## Validator invariants

Stage 4A and Stage 4B validators now apply the shared map contract and report event ID, field, and reason. Checks include:

- exactly six canonical geo types;
- marker/region cardinality for each type;
- unique marker coordinates and `marker == markers[0]`;
- finite coordinates and WGS84 ranges;
- equal `provinceNames`/`gadmRefs` cardinality;
- no duplicate GADM target;
- no operational geometry for `nationwide` and `no_location`;
- valid `focusGeometry` metadata without using it for classification.

Validation is non-mutating and does not convert invalid state to `no_location`.

## Regression tests added

`test_geo_contract.py` covers Hà Tĩnh, Hà Tiên, Bãi Cháy/Hạ Long, exact-first/longest matching, ambiguous aliases, contextual Cửu Long, parent province separation, duplicate/distinct coordinates, canonical classifier outcomes, focus metadata independence, coordinate order conversion, legacy type rejection, and validator failures.

`test_geo_contract_stage4b.py` verifies that synthetic root and collection nodes remain `nationwide` without local operational geometry.

## Commands and results

The bundled workspace Python runtime was used because `C:\Windows\System32\python` is an empty execution alias on this machine.

Focused tests:

```powershell
python.exe -B -X utf8 crawData\stage4_assemble\test_geo_contract.py
python.exe -B -X utf8 crawData\stage4b_curate_tree\test_geo_contract_stage4b.py
```

Result: PASS for both focused suites.

All existing relevant test scripts also passed:

```text
test_centroid_reproducibility.py       PASS
test_lesson_index_recovery.py          PASS
test_chronology_repair.py              PASS
test_synthetic_chronology_repair.py    PASS
```

Static syntax compilation of all eight changed Python source/test files: PASS.

Actual read-only GADM construction result:

```text
provinces=63, exact aliases=133, phrase aliases=133
ha_tinh=HàTĩnh, ambiguous phrase alias ha absent
```

A read-only audit of the existing pre-B1 `core_events.jsonl` found 28 events that the new validator will require B2 to rebuild/review: 14 with duplicate operational coordinates and 14 `nationwide` events retaining operational geometry. This is an audit of the old snapshot, not a claim that its 361 rows were repaired.

`validate_stage4.py` was not executed against generated output because it writes a validation report for the pre-B1 snapshot and B1 forbids rebuilding. Its shared logic was exercised through deterministic fixtures and the read-only audit.

## Semantic review still required

- Review all 28 events flagged in the old snapshot after the B2 candidate rebuild.
- Confirm that duplicate-coordinate names represent the same target; the pipeline preserves names but selects one representative marker.
- Review every changed `mixed` event to confirm its polygon came from an independent region mention.
- Review event-scoped overrides, especially Kowloon/Hong Kong.
- Inspect Stage 4B merge groups whose members have different `mapData`; B1 did not redesign merge semantics.

## Phase B1 scope confirmation

- `core_events.jsonl` was not modified or rebuilt.
- Cached indexes and Stage 2 artifacts were not modified.
- No network, LLM, Gemini, geocoder, or crawl call was made.
- No database was accessed or written.
- Backend, frontend, importer, GeoJSON, Cesium, terrain, migrations, dependencies, and thesis DOCX were not modified.
- No Stage 4A or Stage 4B dataset build command was run.

## Recommendation for Phase B2

1. Create a release-input manifest with SHA-256 for reviewed Stage 3, index inputs/cache, GADM, configs, and the B1 commit.
2. Rebuild indexes and Stage 4A into an isolated candidate location, not over accepted output.
3. Run Stage 4B from that same candidate input set.
4. Produce an event-ID keyed semantic before/after diff with `mapData` separated from non-geography content.
5. Require zero validator errors before promotion; review the 28 known invalid events and every merge group with differing geography.
6. Promote only the reviewed candidate. Do not use the full JSONL as the source of truth for historical narrative or synchronize it wholesale to the database.

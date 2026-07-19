# Post-review + external media runbook

Ví dụ PowerShell, giả sử package được giải nén tại `$PKG` và repo tại current directory.

```powershell
$STAGE5 = "crawData/stage5_media_enrich"
$CORE = "crawData/stage4b_curate_tree/output/phase2/core_events.jsonl"
$PKG = "<PATH_TO_PACKAGE>/stage5_external_media_enrichment"
$WEBROOT = "$STAGE5/external_event_images"
```

## 0. Copy integration tools vào Stage5

```powershell
Copy-Item "$PKG/activate_full_rereview.py" "$STAGE5/activate_full_rereview.py"
Copy-Item "$PKG/prepare_external_event_media.py" "$STAGE5/prepare_external_event_media.py"
Copy-Item "$PKG/discover_trusted_verification_sources.py" "$STAGE5/discover_trusted_verification_sources.py"
Copy-Item "$PKG/download_external_event_images.py" "$STAGE5/download_external_event_images.py"
Copy-Item "$PKG/review_external_event_media.py" "$STAGE5/review_external_event_media.py"
Copy-Item "$PKG/validate_external_event_media.py" "$STAGE5/validate_external_event_media.py"
Copy-Item "$PKG/finalize_external_event_media.py" "$STAGE5/finalize_external_event_media.py"
Copy-Item "$PKG/publish_approved_media_v2.py" "$STAGE5/publish_approved_media_v2.py"
```

## 1. Activate full re-review base — dry-run first

```powershell
python -X utf8 "$STAGE5/activate_full_rereview.py" `
  --reviewed-mappings "$PKG/reviewed_base/approved_event_image_mappings_reviewed.json" `
  --approved-mappings "$STAGE5/config/approved_event_image_mappings.json" `
  --candidates "$STAGE5/output/image_event_candidates.jsonl" `
  --core-events "$CORE" `
  --validator "$STAGE5/validate_approved_mappings.py" `
  --preview-output "$STAGE5/output/full_rereview_activation_preview.json"
```

Expected validated base:

```text
approvedImages = 121
relationships = 175
targetEvents = 103
thumbnails = 103
```

Sau khi inspect preview:

```powershell
python -X utf8 "$STAGE5/activate_full_rereview.py" `
  --reviewed-mappings "$PKG/reviewed_base/approved_event_image_mappings_reviewed.json" `
  --approved-mappings "$STAGE5/config/approved_event_image_mappings.json" `
  --candidates "$STAGE5/output/image_event_candidates.jsonl" `
  --core-events "$CORE" `
  --validator "$STAGE5/validate_approved_mappings.py" `
  --preview-output "$STAGE5/output/full_rereview_activation_preview.json" `
  --apply
```

## 2. Recompute exact missing-event plan

```powershell
python -X utf8 "$STAGE5/prepare_external_event_media.py" `
  --core-events "$CORE" `
  --reviewed-mappings "$STAGE5/config/approved_event_image_mappings.json" `
  --output "$STAGE5/output/event_source_plan.json" `
  --by-event-root "$WEBROOT/by_event"
```

Expected:

```text
coreEvents = 361
covered = 103
missing = 258
required image assignments = 516
```

## 3. Discover trusted historical verification pages

```powershell
python -X utf8 "$STAGE5/discover_trusted_verification_sources.py" `
  --plan "$STAGE5/output/event_source_plan.json" `
  --output "$STAGE5/output/authoritative_verification_sources.json"
```

Events without a trusted result must remain unresolved or receive a manual exact source override.

## 4. Download two candidates per missing event

```powershell
python -X utf8 "$STAGE5/download_external_event_images.py" `
  --plan "$STAGE5/output/event_source_plan.json" `
  --verification-manifest "$STAGE5/output/authoritative_verification_sources.json" `
  --overrides "$STAGE5/config/source_overrides.json" `
  --output-root "$WEBROOT"
```

Expected folder form:

```text
$WEBROOT/by_event/<eventId>/image_01.<ext>
$WEBROOT/by_event/<eventId>/image_02.<ext>
```

The script returns non-zero if some events remain unresolved. That is a review signal, not permission to use generic images.

## 5. Open local review UI

```powershell
python -X utf8 "$STAGE5/review_external_event_media.py" `
  --media-root "$WEBROOT" `
  --port 8788
```

Open:

```text
http://127.0.0.1:8788
```

Approve only when both slots have:

- correct image/event relation
- `direct` or `strong_contextual`
- trusted historical verification URL

## 6. Validate all external reviews

```powershell
python -X utf8 "$STAGE5/validate_external_event_media.py" `
  --plan "$STAGE5/output/event_source_plan.json" `
  --manifest "$WEBROOT/external_event_image_manifest.json" `
  --decisions "$WEBROOT/external_event_media_review_decisions.json" `
  --media-root "$WEBROOT" `
  --require-all-reviewed
```

## 7. Finalize external + combined preview

```powershell
python -X utf8 "$STAGE5/finalize_external_event_media.py" `
  --manifest "$WEBROOT/external_event_image_manifest.json" `
  --decisions "$WEBROOT/external_event_media_review_decisions.json" `
  --base-reviewed-mappings "$STAGE5/config/approved_event_image_mappings.json" `
  --base-candidates "$STAGE5/output/image_event_candidates.jsonl" `
  --package-root "$WEBROOT" `
  --output-dir "$STAGE5/output/external_media_finalized"
```

Produces:

```text
approved_external_event_image_mappings.json
approved_event_image_mappings_combined_preview.json
external_event_image_candidates.jsonl
combined_image_candidates.jsonl
external_media_finalize_report.json
```

## 8. Validate combined preview with existing validator

```powershell
python -X utf8 "$STAGE5/validate_approved_mappings.py" `
  --approved-mappings "$STAGE5/output/external_media_finalized/approved_event_image_mappings_combined_preview.json" `
  --candidates "$STAGE5/output/external_media_finalized/combined_image_candidates.jsonl" `
  --core-events "$CORE"
```

## 9. Run tests before any publish

```powershell
python -m unittest discover -s "$PKG/tests" -p "test_*.py" -v
python -m py_compile `
  "$STAGE5/activate_full_rereview.py" `
  "$STAGE5/prepare_external_event_media.py" `
  "$STAGE5/discover_trusted_verification_sources.py" `
  "$STAGE5/download_external_event_images.py" `
  "$STAGE5/review_external_event_media.py" `
  "$STAGE5/validate_external_event_media.py" `
  "$STAGE5/finalize_external_event_media.py" `
  "$STAGE5/publish_approved_media_v2.py"
```

## 10. Explicit integration of combined config

Only after inspection:

- replace/copy combined approved preview into live approved config
- replace/copy combined candidates into the candidate path consumed by publisher
- keep backups
- run validator again

## 11. Publish with v2 publisher

Use `publish_approved_media_v2.py`, because the old publisher intentionally rejects non-thumbnail relationships while both the full re-review and new external phase contain gallery relationships.

Then run existing:

```powershell
python -X utf8 "$STAGE5/verify_media_pipeline.py"
```

Only after zero errors continue to DB/API/UI checks.

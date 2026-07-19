# Manual external package download guide

This queue came from `stage5_manual_external_images_stabilized_v2.zip`.
No image binaries were extracted or downloaded by this activation step.

For each non-blocked slot:
1. Open the asset page in a browser.
2. Choose a concrete reusable image file page.
3. Verify license, attribution, and historical relevance.
4. Save the binary manually into the event folder as `image_01.<ext>` or `image_02.<ext>`.
5. Run the ingest command after a batch is downloaded.

Blocked rows must not be approved until their gate is resolved.

```powershell
python -X utf8 crawData/stage5_media_enrich/ingest_manual_external_images.py --resume
```

## Counts
- awaiting_manual_document_source: 10
- awaiting_manual_download: 452
- awaiting_manual_download_candidate_independence_review: 10
- awaiting_manual_download_scoped: 16
- blocked_data_issue: 12
- blocked_needs_direct_source: 16

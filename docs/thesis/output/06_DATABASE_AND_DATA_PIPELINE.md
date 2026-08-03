# 06 — Database and data pipeline

Static schema evidence contains 37 Flyway migrations (V1–V37) and 54 table names. Live MySQL statistics are intentionally unavailable (`DB_LIVE_UNVERIFIED`).

## Migration inventory

| V | File | Purpose | Tables (parser output) | Evidence |
| --- | --- | --- | --- | --- |
| 1 | V1__users_roles.sql | users roles | roles, user_roles, users | backend/src/main/resources/db/migration/V1__users_roles.sql:1 |
| 2 | V2__events_core.sql | events core | historical_events | backend/src/main/resources/db/migration/V2__events_core.sql:1 |
| 3 | V3__event_support_tables.sql | event support tables | event_grades, event_media, event_relations, event_textbook_refs | backend/src/main/resources/db/migration/V3__event_support_tables.sql:1 |
| 4 | V4__import_traceability.sql | import traceability | data_import_runs, import_run_events | backend/src/main/resources/db/migration/V4__import_traceability.sql:1 |
| 5 | V5__progress.sql | progress | event_view_logs, learning_progress | backend/src/main/resources/db/migration/V5__progress.sql:1 |
| 6 | V6__quiz_exam_attempts.sql | quiz exam attempts | exam_answers, exam_attempts, quiz_answers, quiz_attempts | backend/src/main/resources/db/migration/V6__quiz_exam_attempts.sql:1 |
| 7 | V7__ai_tts_admin_optional.sql | ai tts admin optional | admin_audit_logs, event_provinces, rag_index_status, tts_requests | backend/src/main/resources/db/migration/V7__ai_tts_admin_optional.sql:1 |
| 8 | V8__fix_learning_progress_scope_id.sql | fix learning progress scope id | learning_progress | backend/src/main/resources/db/migration/V8__fix_learning_progress_scope_id.sql:1 |
| 9 | V9__auth_hardening.sql | auth hardening | auth_email_tokens, users | backend/src/main/resources/db/migration/V9__auth_hardening.sql:1 |
| 10 | V10__social_auth.sql | social auth | user_social_providers, users | backend/src/main/resources/db/migration/V10__social_auth.sql:1 |
| 11 | V11__add_deleted_status.sql | add deleted status | users | backend/src/main/resources/db/migration/V11__add_deleted_status.sql:1 |
| 12 | V12__nullable_event_chronology.sql | nullable event chronology | historical_events | backend/src/main/resources/db/migration/V12__nullable_event_chronology.sql:1 |
| 13 | V13__exam_v2_attempts.sql | exam v2 attempts | exam_v2_attempts | backend/src/main/resources/db/migration/V13__exam_v2_attempts.sql:1 |
| 14 | V14__nullable_event_chronology_remote_bridge.sql | nullable event chronology remote bridge | historical_events | backend/src/main/resources/db/migration/V14__nullable_event_chronology_remote_bridge.sql:1 |
| 15 | V15__add_event_relation_association_type.sql | add event relation association type | event_relations | backend/src/main/resources/db/migration/V15__add_event_relation_association_type.sql:1 |
| 16 | V16__import_event_associations.sql | import event associations | association_type, event_relation_seed, event_relations, historical_events | backend/src/main/resources/db/migration/V16__import_event_associations.sql:1 |
| 17 | V17__create_tts_audio_assets.sql | create tts audio assets | tts_audio_assets | backend/src/main/resources/db/migration/V17__create_tts_audio_assets.sql:1 |
| 18 | V18__extend_tts_audio_assets_for_worker.sql | extend tts audio assets for worker | tts_audio_assets | backend/src/main/resources/db/migration/V18__extend_tts_audio_assets_for_worker.sql:1 |
| 19 | V19__create_tts_audio_chunk_cache.sql | create tts audio chunk cache | tts_audio_asset_chunks, tts_audio_chunks | backend/src/main/resources/db/migration/V19__create_tts_audio_chunk_cache.sql:1 |
| 20 | V20__add_event_key_facts.sql | add event key facts | historical_events | backend/src/main/resources/db/migration/V20__add_event_key_facts.sql:1 |
| 21 | V21__extend_event_textbook_refs.sql | extend event textbook refs | event_textbook_refs | backend/src/main/resources/db/migration/V21__extend_event_textbook_refs.sql:1 |
| 22 | V22__rename_textbook_ref_content.sql | rename textbook ref content | event_textbook_refs | backend/src/main/resources/db/migration/V22__rename_textbook_ref_content.sql:1 |
| 23 | V23__create_event_textbook_contents.sql | create event textbook contents | event_textbook_contents | backend/src/main/resources/db/migration/V23__create_event_textbook_contents.sql:1 |
| 24 | V24__add_textbook_page_mapping_fields.sql | add textbook page mapping fields | event_textbook_refs | backend/src/main/resources/db/migration/V24__add_textbook_page_mapping_fields.sql:1 |
| 25 | V25__create_source_catalog.sql | create source catalog | source_catalog | backend/src/main/resources/db/migration/V25__create_source_catalog.sql:1 |
| 26 | V26__create_event_source_relations.sql | create event source relations | event_external_sources, event_research_sources, event_textbook_content_refs | backend/src/main/resources/db/migration/V26__create_event_source_relations.sql:1 |
| 27 | V27__create_history_rag_import_audit.sql | create history rag import audit | history_rag_import_changes | backend/src/main/resources/db/migration/V27__create_history_rag_import_audit.sql:1 |
| 28 | V28__add_history_rag_indexes.sql | add history rag indexes |  | backend/src/main/resources/db/migration/V28__add_history_rag_indexes.sql:1 |
| 29 | V29__drop_legacy_event_textbook_ref_content.sql | drop legacy event textbook ref content | event_textbook_refs | backend/src/main/resources/db/migration/V29__drop_legacy_event_textbook_ref_content.sql:1 |
| 30 | V30__add_textbook_ref_detail_visibility.sql | add textbook ref detail visibility | event_textbook_refs | backend/src/main/resources/db/migration/V30__add_textbook_ref_detail_visibility.sql:1 |
| 31 | V31__versioned_exam_question_bank.sql | versioned exam question bank | exam_datasets, exam_definitions, exam_import_runs, exam_mcq_options, exam_question_sources, exam_question_topics, exam_questions, exam_runtime_state, exam_sections, exam_tf_stateme | backend/src/main/resources/db/migration/V31__versioned_exam_question_bank.sql:1 |
| 32 | V32__exam_sessions_and_submission_receipts.sql | exam sessions and submission receipts | exam_session_questions, exam_sessions, exam_submission_receipts | backend/src/main/resources/db/migration/V32__exam_sessions_and_submission_receipts.sql:1 |
| 33 | V33__exam_v2_attempt_snapshot_authority.sql | exam v2 attempt snapshot authority | exam_v2_attempts | backend/src/main/resources/db/migration/V33__exam_v2_attempt_snapshot_authority.sql:1 |
| 34 | V34__expand_event_geo_type_enum.sql | expand event geo type enum | historical_events | backend/src/main/resources/db/migration/V34__expand_event_geo_type_enum.sql:1 |
| 35 | V35__ai_question_review_workflow.sql | ai question review workflow | ai_generation_receipts, ai_question_candidate_audit_events, ai_question_candidate_options, ai_question_candidate_sources, ai_question_candidates | backend/src/main/resources/db/migration/V35__ai_question_review_workflow.sql:1 |
| 36 | V36__ai_candidate_security_provenance_retention.sql | ai candidate security provenance retention | ai_candidate_provenance_validations, ai_generation_receipts, ai_question_candidate_audit_events, ai_question_candidates, roles | backend/src/main/resources/db/migration/V36__ai_candidate_security_provenance_retention.sql:1 |
| 37 | V37__ai_question_revision_workflow.sql | ai question revision workflow | ai_candidate_provenance_validations, ai_question_candidate_audit_events, ai_question_candidate_options, ai_question_candidates, ai_question_official_revisions, ai_question_revision | backend/src/main/resources/db/migration/V37__ai_question_revision_workflow.sql:1 |

## Table dictionary

`admin_audit_logs`, `ai_candidate_provenance_validations`, `ai_generation_receipts`, `ai_question_candidate_audit_events`, `ai_question_candidate_options`, `ai_question_candidate_sources`, `ai_question_candidates`, `ai_question_official_revisions`, `ai_question_revision_heads`, `auth_email_tokens`, `data_import_runs`, `event_external_sources`, `event_grades`, `event_media`, `event_provinces`, `event_relations`, `event_research_sources`, `event_textbook_content_refs`, `event_textbook_contents`, `event_textbook_refs`, `event_view_logs`, `exam_answers`, `exam_attempts`, `exam_datasets`, `exam_definitions`, `exam_import_runs`, `exam_mcq_options`, `exam_question_sources`, `exam_question_topics`, `exam_questions`, `exam_runtime_state`, `exam_sections`, `exam_session_questions`, `exam_sessions`, `exam_submission_receipts`, `exam_tf_statements`, `exam_topics`, `exam_v2_attempts`, `historical_events`, `history_rag_import_changes`, `import_run_events`, `learning_progress`, `quiz_answers`, `quiz_attempts`, `rag_index_status`, `roles`, `source_catalog`, `tts_audio_asset_chunks`, `tts_audio_assets`, `tts_audio_chunks`, `tts_requests`, `user_roles`, `user_social_providers`, `users`

## Canonical dataset

| Metric | Value |
| --- | --- |
| JSONL | crawData/stage4b_curate_tree/output/phase2/core_events.jsonl |
| SHA-256 | 4674284bed8be87e01045df88db90b8c4898fe0cc8a1c63baaaae5d1a3c1f1f9 |
| Records | 361 |
| Parse errors | 0 |
| Grades | {"10": 57, "11": 125, "12": 177} |
| Geo types | {"mixed": 107, "multi_point": 4, "multi_polygon": 2, "nationwide": 56, "no_location": 169, "point": 23} |
| Source policy | {"derived": 15, "textbook": 346} |
| Hierarchy levels | {"0": 9, "1": 228, "2": 119, "3": 5} |

The terrain audit is read-only: 361/361 records have valid mapData and geoType, 380/380 GADM references resolve to MultiPolygon features, and terrain eligibility is conditional at 136/361 (37.67%). Nationwide (56) and no_location (169) records are rejected by the target normalizer.

# Admin Phase 11 verification report

Ngày kiểm tra: 2026-07-27 (Asia/Bangkok). Baseline HEAD:
`54fe601aafa0bc1de0333b6f19b6147710e7ea16`.

## Môi trường và isolation

- Maven wrapper: Maven 3.9.12, Java 21.0.8; shell Java 25.0.2.
- Node 22.15.1, npm 10.9.2.
- Docker Engine 29.6.2, Docker Desktop 4.83.0.
- Browser E2E dùng `mysql:8.0.36`, volume disposable, internal Docker network;
  chỉ nginx frontend bind `127.0.0.1:15174`.
- AI, mail, TTS, Cloudinary, OAuth và importer bị tắt. Browser chỉ cho same-origin
  và synthetic media được fulfill local. Runner teardown volume/orphans trong
  `finally`; fixture credential sinh mới mỗi run.

Fixture user được tạo qua registration thật, sau đó SQL local disposable cập nhật
status/roles và tăng `auth_version`; mọi cookie pre-promotion bị bỏ trước khi đăng
nhập UI mới. Có hai Admin fixture độc lập.

## Baseline trước thay đổi Phase 11

| Check | Kết quả |
| --- | --- |
| Backend full | 347 tests, 0 failure, 0 error, 1 intentional skip; BUILD SUCCESS |
| Frontend full | 54 files, 260 tests, 0 failure |
| TypeScript | Pass |
| Direct Vite | Pass; 4,176 modules; main ~5,513.87 kB min/~1,413.77 kB gzip |

## Evidence Phase 11

| Check | Kết quả cuối |
| --- | --- |
| Backend security/log focused | 46 tests, 0 failure/error/skip; BUILD SUCCESS |
| Backend MySQL/Admin focused | 56 tests, 0 failure/error/skip; BUILD SUCCESS |
| Backend full | 354 tests, 0 failure, 0 error, 1 intentional `AiSpringFastApiSmokeTest` skip; BUILD SUCCESS; exit 0; 22:12 |
| Frontend Admin/auth focused | 6 files, 32 tests, 0 failure |
| Frontend full | 56 files, 266 tests, 0 failure |
| Browser E2E full | 12 tests, 12 pass, Chromium, 1 worker, 0 retry; 1.4 phút Playwright |
| TypeScript | `npx.cmd tsc --noEmit`: pass |
| Scoped ESLint | Pass, không warning |
| Direct Vite build | Pass; 4,176 modules; 1m44s; main ~5,472.18 kB min/~1,408.59 kB gzip; còn chunk-size warning |

Evidence bổ sung:

- `CsrfSecurityTest`: 11/11 pass, gồm regression giữ CSRF cookie qua authenticated GET.
- MySQL/Flyway V1–V39 chạy thành công trên schema Testcontainers disposable; không
  migration nào bị sửa.
- Browser E2E xác nhận deny anonymous/student/teacher, cookie-only auth, CSRF,
  credential invalidation, Dashboard, optimistic conflict, event lifecycle,
  user lifecycle và accessibility assertions.
- Final runner dùng các probe không đổi với `retries: 48` cho MySQL disposable
  và backend sau khi Docker khởi tạo lạnh. Runner không có `--wait-timeout`;
  Flyway hoàn tất trong 5m53s và backend khởi động trong 390.646s, nằm trong
  cửa sổ health tám phút.
- Sau full Maven suite, không còn test-owned Java process hoặc Testcontainer chạy.
- Full Vitest lần đầu phát hiện Playwright specs trong `e2e/` bị Vitest thu thập
  nhầm. Test include được giới hạn về `src/**`; lần chạy cuối đạt 56 files/265 tests.

## E2E matrix

| Spec | Phạm vi |
| --- | --- |
| `authentication-security.spec.ts` | deny roles, login/logout, cookie/CSRF, Bearer/storage, credential invalidation |
| `event-lifecycle.spec.ts` | draft, core/grade, media/thumbnail/order, point geography, publication/archive/restore |
| `event-conflict.spec.ts` | hai context, stale version, explicit destructive reload |
| `user-lifecycle.spec.ts` | typed states/roles, replace roles, disable/reactivate, self controls |
| `dashboard-accessibility.spec.ts` | aggregate/retry/metrics, viewports, axe, focus/reflow/media preferences |

Trace/screenshot chỉ sinh khi failure, được coi là nhạy cảm và CI giữ tối đa hai
ngày. Không có artifact nào được đưa vào tài liệu này.

## Manual accessibility checklist

| Hạng mục | Trạng thái |
| --- | --- |
| Dialog/sidebar focus move, trap, Escape, restore, inert | Verified bằng component + Chromium E2E |
| Form label/error/help/live-region và table semantics | Verified bằng Vitest/axe |
| 360×800, 768×1024, 1440×900 | Verified bằng Chromium E2E |
| Reflow tương đương 200%, reduced-motion, forced-colors | Verified bằng targeted emulation |
| NVDA/VoiceOver và keyboard-only trên deployment production | Pending manual |
| Browser UI zoom 200% và high-contrast OS thật | Pending manual |

Không tuyên bố chứng nhận WCAG AA; chỉ báo cáo phạm vi đã test.

## Flyway V1–V39 baseline SHA-256

Manifest được tính read-only từ các migration tại baseline HEAD và được giữ để
đối chiếu release artifact. Full Maven suite đồng thời xác nhận Flyway apply đủ
39 migration, không có failed row.

```text
af6ea6243345e681bf71f84c9afd30671ecb6690f62551b72598691ad08cdbf4  V1__users_roles.sql
4bdf62a4c64e6c61520ac69bb72b12b98ebd7f34a39aba12edc8f7bc207d06dc  V2__events_core.sql
3e4c31f4884f8ccc795d3f86163a93532a1c33f65e0a277a1bd3087eb8ec4615  V3__event_support_tables.sql
173c29833ce5a6912c3e90a8653eaffa954157601082fe9c8ae316250a57a411  V4__import_traceability.sql
8c9e5884f8e3bcd532abb76e2b849a0b7ab8abd92e4aead783239cc2de9212d4  V5__progress.sql
343f5cedd41ba4d2b5a73b98c871f5070571d353cdad662525bddcc69f2e9ca7  V6__quiz_exam_attempts.sql
3d8cf091103844bf4371df1e12d9a4a3dec81af8f54f0d1481e954f396bec7b2  V7__ai_tts_admin_optional.sql
01a41284a239317f200c3571562ee8e7fe107f4c9432164c9ca8c2a74656bc29  V8__fix_learning_progress_scope_id.sql
c692b73d7f66f39d214d9c4e34cd5097d1075eb830a56289e49fd0c8393c83bc  V9__auth_hardening.sql
fa53d5cd3d675cfff72eccf50720b90eb77db248353f837a35d01321beff0ce1  V10__social_auth.sql
1701d26b46d1fb187cab41f4c72228429048e0bfff7082b1bf4b42202962d6a7  V11__add_deleted_status.sql
e7a103a13a1cc59dac92adb44eb8002df3ed66fb6562b1305384b3a063ca33e4  V12__nullable_event_chronology.sql
959f66b31f26bb89be0d018729f665f2c150da75b53dd70a83aae620fa140e8d  V13__exam_v2_attempts.sql
ecddb3eee7f2ee7826808654c5833d15f9801dac918d01197a45eee38be9c0de  V14__nullable_event_chronology_remote_bridge.sql
e4382d1329ef3792b059405d204d1f78a5daa21d50dd7f95b4b8abd5e8db5735  V15__add_event_relation_association_type.sql
c0c46b5b8cbb40d4fcf4aed633f3b682f2d42cdfe78cdd6a6cbbff51293430b7  V16__import_event_associations.sql
0f36c13875ded70c5a0823ea43ef4446bbd755fc3e7e495e87c60464bc5bc84d  V17__create_tts_audio_assets.sql
3f0c8ca46d31fd3a4e4e0023e7e720cb84d70cf1ba7cede171f2c2f0c7863fba  V18__extend_tts_audio_assets_for_worker.sql
0ae5e593d5a9e883a6a9d199156bf7e646a0a8f60d136544b5b79354d1061374  V19__create_tts_audio_chunk_cache.sql
66e7b81166ec7dd072b003a079131e709061664b5d06399b406c4f0a644adb6c  V20__add_event_key_facts.sql
033dc759a49a4357fae5365bf81354ea3a1e26d41216ba1e4e99dd2097075919  V21__extend_event_textbook_refs.sql
5dc1b33aa762fdf22d06aaea170cef30399e0e314458ba852144339e924a12f5  V22__rename_textbook_ref_content.sql
1f5c556860fdc3194c9acf00c92c57e270a499ecbbe35933d7b3c7f62faf4204  V23__create_event_textbook_contents.sql
8a6b17c28f1f700bc4f3610c46ee530a4b893a94aa4e504e810731ec75e9d603  V24__add_textbook_page_mapping_fields.sql
e505243c500d82354191a9f80053353f33600483371ab9a87da7efbae966d8cf  V25__create_source_catalog.sql
6bfef10ed4dd50692710bd8eca0e30bcd76b5c48a8716276f12732a3e365c730  V26__create_event_source_relations.sql
0e89f17474c26c79a377ea43a402aee60c27e95a36954f474467d33a2be3ad7d  V27__create_history_rag_import_audit.sql
3e59ba0ae8be2182096a7ba31f01b6706f8f2332ead396f0b5fd1e99361b8f62  V28__add_history_rag_indexes.sql
7116e910f777c3aa92ac089955d252f77560712ad13b053448578e136b57d004  V29__drop_legacy_event_textbook_ref_content.sql
352db0a7b27e58aad3ecf2342372580f8a90fa0653674e4e9cf5983d7d947e58  V30__add_textbook_ref_detail_visibility.sql
6624e6cc4aa68b7230cbe2ac7083422b215885b58339ab670be701633fd9e91e  V31__versioned_exam_question_bank.sql
35e3fbbe630bd20c0cd603c787107b3388ef0a6e3031bc0b18364ee8aa975a62  V32__exam_sessions_and_submission_receipts.sql
2bb0b1ba99e71b586268708e3ff71dbacef1598962ff4359f3a9c62690fa5a12  V33__exam_v2_attempt_snapshot_authority.sql
f5bc2f00cf2562b0e06c97bc65903be69e13ddc00cb41c7b096a087c79682700  V34__expand_event_geo_type_enum.sql
fd4f84f4351fc378883014850730fcb0f58f4250ed21d9c2a8d259c3e5ef21b4  V35__ai_question_review_workflow.sql
8411cf04f23d61dc9dd938362ffc0ab68905a60ce08e1e7da686f1dca2d8c25d  V36__ai_candidate_security_provenance_retention.sql
cf2f77bd3d6045cc8cb79d8c6056deeca99565fd73c0e761e6224031ae5c9424  V37__ai_question_revision_workflow.sql
563952a4d51dbc385329f370dd25b7e338922c141116c4aa180c4587f14556f8  V38__increase_event_updated_at_precision.sql
3e3dfbd12897e12a088dd547070f4654dfe16059b246c3742dad01b9bdbd6e55  V39__add_user_mutation_versions.sql
```

# Admin API and authorization

Mọi endpoint dưới đây có URL rule `ROLE_admin` và facade method security tương
ứng. Anonymous nhận 401; student/teacher nhận 403 trước khi facade/repository được
gọi. Unsafe methods cần cookie CSRF + configured header, nếu thiếu/sai trả
`CSRF_TOKEN_INVALID` trước controller.

## Dashboard và read models

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/api/admin/dashboard` | Aggregate metrics + attention + audit; initial SPA load duy nhất |
| GET | `/api/admin/dashboard/metrics` | Retry riêng metrics |
| GET | `/api/admin/dashboard/attention` | Retry riêng attention, tối đa 10 |
| GET | `/api/admin/dashboard/audit` | Retry riêng bounded audit summaries |
| GET | `/api/admin/events` | Typed page; filter/search/sort allowlist |
| GET | `/api/admin/events/{id}` | Typed aggregate detail, sanitized mapData |
| GET | `/api/admin/users` | Typed page, multi-role semantics |
| GET | `/api/admin/users/{uuid}` | Typed safe account/learning/activity/audit detail |

Event list hỗ trợ `q`, `status`, `eventLevel`, `eventType`, `grade`, `geoType`,
`chronology`, `startYearFrom`, `startYearTo`, `missingThumbnail`, `missingMedia`,
`missingMapData`, `sortBy`, `sortDir`, `limit`, `offset`. User list hỗ trợ `q`,
`role`, `status`, `verified`, `sortBy`, `sortDir`, `limit`, `offset`. Fragment sort
được allowlist; values được parameterize. Invalid filter/sort/page trả stable 400.

## Typed mutations

| Method | Path | Ghi chú |
| --- | --- | --- |
| POST | `/api/admin/events` | Tạo draft core + grades |
| PATCH | `/api/admin/events/{id}/core` | Patch core allowlist |
| PUT | `/api/admin/events/{id}/grades` | Replace grades |
| POST/PATCH/DELETE | `/api/admin/events/{id}/media[/{mediaId}]` | Metadata URL HTTP(S), không upload storage |
| PUT | `/api/admin/events/{id}/media/order` | Full ID permutation; thumbnail luôn pin đầu |
| PUT | `/api/admin/events/{id}/thumbnail/{mediaId}` | Active safe image only |
| PATCH | `/api/admin/events/{id}/geography` | Một trong sáu canonical typed payload |
| PATCH | `/api/admin/events/{id}/publication` | `publish|unpublish|archive|restore` |
| PUT | `/api/admin/users/{uuid}/roles` | Replace `admin|teacher|student` set |
| PATCH | `/api/admin/users/{uuid}/status` | `active|pending|disabled` transition |

Mutation dùng `expectedUpdatedAt` opaque sáu-digit string; media DELETE dùng
`X-Event-Version`. Conflict/no-op/invariant trả stable 409. Self mutation, last
active Admin, deleted immutable user và unsupported stored role đều được chặn.

## Quarantine endpoints

Các endpoint sau authorize trước, luôn trả 409 ổn định và không gọi legacy
mutation service:

| Method/path | Code |
| --- | --- |
| `PUT /api/admin/events/{id}` | `ADMIN_EVENT_UPDATE_DISABLED` |
| `PATCH /api/admin/events/{id}/status` | `ADMIN_EVENT_STATUS_DISABLED` |
| `DELETE /api/admin/events/{id}` | `EVENT_HARD_DELETE_DISABLED` |
| `PATCH /api/admin/users/{id}/role` | `ADMIN_USER_ROLE_ENDPOINT_RETIRED` |
| `DELETE /api/admin/users/{id}` | `ADMIN_USER_DELETE_DISABLED` |

## Cookie, CSRF và CORS

- `access_token`: HttpOnly, path `/`, 1 giờ.
- `refresh_token`: HttpOnly, path `/api/auth/refresh`, 7 ngày.
- `CSRF-TOKEN`: HttpOnly, path `/`; token được trả trong JSON bởi
  `GET /api/auth/csrf` với `Cache-Control: no-store`.
- Production dùng `Secure`; `SameSite=None` với `Secure=false` fail-fast.
- CORS credentialed chỉ nhận explicit origins; wildcard bị từ chối và
  `Authorization` không nằm trong browser allowed headers.
- Refresh là cookie-only POST không body token. Bearer application auth bị bỏ.

Facebook `accessToken` và Cloudinary Basic `Authorization` còn xuất hiện ở các
integration riêng của nhà cung cấp; chúng không phải compatibility path cho JWT
ứng dụng và không được dùng bởi Admin E2E.

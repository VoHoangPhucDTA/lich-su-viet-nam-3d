# Release scope

## Immutable identity

- release ID: `CONTROLLED_RELEASE_F_GEO_1287`;
- event ID: `khang-chien-chong-quan-nguyen-1287-1288`;
- canonical SHA-256: `7b2b2f4d391614020c5a1362006ee01847332c2a5b6fae033dc0ac605e0e58f0`;
- reviewed plan SHA-256: `4f406ab21890544fa1b351551e000f408f6c484308fa1c5f16f6da0c6a0ad98e`;
- maximum affected rows: `1`;
- production identity: TiDB target `main`, database `lichsuvn`, Flyway V42,
  plus the complete reviewed database fingerprint in the contract source.

## Authorized storage fields

- `historical_events.geo_type`;
- `historical_events.lat`;
- `historical_events.lng`;
- `historical_events.province_names`;
- `historical_events.historical_locations`;
- `historical_events.raw_json.mapData` (including semantic `marker` and `markers`);
- `historical_events.raw_json.display.showOnMap`.

`updated_at` may advance only as server-maintained version metadata caused by
the one bounded update. It is a guard, not an operator-controlled payload.

Everything else is forbidden, including titles, narratives, summaries,
descriptions, categories, dates, hierarchy, images, citations, RAG/textbook
data, views, user data, and any other event or table. The full non-geography
portion of `raw_json` must preserve its reviewed SHA-256.

## Expected semantic change

`no_location`, zero markers, and `showOnMap=false` become `multi_point`, the
four reviewed markers Bạch Đằng, Cửa Lục, Thăng Long, Vân Đồn, and
`showOnMap=true`. Coordinates and ordering are immutable in `REVIEWED_PLAN.json`.

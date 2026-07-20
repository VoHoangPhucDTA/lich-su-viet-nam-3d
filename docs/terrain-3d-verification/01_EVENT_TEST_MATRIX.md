# Ma trận event đại diện

Nguồn: `crawData/stage4b_curate_tree/output/phase2/core_events.jsonl`; đối chiếu với audit read-only tại `docs/terrain-3d-audit/`.

| Geo type | ID / slug | Lớp | Point targets | Region targets | Kết quả dữ liệu | Runtime WebGL |
|---|---|---:|---:|---:|---|---|
| `point` | `nha-minh-xam-luoc-dai-ngu` | 11 | 1 | 0 | PASS | BLOCKED |
| `multi_point` | `viet-nam-danh-chiem-nua-phia-dong-hoang-sa` | 11 | 2 | 0 | PASS | BLOCKED |
| `multi_polygon` | `van-hoa-tien-oc-eo` | 10 | 0 | 19 | PASS | BLOCKED |
| `mixed` | `van-hoa-sa-huynh` | 10 | 2 | 2 | PASS | BLOCKED |
| `nationwide` | `viet-nam-thoi-dung-nuoc` | Chưa gán | 0 | 0 | PASS — không eligible | BLOCKED |
| `no_location` | `phu-nam-tro-thanh-vuong-quoc-hung-manh` | 10 | 0 | 0 | PASS — không eligible | BLOCKED |

Số target là kết quả áp dụng quy tắc normalization hiện tại, gồm loại primary marker mirror trong `mixed`. Audit toàn bộ canonical source ghi nhận 361/361 record parse được, 136/136 event thuộc bốn type hỗ trợ là eligible và 380/380 GADM refs resolve bằng exact `GID_1`.

`Runtime WebGL = BLOCKED` vì frontend không có event API local an toàn và không có Cesium Ion token; bảng không tuyên bố camera/provider/polygon runtime đã PASS.

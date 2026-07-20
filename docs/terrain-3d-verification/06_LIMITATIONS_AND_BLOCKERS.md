# Limitations và blockers

## Blockers

1. `BLOCKED_BY_MISSING_CESIUM_TOKEN`: không có `frontend/.env.local`; World Terrain, elevation thật, quota/origin và retry provider chưa thể nghiệm thu.
2. `BLOCKED_BY_LOCAL_DATABASE`: backend dotenv trỏ datasource cloud/non-local có credentials. Backend không được khởi động và database không bị ghi.
3. `DB_LIVE_UNVERIFIED`: chưa chứng minh database detail `sourceJson.mapData` tương đồng canonical JSONL.
4. Không có fixture/mock API `/map` tương thích sẵn; browser chỉ kiểm tra được application shell.
5. Ranh giới là GADM hiện đại, không phải historical boundary.
6. Resource lifecycle 10 vòng, camera restore tolerance và WebGL performance chưa được đo.
7. Production base path/CSP/static asset hosting chưa được kiểm tra.

## Có thể dùng trong khóa luận

- Kiến trúc/state machine và implementation đã typecheck.
- 28/28 unit tests PASS; các test terrain bao phủ target normalization, reducer/session, camera snapshot/reduced motion và region geometry.
- Audit read-only: 361 records, 136 supported/eligible events, 380/380 exact GID refs resolve.
- Build production trực tiếp PASS và không sửa source/generated data.
- Responsive shell không overflow tại desktop, 375 px và 320 px.
- Security remediation: token cũ đã được loại khỏi source hiện tại và người dùng xác nhận đã revoke/rotate.

## Chưa được phép tuyên bố

- End-to-end Terrain 3D PASS.
- World Terrain/elevation thật hoạt động trên staging/production.
- Không có datasource/entity/handler/WebGL leak sau 10 vòng.
- Camera restore, polygon picking và target switching đã được nghiệm thu bằng browser runtime.
- Backend live contract và deploy CSP/base path đã được xác minh.
- Ranh giới hiển thị phản ánh chính xác địa giới lịch sử.

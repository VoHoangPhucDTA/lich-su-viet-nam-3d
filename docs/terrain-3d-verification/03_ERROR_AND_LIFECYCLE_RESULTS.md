# Error và resource lifecycle

## Error/transition evidence

| Tình huống | Trạng thái | Mức chứng cứ |
|---|---|---|
| Enter → active → exit → idle | PASS | MEASURED — reducer test |
| Enter error và deterministic exit | PASS | MEASURED — reducer test |
| Retry tạo session mới | PASS | MEASURED — reducer test |
| Callback/error session cũ bị bỏ qua | PASS | MEASURED — reducer test |
| Duplicate completion không đổi state | PASS | MEASURED — reducer test |
| Provider/geometry/overview ready theo thứ tự bất kỳ | PASS | MEASURED — reducer test |
| Invalid coordinate/array/GADM input fail-safe | PASS | MEASURED — unit tests |
| Missing token UI và retry runtime | UNVERIFIED | Không có event API local để mở popup |
| Provider network/quota failure | BLOCKED | Không có local token |
| GeoJSON HTTP failure | UNVERIFIED | Không inject network failure vào production code |
| Camera cancel/viewer destroyed giữa promise | UNVERIFIED | Chỉ kiểm tra static session/mounted guards |

## Static lifecycle observations

Source có mounted/session/provider operation guards, camera cancellation, snapshot clear, datasource removal, handler destruction và Viewer destruction. Chỉ có một vị trí khởi tạo `ScreenSpaceEventHandler`; provider/promise được cache theo Viewer lifecycle. Đây là `OBSERVED`, không phải đo resource runtime.

## Chu kỳ 10 vòng

`BLOCKED`: không thực hiện được chuỗi mở terrain → chọn target → overview → exit vì backend local bị chặn và thiếu Cesium token. Datasource count, entity count, handler count, provider reuse và snapshot clearing qua 10 vòng đều `UNVERIFIED`; không được phép tuyên bố không leak.

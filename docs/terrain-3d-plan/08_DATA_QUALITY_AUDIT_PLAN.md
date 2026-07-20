# Kế hoạch kiểm toán chất lượng dữ liệu

## Mục tiêu và nguyên tắc

Audit là read-only, thực hiện sau nhiệm vụ planning trên snapshot/staging được phép. Không sửa DB/JSON, không chạy importer, không gọi production API nếu chưa có phê duyệt, không log toàn raw JSON. Mỗi lỗi chỉ log event ID, loại lỗi, path ngắn và counter.

## Metrics bắt buộc

| Nhóm | Chỉ số |
|---|---|
| Quy mô | tổng event; số event theo sáu `geo_type` |
| Raw | row có `raw_json`; parse được; có `sourceJson.mapData` |
| Point | marker hợp lệ; marker lỗi/range sai; marker trùng tọa độ |
| Region | tổng region target; `gadmRef` resolve; unresolved |
| Schema | arrays lệch độ dài; thiếu label/id; duplicate target ID |
| Eligibility | event eligible sau validation; bị loại theo từng lý do |
| Coverage | terrain coverage toàn dataset; coverage theo lớp/giai đoạn nếu field hỗ trợ |
| Runtime risk | event có nhiều target; MultiPolygon parts lớn; payload malformed |

Báo cáo phải có numerator/denominator, không chỉ phần trăm; ghi snapshot date, schema/version và asset GADM version.

## Validation rules

- `geo_type` canonical/legacy được phân loại riêng; `nationwide`/`no_location` luôn không eligible.
- Point chỉ hợp lệ khi number finite và lat/lng trong range; confidence ngoài enum/unknown là warning, không crash.
- Region cần `gadmRef` hoặc name có thể resolve; exact `GID_1` trước normalized `NAME_1`.
- `markers[]`, `gadmRefs[]`, `provinceNames[]` lệch độ dài là diagnostic; không ghép ngầm các phần tử thiếu.
- Duplicate tọa độ không tự loại nếu label/ID khác; duplicate cùng stable identity phải gộp hoặc báo quyết định.
- `focusGeometry` chỉ là hint; không tính vào eligible nếu không có target.
- Raw parse lỗi hoặc thiếu mapData phải tạo reason code và fallback status.

## Output audit dự kiến

Script tương lai (chưa viết trong nhiệm vụ này) nhận input snapshot/response đã phê duyệt và xuất:

```text
terrain-audit-summary.json
terrain-audit-events.csv
terrain-audit-README.md
```

JSON chứa counters, rates, schema/version và quality-gate result. CSV chỉ chứa event ID, geo type, eligible, target counts, unresolved counts, reason codes. Không chứa narrative, media, token hay toàn bộ raw JSON.

Pseudo-flow:

```text
read-only source → parse → validate canonical/legacy
  → resolve GADM → classify diagnostics
  → aggregate counters → write JSON/CSV
```

## Quality gates đề xuất

**Gate A — an toàn parser:** 100% row được phân loại; không runtime exception; 100% coordinate được validate.

**Gate B — hiển thị:** 100% region target được render phải resolve; mọi target lỗi bị loại an toàn và có diagnostic; không có CTA active khi không còn target.

**Gate C — coverage:** công bố tỷ lệ eligible toàn dataset và theo từng `geo_type`/khối lớp; không đặt ngưỡng coverage tuyệt đối trước khi biết chất lượng nguồn. Product phải duyệt ngưỡng tối thiểu sau audit.

**Gate D — reproducibility:** report chạy lại trên cùng snapshot cho cùng counters; lưu hash/version của input và GeoJSON.

## Đưa vào phụ lục khóa luận

Lưu bảng tổng hợp sáu type, sample reason codes, unresolved GADM examples, histogram target count và coverage theo giai đoạn. Ẩn dữ liệu không cần thiết; ghi ngày audit, commit/version, command và môi trường. Phần main text chỉ nêu phương pháp và kết quả tổng quát, không dump dữ liệu sự kiện.

## Chưa thực hiện

Không chạy audit thật trong nhiệm vụ này theo giới hạn quota và planning-only. Các con số hiện có trong tài liệu cũ chỉ là evidence repository/sample, không thay thế audit DB live.

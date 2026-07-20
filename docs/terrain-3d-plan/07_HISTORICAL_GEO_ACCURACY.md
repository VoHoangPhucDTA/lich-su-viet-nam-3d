# Độ chính xác lịch sử và địa lý

## Các khái niệm không được trộn lẫn

| Khái niệm | Ý nghĩa trong module | Không được suy ra |
|---|---|---|
| Địa hình tự nhiên | Elevation hiện đại do Cesium provider biểu diễn | Địa hình năm xảy ra sự kiện |
| Ranh giới hành chính hiện đại | GADM level-1 dùng lookup, fill, click và bounds | Biên giới lịch sử |
| Không gian lịch sử | Khu vực/địa điểm được mô tả trong nguồn lịch sử | Một polygon kỹ thuật chính xác |
| Địa danh lịch sử | Nhãn có thể đổi tên/mất đi | Tự động map sang tỉnh hiện đại |
| Vị trí đại diện | Một point/centroid/hint để định vị | Tâm chính xác của toàn sự kiện |
| Khu vực diễn ra | Phạm vi khái niệm có thể gồm nhiều point/region | Một target duy nhất |

Asset hiện tại là GADM level-1, 63 feature `MultiPolygon`, có `GID_1`/`NAME_1`; runtime đang match tên, kế hoạch mới phải exact `gadmRef` trước (`frontend/public/geojson/vietnam-provinces.json:1`, `01_FRONTEND_ANALYSIS.md`).

## Chính sách hiển thị an toàn

1. Polygon GADM hiện đại chỉ dùng để định vị, highlight và tương tác.
2. Terrain hiển thị địa hình hiện đại của khu vực liên quan, không phải địa hình lịch sử.
3. Không có target thì ẩn/disable CTA; không đoán từ narrative hoặc centroid.
4. Point có confidence thấp vẫn có thể dùng làm vị trí đại diện nhưng phải gắn nhãn/chú thích, không thể hiện như tọa độ tuyệt đối.
5. Region unresolved bị loại độc lập và có diagnostic; không sửa dữ liệu để ép resolve.
6. Event ngoài lãnh thổ Việt Nam hoặc phạm vi quá rộng dùng point/overview nếu dữ liệu cho phép; nếu không, giữ 2D/no-terrain.
7. Tên tỉnh/địa giới thay đổi được lưu như limitation; không tự gán địa danh lịch sử vào địa giới hiện đại khi chưa có mapping được duyệt.

## Wording UI đề xuất

**Chú thích ngắn cạnh terrain:**

> Địa hình hiển thị theo dữ liệu hiện đại. Vùng tô màu là ranh giới hành chính hiện đại dùng để định vị, không phải ranh giới lịch sử.

**Confidence thấp:**

> Vị trí này là điểm đại diện theo dữ liệu nguồn; không nên hiểu là tọa độ chính xác tuyệt đối.

**Region unresolved:**

> Một số khu vực chưa xác định được trên bản đồ hiện tại.

**Provider/fallback:**

> Chưa tải được địa hình 3D. Bạn vẫn có thể xem bản đồ và nội dung sự kiện.

Không hiển thị các từ `GADM`, `provider`, `geometry`, `raw_json` trong UI học sinh; các thuật ngữ này chỉ dùng trong log/audit/khóa luận.

## Nội dung đầy đủ cho khóa luận

“Module dùng Cesium World Terrain để minh họa địa hình hiện đại và dùng bộ ranh giới hành chính GADM cấp 1 làm lớp tham chiếu tương tác. Hai lớp này là biểu diễn hiện đại phục vụ định vị, không phải tái dựng địa giới hoặc địa hình tại thời điểm lịch sử. Các tọa độ point có thể là vị trí đại diện; độ tin cậy, phạm vi sự kiện, thay đổi địa danh và các target không resolve được được báo cáo như giới hạn dữ liệu.”

## Ma trận rủi ro và giảm thiểu

| Rủi ro | Giảm thiểu | Evidence cần lưu |
|---|---|---|
| Tên tỉnh/địa giới đổi | exact ref trước tên; bảng alias được duyệt; warning | resolver diagnostics, version asset |
| Địa danh lịch sử không tồn tại | không suy đoán; giữ label nguồn; confidence | raw label + decision log |
| Point đại diện bị hiểu là chính xác | confidence/chú thích, không dùng làm polygon | fixture và screenshot |
| Event phạm vi rộng | multi-target/overview, không ép một centroid | target report |
| Ngoài lãnh thổ Việt Nam | point/2D fallback hoặc unresolved | event scope note |
| GADM không trùng phạm vi lịch sử | disclaimer, không gọi là historical boundary | khóa luận + UI copy |
| Địa hình hiện đại khác thời điểm lịch sử | ghi rõ temporal limitation | caption hình/demo |

## Review nội dung trước nghiệm thu

Content owner phải duyệt caption cho ít nhất một point, một multi-region, một mixed và một event không hỗ trợ. Nếu yêu cầu ranh giới theo thời kỳ xuất hiện, đó là scope mới: cần dataset lịch sử authoritative, không giải quyết bằng GADM hiện tại.

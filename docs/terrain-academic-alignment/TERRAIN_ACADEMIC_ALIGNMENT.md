# Vai trò của module

Module cung cấp mô hình địa hình 3D tham chiếu thời hiện đại cho khu vực liên quan đến sự kiện lịch sử. Mục đích là hỗ trợ quan sát địa thế, độ cao tương đối và quan hệ không gian; đây không phải là bản phục dựng chính xác cảnh quan tại thời điểm lịch sử.

# Nguồn dữ liệu

- Terrain provider: Cesium World Terrain, chỉ được tải khi người học mở một phiên Terrain hợp lệ; nếu không tải được, ứng dụng trở về mô hình ellipsoid dự phòng và không coi đó là dữ liệu độ cao địa hình chi tiết.
- Imagery provider: Không cấu hình imagery provider riêng; Viewer sử dụng base layer mặc định theo cấu hình hiện tại.
- Lớp dữ liệu sự kiện: marker, target và polygon do hệ thống quản lý từ dữ liệu sự kiện. Polygon GADM là khu vực tham chiếu theo địa giới hiện đại, không phải ranh giới lịch sử chính xác.

Source hiện không tải Cesium OSM Buildings, Google Photorealistic 3D Tiles hay custom 3D Tiles. Những hình mái nhà có thể nhìn thấy trong ảnh nền, nếu có, thuộc raster imagery chứ không phải building geometry.

# Giá trị học tập

- Rèn tư duy không gian và quan sát địa thế tổng quát.
- So sánh vị trí tương đối và phạm vi phân bố của các target.
- Đọc tọa độ và độ cao tham khảo từ mô hình địa hình hiện đại.
- Đặt câu hỏi lịch sử về những biến đổi có thể có của cảnh quan.

# Giới hạn

- Không phải historical DEM và không tái dựng dòng sông, bờ biển hoặc cảnh quan cổ.
- Không chứng minh tuyến hành quân, dòng chảy hay đường bờ lịch sử chính xác.
- Không coi địa giới hành chính hiện đại là ranh giới lịch sử.
- Sông, bờ biển, bãi bồi, hồ chứa, đô thị và cảnh quan có thể đã thay đổi theo thời gian.

# Đoạn văn đề xuất cho khóa luận

“Chức năng cung cấp mô hình địa hình 3D tham chiếu hiện đại cho khu vực liên quan đến sự kiện, hỗ trợ học sinh quan sát địa thế, độ cao tương đối và quan hệ không gian giữa các địa điểm. Hệ thống không xem mô hình này là bản phục dựng chính xác địa hình tại thời điểm lịch sử; các yếu tố như sông, đường bờ, bãi bồi và cảnh quan có thể đã thay đổi theo thời gian.”

# Hướng phát triển

- Historical maps được georeference.
- Historical shoreline và river course.
- Historical DEM khi có dữ liệu nghiên cứu phù hợp.
- Mức độ tin cậy theo sự kiện.
- Bật/tắt có kiểm soát các lớp hiện đại và lớp lịch sử.

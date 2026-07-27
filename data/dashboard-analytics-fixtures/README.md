# Dashboard Analytics API V1 golden fixtures

Các fixture trong thư mục này là dữ liệu tổng hợp, không chứa dữ liệu người dùng thật, raw answer,
correct answer, explanation hoặc reviewed question.

Expected mapping:

- `response-v1-default.json`: `ready`, source `backend`, weakness thấp nhất là
  `viet-nam-1945-1954`, mode backend được đổi sang mode UI tiếng Việt.
- `response-v1-empty.json`: `empty`, recommendation bắt đầu làm đề, không tạo KPI giả.
- `response-v1-partial-coverage.json`: `ready`, trend không complete và có notice coverage/detail.
- `response-v1-authority-mix.json`: `ready`, có notice recovered + legacy; legacy chỉ đóng góp
  summary/trend, không có deep analytics riêng.

Frontend validator phải parse cả bốn fixture. Goal backend tiếp theo có thể dùng chúng làm contract
test mà không phụ thuộc 10 UI fixture development.

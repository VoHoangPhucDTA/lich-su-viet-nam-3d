# Goal 3 terrain insight source matrix

## Kết luận source gate

**BLOCKED — PENDING_MANUAL_SOURCE_VERIFICATION**

Goal 3-R không thay đổi source gate hoặc bất kỳ status `NOT_SUPPORTED` nào dưới đây. Hai production insight remediation chỉ dùng nội dung contextual đã thu hẹp: mốc/sự kiện trực tiếp đã xác minh và các **Human-reviewed pedagogical observation prompts** về mô hình địa hình hiện nay; chúng không tái sử dụng các claim bị cấm như quan hệ nhân quả lịch sử.

## Goal 3-R.1 production policy

```text
Goal 3 original: BLOCKED — PENDING_MANUAL_SOURCE_VERIFICATION
Goal 3-R scope decision: SCOPE_REDUCED_APPROVED
Insight lookup: SLUG_ONLY_FAIL_CLOSED
event.id: not used as a slug fallback
```

- `headline`, `explanation` và `sourceRef`: verified textbook layer.
- `observePoints`: reviewed observation prompts.
- `scopeNote`: project-data/tool limitation; không phải nội dung SGK.
- Target-list label: project map-data provenance.
- Không production entry nào là `decisive`; không preferred target nào được kích hoạt.
- Payload thiếu slug vẫn dùng được generic terrain flow, nhưng không hiển thị sourced insight hoặc custom CTA.

Đối chiếu trực tiếp bản PDF SGK Kết nối tri thức cho thấy các trường nội dung đã biên tập trong canonical JSON không hoàn toàn khớp với trang SGK được dẫn. Vì các claim bắt buộc cho insight sư phạm chưa đủ bằng chứng trực tiếp, Goal 3 không được phép tạo production insight, decisive entry, CTA hoặc UI.

| Event | Claim ID | Claim dùng trong UI | Canonical field | SGK/bài | Trang chính xác | Trích đoạn ngắn | URL provenance | Applicability | Verification status |
|---|---|---|---|---|---|---|---|---|---|
| Kháng chiến chống quân Nguyên 1287–1288 | 1287-A | Địa hình Đại Việt có núi đèo hiểm trở, sông ngòi chằng chịt. | `textbookContent.detailedNarrative` | KNTT 11, Bài 7 | Đã kiểm tra trang in 41–61; không có trang hỗ trợ claim này | Không tìm thấy diễn đạt tương ứng trong phạm vi đã kiểm tra. | [SGK Việt Nam, Bài 7](https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-chien-tranh-bao-ve-to-quoc-va-chien-tranh-giai-phong-dan-toc-trong-lich-su-viet-nam-truoc-cach-mang-thang-tam-nam-1945-3346/bai-7-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-12370.html) | `EVENT_SPECIFIC` | **NOT_SUPPORTED** |
| Kháng chiến chống quân Nguyên 1287–1288 | 1287-B | Địa hình đó làm quân Nguyên không phát huy được ưu thế kỵ binh. | `textbookContent.detailedNarrative` | KNTT 11, Bài 7 | Đã kiểm tra trang in 41–61; không có trang hỗ trợ quan hệ nhân quả này | Không tìm thấy diễn đạt tương ứng trong phạm vi đã kiểm tra. | [SGK Việt Nam, Bài 7](https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-chien-tranh-bao-ve-to-quoc-va-chien-tranh-giai-phong-dan-toc-trong-lich-su-viet-nam-truoc-cach-mang-thang-tam-nam-1945-3346/bai-7-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-12370.html) | `EVENT_SPECIFIC` | **NOT_SUPPORTED** |
| Kháng chiến chống quân Nguyên 1287–1288 | 1287-C | Riêng lần kháng chiến 1287–1288: quân dân thực hiện “thanh dã”, rút khỏi Thăng Long, làm đối phương thiếu lương và bị động. | `textbookContent.detailedNarrative` | KNTT 11, Bài 7 | Trang in 45–46 có “thanh dã” nhưng lần lượt nói về năm 1258 và 1285; phần 1287–1288 ở trang 46 không nêu claim này | “nhân dân thực hiện kế ‘thanh dã’”; ngữ cảnh không phải 1287–1288. | [SGK Việt Nam, Bài 7](https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-chien-tranh-bao-ve-to-quoc-va-chien-tranh-giai-phong-dan-toc-trong-lich-su-viet-nam-truoc-cach-mang-thang-tam-nam-1945-3346/bai-7-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-12370.html) | `EVENT_SPECIFIC` | **NOT_SUPPORTED** |
| Kháng chiến chống quân Nguyên 1287–1288 | 1287-D | Năm 1287–1288 có các mốc Vân Đồn, Vạn Kiếp và Bạch Đằng. | `canonicalSummary`, `textbookRefs[0].excerpt` | KNTT 11, Bài 7 | Trang in 46 | Phần lược đồ thời gian nêu Vân Đồn, Vạn Kiếp và Bạch Đằng. | [SGK Việt Nam, Bài 7](https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-chien-tranh-bao-ve-to-quoc-va-chien-tranh-giai-phong-dan-toc-trong-lich-su-viet-nam-truoc-cach-mang-thang-tam-nam-1945-3346/bai-7-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-12370.html) | `EVENT_SPECIFIC` | **VERIFIED_DIRECT_TEXT** |
| Kháng chiến chống quân Nguyên 1287–1288 | 1287-E | Quân xâm lược nói chung gặp bất lợi vì hành quân xa, hao tổn lực lượng, không quen địa hình/thuỷ thổ và không chủ động lương thực. | `textbookContent.detailedNarrative` | KNTT 11, Bài 7 | Trang in 49 | “không thông thạo địa hình… không chủ động được nguồn lương thực” | [SGK Việt Nam, Bài 7](https://sgkvn.com/lop-11-14/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-4-chien-tranh-bao-ve-to-quoc-va-chien-tranh-giai-phong-dan-toc-trong-lich-su-viet-nam-truoc-cach-mang-thang-tam-nam-1945-3346/bai-7-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-12370.html) | `GENERAL_CONTEXT_ONLY` | **VERIFIED_DIRECT_TEXT** |
| Chiến dịch Điện Biên Phủ 1954 | DBP-1 | Chiến dịch diễn ra qua ba đợt từ 13-3-1954 đến 7-5-1954. | `canonicalSummary`, `textbookContent`, `textbookRefs[0].excerpt` | KNTT 12, Bài 7 | Trang in 38 | “Chiến dịch Điện Biên Phủ diễn ra qua 3 đợt” | [SGK Việt Nam, Bài 7](https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-3-cach-mang-thang-tam-nam-1945-chien-tranh-giai-phong-dan-toc-va-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-tu-thang-8-nam-1945-den-nay-3539/bai-7-cuoc-khang-chien-chong-thuc-dan-phap-1945-1954-12955.html) | `EVENT_SPECIFIC` | **VERIFIED_DIRECT_TEXT** |
| Chiến dịch Điện Biên Phủ 1954 | DBP-2 | Ánh xạ từng đợt với Him Lam, Độc Lập, Bản Kéo, phía đông phân khu Trung tâm, sân bay Mường Thanh, phân khu Nam. | `canonicalSummary`, `textbookContent.detailedNarrative`, `keyFacts`, `mapData.markers`, `textbookRefs[0].excerpt` | KNTT 12, Bài 7 | Đã kiểm tra trang in 37–44; không thấy ánh xạ mục tiêu theo từng đợt | Nội dung chi tiết chỉ hiện diện trong canonical JSON/excerpt đã biên tập, không thấy trong PDF tương ứng. | [SGK Việt Nam, Bài 7](https://sgkvn.com/lop-12-15/ket-noi-tri-thuc-voi-cuoc-song-3/chu-de-3-cach-mang-thang-tam-nam-1945-chien-tranh-giai-phong-dan-toc-va-chien-tranh-bao-ve-to-quoc-trong-lich-su-viet-nam-tu-thang-8-nam-1945-den-nay-3539/bai-7-cuoc-khang-chien-chong-thuc-dan-phap-1945-1954-12955.html) | `EVENT_SPECIFIC` | **NOT_SUPPORTED** |

## Ghi chú kiểm chứng

- Số trang trong bảng là số trang in trên SGK. Trong hai PDF cục bộ, trang vật lý PDF lệch `+2` so với số trang in.
- `textbookRefs[0].pageRange` của sự kiện 1287–1288 hiện ghi `54–61`, nhưng phần ba lần kháng chiến chống Mông–Nguyên nằm ở trang in 45–46. Trang 54–61 thuộc nội dung khác.
- URL provenance là đường dẫn được canonical JSON khai báo; URL không thay thế việc đối chiếu nội dung PDF.
- Claim 1287-E là nhận định chung về nhiều cuộc chiến tranh bảo vệ Tổ quốc, không đủ để suy ra 1287-A, 1287-B hoặc gắn riêng cho năm 1287–1288.
- `Applicability: GENERAL_CONTEXT_ONLY` của 1287-E cấm dùng claim này để tạo quan hệ nhân quả riêng cho cuộc kháng chiến 1287–1288.
- DBP-1 không đủ để suy ra DBP-2. Do CTA theo địa điểm cần ánh xạ mục tiêu có nguồn, DBP-2 vẫn là blocker.

export type FieldMeta = {
  path: string
  key: string
  viLabel: string
  help: string
  required?: boolean
}

export type SectionMeta = {
  id: string
  title: string
  description: string
  fields: string[]
}

export const fieldMetaMap: Record<string, FieldMeta> = {
  id: { path: 'id', key: 'id', viLabel: 'Mã sự kiện', help: 'ID nội bộ duy nhất của sự kiện', required: true },
  slug: { path: 'slug', key: 'slug', viLabel: 'Đường dẫn thân thiện', help: 'Chuỗi dùng cho URL', required: true },
  entityType: { path: 'entityType', key: 'entityType', viLabel: 'Loại thực thể', help: 'Loại dữ liệu chính, thường là event', required: true },
  eventLevel: { path: 'eventLevel', key: 'eventLevel', viLabel: 'Cấp sự kiện', help: 'atomic hoặc collection', required: true },
  'titles.primary': { path: 'titles.primary', key: 'primary', viLabel: 'Tên chính', help: 'Tên chính thức để hiển thị', required: true },
  'titles.short': { path: 'titles.short', key: 'short', viLabel: 'Tên ngắn', help: 'Tên rút gọn cho card/timeline' },
  'titles.alternatives': { path: 'titles.alternatives', key: 'alternatives', viLabel: 'Tên thay thế', help: 'Các tên gọi khác của sự kiện' },
  'classification.eventType': { path: 'classification.eventType', key: 'eventType', viLabel: 'Loại sự kiện', help: 'Phân loại lớn của sự kiện', required: true },
  'classification.eventSubtype': { path: 'classification.eventSubtype', key: 'eventSubtype', viLabel: 'Phân loại chi tiết', help: 'Nhóm chi tiết hơn trong eventType', required: true },
  'classification.tags': { path: 'classification.tags', key: 'tags', viLabel: 'Từ khóa', help: 'Các từ khóa để tìm kiếm/lọc' },
  'coverage.grades': { path: 'coverage.grades', key: 'grades', viLabel: 'Lớp học', help: 'Sự kiện xuất hiện trong SGK lớp nào' },
  'chronology.start.year': { path: 'chronology.start.year', key: 'year', viLabel: 'Năm bắt đầu', help: 'Mốc năm bắt đầu của sự kiện', required: true },
  'chronology.start.month': { path: 'chronology.start.month', key: 'month', viLabel: 'Tháng bắt đầu', help: 'Mốc tháng bắt đầu nếu có' },
  'chronology.start.day': { path: 'chronology.start.day', key: 'day', viLabel: 'Ngày bắt đầu', help: 'Mốc ngày bắt đầu nếu có' },
  'chronology.end.year': { path: 'chronology.end.year', key: 'year', viLabel: 'Năm kết thúc', help: 'Mốc năm kết thúc nếu có' },
  'chronology.end.month': { path: 'chronology.end.month', key: 'month', viLabel: 'Tháng kết thúc', help: 'Mốc tháng kết thúc nếu có' },
  'chronology.end.day': { path: 'chronology.end.day', key: 'day', viLabel: 'Ngày kết thúc', help: 'Mốc ngày kết thúc nếu có' },
  'chronology.datePrecision': { path: 'chronology.datePrecision', key: 'datePrecision', viLabel: 'Độ chính xác thời gian', help: 'Mức chính xác của mốc thời gian', required: true },
  'chronology.displayDate': { path: 'chronology.displayDate', key: 'displayDate', viLabel: 'Chuỗi hiển thị thời gian', help: 'Chuỗi thời gian để hiển thị trên UI', required: true },
  'chronology.isApproximate': { path: 'chronology.isApproximate', key: 'isApproximate', viLabel: 'Thời gian ước lượng', help: 'Đánh dấu mốc thời gian xấp xỉ' },
  'mapData.displayGeometry.geoType': { path: 'mapData.displayGeometry.geoType', key: 'geoType', viLabel: 'Kiểu hình học', help: 'Cách sự kiện được hiển thị trên bản đồ', required: true },
  'summary.homepageSummary': { path: 'summary.homepageSummary', key: 'homepageSummary', viLabel: 'Tóm tắt trang chủ', help: 'Mô tả ngắn hiển thị ở trang chủ', required: true },
  'textbookContent.canonicalSummary': { path: 'textbookContent.canonicalSummary', key: 'canonicalSummary', viLabel: 'Tóm tắt SGK', help: 'Tóm tắt chuẩn theo SGK', required: true },
  'textbookContent.significance': { path: 'textbookContent.significance', key: 'significance', viLabel: 'Ý nghĩa lịch sử', help: 'Nêu ý nghĩa của sự kiện', required: true },
  'textbookContent.textbookRefs': { path: 'textbookContent.textbookRefs', key: 'textbookRefs', viLabel: 'Nguồn SGK', help: 'Danh sách trích dẫn SGK, tối thiểu 1 mục', required: true },
  'hierarchy.rootId': { path: 'hierarchy.rootId', key: 'rootId', viLabel: 'ID gốc', help: 'ID nút gốc trong cây phân cấp', required: true },
  'hierarchy.level': { path: 'hierarchy.level', key: 'level', viLabel: 'Cấp độ', help: 'Độ sâu trong cây phân cấp', required: true },
  'display.showOnHomepage': { path: 'display.showOnHomepage', key: 'showOnHomepage', viLabel: 'Hiện trang chủ', help: 'Có hiển thị ở trang chủ hay không', required: true },
  'display.showOnTimeline': { path: 'display.showOnTimeline', key: 'showOnTimeline', viLabel: 'Hiện timeline', help: 'Có hiển thị trên dòng thời gian hay không', required: true },
}

export const sections: SectionMeta[] = [
  {
    id: 'basic-info',
    title: '1. Thông tin cơ bản',
    description: 'Định danh và loại sự kiện',
    fields: ['id', 'slug', 'entityType', 'eventLevel'],
  },
  {
    id: 'titles',
    title: '2. Tiêu đề',
    description: 'Tên chính, tên ngắn và tên thay thế',
    fields: ['titles.primary', 'titles.short', 'titles.alternatives'],
  },
  {
    id: 'classification',
    title: '3. Phân loại',
    description: 'Loại sự kiện và từ khóa',
    fields: ['classification.eventType', 'classification.eventSubtype', 'classification.tags'],
  },
  {
    id: 'coverage',
    title: '4. Coverage',
    description: 'Các lớp SGK có đề cập',
    fields: ['coverage.grades'],
  },
  {
    id: 'chronology',
    title: '5. Thời gian',
    description: 'Mốc bắt đầu/kết thúc và chuỗi hiển thị',
    fields: [
      'chronology.start.year',
      'chronology.start.month',
      'chronology.start.day',
      'chronology.end.year',
      'chronology.end.month',
      'chronology.end.day',
      'chronology.datePrecision',
      'chronology.displayDate',
      'chronology.isApproximate',
    ],
  },
  {
    id: 'map-data',
    title: '6. Dữ liệu bản đồ',
    description: 'Geometry hiển thị và focus camera',
    fields: ['mapData.displayGeometry.geoType'],
  },
  {
    id: 'summary',
    title: '7. Tóm tắt',
    description: 'Nội dung ngắn cho giao diện',
    fields: ['summary.homepageSummary'],
  },
  {
    id: 'textbook-content',
    title: '8. Nội dung SGK',
    description: 'Nguồn chính thống cho sự kiện',
    fields: [
      'textbookContent.canonicalSummary',
      'textbookContent.significance',
      'textbookContent.textbookRefs',
    ],
  },
  {
    id: 'external-content',
    title: '9. Nguồn bổ sung',
    description: 'Wikipedia/Wikidata và nguồn khác',
    fields: [],
  },
  {
    id: 'media',
    title: '10. Media',
    description: 'Ảnh/video/tư liệu đa phương tiện',
    fields: [],
  },
  {
    id: 'hierarchy',
    title: '11. Phân cấp',
    description: 'Liên kết cha-con trong cây sự kiện',
    fields: ['hierarchy.rootId', 'hierarchy.level'],
  },
  {
    id: 'associations',
    title: '12. Liên kết',
    description: 'Sự kiện/nhân vật liên quan',
    fields: [],
  },
  {
    id: 'display',
    title: '13. Hiển thị',
    description: 'Điều khiển hiển thị trên trang và timeline',
    fields: ['display.showOnHomepage', 'display.showOnTimeline'],
  },
  {
    id: 'source-policy',
    title: '14. Chính sách nguồn',
    description: 'Nguồn chuẩn và nguồn bổ sung',
    fields: [],
  },
  {
    id: 'curation',
    title: '15. Curation (tùy chọn)',
    description: 'Chỉ hiển thị nếu schema có curation',
    fields: [],
  },
]

export const allFieldMetas = Object.values(fieldMetaMap)

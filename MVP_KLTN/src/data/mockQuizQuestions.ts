/**
 * Mock quiz questions for the AI/RAG quiz module.
 * Replace this with actual RAG-generated questions from the FastAPI/LangChain backend.
 *
 * Covers:
 *  - Lớp 10, 11, 12
 *  - Độ khó: easy / medium / hard
 *  - eventType: military | political | economic | cultural
 *  - Có giải thích đáp án & sourceRefs giả lập từ SGK
 */

import type { QuizQuestion } from '../types/quiz';

export const MOCK_QUIZ_QUESTIONS: QuizQuestion[] = [
  // ─────────────────────────────────────────────────────────────
  // LỚP 10 – EASY
  // ─────────────────────────────────────────────────────────────
  {
    id: 'q-001',
    questionText: 'Chiến thắng Bạch Đằng năm 938 do ai lãnh đạo?',
    options: [
      { id: 'A', text: 'Lê Hoàn' },
      { id: 'B', text: 'Ngô Quyền' },
      { id: 'C', text: 'Đinh Bộ Lĩnh' },
      { id: 'D', text: 'Trần Hưng Đạo' },
    ],
    correctOptionId: 'B',
    explanation:
      'Ngô Quyền lãnh đạo quân dân Việt đánh tan quân Nam Hán trên sông Bạch Đằng năm 938, chấm dứt hơn 1000 năm Bắc thuộc và mở ra kỷ nguyên độc lập.',
    difficulty: 'easy',
    grade: 10,
    topic: 'Ngô Quyền và chiến thắng Bạch Đằng',
    eventId: 'battle-of-bach-dang-938',
    eventTitle: 'Chiến thắng Bạch Đằng (938)',
    eventType: 'military',
    sourceRefs: [
      { title: 'SGK Lịch sử 10', location: 'Bài 14 – Các vương triều Đinh, Tiền Lê, Lý, Trần' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-002',
    questionText: 'Nhà Lý dời đô từ Hoa Lư về Thăng Long vào năm nào?',
    options: [
      { id: 'A', text: '968' },
      { id: 'B', text: '1010' },
      { id: 'C', text: '1054' },
      { id: 'D', text: '1076' },
    ],
    correctOptionId: 'B',
    explanation:
      'Năm 1010, vua Lý Thái Tổ dời đô từ Hoa Lư (Ninh Bình) về Đại La, sau đổi tên thành Thăng Long (Hà Nội ngày nay).',
    difficulty: 'easy',
    grade: 10,
    topic: 'Thời Lý và kinh đô Thăng Long',
    eventType: 'political',
    sourceRefs: [
      { title: 'SGK Lịch sử 10', location: 'Bài 15 – Nhà Lý' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-003',
    questionText: 'Khởi nghĩa Hai Bà Trưng nổ ra vào năm nào?',
    options: [
      { id: 'A', text: '40 SCN' },
      { id: 'B', text: '248 SCN' },
      { id: 'C', text: '938 SCN' },
      { id: 'D', text: '542 SCN' },
    ],
    correctOptionId: 'A',
    explanation:
      'Khởi nghĩa Hai Bà Trưng (Trưng Trắc và Trưng Nhị) nổ ra năm 40 SCN chống lại ách đô hộ nhà Hán, giải phóng hơn 65 thành trì.',
    difficulty: 'easy',
    grade: 10,
    topic: 'Các cuộc khởi nghĩa thời Bắc thuộc',
    eventType: 'military',
    sourceRefs: [
      { title: 'SGK Lịch sử 10', location: 'Bài 12 – Khởi nghĩa Hai Bà Trưng' },
    ],
    generatedBy: 'mock',
  },

  // ─────────────────────────────────────────────────────────────
  // LỚP 10 – MEDIUM
  // ─────────────────────────────────────────────────────────────
  {
    id: 'q-004',
    questionText:
      'Bộ luật nào được ban hành dưới thời vua Lê Thánh Tông có ý nghĩa quan trọng trong lịch sử pháp lý Việt Nam?',
    options: [
      { id: 'A', text: 'Hình thư' },
      { id: 'B', text: 'Hoàng Việt luật lệ' },
      { id: 'C', text: 'Quốc triều hình luật (Luật Hồng Đức)' },
      { id: 'D', text: 'Luật Gia Long' },
    ],
    correctOptionId: 'C',
    explanation:
      'Quốc triều hình luật (thường gọi là Luật Hồng Đức) ban hành thời Lê Thánh Tông là bộ luật tiến bộ nhất thời phong kiến Việt Nam, bảo vệ quyền phụ nữ và nông dân.',
    difficulty: 'medium',
    grade: 10,
    topic: 'Nhà Lê sơ và pháp luật phong kiến',
    eventType: 'political',
    sourceRefs: [
      { title: 'SGK Lịch sử 10', location: 'Bài 20 – Đại Việt thời Lê sơ' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-005',
    questionText:
      'Nền kinh tế Đại Việt thời Lý - Trần phát triển chủ yếu nhờ những yếu tố nào?',
    options: [
      { id: 'A', text: 'Công thương nghiệp và đô thị hóa' },
      { id: 'B', text: 'Nông nghiệp, thủ công nghiệp và thương nghiệp' },
      { id: 'C', text: 'Khai thác mỏ và xuất khẩu khoáng sản' },
      { id: 'D', text: 'Viện trợ từ các nước láng giềng' },
    ],
    correctOptionId: 'B',
    explanation:
      'Kinh tế thời Lý - Trần phát triển toàn diện trên ba lĩnh vực: nông nghiệp (khai hoang, thủy lợi), thủ công nghiệp (gốm, dệt lụa) và thương nghiệp (chợ búa, buôn bán với nước ngoài).',
    difficulty: 'medium',
    grade: 10,
    topic: 'Kinh tế Đại Việt thời Lý – Trần',
    eventType: 'economic',
    sourceRefs: [
      { title: 'SGK Lịch sử 10', location: 'Bài 16 – Nhà Trần và kháng chiến chống Mông Nguyên' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-006',
    questionText:
      'Trận Tốt Động - Chúc Động (1426) là chiến thắng quan trọng của cuộc khởi nghĩa nào?',
    options: [
      { id: 'A', text: 'Khởi nghĩa Lam Sơn' },
      { id: 'B', text: 'Khởi nghĩa Tây Sơn' },
      { id: 'C', text: 'Khởi nghĩa Lý Bí' },
      { id: 'D', text: 'Khởi nghĩa Trần Quốc Toản' },
    ],
    correctOptionId: 'A',
    explanation:
      'Trận Tốt Động - Chúc Động (tháng 11/1426) là một trong những chiến thắng lớn nhất của nghĩa quân Lam Sơn do Lê Lợi lãnh đạo, tiêu diệt hàng vạn quân Minh.',
    difficulty: 'medium',
    grade: 10,
    topic: 'Khởi nghĩa Lam Sơn',
    eventType: 'military',
    sourceRefs: [
      { title: 'SGK Lịch sử 10', location: 'Bài 19 – Khởi nghĩa Lam Sơn' },
    ],
    generatedBy: 'mock',
  },

  // ─────────────────────────────────────────────────────────────
  // LỚP 10 – HARD
  // ─────────────────────────────────────────────────────────────
  {
    id: 'q-007',
    questionText:
      'Trong ba lần kháng chiến chống Mông - Nguyên, yếu tố QUYẾT ĐỊNH nhất dẫn đến chiến thắng của Đại Việt là gì?',
    options: [
      { id: 'A', text: 'Sự hỗ trợ quân sự từ Chiêm Thành' },
      { id: 'B', text: 'Chiến thuật "vườn không nhà trống" kết hợp phản công chiến lược' },
      { id: 'C', text: 'Vũ khí hiện đại hơn quân Mông Cổ' },
      { id: 'D', text: 'Địa hình đồng bằng thuận lợi cho phòng thủ' },
    ],
    correctOptionId: 'B',
    explanation:
      'Nhà Trần áp dụng chiến thuật "vườn không nhà trống" (sơ tán dân, lúa gạo), tiêu hao sinh lực địch rồi tổ chức phản công quyết định ở Đông Bộ Đầu, Hàm Tử, Vân Đồn, Bạch Đằng. Đây là sự kết hợp tư duy quân sự thiên tài.',
    difficulty: 'hard',
    grade: 10,
    topic: 'Kháng chiến chống Mông – Nguyên',
    eventType: 'military',
    sourceRefs: [
      { title: 'SGK Lịch sử 10', location: 'Bài 16 – Nhà Trần và kháng chiến chống Mông Nguyên' },
      { title: 'Đại Việt sử ký toàn thư', location: 'Quyển 5 – Kỷ nhà Trần' },
    ],
    generatedBy: 'mock',
  },

  // ─────────────────────────────────────────────────────────────
  // LỚP 11 – EASY
  // ─────────────────────────────────────────────────────────────
  {
    id: 'q-008',
    questionText: 'Thực dân Pháp nổ súng tấn công Đà Nẵng vào năm nào để mở đầu cuộc xâm lược Việt Nam?',
    options: [
      { id: 'A', text: '1847' },
      { id: 'B', text: '1858' },
      { id: 'C', text: '1862' },
      { id: 'D', text: '1873' },
    ],
    correctOptionId: 'B',
    explanation:
      'Ngày 1/9/1858, liên quân Pháp – Tây Ban Nha nổ súng tấn công bán đảo Sơn Trà (Đà Nẵng), chính thức mở đầu cuộc xâm lược Việt Nam.',
    difficulty: 'easy',
    grade: 11,
    topic: 'Thực dân Pháp xâm lược Việt Nam',
    eventType: 'military',
    sourceRefs: [
      { title: 'SGK Lịch sử 11', location: 'Bài 19 – Nhân dân Việt Nam kháng chiến chống Pháp xâm lược' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-009',
    questionText: 'Hiệp ước nào đã chính thức thừa nhận Nam Kỳ là thuộc địa của Pháp?',
    options: [
      { id: 'A', text: 'Hiệp ước Nhâm Tuất (1862)' },
      { id: 'B', text: 'Hiệp ước Giáp Tuất (1874)' },
      { id: 'C', text: 'Hiệp ước Hác-măng (1883)' },
      { id: 'D', text: 'Hiệp ước Pa-tơ-nốt (1884)' },
    ],
    correctOptionId: 'A',
    explanation:
      'Hiệp ước Nhâm Tuất (5/6/1862) do triều đình Huế ký với Pháp nhường 3 tỉnh miền Đông Nam Kỳ (Gia Định, Định Tường, Biên Hòa) và đảo Côn Lôn cho Pháp.',
    difficulty: 'easy',
    grade: 11,
    topic: 'Quá trình Pháp đô hộ Việt Nam',
    eventType: 'political',
    sourceRefs: [
      { title: 'SGK Lịch sử 11', location: 'Bài 19 – Mục II: Cuộc kháng chiến ở Nam Kỳ' },
    ],
    generatedBy: 'mock',
  },

  // ─────────────────────────────────────────────────────────────
  // LỚP 11 – MEDIUM
  // ─────────────────────────────────────────────────────────────
  {
    id: 'q-010',
    questionText:
      'Phong trào Đông Du (1905-1909) do ai khởi xướng và có mục tiêu gì?',
    options: [
      { id: 'A', text: 'Phan Bội Châu – đưa thanh niên sang Nhật học tập cứu nước' },
      { id: 'B', text: 'Phan Châu Trinh – mở trường học theo kiểu phương Tây' },
      { id: 'C', text: 'Nguyễn Tất Thành – tìm đường cứu nước sang Pháp' },
      { id: 'D', text: 'Hoàng Hoa Thám – vũ trang khởi nghĩa ở Yên Thế' },
    ],
    correctOptionId: 'A',
    explanation:
      'Phan Bội Châu sáng lập phong trào Đông Du năm 1905, tổ chức đưa hàng trăm thanh niên yêu nước sang Nhật Bản học quân sự và khoa học kỹ thuật để chuẩn bị cho cuộc đấu tranh giải phóng dân tộc.',
    difficulty: 'medium',
    grade: 11,
    topic: 'Phong trào yêu nước đầu thế kỷ XX',
    eventType: 'political',
    sourceRefs: [
      { title: 'SGK Lịch sử 11', location: 'Bài 23 – Phong trào yêu nước và cách mạng ở Việt Nam' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-011',
    questionText:
      'Chương trình khai thác thuộc địa lần thứ nhất của thực dân Pháp (1897-1914) tập trung vào những lĩnh vực nào?',
    options: [
      { id: 'A', text: 'Phát triển công nghiệp nặng và đường sắt' },
      { id: 'B', text: 'Khai thác mỏ, nông nghiệp đồn điền và xây dựng giao thông' },
      { id: 'C', text: 'Phát triển giáo dục và y tế' },
      { id: 'D', text: 'Hỗ trợ thương nghiệp của tư sản bản địa' },
    ],
    correctOptionId: 'B',
    explanation:
      'Chương trình khai thác thuộc địa lần I do Toàn quyền Pôn Đu-me thực hiện tập trung vào đào mỏ (than, thiếc), lập đồn điền cao su, cà phê và xây hệ thống đường sắt, đường bộ phục vụ vận chuyển.',
    difficulty: 'medium',
    grade: 11,
    topic: 'Chính sách khai thác thuộc địa của Pháp',
    eventType: 'economic',
    sourceRefs: [
      { title: 'SGK Lịch sử 11', location: 'Bài 22 – Xã hội Việt Nam trong cuộc khai thác thuộc địa lần thứ nhất' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-012',
    questionText:
      'Văn học, nghệ thuật thời kỳ Pháp thuộc chịu ảnh hưởng của trào lưu nào từ phương Tây?',
    options: [
      { id: 'A', text: 'Chủ nghĩa lãng mạn và hiện thực phê phán' },
      { id: 'B', text: 'Chủ nghĩa tượng trưng và siêu thực' },
      { id: 'C', text: 'Chủ nghĩa hữu thần và tôn giáo' },
      { id: 'D', text: 'Chủ nghĩa phát xít và độc tài' },
    ],
    correctOptionId: 'A',
    explanation:
      'Văn học Việt Nam thời Pháp thuộc tiếp thu chủ nghĩa lãng mạn (thơ Mới) và hiện thực phê phán (Nam Cao, Ngô Tất Tố), phản ánh đời sống xã hội và khát vọng tự do.',
    difficulty: 'medium',
    grade: 11,
    topic: 'Văn hóa Việt Nam thời Pháp thuộc',
    eventType: 'cultural',
    sourceRefs: [
      { title: 'SGK Lịch sử 11', location: 'Bài 24 – Văn hóa Việt Nam cuối thế kỷ XIX – đầu thế kỷ XX' },
    ],
    generatedBy: 'mock',
  },

  // ─────────────────────────────────────────────────────────────
  // LỚP 11 – HARD
  // ─────────────────────────────────────────────────────────────
  {
    id: 'q-013',
    questionText:
      'So sánh con đường cứu nước của Phan Bội Châu và Phan Châu Trinh, điểm khác biệt CƠ BẢN nhất là gì?',
    options: [
      { id: 'A', text: 'Phan Bội Châu muốn dùng bạo lực, Phan Châu Trinh chủ trương duy tân cải cách ôn hòa' },
      { id: 'B', text: 'Phan Bội Châu theo Thiên Chúa giáo, Phan Châu Trinh theo Phật giáo' },
      { id: 'C', text: 'Phan Bội Châu ở trong nước, Phan Châu Trinh hoạt động ở nước ngoài' },
      { id: 'D', text: 'Cả hai đều có cùng phương pháp nhưng khác mục tiêu' },
    ],
    correctOptionId: 'A',
    explanation:
      'Phan Bội Châu chủ trương dùng bạo lực vũ trang, liên kết với Nhật Bản để chống Pháp. Phan Châu Trinh chủ trương duy tân: khai dân trí, chấn dân khí, hậu dân sinh theo phương pháp ôn hòa, không bạo động.',
    difficulty: 'hard',
    grade: 11,
    topic: 'Phong trào yêu nước đầu thế kỷ XX',
    eventType: 'political',
    sourceRefs: [
      { title: 'SGK Lịch sử 11', location: 'Bài 23 – Phong trào yêu nước và cách mạng ở Việt Nam từ đầu XX' },
    ],
    generatedBy: 'mock',
  },

  // ─────────────────────────────────────────────────────────────
  // LỚP 12 – EASY
  // ─────────────────────────────────────────────────────────────
  {
    id: 'q-014',
    questionText: 'Cách mạng tháng Tám 1945 thành công vào ngày nào?',
    options: [
      { id: 'A', text: '2/9/1945' },
      { id: 'B', text: '19/8/1945' },
      { id: 'C', text: '2/9/1945' },
      { id: 'D', text: '7/5/1954' },
    ],
    correctOptionId: 'B',
    explanation:
      'Ngày 19/8/1945, nhân dân Hà Nội giành chính quyền từ tay phát xít Nhật và tay sai, đánh dấu thành công của Cách mạng tháng Tám tại trung tâm chính trị cả nước.',
    difficulty: 'easy',
    grade: 12,
    topic: 'Cách mạng tháng Tám 1945',
    eventType: 'political',
    sourceRefs: [
      { title: 'SGK Lịch sử 12', location: 'Bài 16 – Phong trào giải phóng dân tộc và Cách mạng tháng Tám' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-015',
    questionText:
      'Chiến dịch Điện Biên Phủ kết thúc thắng lợi vào ngày nào?',
    options: [
      { id: 'A', text: '7/5/1954' },
      { id: 'B', text: '20/7/1954' },
      { id: 'C', text: '30/4/1975' },
      { id: 'D', text: '21/7/1954' },
    ],
    correctOptionId: 'A',
    explanation:
      'Chiến dịch Điện Biên Phủ kết thúc ngày 7/5/1954 với việc tướng De Castries cùng toàn bộ ban tham mưu bị bắt làm tù binh, buộc Pháp phải ký Hiệp định Genève.',
    difficulty: 'easy',
    grade: 12,
    topic: 'Chiến dịch Điện Biên Phủ 1954',
    eventType: 'military',
    sourceRefs: [
      { title: 'SGK Lịch sử 12', location: 'Bài 20 – Cuộc kháng chiến chống Pháp (1945-1954)' },
    ],
    generatedBy: 'mock',
  },

  // ─────────────────────────────────────────────────────────────
  // LỚP 12 – MEDIUM
  // ─────────────────────────────────────────────────────────────
  {
    id: 'q-016',
    questionText:
      'Chiến lược "Chiến tranh đặc biệt" (1961-1965) của Mỹ ở miền Nam Việt Nam dựa vào yếu tố CHÍNH nào?',
    options: [
      { id: 'A', text: 'Đưa quân chiến đấu Mỹ vào tham chiến trực tiếp' },
      { id: 'B', text: 'Sử dụng quân đội Sài Gòn là lực lượng chiến đấu, có cố vấn và vũ khí Mỹ' },
      { id: 'C', text: 'Ném bom miền Bắc để ngăn chặn chi viện' },
      { id: 'D', text: 'Viện trợ kinh tế để ổn định chính trị miền Nam' },
    ],
    correctOptionId: 'B',
    explanation:
      'Chiến lược "Chiến tranh đặc biệt" (Special War) sử dụng quân ngụy Sài Gòn làm lực lượng chủ yếu, với cố vấn quân sự, trang bị và chỉ huy của Mỹ, nhằm dập tắt phong trào cách mạng mà không đưa quân Mỹ vào chiến đấu.',
    difficulty: 'medium',
    grade: 12,
    topic: 'Chiến tranh chống Mỹ cứu nước',
    eventType: 'military',
    sourceRefs: [
      { title: 'SGK Lịch sử 12', location: 'Bài 22 – Chiến đấu chống chiến lược Chiến tranh đặc biệt' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-017',
    questionText:
      'Công cuộc Đổi Mới năm 1986 của Việt Nam tập trung vào chuyển đổi nền kinh tế theo hướng nào?',
    options: [
      { id: 'A', text: 'Từ kinh tế thị trường sang kinh tế kế hoạch hóa tập trung' },
      { id: 'B', text: 'Từ kinh tế kế hoạch hóa sang kinh tế thị trường định hướng XHCN' },
      { id: 'C', text: 'Xây dựng nền kinh tế tự túc, không cần viện trợ nước ngoài' },
      { id: 'D', text: 'Chuyên môn hóa hoàn toàn vào sản xuất nông nghiệp' },
    ],
    correctOptionId: 'B',
    explanation:
      'Đổi Mới (1986) chuyển nền kinh tế Việt Nam từ cơ chế bao cấp, kế hoạch hóa tập trung sang kinh tế nhiều thành phần, vận hành theo cơ chế thị trường có sự quản lý của nhà nước theo định hướng XHCN.',
    difficulty: 'medium',
    grade: 12,
    topic: 'Công cuộc Đổi Mới 1986',
    eventType: 'economic',
    sourceRefs: [
      { title: 'SGK Lịch sử 12', location: 'Bài 25 – Việt Nam xây dựng CNXH và đổi mới' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-018',
    questionText:
      'Hiệp định Paris (1973) về Việt Nam có ý nghĩa gì đối với cuộc kháng chiến chống Mỹ?',
    options: [
      { id: 'A', text: 'Kết thúc hoàn toàn chiến tranh và thống nhất đất nước' },
      { id: 'B', text: 'Buộc Mỹ rút quân, tạo thế và lực cho cuộc tổng tiến công 1975' },
      { id: 'C', text: 'Chia đôi đất nước vĩnh viễn tại vĩ tuyến 17' },
      { id: 'D', text: 'Ngừng bắn hoàn toàn và xây dựng hòa bình lâu dài' },
    ],
    correctOptionId: 'B',
    explanation:
      'Hiệp định Paris (27/1/1973) buộc Mỹ phải rút toàn bộ quân đội ra khỏi miền Nam, tạo điều kiện thuận lợi về thế và lực để quân dân ta tiến hành cuộc Tổng tiến công và nổi dậy mùa Xuân 1975.',
    difficulty: 'medium',
    grade: 12,
    topic: 'Hiệp định Paris 1973',
    eventType: 'political',
    sourceRefs: [
      { title: 'SGK Lịch sử 12', location: 'Bài 23 – Hiệp định Paris về Việt Nam' },
    ],
    generatedBy: 'mock',
  },

  // ─────────────────────────────────────────────────────────────
  // LỚP 12 – HARD
  // ─────────────────────────────────────────────────────────────
  {
    id: 'q-019',
    questionText:
      'Phân tích nguyên nhân sâu xa dẫn đến thắng lợi của cuộc kháng chiến chống Mỹ cứu nước (1954-1975)?',
    options: [
      { id: 'A', text: 'Sự ủng hộ vũ khí tối tân từ Liên Xô và Trung Quốc' },
      { id: 'B', text: 'Sự suy yếu nội bộ của Mỹ và phong trào phản chiến' },
      { id: 'C', text: 'Sự lãnh đạo đúng đắn của Đảng, tinh thần yêu nước và đoàn kết toàn dân' },
      { id: 'D', text: 'Địa hình rừng núi thuận lợi cho du kích chiến' },
    ],
    correctOptionId: 'C',
    explanation:
      'Nguyên nhân sâu xa và quyết định nhất là sự lãnh đạo sáng suốt của Đảng với đường lối đúng đắn, kết hợp sức mạnh dân tộc (yêu nước, đoàn kết) với sức mạnh thời đại (ủng hộ quốc tế). Các yếu tố khác chỉ là điều kiện thuận lợi.',
    difficulty: 'hard',
    grade: 12,
    topic: 'Kháng chiến chống Mỹ cứu nước',
    eventType: 'political',
    sourceRefs: [
      { title: 'SGK Lịch sử 12', location: 'Bài 24 – Tổng kết cuộc kháng chiến chống Mỹ' },
      { title: 'Văn kiện Đại hội Đảng lần IV', location: 'Phần I: Thắng lợi vĩ đại' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-020',
    questionText:
      'Trong Chiến dịch Hồ Chí Minh (1975), "thần tốc, táo bạo, bất ngờ, chắc thắng" là chỉ thị của ai và có ý nghĩa gì?',
    options: [
      { id: 'A', text: 'Võ Nguyên Giáp – vận dụng chiến thuật nghi binh' },
      { id: 'B', text: 'Lê Duẩn – thúc đẩy tốc độ giải phóng trước mùa mưa và thời cơ chiến lược' },
      { id: 'C', text: 'Văn Tiến Dũng – chiến thuật bao vây và tâm lý chiến' },
      { id: 'D', text: 'Hồ Chí Minh – di chúc lịch sử trước khi mất' },
    ],
    correctOptionId: 'B',
    explanation:
      'Bí thư thứ nhất Lê Duẩn đã điện chỉ thị "Thần tốc, táo bạo, bất ngờ, chắc thắng" để tận dụng thời cơ chiến lược sau sụp đổ Tây Nguyên, hoàn thành giải phóng trước mùa mưa 1975 và ngăn khả năng can thiệp quốc tế.',
    difficulty: 'hard',
    grade: 12,
    topic: 'Chiến dịch Hồ Chí Minh 1975',
    eventType: 'military',
    sourceRefs: [
      { title: 'SGK Lịch sử 12', location: 'Bài 24 – Giải phóng hoàn toàn miền Nam' },
      { title: 'Đại thắng mùa Xuân – Văn Tiến Dũng', location: 'Chương 8' },
    ],
    generatedBy: 'mock',
  },

  // ─────────────────────────────────────────────────────────────
  // BONUS – Mixed topics
  // ─────────────────────────────────────────────────────────────
  {
    id: 'q-021',
    questionText:
      'Phong trào Tây Sơn (1771-1802) có đóng góp gì đặc biệt về mặt kinh tế?',
    options: [
      { id: 'A', text: 'Mở rộng buôn bán với phương Tây và Nhật Bản' },
      { id: 'B', text: 'Bãi bỏ nhiều loại thuế, cho dân nghèo nhận đất hoang khai khẩn' },
      { id: 'C', text: 'Xây dựng hệ thống ngân hàng đầu tiên của Việt Nam' },
      { id: 'D', text: 'Chuyên môn hóa xuất khẩu lúa gạo sang Trung Quốc' },
    ],
    correctOptionId: 'B',
    explanation:
      'Nhà Tây Sơn thực hiện chính sách giảm nhẹ thuế khóa, bãi bỏ nhiều loại thuế vô lý, cho nông dân khai khẩn đất hoang, ổn định sản xuất nông nghiệp sau nhiều thập kỷ chiến tranh phân liệt.',
    difficulty: 'medium',
    grade: 10,
    topic: 'Phong trào Tây Sơn',
    eventType: 'economic',
    sourceRefs: [
      { title: 'SGK Lịch sử 10', location: 'Bài 25 – Phong trào Tây Sơn' },
    ],
    generatedBy: 'mock',
  },
  {
    id: 'q-022',
    questionText:
      'Quốc hiệu "Đại Việt" được sử dụng lần đầu tiên dưới triều đại nào?',
    options: [
      { id: 'A', text: 'Nhà Đinh' },
      { id: 'B', text: 'Nhà Lý' },
      { id: 'C', text: 'Nhà Trần' },
      { id: 'D', text: 'Nhà Lê sơ' },
    ],
    correctOptionId: 'B',
    explanation:
      'Vua Lý Thánh Tông đặt quốc hiệu "Đại Việt" năm 1054, thay cho quốc hiệu "Đại Cồ Việt" của nhà Đinh-Lê. Quốc hiệu này tồn tại qua nhiều triều đại và gắn với giai đoạn Đại Việt hưng thịnh nhất.',
    difficulty: 'easy',
    grade: 10,
    topic: 'Các triều đại phong kiến Việt Nam',
    eventType: 'political',
    sourceRefs: [
      { title: 'SGK Lịch sử 10', location: 'Bài 15 – Nhà Lý (1009-1225)' },
    ],
    generatedBy: 'mock',
  },
];

/** Helper: get questions filtered by config parameters */
export function filterQuestions(
  grade?: number,
  difficulty?: string,
  eventTypes?: string[],
  topic?: string,
): QuizQuestion[] {
  return MOCK_QUIZ_QUESTIONS.filter(q => {
    if (grade && q.grade !== grade) return false;
    if (difficulty && difficulty !== 'mixed' && q.difficulty !== difficulty) return false;
    if (eventTypes && eventTypes.length > 0 && q.eventType && !eventTypes.includes(q.eventType))
      return false;
    if (topic && !q.topic.toLowerCase().includes(topic.toLowerCase())) return false;
    return true;
  });
}

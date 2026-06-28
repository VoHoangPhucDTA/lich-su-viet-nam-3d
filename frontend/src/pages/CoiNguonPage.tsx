import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  BookOpen,
  Award,
  ArrowRight,
  Quote,
  Star,
  Clock,
} from 'lucide-react';
import type { HistoricalEvent } from '../types/event';
import { getHomepageEvents } from '../services/eventApi';
import EventCard from '../components/shared/EventCard';

export default function CoiNguonPage() {
  const navigate = useNavigate();
  const [featuredEvents, setFeaturedEvents] = useState<HistoricalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const events = await getHomepageEvents();
      if (!cancelled) {
        setFeaturedEvents(events.slice(0, 6));
        setLoading(false);
      }
    }
    load();
  return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-stone-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20 space-y-24 lg:space-y-28">

        {/* ═══════════ 1. HERO — split layout (7/5) ═══════════ */}
        <section className="relative overflow-hidden rounded-3xl border border-stone-200/60 bg-stone-100/50 p-1">
          {/* Dot pattern background */}
          <div className="absolute inset-0 bg-[radial-gradient(#c5a05915_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[550px] rounded-[22px] overflow-hidden bg-white">
            {/* Left: Content */}
            <div className="p-8 sm:p-12 lg:p-16 lg:col-span-7 flex flex-col justify-center space-y-7 z-10">
              {/* National Crest Badge */}
              <div className="flex items-center gap-2 px-3.5 py-1 bg-amber-50 text-red-900 w-fit rounded-full text-[10px] font-mono tracking-[0.15em] font-bold uppercase border border-amber-200/40 shadow-sm">
                <Star className="h-3 w-3 text-red-900" />
                <span>Quốc hiệu · Đại Việt</span>
              </div>

              {/* Headings */}
              <div className="space-y-4">
                <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-extrabold text-stone-900 leading-[1.1] tracking-tight">
                  Biên Niên Sử{' '}
                  <span className="text-red-900 font-black italic">
                    Việt Nam 3D
                  </span>
                </h1>
                <div className="h-[2px] w-24 bg-gradient-to-r from-red-900 to-amber-500/50 rounded-full" />
                <p className="text-sm sm:text-base text-stone-600 max-w-xl leading-relaxed font-medium">
                  Khám phá hành trình hơn hai nghìn năm dựng nước và giữ nước của dân tộc
                  Việt Nam qua bản đồ ba chiều tương tác — nơi mỗi địa danh là một chứng
                  tích lịch sử sống động.
                </p>
              </div>

              {/* CTAs */}
              <div className="flex flex-wrap gap-4 pt-3">
                <button
                  onClick={() => navigate('/map')}
                  className="group px-7 py-4 bg-red-900 hover:bg-red-950 text-amber-50 font-bold font-mono text-xs tracking-wider uppercase rounded-xl shadow-lg shadow-red-950/20 flex items-center gap-2.5 transition-all hover:translate-x-1 duration-300"
                >
                  <Compass className="h-4 w-4" />
                  <span>Bản Đồ Tương Tác</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => navigate('/quiz')}
                  className="px-7 py-4 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold font-mono text-xs tracking-wider uppercase rounded-xl border border-stone-200/60 flex items-center gap-2.5 transition-all duration-300"
                >
                  <BookOpen className="h-4 w-4 text-red-900" />
                  <span>Ôn Luyện Kiến Thức</span>
                </button>
              </div>

              {/* Micro stats */}
              <div className="pt-8 border-t border-stone-100 grid grid-cols-3 gap-6 text-left">
                <div className="space-y-1">
                  <span className="block font-serif text-3xl font-bold text-red-900">2.000+</span>
                  <span className="text-[9px] text-stone-400 font-mono tracking-wider uppercase font-bold block">Năm Văn Hiến</span>
                </div>
                <div className="space-y-1">
                  <span className="block font-serif text-3xl font-bold text-red-900">100+</span>
                  <span className="text-[9px] text-stone-400 font-mono tracking-wider uppercase font-bold block">Sự Kiện Tiêu Biểu</span>
                </div>
                <div className="space-y-1">
                  <span className="block font-serif text-3xl font-bold text-red-900">63</span>
                  <span className="text-[9px] text-stone-400 font-mono tracking-wider uppercase font-bold block">Tỉnh Thành</span>
                </div>
              </div>
            </div>

            {/* Right: Media Panel — framed heritage image */}
            <div className="relative lg:col-span-5 h-[340px] lg:h-full overflow-hidden bg-stone-950 border-t lg:border-t-0 lg:border-l border-stone-200/60 p-4">
              <div className="w-full h-full rounded-xl overflow-hidden relative border border-amber-500/20 group">
                <img
                  src="/vietnam_heritage_hero.jpg"
                  alt="Văn Miếu Quốc Tử Giám — Di sản văn hóa Việt Nam"
                  className="absolute inset-0 h-full w-full object-cover object-center opacity-85 transition-transform duration-[10000ms] group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/10 to-transparent" />
                {/* Painting overlay */}
                <div className="absolute bottom-4 left-4 right-4 bg-stone-900/80 backdrop-blur-md p-3 rounded-lg border border-stone-800 flex items-center justify-between">
                  <div>
                    <span className="block text-[8px] font-mono text-amber-500 uppercase tracking-widest font-bold">Ký họa khảo cổ</span>
                    <span className="text-xs font-serif font-bold text-white">Văn Miếu Quốc Tử Giám</span>
                  </div>
                  <span className="text-[9px] font-mono text-stone-400">Hà Nội, Việt Nam</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════ 2. EDUCATIONAL HIGHLIGHTS — 3-column bento grid ═══════════ */}
        <section className="space-y-8">
          <div className="text-center max-w-xl mx-auto space-y-2.5">
            <span className="font-mono text-xs text-red-900 tracking-[0.2em] uppercase font-bold">
              CÔNG CỤ HỌC TẬP
            </span>
            <h2 className="font-serif text-3xl font-black text-stone-900 leading-tight">
              Nền Tảng Số Hỗ Trợ Học Tập Lịch Sử
            </h2>
            <div className="h-0.5 w-12 bg-amber-500 mx-auto rounded-full" />
            <p className="text-xs sm:text-sm text-stone-500 leading-relaxed">
              Học tập chủ động, trực quan hóa tri thức bám sát chương trình phổ thông mới (Khối 10, 11, 12) với độ chính xác học thuật cao.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: <Compass className="h-5 w-5" />,
                title: 'Bản Đồ 3D Trực Quan',
                desc: 'Tự động định vị các cột mốc, sự kiện lịch sử trên nền bản đồ S-shape và khẳng định vững chắc chủ quyền biển đảo thiêng liêng.',
              },
              {
                icon: <Clock className="h-5 w-5" />,
                title: 'Biên Niên Sử Động',
                desc: 'Trình chiếu dòng thời gian tự động, tái hiện tiến trình hào hùng từ buổi Hùng Vương dựng nước tới thời đại Cách mạng rực rỡ.',
              },
              {
                icon: <Award className="h-5 w-5" />,
                title: 'Ôn Luyện Chuẩn THPT',
                desc: 'Hệ thống câu hỏi trắc nghiệm ôn thi Lịch sử chuẩn cấu trúc kiểm tra Quốc gia, kèm lời khảo chứng thấu đáo sâu sắc.',
              },
            ].map((feat, idx) => (
              <div
                key={feat.title}
                className="group p-7 rounded-2xl bg-white border border-stone-200/60 shadow-sm flex flex-col justify-between space-y-5 hover:shadow-md hover:border-amber-500/20 transition-all duration-300 hover:-translate-y-1 relative"
              >
                {/* Number badge — top right */}
                <div className="absolute top-4 right-4 text-[9px] font-mono text-stone-300 font-bold">
                  0{idx + 1}
                </div>
                {/* Icon */}
                <div className="h-12 w-12 rounded-xl bg-amber-50 text-red-900 flex items-center justify-center border border-amber-500/10 shadow-inner group-hover:bg-red-900 group-hover:text-amber-100 transition-colors duration-300">
                  {feat.icon}
                </div>
                {/* Text */}
                <div>
                  <h3 className="font-serif text-lg font-bold text-stone-900">
                    {feat.title}
                  </h3>
                  <p className="text-xs text-stone-500 mt-2 leading-relaxed font-medium">
                    {feat.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════ 3. QUOTE CALLOUT — full-width lacquer box ═══════════ */}
        <section className="py-14 border-t border-b border-stone-200/60 text-center relative overflow-hidden bg-amber-50/20 rounded-3xl p-6">
          <div className="absolute top-2 left-6 text-stone-200/50 pointer-events-none">
            <Quote className="h-24 w-24 opacity-30 -scale-x-100" />
          </div>
          <div className="max-w-2xl mx-auto space-y-5 px-4 relative z-10">
            <p className="font-serif text-2xl sm:text-3xl font-extrabold text-red-900 tracking-wide italic leading-relaxed">
              &ldquo;Dân ta phải biết sử ta,{' '}
              <br className="sm:hidden" />
              cho tường gốc tích nước nhà Việt Nam.&rdquo;
            </p>
            <div className="h-[2px] w-20 bg-amber-500 mx-auto rounded-full" />
            <span className="block font-mono text-[9px] text-stone-500 uppercase tracking-[0.2em] font-bold">
              Chủ tịch Hồ Chí Minh — Lịch sử nước ta (1942)
            </span>
          </div>
        </section>

        {/* ═══════════ 4. FEATURED MILESTONES — backend-driven image cards ═══════════ */}
        <section className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="font-mono text-xs text-red-900 tracking-[0.2em] uppercase font-bold">
                KÝ ỨC VÀNG THIÊNG
              </span>
              <h2 className="font-serif text-3xl font-black text-stone-900 leading-tight">
                Sự Kiện Lịch Sử Tiêu Biểu
              </h2>
            </div>
            <button
              onClick={() => navigate('/browse')}
              className="text-xs font-bold font-mono tracking-wider uppercase text-red-900 flex items-center gap-2 hover:gap-3 transition-all group"
            >
              <span>Tất cả sự kiện</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl bg-white border border-stone-200/65 overflow-hidden animate-pulse">
                  <div className="h-52 bg-stone-200" />
                  <div className="p-6 space-y-4">
                    <div className="h-4 bg-stone-100 rounded w-1/3" />
                    <div className="h-5 bg-stone-100 rounded w-2/3" />
                    <div className="h-4 bg-stone-100 rounded w-full" />
                    <div className="h-4 bg-stone-100 rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : featuredEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredEvents.map((ev) => (
                <EventCard key={ev.id} event={ev} imageHeight="h-52" />
              ))}
            </div>
          ) : (
          <div className="text-center py-16 text-stone-400 space-y-3">
            <ArrowRight className="h-8 w-8 mx-auto opacity-30" strokeWidth={1.5} />
            <p className="font-serif italic text-sm">
              Chưa có sự kiện nổi bật.
              <br />
              <button
                onClick={() => navigate('/map')}
                className="mt-2 text-red-900 font-bold font-mono text-xs tracking-wider uppercase hover:underline"
              >
                Khám phá bản đồ để bắt đầu →
              </button>
            </p>
          </div>
          )}
        </section>

        {/* ═══════════ 5. HISTORICAL ERAS — journey cards ═══════════ */}
        <section className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="font-mono text-xs text-red-900 tracking-[0.2em] uppercase font-bold">
                TIẾN TRÌNH LỊCH SỬ
              </span>
              <h2 className="font-serif text-3xl font-black text-stone-900 leading-tight">
                Thời Kỳ Lịch Sử Trọng Đại
              </h2>
            </div>
            <button
              onClick={() => navigate('/periods')}
              className="text-xs font-bold font-mono tracking-wider uppercase text-red-900 flex items-center gap-2 hover:gap-3 transition-all group"
            >
              <span>Tất cả thời kỳ</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { id: 'ancient', era: 'Cổ đại', period: '~700 TCN – 938', desc: 'Buổi đầu dựng nước và Bắc thuộc hơn nghìn năm.' },
              { id: 'feudal', era: 'Phong kiến', period: '938 – 1858', desc: 'Kỷ nguyên độc lập, tự chủ qua các triều đại Đinh, Lê, Lý, Trần, Lê, Nguyễn.' },
              { id: 'colonial', era: 'Cận đại', period: '1858 – 1945', desc: 'Thực dân Pháp xâm lược và phong trào giải phóng dân tộc.' },
              { id: 'modern', era: 'Hiện đại', period: '1945 – 1975', desc: 'Đấu tranh giành độc lập và thống nhất đất nước.' },
              { id: 'contemporary', era: 'Đương đại', period: '1975 – nay', desc: 'Xây dựng và phát triển đất nước, hội nhập quốc tế.' },
            ].map((era) => (
              <div
                key={era.id}
                onClick={() => navigate(`/periods?period=${era.id}`)}
                className="group cursor-pointer p-5 sm:p-6 rounded-2xl bg-stone-50 border border-stone-200/60 hover:border-amber-500/20 hover:bg-white shadow-sm hover:shadow-md transition-all duration-300 space-y-3"
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] font-bold text-red-900 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-500/10">
                    {era.period}
                  </span>
                  <ArrowRight className="h-4 w-4 text-stone-300 group-hover:text-red-900 transition-colors transform group-hover:translate-x-1" />
                </div>
                <h3 className="font-serif text-base font-bold text-stone-900 leading-tight">
                  {era.era}
                </h3>
                <p className="text-[11px] text-stone-500 leading-relaxed line-clamp-3 italic font-serif">
                  &ldquo;{era.desc}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="border-t border-stone-200/60 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-red-900 to-stone-900 flex items-center justify-center border border-amber-500/20">
                <Compass className="h-4 w-4 text-amber-400" strokeWidth={1.5} />
              </div>
              <span className="font-serif text-lg font-bold text-stone-900">Lịch Sử Việt Nam 3D</span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-stone-400">
              Bảo tàng số học đường THPT · {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

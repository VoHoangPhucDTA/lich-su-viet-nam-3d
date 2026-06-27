import type { MockEventDetail } from '../../data/mockEventDetails';
import SectionHeader from './SectionHeader';

interface EventTextbookContentProps {
  event: MockEventDetail;
  overviewIndex?: string;
  narrativeIndex?: string;
  significanceIndex?: string;
}

/**
 * Textbook content redesigned with CoiNguonPage design language.
 * Red-900 accent blockquotes, serif typography, white cards, subtle shadow.
 */
export default function EventTextbookContent({
  event,
  overviewIndex = '01',
  narrativeIndex = '02',
  significanceIndex = '03',
}: EventTextbookContentProps) {
  const { summary, textbookContent } = event;

  const cardClass = 'p-6 md:p-8 lg:p-10 rounded-2xl text-[15.5px] leading-loose';
  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    boxShadow: 'var(--shadow)',
  };

  return (
    <div className="flex flex-col gap-12 w-full">
      {/* === Tổng quan === */}
      <section id="tong-quan" className="scroll-mt-28">
        <SectionHeader index={overviewIndex} title="Tổng quan" />

        {summary.homepageSummary && (
          <blockquote
            className="relative italic font-serif text-lg md:text-xl leading-[1.7] mb-6 py-4 pl-7 md:pl-8 pr-6 border-l-[3px]"
            style={{
              color: 'var(--text-primary)',
              borderLeftColor: 'var(--accent)',
              background: 'linear-gradient(to right, var(--accent-soft), transparent)',
            }}
          >
            <span
              aria-hidden
              className="absolute -top-1 left-2 font-serif text-4xl leading-none select-none"
              style={{ color: 'var(--accent)', opacity: 0.25 }}
            >
              &ldquo;
            </span>
            {summary.homepageSummary}
          </blockquote>
        )}

        <article className={cardClass} style={cardStyle}>
          {textbookContent.canonicalSummary}
        </article>
      </section>

      {/* === Nội dung chi tiết === */}
      {textbookContent.detailedNarrative && (
        <section id="noi-dung-sgk" className="scroll-mt-28">
          <SectionHeader
            index={narrativeIndex}
            title="Nội dung theo sách giáo khoa"
            subtitle="Bám sát chương trình Lịch sử THPT, là nguồn chuẩn cho RAG."
          />
          <article className={`${cardClass} whitespace-pre-wrap`} style={cardStyle}>
            {textbookContent.detailedNarrative}
          </article>
        </section>
      )}

      {/* === Ý nghĩa lịch sử === */}
      {textbookContent.significance && (
        <section id="y-nghia" className="scroll-mt-28">
          <SectionHeader index={significanceIndex} title="Ý nghĩa lịch sử" />
          <div
            className={`${cardClass} relative overflow-hidden`}
            style={{
              background: 'linear-gradient(135deg, var(--accent-soft), transparent 70%), var(--bg-card)',
              border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
              boxShadow: 'var(--shadow)',
            }}
          >
            <span
              aria-hidden
              className="absolute -top-2 left-4 select-none pointer-events-none font-serif leading-none text-[7rem]"
              style={{ color: 'var(--accent)', opacity: 0.12 }}
            >
              &ldquo;
            </span>
            <p
              className="relative whitespace-pre-wrap text-[15.5px] leading-loose font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {textbookContent.significance}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

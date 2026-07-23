import type { MockEventDetail } from '../../data/mockEventDetails';
import SectionHeader from './SectionHeader';

interface EventTextbookContentProps {
  event: MockEventDetail;
  overviewIndex?: string;
  narrativeIndex?: string;
  significanceIndex?: string;
}

/**
 * Textbook content follows the shared event-detail reading rhythm.
 */
export default function EventTextbookContent({
  event,
  overviewIndex = '01',
  narrativeIndex = '02',
  significanceIndex = '03',
}: EventTextbookContentProps) {
  const { summary, textbookContent } = event;
  const normalizeOverviewText = (value?: string | null) => value?.replace(/\s+/g, ' ').trim() ?? '';
  const overviewQuote = normalizeOverviewText(summary.homepageSummary);
  const canonicalSummary = normalizeOverviewText(textbookContent.canonicalSummary);
  const showOverviewQuote = Boolean(overviewQuote) && overviewQuote !== canonicalSummary;

  const cardClass = 'w-full text-[15.5px] leading-loose';
  const cardStyle: React.CSSProperties = {
    background: 'transparent',
    border: 0,
    color: 'var(--text-secondary)',
    boxShadow: 'none',
  };

  return (
    <div className="event-longform flex flex-col gap-12 w-full">
      {/* === Tổng quan === */}
      <section id="tong-quan" className="scroll-mt-28">
        <SectionHeader index={overviewIndex} title="Tổng quan" />

        {showOverviewQuote && (
          <blockquote
            className="relative italic font-sans text-lg md:text-xl leading-[1.7] mb-6 py-4 pl-7 md:pl-8 pr-6 border-l-[3px]"
            style={{
              color: 'var(--text-primary)',
              borderLeftColor: 'var(--accent)',
              background: 'linear-gradient(to right, var(--accent-soft), transparent)',
            }}
          >
            <span
              aria-hidden
              className="absolute -top-1 left-2 font-sans text-4xl leading-none select-none"
              style={{ color: 'var(--accent)', opacity: 0.25 }}
            >
              &ldquo;
            </span>
            {summary.homepageSummary}
          </blockquote>
        )}

        <article className={`event-prose ${cardClass}`} style={cardStyle}>
          {textbookContent.canonicalSummary}
        </article>
      </section>

      {/* === Nội dung chi tiết === */}
      {textbookContent.detailedNarrative && (
        <section id="noi-dung-sgk" className="scroll-mt-28">
          <SectionHeader
            index={narrativeIndex}
            title="Nội dung chi tiết"
          />
          <article className={`event-prose ${cardClass} whitespace-pre-wrap`} style={cardStyle}>
            {textbookContent.detailedNarrative}
          </article>
        </section>
      )}

      {/* === Ý nghĩa lịch sử === */}
      {textbookContent.significance && (
        <section id="y-nghia" className="scroll-mt-28">
          <SectionHeader index={significanceIndex} title="Ý nghĩa lịch sử" />
          <div
            className={`event-prose ${cardClass} relative overflow-hidden`}
            style={{
              background: 'transparent',
              border: 0,
              boxShadow: 'none',
            }}
          >
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

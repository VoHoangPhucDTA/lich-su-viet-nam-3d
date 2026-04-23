import type { MockEventDetail } from '../../data/mockEventDetails';

interface EventTextbookContentProps {
  event: MockEventDetail;
}

export default function EventTextbookContent({ event }: EventTextbookContentProps) {
  const { summary, textbookContent } = event;

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl">
      {/* Overview section */}
      <section id="tong-quan" className="scroll-mt-24">
        <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Tổng quan</h2>
        <div className="bg-card border border-default rounded-2xl p-6 leading-8 text-[15px] text-secondary shadow-theme">
          <p className="mb-4"><strong>{summary.homepageSummary}</strong></p>
          <p>{textbookContent.canonicalSummary}</p>
        </div>
      </section>

      {/* Detailed Narrative */}
      {textbookContent.detailedNarrative && (
        <section id="noi-dung-sgk" className="scroll-mt-24">
          <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Nội dung theo sách giáo khoa</h2>
          <div className="bg-card border border-default rounded-2xl p-6 leading-8 text-[15px] text-secondary whitespace-pre-wrap shadow-theme">
            {textbookContent.detailedNarrative}
          </div>
        </section>
      )}

      {/* Significance */}
      {textbookContent.significance && (
        <section id="y-nghia" className="scroll-mt-24">
          <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Ý nghĩa lịch sử</h2>
          <div className="rounded-2xl p-6 leading-8 text-[15px] whitespace-pre-wrap border shadow-theme" style={{ background: 'var(--accent-soft)', color: 'var(--text-primary)', borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)' }}>
            <div className="flex gap-3">
              <span className="text-xl">🌟</span>
              <div>{textbookContent.significance}</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

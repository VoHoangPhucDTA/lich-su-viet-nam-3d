import { ExternalLink } from 'lucide-react';
import type { MockEventDetail } from '../../data/mockEventDetails';
import SectionHeader from './SectionHeader';

interface EventSourcesProps {
  textbookRefs?: MockEventDetail['textbookContent']['textbookRefs'];
  textbookSourceContent?: string;
  externalSources?: MockEventDetail['externalSources'];
  externalContent?: MockEventDetail['externalContent'];
  textbookIndex?: string;
  externalIndex?: string;
}

/**
 * Sources section redesigned with CoiNguonPage design language.
 * Red-900 accents, white cards, stone border, subtle hover.
 */
export default function EventSources({
  textbookRefs,
  textbookSourceContent,
  externalSources,
  externalContent,
  textbookIndex = '08',
  externalIndex = '09',
}: EventSourcesProps) {
  const hasTextbookRefs = textbookRefs && textbookRefs.length > 0;
  const normalizeText = (value?: string) => value?.replace(/\s+/g, ' ').trim() ?? '';
  const textbookContentMatchesExcerpt = (content?: string) => {
    const normalizedContent = normalizeText(content);
    return Boolean(normalizedContent) && (textbookRefs ?? []).some(
      (reference) => normalizeText(reference.excerpt) === normalizedContent,
    );
  };
  const publicExternalSources = (externalSources ?? []).filter((source) => Boolean(source.canonicalUri));
  const hasExternal =
    publicExternalSources.length > 0 ||
    (externalContent &&
      (externalContent.wikipedia ||
        externalContent.wikidata ||
        (externalContent.otherSources && externalContent.otherSources.length > 0)));

  if (!hasTextbookRefs && !hasExternal) {
    return (
      <section id="nguon-mo-rong" className="scroll-mt-28 w-full">
        <SectionHeader index={textbookIndex} title="Nguồn tham khảo" />
        <div
          className="rounded-2xl p-6 md:p-8 text-sm"
          style={{
            background: 'var(--bg-card)',
            border: '1px dashed var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          Chưa có nguồn SGK hoặc nguồn mở rộng cho sự kiện này.
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-12 w-full">
      {hasTextbookRefs && (
        <section id="nguon-sgk" className="scroll-mt-28">
          <SectionHeader
            index={textbookIndex}
            title="Nguồn sách giáo khoa"
          />
          <div className="flex flex-col gap-3">
            {textbookRefs.map((ref, idx) => (
              <div
                key={idx}
                className="p-6 md:p-8 rounded-2xl flex items-start gap-4 transition-all duration-200"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'color-mix(in srgb, var(--accent) 50%, var(--border))';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                }}
              >
                <div
                  className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2 mb-1">
                    <h4 className="font-bold text-[15px]" style={{ color: 'var(--text-primary)' }}>
                      {ref.book}
                    </h4>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-md font-mono"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}
                    >
                      Lớp {ref.grade}
                    </span>
                  </div>
                  {(ref.theme || ref.lesson) && (
                    <div className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                      {ref.theme}{ref.theme && ref.lesson && ' · '}{ref.lesson}
                    </div>
                  )}
                  {(ref.pageStart || ref.pageEnd) && (
                    <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      Trang {ref.pageStart}{ref.pageEnd && ref.pageEnd !== ref.pageStart ? ` – ${ref.pageEnd}` : ''}
                    </div>
                  )}
                  {ref.excerpt && (
                    <blockquote
                      className="mt-3 pl-3 italic text-sm"
                      style={{ borderLeft: '2px solid var(--accent)', color: 'var(--text-secondary)' }}
                    >
                      &ldquo;{ref.excerpt}&rdquo;
                    </blockquote>
                  )}
                  {idx === 0 && textbookSourceContent && !textbookContentMatchesExcerpt(textbookSourceContent) && (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-7" style={{ color: 'var(--text-secondary)' }}>
                      {textbookSourceContent}
                    </p>
                  )}
                  {ref.url && (
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
                      style={{ color: 'var(--accent)' }}
                    >
                      Mở nguồn SGK
                      <ExternalLink size={15} aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasExternal && (
        <section id="nguon-mo-rong" className="scroll-mt-28">
          <SectionHeader
            index={externalIndex}
            title="Nguồn tham khảo mở rộng"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {publicExternalSources.length > 0
              ? publicExternalSources.map((source, index) => (
                  <SourceLink
                    key={`${source.sourceType}-${source.title}-${index}`}
                    logo={source.sourceType === 'wikidata' ? 'WD' : source.sourceType === 'wikipedia' ? 'W' : '↗'}
                    name={source.sourceType === 'wikidata' ? 'Wikidata' : source.sourceType === 'wikipedia' ? 'Wikipedia' : source.sourceType}
                    title={source.title}
                    url={source.canonicalUri!}
                  />
                ))
              : <>
                  {externalContent?.wikipedia && (
                    <SourceLink logo="W" name="Wikipedia" title={externalContent.wikipedia.title} url={externalContent.wikipedia.url} />
                  )}
                  {externalContent?.wikidata && (
                    <SourceLink logo="WD" name="Wikidata" title={externalContent.wikidata.url} url={externalContent.wikidata.url} />
                  )}
                  {externalContent?.otherSources?.map((source, idx) => (
                    <SourceLink key={idx} logo="↗" name={source.name} title={source.url} url={source.url} />
                  ))}
                </>}
          </div>
        </section>
      )}
    </div>
  );
}

function SourceLink({ logo, name, title, url }: { logo: string; name: string; title: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3.5 p-[18px] rounded-xl transition-all duration-200"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent)';
        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLAnchorElement).style.transform = 'none';
      }}
    >
      <div
        className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
        style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', color: 'var(--accent)' }}
      >
        {logo}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</div>
        <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{title}</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50 group-hover:opacity-100 transition flex-shrink-0" style={{ color: 'var(--accent)' }}>
        <path d="M7 17L17 7M7 7h10v10" />
      </svg>
    </a>
  );
}

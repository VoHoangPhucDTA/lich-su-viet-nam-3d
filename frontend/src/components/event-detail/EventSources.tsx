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
                className="p-6 md:p-8 rounded-2xl transition-all duration-200"
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
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2 mb-1">
                    <h4 className="font-bold text-[15px]" style={{ color: 'var(--text-primary)' }}>
                      {ref.book}
                    </h4>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-md font-sans"
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
                    <div className="text-xs font-sans" style={{ color: 'var(--text-muted)' }}>
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
                    name={source.sourceType === 'wikidata' ? 'Wikidata' : source.sourceType === 'wikipedia' ? 'Wikipedia' : source.sourceType}
                    title={source.title}
                    url={source.canonicalUri!}
                  />
                ))
              : <>
                  {externalContent?.wikipedia && (
                    <SourceLink name="Wikipedia" title={externalContent.wikipedia.title} url={externalContent.wikipedia.url} />
                  )}
                  {externalContent?.wikidata && (
                    <SourceLink name="Wikidata" title={externalContent.wikidata.url} url={externalContent.wikidata.url} />
                  )}
                  {externalContent?.otherSources?.map((source, idx) => (
                    <SourceLink key={idx} name={source.name} title={source.url} url={source.url} />
                  ))}
                </>}
          </div>
        </section>
      )}
    </div>
  );
}

function SourceLink({ name, title, url }: { name: string; title: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center p-[18px] rounded-xl transition-all duration-200"
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
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</div>
        <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{title}</div>
      </div>
    </a>
  );
}

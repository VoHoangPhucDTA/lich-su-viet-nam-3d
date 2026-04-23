import type { MockEventDetail } from '../../data/mockEventDetails';

interface EventSourcesProps {
  textbookRefs?: MockEventDetail['textbookContent']['textbookRefs'];
  externalContent?: MockEventDetail['externalContent'];
}

export default function EventSources({ textbookRefs, externalContent }: EventSourcesProps) {
  const hasTextbookRefs = textbookRefs && textbookRefs.length > 0;
  const hasExternal = externalContent && (externalContent.wikipedia || externalContent.wikidata || (externalContent.otherSources && externalContent.otherSources.length > 0));

  if (!hasTextbookRefs && !hasExternal) {
    return (
      <div className="w-full max-w-4xl mt-8">
        <section id="nguon-mo-rong" className="scroll-mt-24">
          <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Nguồn tham khảo</h2>
          <div className="bg-card border border-default rounded-xl p-5 text-sm text-muted border-dashed">
            Chưa có nguồn SGK hoặc nguồn mở rộng cho sự kiện này.
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mt-8 flex flex-col gap-8">
      {/* Textbook Sources */}
      {hasTextbookRefs && (
        <section id="nguon-sgk" className="scroll-mt-24">
          <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Nguồn sách giáo khoa</h2>
          <div className="flex flex-col gap-3">
            {textbookRefs.map((ref, idx) => (
              <div key={idx} className="bg-card border border-default rounded-xl p-4 flex items-start gap-4 shadow-theme">
                <span className="text-2xl pt-1">📚</span>
                <div>
                  <div className="font-semibold text-primary">
                    {ref.book} <span className="text-sm font-normal text-secondary bg-surface px-2 py-0.5 rounded ml-2 border border-default">{ref.grade}</span>
                  </div>
                  {(ref.theme || ref.lesson) && (
                    <div className="text-sm text-secondary mt-1">
                      {ref.theme && <span>{ref.theme}</span>}
                      {ref.theme && ref.lesson && <span>{' - '}</span>}
                      {ref.lesson && <span>{ref.lesson}</span>}
                    </div>
                  )}
                  {(ref.pageStart || ref.pageEnd) && (
                    <div className="text-xs text-muted mt-1 font-mono">
                      Trang: {ref.pageStart}{ref.pageEnd && ref.pageEnd !== ref.pageStart ? ` - ${ref.pageEnd}` : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* External Sources */}
      {hasExternal ? (
        <section id="nguon-mo-rong" className="scroll-mt-24">
          <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Nguồn tham khảo mở rộng</h2>
          <div className="bg-card border border-default rounded-xl p-4 flex flex-col gap-3 shadow-theme">
            
            {externalContent.wikipedia && (
              <a href={externalContent.wikipedia.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-secondary hover:text-[var(--accent)] transition group">
                <div className="w-8 h-8 rounded bg-surface border border-default flex items-center justify-center flex-shrink-0">W</div>
                <div>
                  <div className="font-medium text-sm">Wikipedia</div>
                  <div className="text-xs text-muted line-clamp-1">{externalContent.wikipedia.title}</div>
                </div>
              </a>
            )}
            
            {externalContent.wikidata && (
              <a href={externalContent.wikidata.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-secondary hover:text-[var(--accent)] transition group mt-2 pt-3 border-t border-default">
                <div className="w-8 h-8 rounded bg-surface border border-default flex items-center justify-center flex-shrink-0 text-xs font-bold">WD</div>
                <div>
                  <div className="font-medium text-sm">Wikidata</div>
                  <div className="text-xs text-muted line-clamp-1 truncate block w-48">{externalContent.wikidata.url}</div>
                </div>
              </a>
            )}

            {externalContent.otherSources?.map((source, idx) => (
              <a key={idx} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-secondary hover:text-[var(--accent)] transition group mt-2 pt-3 border-t border-default">
                <div className="w-8 h-8 rounded bg-surface border border-default flex items-center justify-center flex-shrink-0 text-xs">🔗</div>
                <div>
                  <div className="font-medium text-sm">{source.name}</div>
                </div>
              </a>
            ))}

          </div>
        </section>
      ) : (
        <section id="nguon-mo-rong" className="scroll-mt-24">
          <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Nguồn tham khảo mở rộng</h2>
          <div className="bg-card border border-default rounded-xl p-4 text-sm text-muted border-dashed">
            Sự kiện này hiện chưa có nguồn mở rộng (Wikipedia/Wikidata/liên kết ngoài).
          </div>
        </section>
      )}
    </div>
  );
}

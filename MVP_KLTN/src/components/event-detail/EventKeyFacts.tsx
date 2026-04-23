interface EventKeyFactsProps {
  keyFacts?: string[];
}

export default function EventKeyFacts({ keyFacts }: EventKeyFactsProps) {
  if (!keyFacts || keyFacts.length === 0) return null;

  return (
    <section id="du-kien-chinh" className="scroll-mt-24 w-full max-w-4xl mt-8">
      <h2 className="text-2xl font-bold text-primary mb-4 border-b border-default pb-2">Dữ kiện chính cần nhớ</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {keyFacts.map((fact, index) => (
          <div key={index} className="flex items-start gap-3 bg-card border border-default rounded-xl p-4 shadow-theme">
            <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 border" style={{ background: 'color-mix(in srgb, var(--success) 20%, transparent)', color: 'var(--success)', borderColor: 'color-mix(in srgb, var(--success) 40%, transparent)' }}>
              ✓
            </div>
            <div className="text-[14px] text-secondary leading-snug">
              {fact}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

import SectionHeader from './SectionHeader';

interface EventKeyFactsProps {
  keyFacts?: string[];
  index?: string;
}

/**
 * "Dữ kiện chính cần nhớ" – grid card có số thứ tự lớn cổ điển.
 */
export default function EventKeyFacts({ keyFacts, index = '04' }: EventKeyFactsProps) {
  if (!keyFacts || keyFacts.length === 0) return null;

  return (
    <section id="du-kien-chinh" className="scroll-mt-28 w-full">
      <SectionHeader
        index={index}
        title="Dữ kiện chính cần nhớ"
        subtitle="Các điểm cốt lõi học sinh cần nắm vững khi ôn thi."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {keyFacts.map((fact, idx) => (
          <div
            key={idx}
            className="p-6 md:p-8 lg:p-10 rounded-2xl flex items-start gap-4 transition"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow)',
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLDivElement).style.borderColor =
                'color-mix(in srgb, var(--admin-accent) 50%, var(--border))')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLDivElement).style.borderColor =
                'var(--border)')
            }
          >
            <div
              className="flex-shrink-0 font-mono font-extrabold text-3xl leading-none mt-1 tracking-[-0.02em]"
              style={{ color: 'var(--admin-accent)', opacity: 0.85 }}
            >
              {String(idx + 1).padStart(2, '0')}
            </div>
            <p
              className="text-[15px] leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
            >
              {fact}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

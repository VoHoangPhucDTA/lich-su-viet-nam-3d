import { describe, expect, it } from 'vitest';
import { timelineYearsFromEvents } from './chronology';

describe('timelineYearsFromEvents', () => {
  it('keeps only dated start years, deduplicated and sorted', () => {
    const years = timelineYearsFromEvents([
      { startYear: 938 },
      { startYear: null },
      { startYear: -700 },
      { startYear: 938 },
      { startYear: Number.NaN },
    ]);

    expect(years).toEqual([-700, 938]);
  });

  it('reports 153 distinct years for a 361-event timeline with 308 dated events', () => {
    const events = Array.from({ length: 361 }, (_, index) => ({
      startYear: index < 308 ? -700 + (index % 153) : null,
    }));
    const datedEvents = events.filter((event) => event.startYear != null);
    const years = timelineYearsFromEvents(events);

    expect(events).toHaveLength(361);
    expect(datedEvents).toHaveLength(308);
    expect(years).toHaveLength(153);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(new Set(years).size).toBe(years.length);
  });
});

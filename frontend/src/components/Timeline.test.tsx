import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildTimelineRuntimeModel } from '../utils/timelineModel';
import Timeline from './Timeline';

function model(years: number[]) {
  const result = buildTimelineRuntimeModel(years);
  if (!result) throw new Error('Timeline test requires at least one year');
  return result;
}

describe('Timeline', () => {
  it('uses runtime bounds, labels the year count, and exposes no grade controls', () => {
    render(
      <Timeline
        currentYear={938}
        model={model([-700, -208, 938, 2016])}
        onYearChange={vi.fn()}
      />,
    );

    expect(screen.getByText('4 mốc năm')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveAttribute('min', '-700');
    expect(screen.getByRole('slider')).toHaveAttribute('max', '2016');
    expect(screen.queryByText('Lớp 10')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đi tới mốc 938' })).toHaveAttribute(
      'aria-current',
      'date',
    );
  });

  it('routes slider and label changes through onYearChange without cluster UI', () => {
    const onYearChange = vi.fn();
    render(
      <Timeline
        currentYear={1945}
        model={model([1945, 1954, 1975])}
        onYearChange={onYearChange}
      />,
    );

    fireEvent.change(screen.getByRole('slider'), { target: { value: '1954' } });
    expect(onYearChange).toHaveBeenCalledWith(1954);
    expect(screen.queryByRole('button', { name: /Cụm|Thu gọn|Mở rộng/ })).not.toBeInTheDocument();
  });

  it('renders a single-year domain safely', () => {
    render(<Timeline currentYear={938} model={model([938])} onYearChange={vi.fn()} />);
    expect(screen.getByRole('slider')).toHaveAttribute('min', '938');
    expect(screen.getByRole('slider')).toHaveAttribute('max', '938');
    expect(screen.getByRole('button', { name: 'Đi tới mốc 938' })).toBeInTheDocument();
  });
});

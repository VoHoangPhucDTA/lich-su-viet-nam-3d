import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TIMELINE_MAX_YEAR } from '../data/events';
import Timeline from './Timeline';

describe('Timeline', () => {
  it('labels the timeline count as years, not events', () => {
    render(
      <Timeline
        currentYear={938}
        eventYears={[-2200, -700, -208, 938, 2016]}
        onYearChange={vi.fn()}
        onGradeChange={vi.fn()}
      />
    );

    expect(screen.getByText('4 mốc năm')).toBeInTheDocument();
    expect(
      screen.getByLabelText('4 mốc năm trong dòng thời gian hiện tại; đây không phải tổng số sự kiện.')
    ).toBeInTheDocument();
    expect(screen.getByText('2000 TCN')).toBeInTheDocument();
    expect(screen.getByText('700 TCN')).toBeInTheDocument();
    const rangeStart = screen.getByRole('button', { name: 'Đi tới mốc 2000 TCN' });
    expect(rangeStart).toHaveStyle({ left: '0%' });
    expect(rangeStart).not.toHaveClass('-translate-x-1/2');
    expect(screen.getByRole('slider')).toHaveAttribute('min', '-2000');
    expect(screen.getByRole('slider')).toHaveAttribute('max', String(TIMELINE_MAX_YEAR));
    expect(
      screen.getByRole('button', { name: 'Hiển thị tất cả các lớp trong mốc thời gian hiện tại' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Đi tới mốc 938' })).toHaveAttribute('aria-current', 'date');
  });

  it('only offers a collapse action for the expandable 1789–2000 cluster', () => {
    render(
      <Timeline
        currentYear={1428}
        onYearChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Thu gọn cụm/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cụm 5 mốc thời gian: 1789–2000/ }));
    expect(
      screen.getByRole('button', { name: 'Thu gọn cụm mốc thời gian 1789 đến 2000' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đi tới mốc 938' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đi tới mốc 1010' })).toBeInTheDocument();
  });
});

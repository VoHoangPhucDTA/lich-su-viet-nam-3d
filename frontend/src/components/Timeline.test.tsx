import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Timeline from './Timeline';

describe('Timeline', () => {
  it('labels the timeline count as years, not events', () => {
    render(
      <Timeline
        currentYear={938}
        eventYears={[-700, 40, 938]}
        onYearChange={vi.fn()}
        onGradeChange={vi.fn()}
      />
    );

    expect(screen.getByText('3 mốc năm')).toBeInTheDocument();
    expect(
      screen.getByLabelText('3 mốc năm trong dòng thời gian hiện tại; đây không phải tổng số sự kiện.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hiển thị tất cả các lớp trong mốc thời gian hiện tại' })
    ).toBeInTheDocument();
  });
});

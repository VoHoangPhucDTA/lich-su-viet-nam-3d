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
        onExactYearChange={vi.fn()}
      />,
    );

    expect(screen.getByText('4 năm có sự kiện')).toBeInTheDocument();
    expect(screen.getByLabelText(/4 năm có sự kiện.*không phải tổng số sự kiện/i)).toBeInTheDocument();
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
        onExactYearChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('slider'), { target: { value: '1954' } });
    expect(onYearChange).toHaveBeenCalledWith(1954);
    expect(screen.queryByRole('button', { name: /Cụm|Thu gọn|Mở rộng/ })).not.toBeInTheDocument();
  });

  it('renders a single-year domain safely', () => {
    render(<Timeline currentYear={938} model={model([938])} onYearChange={vi.fn()} onExactYearChange={vi.fn()} />);
    expect(screen.getByRole('slider')).toHaveAttribute('min', '938');
    expect(screen.getByRole('slider')).toHaveAttribute('max', '938');
    expect(screen.getByRole('button', { name: 'Đi tới mốc 938' })).toBeInTheDocument();
  });

  it.each([
    [-938, '938 TCN'],
    [0, 'Công Nguyên'],
    [1945, '1945'],
  ])('formats exact year %s as %s', (year, label) => {
    render(
      <Timeline
        currentYear={year}
        model={model([40, 938, 1945])}
        onYearChange={vi.fn()}
        onExactYearChange={vi.fn()}
      />,
    );

    expect(screen.getByText(label, { selector: '.map-timeline-current' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nhập năm' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Đi tới' })).toBeVisible();
  });

  it('commits an in-range year without events exactly with Enter', () => {
    const onExactYearChange = vi.fn();
    render(
      <Timeline
        currentYear={1945}
        model={model([-938, 938, 1945])}
        onYearChange={vi.fn()}
        onExactYearChange={onExactYearChange}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Nhập năm' });
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onExactYearChange).toHaveBeenCalledWith(500);
  });

  it('commits signed years through the explicit action button', () => {
    const onExactYearChange = vi.fn();
    render(
      <Timeline
        currentYear={1945}
        model={model([-938, 0, 1945])}
        onYearChange={vi.fn()}
        onExactYearChange={onExactYearChange}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Nhập năm' }), { target: { value: ' -938 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đi tới' }));
    expect(onExactYearChange).toHaveBeenCalledWith(-938);
  });

  it.each([
    ['0', 0],
    ['1975', 1975],
  ])('submits exact year %s through the action button', (value, expectedYear) => {
    const onExactYearChange = vi.fn();
    render(
      <Timeline
        currentYear={938}
        model={model([-938, 938, 1975])}
        onYearChange={vi.fn()}
        onExactYearChange={onExactYearChange}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Nhập năm' }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: /^Đi tới$/ }));
    expect(onExactYearChange).toHaveBeenCalledWith(expectedYear);
  });

  it.each(['', '938.5', 'abc', '1e3', '--', '9007199254740992'])('rejects invalid exact year %j without calling the handler', (value) => {
    const onExactYearChange = vi.fn();
    render(
      <Timeline
        currentYear={1945}
        model={model([40, 938, 1945])}
        onYearChange={vi.fn()}
        onExactYearChange={onExactYearChange}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Nhập năm' });
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onExactYearChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập một năm nguyên có dấu');
  });

  it.each(['-939', '1946'])('rejects out-of-range year %s without navigating', (value) => {
    const onExactYearChange = vi.fn();
    render(
      <Timeline
        currentYear={938}
        model={model([-938, 938, 1945])}
        onYearChange={vi.fn()}
        onExactYearChange={onExactYearChange}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Nhập năm' });
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Đi tới' }));
    expect(onExactYearChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('938 TCN đến 1945');
  });
});

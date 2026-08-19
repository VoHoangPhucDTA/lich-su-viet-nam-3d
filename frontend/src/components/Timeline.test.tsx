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
    [2026, '2026'],
  ])('formats exact year %s as %s', (year, label) => {
    render(
      <Timeline
        currentYear={year}
        model={model([40, 938, 1945])}
        onYearChange={vi.fn()}
        onExactYearChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: `Chỉnh sửa năm hiện tại ${label}` })).toHaveTextContent(label);
  });

  it('commits valid exact years with Enter and blur, while Escape cancels', () => {
    const onExactYearChange = vi.fn();
    render(
      <Timeline
        currentYear={1945}
        model={model([40, 938, 1945])}
        onYearChange={vi.fn()}
        onExactYearChange={onExactYearChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa năm hiện tại 1945' }));
    const input = screen.getByRole('textbox', { name: 'Nhập năm chính xác' });
    fireEvent.change(input, { target: { value: '-938' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onExactYearChange).toHaveBeenCalledWith(-938);

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa năm hiện tại 1945' }));
    const blurInput = screen.getByRole('textbox', { name: 'Nhập năm chính xác' });
    fireEvent.change(blurInput, { target: { value: '0' } });
    fireEvent.blur(blurInput);
    expect(onExactYearChange).toHaveBeenLastCalledWith(0);

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa năm hiện tại 1945' }));
    const escapeInput = screen.getByRole('textbox', { name: 'Nhập năm chính xác' });
    fireEvent.change(escapeInput, { target: { value: '2026' } });
    fireEvent.keyDown(escapeInput, { key: 'Escape' });
    expect(onExactYearChange).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Chỉnh sửa năm hiện tại 1945' })).toHaveTextContent('1945');
  });

  it.each(['', '12.5', 'year', '9007199254740992'])('rejects invalid exact year %j without calling the handler', (value) => {
    const onExactYearChange = vi.fn();
    render(
      <Timeline
        currentYear={1945}
        model={model([40, 938, 1945])}
        onYearChange={vi.fn()}
        onExactYearChange={onExactYearChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa năm hiện tại 1945' }));
    const input = screen.getByRole('textbox', { name: 'Nhập năm chính xác' });
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onExactYearChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Chỉnh sửa năm hiện tại 1945/ })).toHaveTextContent('1945');
  });

  it('clamps only the visual slider while preserving a manual year outside the runtime domain', () => {
    render(
      <Timeline
        currentYear={2026}
        model={model([40, 938, 1945])}
        onYearChange={vi.fn()}
        onExactYearChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Chỉnh sửa năm hiện tại 2026' })).toHaveTextContent('2026');
    expect(screen.getByRole('slider')).toHaveValue('1945');
  });
});

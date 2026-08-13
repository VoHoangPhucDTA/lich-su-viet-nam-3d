import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TerrainPointTarget } from '../../utils/terrainTargets';
import DienBienPhuLearningPanel from './DienBienPhuLearningPanel';

const targets: TerrainPointTarget[] = [
  {
    id: 'dbp-session:muong-thanh',
    kind: 'point',
    label: 'Mường Thanh',
    position: { lat: 21.385, lng: 103.006 },
    sourceIndex: 400,
  },
  {
    id: 'dbp-session:raw-dien-bien-phu',
    kind: 'point',
    label: 'Điện Biên Phủ',
    position: { lat: 21.3861, lng: 103.0167 },
    sourceIndex: 8,
  },
  {
    id: 'dbp-session:him-lam',
    kind: 'point',
    label: 'Him Lam',
    position: { lat: 21.405, lng: 103.023 },
    sourceIndex: 901,
  },
  {
    id: 'dbp-session:ban-keo',
    kind: 'point',
    label: 'Bản Kéo',
    position: { lat: 21.411, lng: 102.986 },
    sourceIndex: 17,
  },
  {
    id: 'dbp-session:doi-doc-lap',
    kind: 'point',
    label: 'Đồi Độc Lập',
    position: { lat: 21.428, lng: 103.012 },
    sourceIndex: 250,
  },
];

function targetByLabel(label: string): TerrainPointTarget {
  const target = targets.find((candidate) => candidate.label === label);
  if (!target) throw new Error(`Missing test target: ${label}`);
  return target;
}

function callbacks() {
  return {
    onSelectTarget: vi.fn(),
    onShowOverview: vi.fn(),
    onExit: vi.fn(),
  };
}

function expectOldGenericTerrainCopyAbsent() {
  const oldCopy = [
    /Diễn biến \/ Theo SGK/i,
    /Chiến dịch Điện Biên Phủ diễn ra qua ba đợt/i,
    /Quan sát trên mô hình 3D/i,
    /Quan sát vị trí tương đối của Him Lam/i,
    /Theo dữ liệu bản đồ của đề tài/i,
    /Địa điểm trên bản đồ sự kiện/i,
    /Địa hình đang được phóng đại theo chiều đứng 2×/i,
    /Mô hình địa hình tham chiếu thời hiện đại/i,
  ];

  for (const pattern of oldCopy) {
    expect(screen.queryByText(pattern)).not.toBeInTheDocument();
  }
}

describe('DienBienPhuLearningPanel', () => {
  it('renders exactly the four semantic learning locations and omits the fifth raw marker', () => {
    render(
      <DienBienPhuLearningPanel
        targets={targets}
        selectedTargetId={null}
        {...callbacks()}
      />,
    );

    expect(screen.getByText(
      'Khám phá một số vị trí tiêu biểu và tìm hiểu mối liên hệ giữa chúng trong chiến dịch.',
    )).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Các địa điểm học tập tiêu biểu' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    const locationButtons = within(list).getAllByRole('button');
    expect(locationButtons).toHaveLength(4);
    expect(locationButtons.map((button) => button.querySelector('span')?.textContent)).toEqual([
      'Him Lam',
      'Đồi Độc Lập',
      'Bản Kéo',
      'Khu trung tâm Mường Thanh',
    ]);
    expect(within(list).queryByRole('button', { name: /^Điện Biên Phủ/ })).not.toBeInTheDocument();
    expectOldGenericTerrainCopyAbsent();
  });

  it('emits stable target IDs for a row, overview, and exit actions', () => {
    const handlers = callbacks();
    render(
      <DienBienPhuLearningPanel
        targets={targets}
        selectedTargetId={null}
        {...handlers}
      />,
    );

    const list = screen.getByRole('list', { name: 'Các địa điểm học tập tiêu biểu' });
    fireEvent.click(within(list).getByRole('button', { name: /Bản Kéo/ }));
    expect(handlers.onSelectTarget).toHaveBeenCalledOnce();
    expect(handlers.onSelectTarget).toHaveBeenCalledWith(targetByLabel('Bản Kéo').id);

    fireEvent.click(screen.getByRole('button', { name: 'Xem toàn bộ' }));
    expect(handlers.onShowOverview).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại góc nhìn' }));
    expect(handlers.onExit).toHaveBeenCalledOnce();
  });

  it('reacts to a controlled marker-driven Him Lam selection and exposes sourced detail', () => {
    const handlers = callbacks();
    const himLam = targetByLabel('Him Lam');
    const { rerender } = render(
      <DienBienPhuLearningPanel
        targets={targets}
        selectedTargetId={null}
        {...handlers}
      />,
    );

    rerender(
      <DienBienPhuLearningPanel
        targets={targets}
        selectedTargetId={himLam.id}
        {...handlers}
      />,
    );

    expect(handlers.onSelectTarget).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 3, name: 'Him Lam' })).toBeInTheDocument();
    expect(screen.getByText('Đợt 1 · 13/3/1954')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Vai trò' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Diễn biến' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Mối liên hệ' })).toBeInTheDocument();
    expect(screen.getByText(/cửa ngõ Đông Bắc/)).toBeInTheDocument();
    expect(screen.getByText(/Chiều 13\/3\/1954/)).toBeInTheDocument();
    expect(screen.getByText(/phá vỡ tuyến phòng ngự vòng ngoài/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Nguồn tham khảo'));
    const sourceLinks = screen.getAllByRole('link', { name: /^Mở nguồn:/ });
    expect(sourceLinks).toHaveLength(2);
    for (const link of sourceLinks) {
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }

    fireEvent.click(screen.getByRole('button', {
      name: 'Quay lại các địa điểm và xem toàn bộ bốn vị trí',
    }));
    expect(handlers.onShowOverview).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại góc nhìn' }));
    expect(handlers.onExit).toHaveBeenCalledOnce();
    expectOldGenericTerrainCopyAbsent();
  });

  it('labels Mường Thanh as a representative area with its phase', () => {
    render(
      <DienBienPhuLearningPanel
        targets={targets}
        selectedTargetId={targetByLabel('Mường Thanh').id}
        {...callbacks()}
      />,
    );

    expect(screen.getByRole('heading', {
      level: 3,
      name: 'Khu trung tâm Mường Thanh',
    })).toBeInTheDocument();
    expect(screen.getByText('Trọng điểm · Đợt 2–3')).toBeInTheDocument();
    expect(screen.getByText('Khu vực')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Vai trò' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Diễn biến' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Mối liên hệ' })).toBeInTheDocument();
  });

  it('falls back safely to overview for a stale controlled selected target ID', () => {
    const handlers = callbacks();
    render(
      <DienBienPhuLearningPanel
        targets={targets}
        selectedTargetId="stale-terrain-session:point:99"
        {...handlers}
      />,
    );

    expect(screen.getByText(
      'Khám phá một số vị trí tiêu biểu và tìm hiểu mối liên hệ giữa chúng trong chiến dịch.',
    )).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Các địa điểm học tập tiêu biểu' });
    expect(within(list).getAllByRole('button')).toHaveLength(4);
    expect(screen.queryByRole('heading', { level: 4, name: 'Vai trò' })).not.toBeInTheDocument();
    expect(handlers.onSelectTarget).not.toHaveBeenCalled();
    expect(handlers.onShowOverview).not.toHaveBeenCalled();
    expect(handlers.onExit).not.toHaveBeenCalled();
    expectOldGenericTerrainCopyAbsent();
  });
});

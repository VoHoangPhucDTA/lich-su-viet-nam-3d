import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TerrainInsight } from '../../data/terrainInsights';
import TerrainInsightCard from './TerrainInsightCard';

const insight: TerrainInsight = {
  canonicalSlug: 'fixture-event',
  relevance: 'contextual',
  headline: 'Nội dung lịch sử đã xác minh',
  explanation: 'Nội dung giải thích đã được giới hạn phạm vi.',
  observePoints: ['Quan sát điểm thứ nhất.', 'So sánh điểm thứ hai.'],
  sourceRef: 'SGK Lịch sử 11 – Bài 7, tr. 46',
  scopeNote: 'Dữ liệu bản đồ chưa có một tọa độ.',
};

describe('TerrainInsightCard', () => {
  it('renders semantic sourced content and observation prompts', () => {
    render(<TerrainInsightCard insight={insight} />);

    expect(screen.getByRole('heading', { name: insight.headline })).toBeInTheDocument();
    expect(screen.getByText('Theo SGK')).toBeInTheDocument();
    expect(screen.getByText(insight.explanation)).toBeInTheDocument();
    expect(screen.getByText(insight.sourceRef, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('labels observations as present-day 3D terrain', () => {
    render(<TerrainInsightCard insight={insight} />);
    expect(screen.getByText('Quan sát trên mô hình 3D — địa hình hiện nay')).toBeInTheDocument();
  });

  it('does not expose the whole card as a live region or move focus', () => {
    render(<TerrainInsightCard insight={insight} />);
    const region = screen.getByRole('region', { name: insight.headline });
    expect(region).not.toHaveAttribute('aria-live');
    expect(document.activeElement).toBe(document.body);
  });

  it('separates sourced, observation, and scope layers in the required order', () => {
    render(<TerrainInsightCard insight={insight} />);
    const sourced = screen.getByTestId('terrain-insight-sourced-content');
    const observation = screen.getByTestId('terrain-insight-observation-content');
    const scopeNote = screen.getByTestId('terrain-insight-scope-note');

    expect(sourced).toHaveTextContent('Theo SGK');
    expect(sourced).toHaveTextContent(insight.headline);
    expect(sourced).toHaveTextContent(insight.explanation);
    expect(sourced).toHaveTextContent('Nguồn:');
    expect(sourced).toHaveTextContent(insight.sourceRef);
    expect(sourced).not.toHaveTextContent(insight.scopeNote ?? '');
    for (const point of insight.observePoints) expect(observation).toHaveTextContent(point);
    expect(scopeNote).toHaveTextContent(insight.scopeNote ?? '');
    expect(observation.compareDocumentPosition(scopeNote) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.getAllByText(insight.sourceRef, { exact: false })).toHaveLength(1);
  });

  it('does not render an empty scope-note node when the insight has no scope note', () => {
    render(<TerrainInsightCard insight={{ ...insight, scopeNote: undefined }} />);
    expect(screen.queryByTestId('terrain-insight-scope-note')).not.toBeInTheDocument();
  });
});

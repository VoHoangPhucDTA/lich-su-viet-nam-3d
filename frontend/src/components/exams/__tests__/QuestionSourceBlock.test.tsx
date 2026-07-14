import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import QuestionSourceBlock from '../QuestionSourceBlock';

describe('QuestionSourceBlock', () => {
  it('does not render empty references', () => {
    const { container } = render(<QuestionSourceBlock sourceRefs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders source text without inventing a link', () => {
    const longTitle = 'thuvienhoclieu-com-de-thi-thu-tn-thpt-2026-mon-lich-su-chuyen-phan-boi-chau-nghe-an-lan-1';
    render(<QuestionSourceBlock sourceRefs={[{ title: longTitle, location: 'Câu 28' }]} />);
    const source = screen.getByRole('complementary', { name: /nguồn câu hỏi/i });
    expect(source).toHaveTextContent(/TN THPT/i);
    expect(source).not.toHaveTextContent('Câu 28');
    expect(source.querySelector('cite')).not.toBeNull();
    expect(source.querySelector('a')).toBeNull();
  });
});

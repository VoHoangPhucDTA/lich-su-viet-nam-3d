import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import BackButton from './BackButton';

describe('BackButton', () => {
  it('uses the explicit destination instead of browser history', async () => {
    render(
      <MemoryRouter initialEntries={['/unrelated', '/quiz']}>
        <Routes>
          <Route path="/quiz" element={<BackButton to="/home" label="Về trang chủ" />} />
          <Route path="/home" element={<p>Trang chủ</p>} />
          <Route path="/unrelated" element={<p>Trang trước trong history</p>} />
        </Routes>
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Về trang chủ' });
    expect(button.querySelector('svg')).toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.getByText('Trang chủ')).toBeInTheDocument();
    expect(screen.queryByText('Trang trước trong history')).not.toBeInTheDocument();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import LegacyPeriodsRedirect from './LegacyPeriodsRedirect';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function createRouter(entry: string, includePrevious = false) {
  return createMemoryRouter([
    {
      path: '/',
      element: <Outlet />,
      children: [
        { path: 'periods', element: <LegacyPeriodsRedirect /> },
        { path: 'browse', element: <LocationProbe /> },
        { path: 'before', element: <p>Trang trước</p> },
      ],
    },
  ], {
    initialEntries: includePrevious ? ['/before', entry] : [entry],
    initialIndex: includePrevious ? 1 : 0,
  });
}

describe('LegacyPeriodsRedirect', () => {
  it('redirects the old landing route to Browse with replace', async () => {
    const router = createRouter('/periods', true);
    render(<RouterProvider router={router} />);
    await screen.findByText('/browse');
    expect(router.state.historyAction).toBe('REPLACE');

    await router.navigate(-1);
    expect(await screen.findByText('Trang trước')).toBeInTheDocument();
  });

  it.each(['ancient', 'feudal', 'colonial', 'modern', 'contemporary'])(
    'preserves canonical period %s',
    async period => {
      const router = createRouter(`/periods?period=${period}`);
      render(<RouterProvider router={router} />);
      expect(await screen.findByTestId('location')).toHaveTextContent(`/browse?period=${period}`);
      expect(router.state.historyAction).toBe('REPLACE');
    },
  );

  it('materializes an in-period legacy manual range without period', async () => {
    const router = createRouter('/periods?period=feudal&from=1000&to=1400&q=ly&type=military');
    render(<RouterProvider router={router} />);
    await waitFor(() => {
      const location = screen.getByTestId('location').textContent ?? '';
      expect(location).toContain('/browse?');
      expect(location).toContain('q=ly');
      expect(location).toContain('type=military');
      expect(location).toContain('from=1000');
      expect(location).toContain('to=1400');
      expect(location).not.toContain('period=');
    });
  });

  it('clips a legacy manual range to the selected period boundaries', async () => {
    const router = createRouter('/periods?period=feudal&from=500&to=2000');
    render(<RouterProvider router={router} />);
    expect(await screen.findByTestId('location')).toHaveTextContent('/browse?from=938&to=1857');
  });

  it('drops an invalid legacy period safely', async () => {
    const router = createRouter('/periods?period=unknown&q=ignored');
    render(<RouterProvider router={router} />);
    expect(await screen.findByTestId('location')).toHaveTextContent('/browse');
  });
});

import { describe, expect, it } from 'vitest';

import appSource from '../../../App.tsx?raw';

describe('Admin route characterization', () => {
  it('keeps the existing core Admin routes declared', () => {
    expect(appSource).toContain('path="/admin/dashboard"');
    expect(appSource).toContain('path="/admin/users"');
    expect(appSource).toContain('path="/admin/events"');
    expect(appSource).toContain('path="/admin/events/:id"');
  });

  it('documents that event editor routes are currently absent', () => {
    expect(appSource).not.toContain('path="/admin/events/new"');
    expect(appSource).not.toContain('path="/admin/events/:id/edit"');
  });
});

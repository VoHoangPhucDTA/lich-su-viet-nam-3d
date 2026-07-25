import { describe, expect, it } from 'vitest';

import appSource from '../../../App.tsx?raw';

describe('Admin route characterization', () => {
  it('keeps the existing core Admin routes declared', () => {
    expect(appSource).toContain('path="/admin/dashboard"');
    expect(appSource).toContain('path="/admin/users"');
    expect(appSource).toContain('path="/admin/events"');
    expect(appSource).toContain('path="/admin/events/:id"');
  });

  it('opens only the protected Phase 5 event create and edit routes', () => {
    expect(appSource).toContain('path="/admin/events/new"');
    expect(appSource).toContain('path="/admin/events/:id/edit"');
    expect(appSource).not.toContain('path="/admin/events/:id/media"');
    expect(appSource).not.toContain('path="/admin/events/:id/geography"');
  });
});

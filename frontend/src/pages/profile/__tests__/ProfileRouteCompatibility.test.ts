import { describe, expect, it } from 'vitest';

import appSource from '../../../App.tsx?raw';

describe('Profile route compatibility', () => {
  it('keeps the two Profile pages protected at their existing deep links', () => {
    expect(appSource).toContain(
      'path="/profile/dashboard" element={<ProtectedRoute><ProfileDashboardPage /></ProtectedRoute>}',
    );
    expect(appSource).toContain(
      'path="/profile/settings" element={<ProtectedRoute><ProfileSettingsPage /></ProtectedRoute>}',
    );
  });

  it('keeps authenticated legacy Profile history and score redirects', () => {
    expect(appSource).toContain(
      'path="/profile/history" element={<ProtectedRoute><Navigate to="/exams/lich-su" replace /></ProtectedRoute>}',
    );
    expect(appSource).toContain(
      'path="/profile/scores" element={<ProtectedRoute><Navigate to="/exams/thong-ke" replace /></ProtectedRoute>}',
    );
  });

  it('keeps all existing dashboard CTA destinations declared', () => {
    expect(appSource).toContain('path="/exams/lich-su"');
    expect(appSource).toContain('path="/exams/thong-ke"');
    expect(appSource).toContain('path="/quiz"');
    expect(appSource).toContain('path="/quiz/generate"');
    expect(appSource).toContain('path="/exams"');
    expect(appSource).toContain('path="/exams/browse"');
  });
});

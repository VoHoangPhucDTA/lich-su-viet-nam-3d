import { describe, expect, it } from 'vitest';

import appSource from '../../../App.tsx?raw';

describe('Quiz route compatibility', () => {
  it('keeps /quiz canonical and redirects the legacy generate deep link', () => {
    expect(appSource).toContain('path="/quiz" element={<ProtectedRoute><QuizHomePage /></ProtectedRoute>}');
    expect(appSource).toContain('path="/quiz/generate" element={<Navigate to="/quiz" replace />}');
  });
});

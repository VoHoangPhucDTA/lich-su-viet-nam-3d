export const TIMER_MILESTONES = [300, 60, 0] as const;

export function getCrossedTimerMilestone(previousRemaining: number, currentRemaining: number): number | null {
  let crossed: number | null = null;
  for (const milestone of TIMER_MILESTONES) {
    if (previousRemaining > milestone && currentRemaining <= milestone) crossed = milestone;
  }
  return crossed;
}

export function formatTimerMilestone(milestone: number): string {
  if (milestone === 300) return 'Còn 5 phút';
  if (milestone === 60) return 'Còn 1 phút';
  return 'Đã hết giờ';
}

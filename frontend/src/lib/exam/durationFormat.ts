const MAX_PLAUSIBLE_DURATION_SECONDS = 24 * 60 * 60;

export function formatExamDuration(seconds: number | null | undefined): string {
  if (
    typeof seconds !== 'number'
    || !Number.isFinite(seconds)
    || seconds < 0
    || seconds > MAX_PLAUSIBLE_DURATION_SECONDS
  ) {
    return 'Không xác định';
  }

  const safeSeconds = Math.floor(seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const restSeconds = safeSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours} giờ`);
  if (minutes > 0) parts.push(`${minutes} phút`);
  if (restSeconds > 0 || parts.length === 0) parts.push(`${restSeconds} giây`);
  return parts.join(' ');
}

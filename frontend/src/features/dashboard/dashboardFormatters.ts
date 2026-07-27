export function formatDashboardScore(value: number | null): string {
  return value === null
    ? '—'
    : value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

export function formatDashboardDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} phút`;
  return `${hours} giờ ${minutes.toString().padStart(2, '0')} phút`;
}

export function formatDashboardDateLabel(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('day')}/${value('month')}`;
}

export function formatDashboardSubmittedLabel(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('hour')}:${value('minute')}, ${value('day')}/${value('month')}/${value('year')}`;
}

// Date-only arithmetic deliberately uses UTC fields: these are calendar dates,
// never instants or the device's definition of today. Today comes from the API.
const DAY = 86_400_000;
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function calendarDay(value: string, offset: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function weekday(value: string): number { return new Date(`${value}T12:00:00Z`).getUTCDay(); }
export function currentWindow(today: string, firstWeekday: number): string {
  return calendarDay(today, -((weekday(today) - firstWeekday + 7) % 7));
}
export function rangeDays(start: string, end: string): number {
  if (!isCalendarDate(start) || !isCalendarDate(end)) return 0;
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY) + 1;
}
export function rangeError(start: string, end: string): string | null {
  const count = rangeDays(start, end);
  return count >= 1 && count <= 31 ? null : 'Choose 1 to 31 days, with Through on or after From.';
}
export function nearestVisibleDay(day: string | null, start: string, end: string): string {
  if (!day) return start;
  return day < start ? start : day > end ? end : day;
}
export function rangeLabel(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const label = (date: string, showYear: boolean) => new Intl.DateTimeFormat(undefined,
    { month: 'long', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return `${label(start, !sameYear)} – ${label(end, true)}`;
}
export function calendarMonth(value: string, offset: number): string {
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}
export function monthDays(month: string): (string | null)[] {
  const start = `${month.slice(0, 7)}-01`;
  const next = calendarMonth(start, 1);
  const count = rangeDays(start, calendarDay(next, -1));
  const dates: (string | null)[] = Array.from({ length: weekday(start) }, () => null);
  for (let index = 0; index < count; index += 1) dates.push(calendarDay(start, index));
  while (dates.length % 7) dates.push(null);
  return dates;
}

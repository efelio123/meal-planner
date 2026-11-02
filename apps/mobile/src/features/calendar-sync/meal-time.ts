/** Shared entry parser: accept 24-hour clocks and explicit AM/PM without guessing. */
export function parseMealTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/iu);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2]); const period = match[3]?.toLowerCase();
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (period) hour = hour % 12 + (period === 'pm' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
export function displayMealTime(value: string) {
  const date = new Date(2000, 0, 1, Number(value.slice(0, 2)), Number(value.slice(3)));
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

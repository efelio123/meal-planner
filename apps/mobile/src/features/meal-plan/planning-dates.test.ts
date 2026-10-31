import { calendarDay, calendarMonth, currentWindow, isCalendarDate, monthDays, nearestVisibleDay, rangeDays, rangeError, rangeLabel, weekday } from './planning-dates';
import { preserveShoppingAmountOverrides } from './meal-plan-utils';

describe('date-only planning windows', () => {
  it.each([0, 1, 2, 3, 4, 5, 6])('aligns today to weekday %i without changing shared dates', (first) => {
    const start = currentWindow('2026-10-07', first);
    expect(weekday(start)).toBe(first); expect(start <= '2026-10-07').toBe(true);
    expect(calendarDay(start, 6) >= '2026-10-07').toBe(true);
  });
  it.each([['2028-02-28', 1, '2028-02-29'], ['2028-02-29', 1, '2028-03-01'], ['2026-12-31', 1, '2027-01-01'], ['2026-03-08', 1, '2026-03-09'], ['2026-11-01', -1, '2026-10-31']] as const)('adds calendar days through leap, DST and year boundaries', (start, offset, expected) => expect(calendarDay(start, offset)).toBe(expected));
  it.each([1, 7, 14, 31])('accepts %i inclusive days', (days) => {
    const end = calendarDay('2026-12-24', days - 1);
    expect(rangeDays('2026-12-24', end)).toBe(days); expect(rangeError('2026-12-24', end)).toBeNull();
  });
  it.each([['2026-10-05', '2026-10-04'], ['2026-10-05', '2026-11-05'], ['2026-02-30', '2026-03-01']])('rejects invalid/reversed/overlong ranges', (start, end) => expect(rangeError(start, end)).not.toBeNull());
  it('validates dates, labels distinct years and preserves or clamps a selected day', () => {
    expect(isCalendarDate('2026-02-29')).toBe(false); expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(nearestVisibleDay('2026-10-09', '2026-10-08', '2026-10-14')).toBe('2026-10-09');
    expect(nearestVisibleDay('2026-10-07', '2026-10-08', '2026-10-14')).toBe('2026-10-08');
    expect(nearestVisibleDay('2026-10-15', '2026-10-08', '2026-10-14')).toBe('2026-10-14');
    expect(rangeLabel('2026-12-31', '2027-01-06')).toContain('2026'); expect(rangeLabel('2026-12-31', '2027-01-06')).toContain('2027');
    expect(calendarMonth('2026-12-31', 1)).toBe('2027-01-01');
    expect(monthDays('2028-02-01').filter(Boolean)).toHaveLength(29);
  });
  it('never carries manual amounts to a changed range, even if its needs are identical', () => {
    const review = { week_start: '2026-10-05', week_end: '2026-10-11', review_token: 'a', needs: [] };
    expect(preserveShoppingAmountOverrides(review, { rice: '1' }, { ...review, week_end: '2026-10-12' })).toEqual({});
  });
});

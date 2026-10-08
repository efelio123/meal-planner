import { addCalendarDays, formatAmount, newMealRequestId } from './meal-plan-utils';

describe('meal-plan calendar helpers', () => {
  it('moves calendar dates across month, year, and leap-day boundaries without offsetting the selected day', () => {
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCalendarDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('marks unknown ingredient amounts instead of inventing a quantity', () => {
    expect(formatAmount(null, null)).toBe('Amount not specified');
    expect(formatAmount('1.5', 'Cup')).toBe('1.5 Cup');
  });

  it('creates RFC 4122-shaped idempotency request IDs', () => {
    expect(newMealRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });
});

import { addCalendarDays, formatAmount, isValidShoppingAmount, newMealRequestId, preserveShoppingAmountOverrides, shoppingReviewWeekStart } from './meal-plan-utils';

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

  it('accepts only positive decimal, fraction, and mixed-fraction shopping amounts within the numeric range', () => {
    for (const amount of ['1', '0.25', '1/2', '1 1/2']) expect(isValidShoppingAmount(amount)).toBe(true);
    for (const amount of ['', '0', '0.0', '-1', '1-2', '1/0', '0/2', 'one', '1000000000000']) {
      expect(isValidShoppingAmount(amount)).toBe(false);
    }
  });

  it('preserves amount edits only while the same need identity and recipe total remain current', () => {
    const need = { need_key: 'chicken-pound', catalog_item_id: 'chicken', name: 'Chicken', amount: '3', recipe_unit_code: 'pound', recipe_unit_dimension: 'mass' as const, unit_label: 'Pound', custom_unit_label: null, sources: [], existing_matches: [], default_selected: true };
    const review = { week_start: '2026-10-05', week_end: '2026-10-11', review_token: 'a'.repeat(64), needs: [need] };
    const edited = { 'chicken-pound': '1' };
    expect(preserveShoppingAmountOverrides(review, edited, { ...review, review_token: 'b'.repeat(64) })).toEqual(edited);
    expect(preserveShoppingAmountOverrides(review, edited, { ...review, needs: [{ ...need, amount: '4' }] })).toEqual({});
    expect(preserveShoppingAmountOverrides(review, edited, { ...review, needs: [{ ...need, catalog_item_id: 'different' }] })).toEqual({});
    expect(preserveShoppingAmountOverrides(review, edited, { ...review, needs: [] })).toEqual({});
  });

  it('creates RFC 4122-shaped idempotency request IDs', () => {
    expect(newMealRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });

  it('does not offer shopping review until the current week is usable', () => {
    const week = { week_start: '2026-10-05' } as Parameters<typeof shoppingReviewWeekStart>[0];
    expect(shoppingReviewWeekStart(null, true, null)).toBeNull();
    expect(shoppingReviewWeekStart(null, false, null)).toBeNull();
    expect(shoppingReviewWeekStart(week, true, null)).toBeNull();
    expect(shoppingReviewWeekStart(week, false, 'Refresh failed')).toBeNull();
    expect(shoppingReviewWeekStart(week, false, null)).toBe('2026-10-05');
  });
});

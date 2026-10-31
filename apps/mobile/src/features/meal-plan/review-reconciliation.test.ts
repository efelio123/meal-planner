import type { MealPlanNeed, MealPlanShoppingReview } from '@/lib/api';
import { reconcileShoppingReview } from './review-reconciliation';
const need = (key: string, overrides: Partial<MealPlanNeed> = {}): MealPlanNeed => ({ need_key: key, catalog_item_id: key, name: key, amount: '3', recipe_unit_code: 'cup', recipe_unit_dimension: 'volume', unit_label: 'Cup', custom_unit_label: null, sources: [], existing_matches: [], default_selected: true, ...overrides });
const review = (needs: MealPlanNeed[]): MealPlanShoppingReview => ({ week_start: '2026-10-05', week_end: '2026-10-11', review_token: 'a'.repeat(64), needs });
const matched = { kind: 'exact' as const, item_id: 'shopping-a', name: 'a' };
it('retains explicit deselections, edited amounts and expanded sources across an item edit', () => {
  const previous = review([need('a'), need('b'), need('c', { existing_matches: [matched], default_selected: false })]);
  const result = reconcileShoppingReview(previous, ['a'], { a: '1' }, ['a'], { ...previous, review_token: 'b'.repeat(64) });
  expect(result).toEqual({ selected: ['a'], overrides: { a: '1' }, expanded: ['a'], adjustedAmountsChanged: false });
});
it('makes removed matches eligible, deselects new matches and resets changed quantities safely', () => {
  const before = review([need('a'), need('b', { existing_matches: [matched], default_selected: false }), need('c')]);
  const next = review([need('a', { existing_matches: [matched] }), need('b'), need('c', { amount: '4' })]);
  expect(reconcileShoppingReview(before, ['a', 'c'], { a: '1', c: '2' }, ['a', 'missing'], next)).toEqual({ selected: ['b', 'c'], overrides: {}, expanded: ['a'], adjustedAmountsChanged: true });
});
it('uses defaults only for a new range or initial review', () => {
  const before = review([need('a')]);
  expect(reconcileShoppingReview(before, [], { a: '1' }, ['a'], { ...before, week_end: '2026-10-12' })).toEqual({ selected: ['a'], overrides: {}, expanded: [], adjustedAmountsChanged: false });
});

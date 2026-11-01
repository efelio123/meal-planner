import type { MealPlanShoppingReview } from '@/lib/api';
import { preserveShoppingAmountOverrides } from './meal-plan-utils';

export function reconcileShoppingReview(previous: MealPlanShoppingReview | null, selected: readonly string[], overrides: Record<string, string>, expanded: readonly string[], next: MealPlanShoppingReview) {
  const sameRange = previous?.week_start === next.week_start && previous.week_end === next.week_end;
  const oldNeeds = new Map((sameRange ? previous.needs : []).map((need) => [need.need_key, need]));
  const chosen = new Set(selected);
  const nextSelected = next.needs.filter((need) => {
    if (need.existing_matches.length) return false;
    const old = oldNeeds.get(need.need_key);
    return old && !old.existing_matches.length && old.amount === need.amount ? chosen.has(need.need_key) : need.default_selected;
  }).map((need) => need.need_key);
  const allowedOverrides = preserveShoppingAmountOverrides(sameRange ? previous : null, overrides, next);
  const eligible = new Set(next.needs.filter((need) => !need.existing_matches.length).map((need) => need.need_key));
  const nextOverrides = Object.fromEntries(Object.entries(allowedOverrides).filter(([key]) => eligible.has(key)));
  const available = new Set(next.needs.map((need) => need.need_key));
  return {
    selected: nextSelected, overrides: nextOverrides,
    expanded: sameRange ? expanded.filter((key) => available.has(key)) : [],
    adjustedAmountsChanged: sameRange && Object.keys(nextOverrides).length < Object.keys(overrides).length,
  };
}

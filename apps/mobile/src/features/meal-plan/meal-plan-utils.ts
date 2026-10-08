import type { MealPlanNeed, MealPlanShoppingReview, MealPlanWeek, MealSlot } from '@/lib/api';

export const MEAL_SLOTS: { id: MealSlot; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
];

export function addCalendarDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

export function dateLabel(dateValue: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${dateValue}T12:00:00`));
}

export function shortDayLabel(dateValue: string) {
  return dateLabel(dateValue, { weekday: 'short' });
}

export function dayNumber(dateValue: string) {
  return dateLabel(dateValue, { day: 'numeric' });
}

export function formatAmount(value: string | null, unit: string | null) {
  if (!value) return 'Amount not specified';
  return unit ? `${value} ${unit}` : value;
}

export function isValidShoppingAmount(value: string): boolean {
  const amount = value.trim();
  if (!amount) return false;
  let numeric: number;
  if (/^\d+(?:\.\d+)?$/u.test(amount)) {
    numeric = Number(amount);
  } else {
    const mixed = amount.match(/^(\d+)\s+(\d+)\/(\d+)$/u);
    const fraction = amount.match(/^(\d+)\/(\d+)$/u);
    const parts = mixed ?? fraction;
    if (!parts) return false;
    const whole = mixed ? Number(parts[1]) : 0;
    const numerator = Number(mixed ? parts[2] : parts[1]);
    const denominator = Number(mixed ? parts[3] : parts[2]);
    if (denominator <= 0 || numerator <= 0) return false;
    numeric = whole + numerator / denominator;
  }
  return Number.isFinite(numeric) && numeric > 0 && numeric < 1_000_000_000_000;
}

export function preserveShoppingAmountOverrides(
  previousReview: MealPlanShoppingReview | null,
  overrides: Record<string, string>,
  nextReview: MealPlanShoppingReview,
): Record<string, string> {
  if (!previousReview) return {};
  const previousNeeds = new Map(previousReview.needs.map((need) => [need.need_key, need]));
  const nextNeeds = new Map(nextReview.needs.map((need) => [need.need_key, need]));
  return Object.fromEntries(Object.entries(overrides).filter(([key, value]) => {
    const before = previousNeeds.get(key);
    const after = nextNeeds.get(key);
    return before && after && sameNeedIdentity(before, after) && before.amount === after.amount &&
      value !== after.amount && isValidShoppingAmount(value);
  }));
}

function sameNeedIdentity(before: MealPlanNeed, after: MealPlanNeed) {
  return before.catalog_item_id === after.catalog_item_id &&
    before.recipe_unit_code === after.recipe_unit_code &&
    before.recipe_unit_dimension === after.recipe_unit_dimension &&
    before.custom_unit_label?.trim().toLocaleLowerCase() === after.custom_unit_label?.trim().toLocaleLowerCase();
}

export function shoppingReviewWeekStart(week: MealPlanWeek | null, loading: boolean, error: string | null): string | null {
  return !loading && !error && week?.week_start ? week.week_start : null;
}

export function newMealRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

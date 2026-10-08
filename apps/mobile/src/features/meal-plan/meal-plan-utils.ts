import type { MealSlot } from '@/lib/api';

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

export function newMealRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

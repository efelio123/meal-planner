export type LabProps = {
  view: 'shopping' | 'plan'; selectedDay: number; size: 'small' | 'medium' | 'large';
  items: { id: string; name: string; confirmedChecked: boolean; pendingChecked: boolean | null }[];
  days: { date: string; label: string; breakfast: string; lunch: string; dinner: string }[];
  colors: { background: string; text: string; secondary: string; primary: string };
};
/** Fictional data only. This prototype never reads the consumer app or calls its API. */
export function freshSample(): LabProps {
  return {
    view: 'shopping', selectedDay: 0, size: 'medium',
    items: ['Milk', 'Rice', 'Soap'].map((name, index) => ({ id: `sample-${index}`, name, confirmedChecked: false, pendingChecked: null })),
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, index) => ({ date: `2026-11-${String(index + 2).padStart(2, '0')}`, label,
      breakfast: index === 0 ? 'Oatmeal' : 'Toast', lunch: index === 1 ? 'Leftovers — Tacos' : 'Soup', dinner: index === 2 ? 'Eating out' : 'Chicken tacos' })),
    colors: { background: '#E4C7AC', text: '#50322B', secondary: '#67574E', primary: '#293447' },
  };
}

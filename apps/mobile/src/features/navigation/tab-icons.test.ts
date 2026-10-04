import { tabIcons } from '@/features/navigation/tab-icons';

it('defines platform-specific SF and Material symbols for every tab', () => {
  expect(Object.keys(tabIcons)).toEqual(['plan', 'recipes', 'shopping', 'catalog', 'profile']);

  for (const icon of Object.values(tabIcons)) {
    expect(icon.ios).toBeTruthy();
    expect(icon.android).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(icon.web).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(icon.web).not.toBe(icon.ios);
  }

  expect(tabIcons).toMatchObject({
    plan: { web: 'calendar_month' },
    recipes: { web: 'menu_book' },
    shopping: { web: 'shopping_cart' },
    catalog: { web: 'kitchen' },
    profile: { web: 'account_circle' },
  });
});

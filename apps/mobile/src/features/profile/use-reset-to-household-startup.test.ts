import type { NavigationState } from 'expo-router';
import { clearHouseholdTabHistory } from './use-reset-to-household-startup';

function stack(name: string, includeRoot = true): NavigationState {
  return {
    key: `${name}-stack`, type: 'stack', stale: false, routeKeySeq: 4,
    index: includeRoot ? 1 : 0, routeNames: ['index', 'details'],
    routes: [
      ...(includeRoot ? [{ name: 'index', key: `${name}-index` }] : []),
      { name: 'details', key: `${name}-details`, params: { householdId: 'old-household' } },
    ],
  };
}

it('clears retained detail routes in every visited tab without mutating the original tree', () => {
  const original: NavigationState = {
    key: 'tabs', type: 'tab', stale: false, index: 1, routeKeySeq: 2,
    routeNames: ['plan', 'profile'], history: [{ type: 'route', key: 'profile' }],
    routes: [
      { name: 'plan', key: 'plan', state: stack('plan') },
      { name: 'profile', key: 'profile', state: stack('profile') },
    ],
  };
  const reset = clearHouseholdTabHistory(original);
  expect(reset.key).toBe(original.key);
  expect(reset.routeNames).toEqual(original.routeNames);
  for (const route of reset.routes) {
    expect(route.state).toMatchObject({ stale: false, index: 0 });
    expect(route.state?.routes).toEqual([{ name: 'index', key: `${route.name}-index` }]);
  }
  expect(original.routes[1].state?.routes).toHaveLength(2);
});

it('creates a clean root route for a stack originally opened by a deep link', () => {
  const original = stack('profile', false);
  const reset = clearHouseholdTabHistory(original);
  expect(reset.routes).toEqual([{ name: 'index', key: 'profile-stack-household-root-4' }]);
  expect(reset.routeKeySeq).toBe(5);
});

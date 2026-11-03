import { render } from '@testing-library/react-native';
import { useAuth } from '@clerk/expo';
import { useHouseholdState } from '@/hooks/use-household-state';
import { nativeWidgets, widgetSessionKey, widgetScopeKey } from './native-adapter';
import { WidgetSessionFence } from './widget-provider';
import { apiOrigin } from '@/auth-config';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@clerk/expo', () => ({ useAuth: jest.fn() }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: jest.fn() }));
jest.mock('./native-adapter', () => {
  const actual = jest.requireActual('./native-adapter');
  const bridge = { verifySession: jest.fn(), activateScope: jest.fn() };
  return { ...actual, nativeWidgets: () => bridge };
});
const auth = jest.mocked(useAuth);
const household = jest.mocked(useHouseholdState);
const bridge = nativeWidgets()!;
beforeEach(() => {
  jest.clearAllMocks();
  auth.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: 'actor', sessionId: 'session' } as ReturnType<typeof useAuth>);
  household.mockReturnValue({ destination: 'app', selectedHousehold: { id: 'home' }, me: { user: { id: 'local-user' } } } as ReturnType<typeof useHouseholdState>);
});
test('a household switch is fenced before app navigation finishes', async () => {
  const page = await render(<WidgetSessionFence />);
  const key = widgetSessionKey(apiOrigin, 'actor', 'session');
  expect(bridge.activateScope).toHaveBeenLastCalledWith(widgetScopeKey(key, 'local-user', 'home'));
  household.mockReturnValue({ destination: 'app', selectedHousehold: { id: 'next-home' }, me: { user: { id: 'local-user' } } } as ReturnType<typeof useHouseholdState>);
  await page.rerender(<WidgetSessionFence />);
  expect(bridge.activateScope).toHaveBeenLastCalledWith(widgetScopeKey(key, 'local-user', 'next-home'));
});
test('confirmed sign-out clears while initial auth loading preserves offline work', async () => {
  auth.mockReturnValue({ isLoaded: false } as ReturnType<typeof useAuth>);
  const page = await render(<WidgetSessionFence />);
  expect(bridge.verifySession).not.toHaveBeenCalled();
  auth.mockReturnValue({ isLoaded: true, isSignedIn: false } as ReturnType<typeof useAuth>);
  await page.rerender(<WidgetSessionFence />);
  expect(bridge.verifySession).toHaveBeenCalledWith(null);
});
test('a confirmed missing household clears; a transient API error preserves the same session', async () => {
  household.mockReturnValue({ destination: 'api-error' } as ReturnType<typeof useHouseholdState>);
  const page = await render(<WidgetSessionFence />);
  expect(bridge.activateScope).not.toHaveBeenCalled();
  household.mockReturnValue({ destination: 'create-or-join' } as ReturnType<typeof useHouseholdState>);
  await page.rerender(<WidgetSessionFence />);
  expect(bridge.activateScope).toHaveBeenCalledWith(null);
});

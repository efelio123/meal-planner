import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { MyHouseholdsScreen } from '@/features/household-management/my-households-screen';

let mockRefresh: jest.Mock;
let mockHouseholds: { id: string; name: string; role: 'owner' | 'member'; time_zone: string }[];
let mockSelectedHousehold: { id: string; name: string; role: 'owner' | 'member'; time_zone: string } | null;

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ isSignedIn: true, sessionId: 'session-a', userId: 'user-a' }) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({
  households: mockHouseholds,
  isSigningOut: false,
  refresh: mockRefresh,
  selectedHousehold: mockSelectedHousehold,
}) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe('MyHouseholdsScreen refresh', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    mockRefresh = jest.fn();
    mockHouseholds = [{ id: 'home-a', name: 'Home', role: 'owner', time_zone: 'UTC' }];
    mockSelectedHousehold = mockHouseholds[0];
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('offers a web refresh action, marks stale data after failure, and allows retry', async () => {
    const retry = deferred<{ households: typeof mockHouseholds } | null>();
    mockRefresh.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(retry.promise);
    const rendered = await render(<MyHouseholdsScreen />);

    await fireEvent.press(rendered.getByRole('button', { name: 'Refresh households' }));
    expect(await rendered.findByText('Showing the last confirmed household information.')).toBeTruthy();
    expect(await rendered.findByRole('alert')).toBeTruthy();
    expect(rendered.getByRole('button', { name: 'Retry refresh' })).toBeTruthy();

    await fireEvent.press(rendered.getByRole('button', { name: 'Retry refresh' }));
    expect(await rendered.findByText('Refreshing households…')).toBeTruthy();
    await act(async () => {
      retry.resolve({ households: mockHouseholds });
      await retry.promise;
    });
    await rendered.findByRole('button', { name: 'Refresh households' });

    expect(rendered.queryByRole('alert')).toBeNull();
    expect(rendered.queryByText('Showing the last confirmed household information.')).toBeNull();
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });

});

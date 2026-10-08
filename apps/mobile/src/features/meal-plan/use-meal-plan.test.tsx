import { act, renderHook, waitFor } from '@testing-library/react-native';
import { api, type MealPlanWeek } from '@/lib/api';
import { useMealPlan } from './use-meal-plan';
import { addCalendarDays } from './meal-plan-utils';

let mockHouseholdId = 'household-a';
let mockUserId = 'user-a';
let mockSessionId = 'session-a';
const mockGetToken = jest.fn().mockResolvedValue('session-token');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function week(offset: number, today: string): MealPlanWeek {
  const weekStart = addCalendarDays('2026-10-05', offset * 7);
  return {
    time_zone: 'America/Phoenix', local_today: today, week_start: weekStart, week_end: addCalendarDays(weekStart, 6),
    week_offset: offset, entries: [],
  };
}

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: mockUserId, sessionId: mockSessionId }) }));
jest.mock('@/hooks/use-household-state', () => ({
  useHouseholdState: () => ({ getToken: mockGetToken, selectedHousehold: { id: mockHouseholdId } }),
}));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, mealPlan: jest.fn(), createMealPlanEntry: jest.fn(), updateMealPlanEntry: jest.fn(), deleteMealPlanEntry: jest.fn() } };
});

const mockedApi = jest.mocked(api);

describe('useMealPlan request scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHouseholdId = 'household-a';
    mockUserId = 'user-a';
    mockSessionId = 'session-a';
    mockGetToken.mockResolvedValue('session-token');
    mockedApi.mealPlan.mockResolvedValue(week(0, '2026-10-05'));
  });

  it('refreshes Today without stranding a pending current-week load', async () => {
    const old = deferred<MealPlanWeek>();
    mockedApi.mealPlan.mockReturnValueOnce(old.promise).mockResolvedValueOnce(week(0, '2026-10-06'));
    const hook = await renderHook(() => useMealPlan());
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(1));

    await act(async () => { await hook.result.current.setTodayWeek(); });
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(2));
    expect(hook.result.current.week?.local_today).toBe('2026-10-06');
    expect(hook.result.current.loading).toBe(false);

    await act(async () => { old.resolve(week(0, '2026-10-05')); await old.promise; });
    expect(hook.result.current.week?.local_today).toBe('2026-10-06');
  });

  it('ignores a delayed previous-household response', async () => {
    const old = deferred<MealPlanWeek>();
    mockedApi.mealPlan.mockReturnValueOnce(old.promise).mockResolvedValueOnce(week(0, '2026-10-06'));
    const hook = await renderHook(() => useMealPlan());
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(1));

    mockHouseholdId = 'household-b';
    await hook.rerender(undefined);
    await waitFor(() => expect(hook.result.current.week?.local_today).toBe('2026-10-06'));
    await act(async () => { old.resolve(week(0, '2026-10-05')); await old.promise; });

    expect(hook.result.current.householdId).toBe('household-b');
    expect(hook.result.current.week?.local_today).toBe('2026-10-06');
    expect(mockedApi.mealPlan).toHaveBeenCalledTimes(2);
  });

  it('ignores a delayed prior-session response for the same household', async () => {
    const old = deferred<MealPlanWeek>();
    mockedApi.mealPlan.mockReturnValueOnce(old.promise).mockResolvedValueOnce(week(0, '2026-10-07'));
    const hook = await renderHook(() => useMealPlan());
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(1));

    mockUserId = 'user-b';
    mockSessionId = 'session-b';
    await hook.rerender(undefined);
    await waitFor(() => expect(hook.result.current.week?.local_today).toBe('2026-10-07'));
    await act(async () => { old.resolve(week(0, '2026-10-05')); await old.promise; });

    expect(hook.result.current.week?.local_today).toBe('2026-10-07');
    expect(mockedApi.mealPlan).toHaveBeenCalledTimes(2);
  });

  it('ignores an older week response after the selected week changes', async () => {
    const old = deferred<MealPlanWeek>();
    mockedApi.mealPlan.mockReturnValueOnce(old.promise).mockResolvedValueOnce(week(1, '2026-10-12'));
    const hook = await renderHook(() => useMealPlan());
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(1));

    await act(async () => { hook.result.current.changeWeek(1); });
    await waitFor(() => expect(hook.result.current.weekOffset).toBe(1));
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.week?.week_offset).toBe(1));
    await act(async () => { old.resolve(week(0, '2026-10-05')); await old.promise; });

    expect(hook.result.current.week?.week_offset).toBe(1);
    expect(mockedApi.mealPlan).toHaveBeenLastCalledWith(expect.any(Function), 'household-a', 1);
  });

  it('does not let a pending mutation refresh an old week after the selected week changes', async () => {
    const mutation = deferred<{ entry: { id: string } }>();
    mockedApi.createMealPlanEntry.mockReturnValueOnce(mutation.promise as never);
    mockedApi.mealPlan.mockImplementation(async (_token, _householdId, offset = 0) => week(offset, offset === 0 ? '2026-10-05' : '2026-10-12'));
    const hook = await renderHook(() => useMealPlan());
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hook.result.current.week?.week_offset).toBe(0));

    let pendingMutation!: Promise<void>;
    await act(async () => { pendingMutation = hook.result.current.create({ planned_for: '2026-10-05', meal_slot: 'dinner', recipe_id: 'recipe-a' }); });
    await waitFor(() => expect(mockedApi.createMealPlanEntry).toHaveBeenCalledTimes(1));
    await act(async () => { hook.result.current.changeWeek(1); });
    expect(hook.result.current.weekOffset).toBe(1);
    await waitFor(() => expect(hook.result.current.week?.week_offset).toBe(1));
    await act(async () => { mutation.resolve({ entry: { id: 'entry-a' } }); await pendingMutation; });

    expect(hook.result.current.week?.week_offset).toBe(1);
    expect(mockedApi.mealPlan).toHaveBeenCalledTimes(2);
    expect(mockedApi.mealPlan).toHaveBeenLastCalledWith(expect.any(Function), 'household-a', 1);
  });
});

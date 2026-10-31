import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ApiError, api, type MealPlanEntry, type MealPlanWeek } from '@/lib/api';
import { useMealPlan } from './use-meal-plan';
import { addCalendarDays } from './meal-plan-utils';

let mockHouseholdId = 'household-a';
let mockUserId = 'user-a';
let mockSessionId = 'session-a';
const mockGetToken = jest.fn().mockResolvedValue('session-token');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
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


const plannedEntry = (id: string, slot: MealPlanEntry['meal_slot'] = 'breakfast'): MealPlanEntry => ({
  id, planned_for: '2026-10-05', meal_slot: slot, recipe_id: 'recipe-a', recipe_name: 'Soup',
  edit_revision: 1, cover_kind: 'initials', cover_emoji: null, ingredient_count: 1,
});
const populatedWeek = (): MealPlanWeek => ({ ...week(0, '2026-10-05'), entries: [plannedEntry('a'), plannedEntry('b', 'dinner')] });

describe('confirmed meal removal and recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks(); mockHouseholdId = 'household-a'; mockUserId = 'user-a'; mockSessionId = 'session-a';
    mockedApi.mealPlan.mockReset().mockResolvedValue(populatedWeek());
    mockedApi.deleteMealPlanEntry.mockReset().mockResolvedValue(undefined);
  });
  async function loaded() {
    const hook = await renderHook(() => useMealPlan());
    await waitFor(() => expect(hook.result.current.week?.entries).toHaveLength(2));
    return hook;
  }
  it('keeps only the confirmed occurrence removed when its following read fails', async () => {
    const hook = await loaded();
    mockedApi.mealPlan.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await hook.result.current.remove('a', 1); });
    expect(hook.result.current.week?.entries.map((entry) => entry.id)).toEqual(['b']);
    expect(hook.result.current.error).toContain('load this week');
    expect(hook.result.current.pendingRemovalIds.size).toBe(0);
    expect(hook.result.current.blockedRemovalIds.size).toBe(0);
    expect(hook.result.current.week?.entries[0].recipe_id).toBe('recipe-a');
  });
  it('deduplicates one entry while allowing a different meal to be removed concurrently', async () => {
    const hook = await loaded();
    const first = deferred<void>(); const second = deferred<void>();
    mockedApi.deleteMealPlanEntry.mockImplementation((_token, _household, id) => id === 'a' ? first.promise : second.promise);
    let a!: Promise<void>; let again!: Promise<void>; let b!: Promise<void>;
    await act(async () => { a = hook.result.current.remove('a', 1); again = hook.result.current.remove('a', 1); b = hook.result.current.remove('b', 1); });
    expect(a).toBe(again);
    expect(mockedApi.deleteMealPlanEntry).toHaveBeenCalledTimes(2);
    expect([...hook.result.current.pendingRemovalIds].sort()).toEqual(['a', 'b']);
    await act(async () => { second.resolve(); await b; });
    expect(hook.result.current.week?.entries.map((entry) => entry.id)).toEqual(['a']);
    expect([...hook.result.current.pendingRemovalIds]).toEqual(['a']);
    await act(async () => { first.resolve(); await a; });
    expect(hook.result.current.week?.entries).toHaveLength(0);
    expect(hook.result.current.pendingRemovalIds.size).toBe(0);
  });
  it('filters confirmed IDs from stale reads and ignores an older in-flight response', async () => {
    const hook = await loaded();
    const oldRead = deferred<MealPlanWeek>();
    mockedApi.mealPlan.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce(populatedWeek());
    let oldRefresh!: Promise<MealPlanWeek | null>;
    await act(async () => { oldRefresh = hook.result.current.refresh(); });
    await act(async () => { await hook.result.current.remove('a', 1); });
    expect(hook.result.current.week?.entries.map((entry) => entry.id)).toEqual(['b']);
    await act(async () => { oldRead.resolve(populatedWeek()); await oldRefresh; });
    expect(hook.result.current.week?.entries.map((entry) => entry.id)).toEqual(['b']);
  });
  it('rejects an out-of-date entry revision before sending any DELETE', async () => {
    const hook = await loaded();
    await act(async () => { await expect(hook.result.current.remove('a', 0)).rejects.toMatchObject({ code: 'MEAL_PLAN_REVISION_CONFLICT' }); });
    expect(mockedApi.deleteMealPlanEntry).not.toHaveBeenCalled();
    expect(hook.result.current.week?.entries).toHaveLength(2);
  });
  it.each([
    { label: 'network', reason: new Error('connection lost') },
    { label: 'not found', reason: new ApiError(404, 'Meal unavailable.') },
    { label: 'revision', reason: new ApiError(409, 'Meal changed.', 'MEAL_PLAN_REVISION_CONFLICT') },
  ])('requires fresh data before retry after $label failure', async ({ reason }) => {
    const hook = await loaded();
    mockedApi.deleteMealPlanEntry.mockRejectedValueOnce(reason);
    mockedApi.mealPlan.mockRejectedValueOnce(new Error('read offline'));
    await act(async () => { await expect(hook.result.current.remove('a', 1)).rejects.toBe(reason); });
    expect(hook.result.current.week?.entries).toHaveLength(2);
    expect(hook.result.current.blockedRemovalIds.has('a')).toBe(true);
    await act(async () => { await expect(hook.result.current.remove('a', 1)).rejects.toThrow('Refresh'); });
    expect(mockedApi.deleteMealPlanEntry).toHaveBeenCalledTimes(1);
    const fresh = populatedWeek(); fresh.entries[0] = { ...fresh.entries[0], edit_revision: 2 };
    mockedApi.mealPlan.mockResolvedValue(fresh);
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.blockedRemovalIds.size).toBe(0);
    await act(async () => { await hook.result.current.remove('a', 2); });
    expect(mockedApi.deleteMealPlanEntry).toHaveBeenCalledTimes(2);
    expect(mockedApi.deleteMealPlanEntry).toHaveBeenLastCalledWith(expect.any(Function), 'household-a', 'a', 2);
  });
  it('reconciles an unknown deletion through a fresh read without retrying DELETE automatically', async () => {
    const hook = await loaded();
    mockedApi.deleteMealPlanEntry.mockRejectedValueOnce(new Error('response lost'));
    mockedApi.mealPlan.mockResolvedValue({ ...populatedWeek(), entries: [plannedEntry('b', 'dinner')] });
    await act(async () => { await expect(hook.result.current.remove('a', 1)).rejects.toThrow('response lost'); });
    expect(hook.result.current.week?.entries.map((entry) => entry.id)).toEqual(['b']);
    expect(mockedApi.deleteMealPlanEntry).toHaveBeenCalledTimes(1);
  });
  it.each(['household', 'session', 'week'] as const)('rejects late callbacks even after returning to the same %s', async (change) => {
    const hook = await loaded(); const oldRemove = hook.result.current.remove;
    if (change === 'household') mockHouseholdId = 'household-b';
    if (change === 'session') mockSessionId = 'session-b';
    if (change === 'week') await act(async () => { hook.result.current.changeWeek(1); });
    else await hook.rerender(undefined);
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(2));
    await act(async () => { await expect(oldRemove('a', 1)).rejects.toThrow('selected plan changed'); });
    if (change === 'household') mockHouseholdId = 'household-a';
    if (change === 'session') mockSessionId = 'session-a';
    if (change === 'week') await act(async () => { hook.result.current.changeWeek(-1); });
    else await hook.rerender(undefined);
    await waitFor(() => expect(mockedApi.mealPlan).toHaveBeenCalledTimes(3));
    await act(async () => { await expect(oldRemove('a', 1)).rejects.toThrow('selected plan changed'); });
    expect(mockedApi.deleteMealPlanEntry).not.toHaveBeenCalled();
  });
  it.each(['household', 'session', 'week'] as const)('does not let an in-flight deletion replace a new %s view', async (change) => {
    const hook = await loaded(); const deleting = deferred<void>();
    mockedApi.deleteMealPlanEntry.mockReturnValueOnce(deleting.promise);
    let removal!: Promise<void>;
    await act(async () => { removal = hook.result.current.remove('a', 1); });
    mockedApi.mealPlan.mockResolvedValue({ ...week(1, '2026-10-12'), entries: [plannedEntry('new-view', 'lunch')] });
    if (change === 'household') mockHouseholdId = 'household-b';
    if (change === 'session') mockSessionId = 'session-b';
    if (change === 'week') await act(async () => { hook.result.current.changeWeek(1); });
    else await hook.rerender(undefined);
    await waitFor(() => expect(hook.result.current.week?.entries[0].id).toBe('new-view'));
    await act(async () => { deleting.resolve(); await removal; });
    expect(hook.result.current.week?.entries[0].id).toBe('new-view');
    expect(mockedApi.mealPlan).toHaveBeenCalledTimes(2);
  });
});

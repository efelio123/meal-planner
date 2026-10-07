import { act, renderHook, waitFor } from '@testing-library/react-native';
import { api, type Recipe } from '@/lib/api';
import { useRecipes } from './use-recipes';

let mockHouseholdId = 'household-a';
let mockUserId = 'user-a';
let mockSessionId = 'session-a';
const mockGetToken = jest.fn().mockResolvedValue('token');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function recipe(id: string): Recipe {
  return {
    id, household_id: 'household-b', name: `Recipe ${id}`, cover_kind: 'initials', cover_emoji: null,
    servings: null, prep_minutes: null, cook_minutes: null, notes: null, source_url: null, edit_revision: 1,
    created_at: '', updated_at: '', archived_at: null, ingredient_count: 0, ingredients: [], steps: [],
  };
}

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ sessionId: mockSessionId, userId: mockUserId }) }));
jest.mock('@/hooks/use-household-state', () => ({
  useHouseholdState: () => ({ getToken: mockGetToken, selectedHousehold: { id: mockHouseholdId } }),
}));
jest.mock('./recipe-context', () => ({ useRecipeContext: () => ({ revisionForHousehold: () => 0 }) }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, recipes: jest.fn() } };
});

const mockedApi = jest.mocked(api);

describe('useRecipes request scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHouseholdId = 'household-a';
    mockUserId = 'user-a';
    mockSessionId = 'session-a';
  });

  it('rejects a late prior-household response after switching households', async () => {
    const oldResponse = deferred<{ recipes: Recipe[] }>();
    mockedApi.recipes.mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce({ recipes: [recipe('b1')] });
    const hook = await renderHook(() => useRecipes());
    await waitFor(() => expect(mockedApi.recipes).toHaveBeenCalledTimes(1));

    mockHouseholdId = 'household-b';
    await hook.rerender(undefined);
    await waitFor(() => expect(hook.result.current.recipes.map((item) => item.id)).toEqual(['b1']));
    await act(async () => { oldResponse.resolve({ recipes: [recipe('a-late')] }); await oldResponse.promise; });

    expect(hook.result.current.householdId).toBe('household-b');
    expect(hook.result.current.recipes.map((item) => item.id)).toEqual(['b1']);
    expect(mockedApi.recipes).toHaveBeenCalledTimes(2);
  });

  it('rejects a late prior-session response and keeps the new session request authoritative', async () => {
    const oldResponse = deferred<{ recipes: Recipe[] }>();
    mockedApi.recipes.mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce({ recipes: [recipe('new-session')] });
    const hook = await renderHook(() => useRecipes());
    await waitFor(() => expect(mockedApi.recipes).toHaveBeenCalledTimes(1));

    mockUserId = 'user-b';
    mockSessionId = 'session-b';
    await hook.rerender(undefined);
    await waitFor(() => expect(hook.result.current.recipes.map((item) => item.id)).toEqual(['new-session']));
    await act(async () => { oldResponse.resolve({ recipes: [recipe('old-session')] }); await oldResponse.promise; });

    expect(hook.result.current.recipes.map((item) => item.id)).toEqual(['new-session']);
    expect(mockedApi.recipes).toHaveBeenCalledTimes(2);
  });
});

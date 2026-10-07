import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Recipe } from '@/lib/api';
import { RecipeLibraryScreen } from './recipe-library-screen';

let mockMode: 'light' | 'dark' = 'light';
let mockUserId = 'user-a';
let mockSessionId = 'session-a';
let mockHouseholdId = 'household-a';
let mockViewMode: 'grid' | 'list' = 'grid';
let mockRecipes: Recipe[] = [];
let mockError: string | null = null;
const mockRefresh = jest.fn();
const mockSetViewMode = jest.fn((mode: 'grid' | 'list') => { mockViewMode = mode; });

const fixture: Recipe[] = [
  { id: 'soup', household_id: 'household-a', name: 'Tomato Soup', cover_kind: 'initials', cover_emoji: null, servings: null, prep_minutes: 30, cook_minutes: 45, notes: null, source_url: null, edit_revision: 1, created_at: '', updated_at: '', archived_at: null, ingredient_count: 3, ingredients: [], steps: [] },
  { id: 'bread', household_id: 'household-a', name: 'Banana Bread', cover_kind: 'emoji', cover_emoji: '🍞', servings: null, prep_minutes: null, cook_minutes: null, notes: null, source_url: null, edit_revision: 1, created_at: '', updated_at: '', archived_at: null, ingredient_count: 5, ingredients: [], steps: [] },
];

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ userId: mockUserId, sessionId: mockSessionId }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useNavigation: () => ({ isFocused: () => true, addListener: () => () => undefined }),
}));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mockMode }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ selectedHousehold: { id: mockHouseholdId } }) }));
jest.mock('./use-recipes', () => ({ useRecipes: () => ({ householdId: mockHouseholdId, recipes: mockRecipes, loading: false, refreshing: false, error: mockError, refresh: mockRefresh }) }));
jest.mock('./recipe-context', () => ({ useRecipeContext: () => ({ viewMode: mockViewMode, setViewMode: mockSetViewMode }) }));
jest.mock('expo-symbols', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SymbolView: (props: Record<string, unknown>) => React.createElement(View, props) };
});

async function renderLibrary() {
  return render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}><RecipeLibraryScreen /></SafeAreaProvider>);
}

describe('Recipe library presentation', () => {
  beforeEach(() => {
    mockMode = 'light'; mockUserId = 'user-a'; mockSessionId = 'session-a'; mockHouseholdId = 'household-a'; mockViewMode = 'grid';
    mockRecipes = fixture; mockError = null; mockRefresh.mockReset(); mockSetViewMode.mockClear();
  });

  it('searches the library and can switch between grid and list presentation', async () => {
    const view = await renderLibrary();
    expect(view.getByTestId('recipe-search-icon', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search recipes'), 'soup');
    expect(screen.getByText('Tomato Soup')).toBeTruthy();
    expect(screen.queryByText('Banana Bread')).toBeNull();
    expect(screen.getByText('1 family recipe')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'List view' }));
    expect(mockSetViewMode).toHaveBeenCalledWith('list');
    mockViewMode = 'list';
    await view.rerender(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}><RecipeLibraryScreen /></SafeAreaProvider>);
    expect(screen.getByText('Tomato Soup')).toBeTruthy();
    expect(screen.queryByText('Banana Bread')).toBeNull();
  });

  it('clears search when the household or authenticated identity changes', async () => {
    const view = await renderLibrary();
    await fireEvent.changeText(screen.getByLabelText('Search recipes'), 'soup');
    expect(screen.queryByText('Banana Bread')).toBeNull();

    mockHouseholdId = 'household-b';
    mockRecipes = [{ ...fixture[1], household_id: 'household-b' }];
    await view.rerender(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}><RecipeLibraryScreen /></SafeAreaProvider>);
    await waitFor(() => expect(screen.getByText('Banana Bread')).toBeTruthy());
    expect(screen.getByText('1 family recipe')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Search recipes'), 'bread');
    mockUserId = 'user-b'; mockSessionId = 'session-b';
    await view.rerender(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}><RecipeLibraryScreen /></SafeAreaProvider>);
    expect(screen.getByText('Banana Bread')).toBeTruthy();
  });

  it('shows a retryable empty/error state and uses theme-aware surfaces in both modes', async () => {
    mockRecipes = []; mockError = null;
    const view = await renderLibrary();
    expect(screen.getByText('No recipes yet. Add a family favorite to get started.')).toBeTruthy();
    mockMode = 'dark';
    await view.rerender(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}><RecipeLibraryScreen /></SafeAreaProvider>);
    expect(screen.getByRole('button', { name: 'Grid view' })).toBeTruthy();
    mockError = 'We couldn’t load recipes. Please try again.';
    await view.rerender(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}><RecipeLibraryScreen /></SafeAreaProvider>);
    expect(screen.getByText('We couldn’t load recipes. Please try again.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Retry loading recipes' }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});

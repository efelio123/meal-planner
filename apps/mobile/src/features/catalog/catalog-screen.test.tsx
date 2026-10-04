import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CatalogScreen } from './catalog-screen';

let mockMode: 'light' | 'dark' = 'light';
let mockCatalog: Record<string, unknown>;

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ sessionId: 'session-1', userId: 'user-1' }) }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Link: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useRouter: () => ({ push: jest.fn() }),
  };
});
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mockMode }));
jest.mock('./use-catalog', () => ({ useCatalog: () => mockCatalog }));
jest.mock('expo-symbols', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SymbolView: (props: Record<string, unknown>) => React.createElement(View, props) };
});

const baseCatalog = {
  categories: [{ id: 'produce', name: 'Produce', item_type: 'food', emoji: '🥬' }],
  error: null,
  householdId: 'household-1',
  items: [{ id: 'apple', household_id: 'household-1', name: 'Apple', item_type: 'food', category_id: 'produce', category_name: 'Produce', shopping_unit_label: 'bag' }],
  loading: false,
  refresh: jest.fn(),
  refreshing: false,
};

describe('Catalog root visual regression', () => {
  beforeEach(() => { mockMode = 'light'; mockCatalog = { ...baseCatalog }; });

  it('shows category and optional unit without emoji, extra counts, or helper copy', async () => {
    const view = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}><CatalogScreen /></SafeAreaProvider>);
    expect(view.getByText('Produce · bag')).toBeTruthy();
    expect(view.queryByText('🥬')).toBeNull();
    expect(view.getByText(/bag/)).toBeTruthy();
    expect(view.queryByText('1 items')).toBeNull();
    expect(view.queryByText('Items your household uses in recipes and shopping.')).toBeNull();
  });

  it('uses a filter-aware empty message instead of blaming an empty search', async () => {
    mockCatalog = { ...baseCatalog, items: [] };
    const view = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}><CatalogScreen /></SafeAreaProvider>);
    expect(view.getByText('Your catalog is empty. Add items your household uses.')).toBeTruthy();
  });
});

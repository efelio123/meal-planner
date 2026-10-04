import { render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CatalogProvider } from './catalog-context';
import { CatalogChoiceForm, CatalogChoiceManagement } from './catalog-choice-management';

let mockParams: { kind: string; choiceId?: string; itemType?: string } = { kind: 'category', itemType: 'food' };
const mockSetOptions = jest.fn();
const mockBack = jest.fn();

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ sessionId: 'session-1', userId: 'user-1' }) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ getToken: jest.fn(), selectedHousehold: { id: 'household-1' } }) }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  return {
    Link: passthrough,
    Stack: { Screen: () => null, Toolbar: Object.assign(passthrough, { Button: passthrough }) },
    useLocalSearchParams: () => mockParams,
    useNavigation: () => ({ setOptions: mockSetOptions }),
    useRouter: () => ({ back: mockBack, push: jest.fn() }),
  };
});
jest.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    catalogCategories: jest.fn(), catalogStores: jest.fn(), catalogUnits: jest.fn(),
    createCatalogCategory: jest.fn(), updateCatalogCategory: jest.fn(), deleteCatalogCategory: jest.fn(),
    createCatalogStore: jest.fn(), updateCatalogStore: jest.fn(), deleteCatalogStore: jest.fn(),
    createCatalogShoppingUnit: jest.fn(), updateCatalogShoppingUnit: jest.fn(), deleteCatalogShoppingUnit: jest.fn(),
  },
}));
jest.mock('expo-symbols', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SymbolView: (props: Record<string, unknown>) => React.createElement(View, props) };
});

const apiMock = jest.requireMock('@/lib/api').api as {
  catalogCategories: jest.Mock;
  catalogStores: jest.Mock;
  catalogUnits: jest.Mock;
};

async function renderRoute(child: React.ReactNode) {
  return render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}><CatalogProvider>{child}</CatalogProvider></SafeAreaProvider>);
}

describe('Catalog choice management presentation', () => {
  beforeEach(() => {
    mockParams = { kind: 'category', itemType: 'food' };
    mockSetOptions.mockClear();
    mockBack.mockClear();
    apiMock.catalogCategories.mockResolvedValue({ categories: [{ id: 'produce', name: 'Produce', item_type: 'food', emoji: '🥬', active_item_count: 1 }] });
    apiMock.catalogStores.mockResolvedValue({ stores: [{ id: 'market', name: 'Market' }] });
    apiMock.catalogUnits.mockResolvedValue({ shopping_units: { household: [] } });
  });

  it('shows the emoji beside the category name in the editable list', async () => {
    const view = await renderRoute(<CatalogChoiceManagement />);
    await waitFor(() => expect(view.getByText('Produce')).toBeTruthy());
    expect(view.getByText('🥬')).toBeTruthy();
  });

  it('distinguishes absent custom units from built-in units', async () => {
    mockParams = { kind: 'shopping-unit' };
    const view = await renderRoute(<CatalogChoiceManagement />);
    await waitFor(() => expect(view.getByText('No custom shopping units yet. Built-in units are available when adding or editing items.')).toBeTruthy());
  });

  it('describes editing a store rather than adding another one', async () => {
    mockParams = { kind: 'store', choiceId: 'market' };
    const view = await renderRoute(<CatalogChoiceForm editing />);
    await waitFor(() => expect(view.getByLabelText('store name').props.value).toBe('Market'));
    expect(view.getByText('Update this shared household store.')).toBeTruthy();
    expect(view.queryByText('Add a household store for catalog items.')).toBeNull();
    expect(StyleSheet.flatten(view.getByText('Remove store').parent?.props.style)).toMatchObject({
      alignItems: 'center', borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 52,
    });
  });
});

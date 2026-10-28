import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NativeSheetProvider } from '@/features/native-sheets/native-sheet-context';
import { CatalogProvider } from './catalog-context';
import { CatalogChoiceForm, CatalogChoiceManagement } from './catalog-choice-management';
import { namePrefillScope, type NamePrefillParams } from './catalog-name-prefill';

let mockParams: NamePrefillParams & { kind: string; choiceId?: string; itemType?: string } = { kind: 'category', itemType: 'food' };
let mockHouseholdId = 'household-1';
let mockSessionId = 'session-1';
const mockSetOptions = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('@clerk/expo', () => ({ useAuth: () => ({ sessionId: mockSessionId, userId: 'user-1' }) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ getToken: jest.fn(), selectedHousehold: { id: mockHouseholdId } }) }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);
  return {
    Link: passthrough,
    Stack: { Screen: () => null, Toolbar: Object.assign(passthrough, { Button: passthrough }) },
    useLocalSearchParams: () => mockParams,
    useNavigation: () => ({ setOptions: mockSetOptions }),
    useRouter: () => ({ back: mockBack, push: mockPush }),
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
  createCatalogCategory: jest.Mock;
};

function wrapRoute(child: React.ReactNode) {
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, right: 0, bottom: 34, left: 0 } }}><NativeSheetProvider scope="category-test"><CatalogProvider>{child}</CatalogProvider></NativeSheetProvider></SafeAreaProvider>;
}

async function renderRoute(child: React.ReactNode) {
  return render(wrapRoute(child));
}

describe('Catalog choice management presentation', () => {
  beforeEach(() => {
    mockHouseholdId = 'household-1';
    mockSessionId = 'session-1';
    mockParams = { kind: 'category', itemType: 'food' };
    mockSetOptions.mockClear();
    mockBack.mockClear();
    mockPush.mockClear();
    apiMock.catalogCategories.mockResolvedValue({ categories: [{ id: 'produce', name: 'Produce', item_type: 'food', emoji: '🥬', active_item_count: 1 }] });
    apiMock.catalogStores.mockResolvedValue({ stores: [{ id: 'market', name: 'Market' }] });
    apiMock.catalogUnits.mockResolvedValue({ shopping_units: { household: [] } });
  });

  it.each(['category', 'store', 'shopping-unit'])('prefills %s once and lets a cleared/edited draft win', async (kind) => {
    mockParams = { kind, itemType: 'food', initialName: '  Crème & 🥬 + Market?  ', prefillScope: namePrefillScope('user-1', 'session-1', 'household-1')! };
    const route = () => wrapRoute(<CatalogChoiceForm layout="tab-stack" />);
    const view = await render(route());
    const label = `${kind === 'shopping-unit' ? 'shopping unit' : kind} name`;
    expect(view.getByLabelText(label).props.value).toBe('Crème & 🥬 + Market?');
    await fireEvent.changeText(view.getByLabelText(label), '');
    mockParams = { ...mockParams, initialName: 'New route param must not replay' };
    await view.rerender(route());
    expect(view.getByLabelText(label).props.value).toBe('');
    await fireEvent.changeText(view.getByLabelText(label), 'My edited name');
    await view.rerender(route());
    expect(view.getByLabelText(label).props.value).toBe('My edited name');
  });

  it.each(['household', 'session'])('clears a retained Create draft on %s switch without replay on return', async (change) => {
    mockParams = { kind: 'store', initialName: 'Private search', prefillScope: namePrefillScope('user-1', 'session-1', 'household-1')! };
    const route = () => wrapRoute(<CatalogChoiceForm layout="tab-stack" />);
    const view = await render(route());
    expect(view.getByLabelText('store name').props.value).toBe('Private search');
    if (change === 'household') mockHouseholdId = 'household-2'; else mockSessionId = 'session-2';
    await view.rerender(route());
    expect(view.getByLabelText('store name').props.value).toBe('');
    mockHouseholdId = 'household-1'; mockSessionId = 'session-1';
    await view.rerender(route());
    expect(view.getByLabelText('store name').props.value).toBe('');
  });

  it.each(['food', 'household'] as const)('creates a %s category with a flexible name and full-width type controls', async (itemType) => {
    mockParams = { kind: 'category', itemType };
    const name = 'A longer category name that must stay inside the form';
    apiMock.createCatalogCategory.mockReset().mockResolvedValue({ category: { id: 'new-category', name, item_type: itemType, emoji: null } });
    const view = await renderRoute(<CatalogChoiceForm layout="tab-stack" />);
    const input = view.getByLabelText('category name');
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({ flex: 1, minWidth: 0, textAlign: 'right' });
    const controls = view.getByTestId('category-type-controls');
    expect(StyleSheet.flatten(controls.parent?.props.style)).toMatchObject({ flexDirection: 'column', alignItems: 'stretch' });
    expect(view.getByRole('radio', { name: itemType === 'food' ? 'Food' : 'Household' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.changeText(input, name);
    await fireEvent.press(view.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(apiMock.createCatalogCategory).toHaveBeenCalledWith(expect.any(Function), 'household-1', itemType, name, null));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows the emoji beside the category name in the editable list', async () => {
    const view = await renderRoute(<CatalogChoiceManagement layout="tab-stack" />);
    await waitFor(() => expect(view.getByText('Produce')).toBeTruthy());
    expect(view.getByText('🥬')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByText('🥬').props.style).lineHeight).toBeUndefined();
  });

  it.each(['store', 'category', 'shopping-unit'])('uses the %s manager search for its own Create action', async (kind) => {
    mockParams = { kind, itemType: 'household' };
    const view = await renderRoute(<CatalogChoiceManagement layout="tab-stack" />);
    await waitFor(() => expect(mockSetOptions.mock.calls.some(([options]) => options.headerRight)).toBe(true));
    await waitFor(() => expect(view.queryByLabelText(`Loading ${kind === 'category' ? 'categories' : kind === 'store' ? 'stores' : 'shopping units'}`)).toBeNull());
    if (kind !== 'shopping-unit') await fireEvent.changeText(view.getByLabelText(`Search ${kind === 'store' ? 'stores' : 'categories'}`), '  Family & home + 🥬  ');
    const options = mockSetOptions.mock.calls.filter(([entry]) => entry.headerRight).at(-1)![0];
    const header = await render(options.headerRight());
    await fireEvent.press(header.getByRole('button', { name: `Create ${kind === 'shopping-unit' ? 'shopping unit' : kind}` }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: `/(app)/(tabs)/catalog/choices/${kind}/create`, params: {
      itemType: 'household',
      ...(kind === 'shopping-unit' ? {} : { initialName: 'Family & home + 🥬', prefillScope: '["user-1","session-1","household-1"]' }),
    } });
  });

  it('clears manager search on a household switch before it can seed a different household', async () => {
    mockParams = { kind: 'store' };
    const view = await renderRoute(<CatalogChoiceManagement layout="tab-stack" />);
    await fireEvent.changeText(view.getByLabelText('Search stores'), 'Private store');
    mockHouseholdId = 'household-2';
    await view.rerender(wrapRoute(<CatalogChoiceManagement layout="tab-stack" />));
    expect(view.getByLabelText('Search stores').props.value).toBe('');
    await waitFor(() => expect(view.queryByLabelText('Loading stores')).toBeNull());
  });

  it('distinguishes absent custom units from built-in units', async () => {
    mockParams = { kind: 'shopping-unit' };
    const view = await renderRoute(<CatalogChoiceManagement layout="tab-stack" />);
    await waitFor(() => expect(view.getByText('No custom shopping units yet. Built-in units are available when adding or editing items.')).toBeTruthy());
  });

  it('describes editing a store rather than adding another one', async () => {
    mockParams = { kind: 'store', choiceId: 'market', initialName: 'Wrong seed', prefillScope: namePrefillScope('user-1', 'session-1', 'household-1')! };
    const view = await renderRoute(<CatalogChoiceForm layout="tab-stack" editing />);
    await waitFor(() => expect(view.getByLabelText('store name').props.value).toBe('Market'));
    expect(view.getByText('Update this shared household store.')).toBeTruthy();
    expect(view.queryByText('Add a household store for catalog items.')).toBeNull();
    expect(StyleSheet.flatten(view.getByText('Remove store').parent?.props.style)).toMatchObject({
      alignItems: 'center', borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 52,
    });
  });
});

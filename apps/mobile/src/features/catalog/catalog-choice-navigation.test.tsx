import { fireEvent, render } from '@testing-library/react-native';
import CatalogLayout from '@/app/(app)/(tabs)/catalog/_layout';
import RecipesLayout from '@/app/(app)/(tabs)/recipes/_layout';
import ShoppingLayout from '@/app/(app)/(tabs)/shopping/_layout';
import PlanLayout from '@/app/(app)/(tabs)/plan/_layout';

jest.mock('@/features/shopping-list/use-shopping-list', () => ({ useShoppingList: () => ({ refreshOnFocus: jest.fn() }) }));

const mockGet = jest.fn(() => ({ detents: [0.58, 0.94], initialDetent: 1 }));
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  function Stack({ children }: React.PropsWithChildren) { return React.createElement(View, null, children); }
  function ScreenRoute({ name, options }: { name: string; options: unknown }) {
    return React.createElement(View, { testID: `route-${name}`, options } as never);
  }
  Stack.Screen = ScreenRoute;
  return { Stack, useRouter: () => ({ back: mockBack }), useFocusEffect: () => undefined };
});

it.each([0, 1])('keeps the Plan unit sheet in its owning stack with registered initial detent %s', async (initialDetent) => {
  mockGet.mockReturnValueOnce({ detents: [0.58, 0.94], initialDetent });
  const view = await render(<PlanLayout />);
  const options = view.getByTestId('route-sheet/unit').props.options({ route: { params: { sheetId: 'unit-sheet' } } });
  expect(mockGet).toHaveBeenCalledWith('unit-sheet');
  expect(options).toMatchObject({ presentation: 'formSheet', sheetAllowedDetents: [0.58, 0.94], sheetInitialDetentIndex: initialDetent });
});

it.each(['choices/[kind]/index', 'choices/[kind]/create', 'choices/[kind]/[choiceId]'])(
  'gives the Shopping modal %s an explicit shared Back arrow', async (route) => {
    mockBack.mockClear();
    const view = await render(<ShoppingLayout />);
    const options = view.getByTestId(`route-${route}`).props.options;
    expect(options.presentation).toBe('fullScreenModal');
    const header = await render(options.headerLeft());
    await fireEvent.press(header.getByRole('button', { name: 'Back' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  },
);
jest.mock('@/features/native-sheets/native-sheet-context', () => ({ useNativeSheetFlow: () => ({ get: mockGet }) }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ surface: '#fff', text: '#111', screen: '#fff', elevatedSurface: '#eee' }) }));

it.each([
  { origin: 'Catalog', Layout: CatalogLayout },
  { origin: 'Recipes', Layout: RecipesLayout },
  { origin: 'Shopping', Layout: ShoppingLayout },
])('configures the $origin choice sheet in its owning stack before navigation', async ({ Layout }) => {
  const view = await render(<Layout />);
  const options = view.getByTestId('route-sheet/choice').props.options({ route: { params: { sheetId: 'choice-sheet' } } });
  expect(mockGet).toHaveBeenCalledWith('choice-sheet');
  expect(options).toMatchObject({
    presentation: 'formSheet', headerShown: false, sheetGrabberVisible: true,
    sheetAllowedDetents: [0.58, 0.94], sheetInitialDetentIndex: 1,
  });
});

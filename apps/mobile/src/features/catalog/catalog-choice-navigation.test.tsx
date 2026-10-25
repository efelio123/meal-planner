import { render } from '@testing-library/react-native';
import CatalogLayout from '@/app/(app)/(tabs)/catalog/_layout';
import RecipesLayout from '@/app/(app)/(tabs)/recipes/_layout';
import ShoppingLayout from '@/app/(app)/(tabs)/shopping/_layout';

const mockGet = jest.fn(() => ({ detents: [0.58, 0.94], initialDetent: 1 }));

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  function Stack({ children }: React.PropsWithChildren) { return React.createElement(View, null, children); }
  function ScreenRoute({ name, options }: { name: string; options: unknown }) {
    return React.createElement(View, { testID: `route-${name}`, options } as never);
  }
  Stack.Screen = ScreenRoute;
  return { Stack, useRouter: () => ({ back: jest.fn() }) };
});
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

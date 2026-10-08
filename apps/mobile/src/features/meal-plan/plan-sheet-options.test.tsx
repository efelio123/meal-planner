import { render } from '@testing-library/react-native';
import PlanStackLayout from '@/app/(app)/(tabs)/plan/_layout';

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
  function Stack({ children }: React.PropsWithChildren) { return React.createElement(MockView, null, children); }
  function ScreenRoute({ name, options }: { name: string; options: unknown }) {
    return React.createElement(MockView, { testID: `route-${name}`, options } as never);
  }
  Stack.Screen = ScreenRoute;
  return { Stack };
});
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ surface: '#fff', text: '#111', screen: '#fff', elevatedSurface: '#eee' }) }));

it('opens only the full meal editor sheets at the high detent', async () => {
  const result = await render(<PlanStackLayout />);
  expect(result.getByTestId('route-sheet/add').props.options.sheetInitialDetentIndex).toBe('last');
  expect(result.getByTestId('route-sheet/edit').props.options.sheetInitialDetentIndex).toBe('last');
  expect(result.getByTestId('route-sheet/day').props.options.sheetInitialDetentIndex).toBe(0);
  expect(result.getByTestId('route-sheet/shopping-amount').props.options.sheetInitialDetentIndex).toBe(0);
});

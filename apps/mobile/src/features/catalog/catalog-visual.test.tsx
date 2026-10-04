import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { CatalogManagementHome } from './catalog-management-home';

let mockMode: 'light' | 'dark' = 'light';
const mockPush = jest.fn();

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mockMode }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-symbols', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SymbolView: (props: Record<string, unknown>) => React.createElement(View, props) };
});

describe.each(['light', 'dark'] as const)('%s Catalog management hub', (mode) => {
  beforeEach(() => {
    mockMode = mode;
    mockPush.mockClear();
  });

  it('uses the themed grouped rows and navigates to each choice manager', async () => {
    const result = await render(<CatalogManagementHome />);
    const palette = Colors[mode];
    for (const kind of ['category', 'store', 'shopping-unit']) {
      expect(StyleSheet.flatten(result.getByTestId(`catalog-management-card-${kind}`).props.style)).toMatchObject({ backgroundColor: palette.surface });
    }
    for (const title of ['Categories', 'Stores', 'Shopping units']) expect(result.getByText(title)).toBeTruthy();

    await fireEvent.press(result.getByText('Categories'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/catalog/choices/category');
  });
});

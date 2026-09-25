import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useTheme } from './use-theme';

let mockAppearance: 'light' | 'dark' = 'light';

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockAppearance,
}));

function ThemeProbe() {
  const theme = useTheme();
  return <Text testID="screen-color">{theme.screen}</Text>;
}

describe('useTheme', () => {
  it('updates an already mounted component when the device appearance changes', async () => {
    mockAppearance = 'light';
    const screen = await render(<ThemeProbe />);
    expect(screen.getByTestId('screen-color').props.children).toBe('#ffffff');

    mockAppearance = 'dark';
    await screen.rerender(<ThemeProbe />);
    expect(screen.getByTestId('screen-color').props.children).toBe('#101114');
  });
});

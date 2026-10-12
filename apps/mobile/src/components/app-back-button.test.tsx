import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { AppBackButton } from './app-back-button';

jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ text: '#eeeeee' }) }));

it('uses the same plain, full-size back control wherever a custom arrow is needed', async () => {
  const onPress = jest.fn();
  await render(<AppBackButton accessibilityLabel="Back to Shopping item" onPress={onPress} />);
  const button = screen.getByRole('button', { name: 'Back to Shopping item' });
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ minHeight: 44, minWidth: 44 });
  expect(StyleSheet.flatten(button.props.style).borderWidth).toBeUndefined();
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

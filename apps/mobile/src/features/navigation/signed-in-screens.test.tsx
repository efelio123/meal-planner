import { fireEvent, render } from '@testing-library/react-native';
import { ComingSoonScreen } from './coming-soon-screen';
import SettingsScreen from '@/app/(app)/(tabs)/settings';
import { Colors } from '@/constants/theme';

let mockMode: 'light' | 'dark' = 'light';
const mockSignOut = jest.fn();

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockMode,
}));
jest.mock('@/hooks/use-household-state', () => ({
  useHouseholdState: () => ({
    isSigningOut: false,
    selectedHousehold: { name: 'Home' },
    signOut: mockSignOut,
    signOutError: null,
  }),
}));

describe.each(['light', 'dark'] as const)('%s signed-in tab screens', (mode) => {
  beforeEach(() => {
    mockMode = mode;
    mockSignOut.mockClear();
  });

  it('uses semantic screen and secondary-text colors on the Coming soon page', async () => {
    const result = await render(<ComingSoonScreen title="Plan" />);
    const palette = Colors[mode];
    expect(result.getByTestId('screen').props.style).toMatchObject({ backgroundColor: palette.screen });
    expect(result.getByText('Plan').props.style[0]).toEqual({ color: palette.text });
    expect(result.getByText('Coming soon').props.style[0]).toEqual({ color: palette.textSecondary });
    expect(result.getByLabelText('Plan. Coming soon.')).toBeTruthy();
  });

  it('keeps Settings household and sign-out content readable on the shared screen', async () => {
    const result = await render(<SettingsScreen />);
    const palette = Colors[mode];
    expect(result.getByTestId('screen').props.style).toMatchObject({ backgroundColor: palette.screen });
    expect(result.getByText('Current household').props.style[0]).toEqual({ color: palette.text });
    expect(result.getByText('Home').props.style[0]).toEqual({ color: palette.text });
    expect(result.getByText('Sign out')).toBeTruthy();
    await fireEvent.press(result.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

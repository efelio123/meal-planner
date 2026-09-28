import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ComingSoonScreen } from './coming-soon-screen';
import { ProfileHubScreen } from '@/features/profile/profile-hub-screen';
import { Colors } from '@/constants/theme';

let mockMode: 'light' | 'dark' = 'light';
let mockDisplayName = 'Test Person';
let mockImageUrl: string | null = null;
const mockSymbolProps: Record<string, unknown>[] = [];

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockMode,
}));
jest.mock('@/hooks/use-household-state', () => ({
  useHouseholdState: () => ({
    me: { user: { id: 'user-1', email: 'person@example.test', display_name: mockDisplayName } },
    selectedHousehold: { name: 'Home', role: 'owner' },
  }),
}));
jest.mock('@clerk/expo', () => ({ useUser: () => ({ user: { imageUrl: mockImageUrl } }) }));
jest.mock('expo-symbols', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SymbolView: (props: Record<string, unknown>) => {
      mockSymbolProps.push(props);
      return React.createElement(View, props);
    },
  };
});

describe.each(['light', 'dark'] as const)('%s signed-in tab screens', (mode) => {
  beforeEach(() => {
    mockMode = mode;
    mockDisplayName = 'Test Person';
    mockImageUrl = null;
    mockSymbolProps.length = 0;
  });

  it('uses semantic screen and secondary-text colors on the Coming soon page', async () => {
    const result = await render(<ComingSoonScreen title="Plan" />);
    const palette = Colors[mode];
    expect(result.getByTestId('screen').props.style).toMatchObject({ backgroundColor: palette.screen });
    expect(result.getByText('Plan').props.style[0]).toEqual({ color: palette.text });
    expect(result.getByText('Coming soon').props.style[0]).toEqual({ color: palette.textSecondary });
    expect(result.getByLabelText('Plan. Coming soon.')).toBeTruthy();
  });

  it('keeps Profile identity and household content readable on the shared screen', async () => {
    const result = await render(<ProfileHubScreen />);
    const palette = Colors[mode];
    expect(result.getByTestId('screen').props.style).toMatchObject({ backgroundColor: palette.screen });
    expect(result.getByText('Current household').props.style[0]).toEqual({ color: palette.textSecondary });
    expect(result.getByText('Home').props.style[0]).toEqual({ color: palette.text });
    expect(result.getByText('Test Person')).toBeTruthy();
    expect(result.getByLabelText('Test Person initials')).toBeTruthy();
    expect(result.getByText('TP')).toBeTruthy();
    expect(result.getByText('owner')).toBeTruthy();
    expect(result.getByText('Account Settings')).toBeTruthy();
    expect(result.getByRole('button', { name: 'My account' })).toBeTruthy();
    expect(result.getByRole('button', { name: 'My households' })).toBeTruthy();
    expect(result.getByTestId('profile-user-card')).toBeTruthy();
    const navigationGroupStyle = StyleSheet.flatten(result.getByTestId('profile-navigation-group').props.style);
    expect(navigationGroupStyle).not.toHaveProperty('borderWidth');
    expect(navigationGroupStyle).not.toHaveProperty('borderRadius');
    expect(navigationGroupStyle).not.toHaveProperty('backgroundColor');
    expect(result.queryByText('Account details and sign out')).toBeNull();
    expect(result.queryByText('View your households and choose when to switch')).toBeNull();

    for (const title of ['My account', 'My households']) {
      const rowIconId = `profile-row-icon-${title.toLowerCase().replace(/\s+/gu, '-')}`;
      const rowChevronId = `profile-row-chevron-${title.toLowerCase().replace(/\s+/gu, '-')}`;
      const row = result.getByRole('button', { name: title });
      const iconName = mockSymbolProps.find((props) => props.testID === rowIconId)?.name;
      const chevronName = mockSymbolProps.find((props) => props.testID === rowChevronId)?.name;
      expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', minHeight: 56, borderWidth: 0 });
      expect(mockSymbolProps.find((props) => props.testID === rowIconId)?.tintColor).toBe(palette.textSecondary);
      expect(mockSymbolProps.find((props) => props.testID === rowChevronId)?.tintColor).toBe(palette.textSecondary);
      expect(iconName).toEqual(title === 'My account'
        ? { ios: 'person.crop.circle', android: 'person', web: 'person' }
        : { ios: 'house', android: 'home', web: 'home' });
      expect(chevronName).toEqual({ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' });
    }
    expect(result.getByTestId('profile-navigation-divider').props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ opacity: 0.4 }),
      expect.objectContaining({ backgroundColor: palette.border }),
    ]));
  });

  it('falls back to the existing account email when no display name is available', async () => {
    mockDisplayName = '  ';
    const result = await render(<ProfileHubScreen />);
    expect(result.getAllByText('person@example.test')).toHaveLength(1);
    expect(result.getByText('PE')).toBeTruthy();
  });
});

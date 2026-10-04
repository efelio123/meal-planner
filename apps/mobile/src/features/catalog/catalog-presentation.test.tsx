import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { DetailRow } from './catalog-item-detail';

let mockMode: 'light' | 'dark' = 'light';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mockMode }));
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ sessionId: 'session-1', userId: 'user-1' }) }));
jest.mock('@/hooks/use-household-state', () => ({ useHouseholdState: () => ({ getToken: jest.fn(), selectedHousehold: { id: 'household-1' } }) }));

describe.each(['light', 'dark'] as const)('%s Catalog item details', (mode) => {
  beforeEach(() => { mockMode = mode; });

  it('renders reference-style label and value on one horizontal row', async () => {
    const view = await render(<DetailRow label="Preferred store" value="Market" />);
    const row = view.getByTestId('catalog-detail-row');
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' });
    expect(view.getByText('Preferred store')).toBeTruthy();
    expect(view.getByText('Market')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByText('Preferred store').props.style)).toMatchObject({ color: Colors[mode].textSecondary });
  });

  it('omits the separator under the last shopping-preference row', async () => {
    const view = await render(<DetailRow label="Preferred store" value="Market" last />);
    expect(StyleSheet.flatten(view.getByTestId('catalog-detail-row').props.style).borderBottomWidth).toBeUndefined();
  });
});

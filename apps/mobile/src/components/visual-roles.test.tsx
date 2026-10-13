import { cleanup, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { CircularAddButton, DisclosureChevron, ExpansionChevron, MoreDetailsToggle, TabPageHeader, visualStyles } from './visual-roles';

let mockMode: 'light' | 'dark' = 'light';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mockMode }));
jest.mock('expo-symbols', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SymbolView: (props: Record<string, unknown>) => React.createElement(View, props) };
});

describe.each(['light', 'dark'] as const)('%s shared visual roles', (mode) => {
  beforeEach(async () => { await cleanup(); mockMode = mode; });

  it('uses a 32-point tab title and a separate subtitle beneath the action row', async () => {
    const view = await render(<TabPageHeader title="Shopping" subtitle={<Text>Family · shared list</Text>} actions={<Text>Add</Text>} />);
    expect(StyleSheet.flatten(view.getByText('Shopping').props.style)).toMatchObject({ fontSize: 32, fontWeight: '700', lineHeight: 40 });
    expect(view.getByText('Family · shared list').parent).not.toBe(view.getByText('Shopping').parent);
  });

  it('uses one accessible 48-point Add action with a 24-point platform symbol', async () => {
    const onPress = jest.fn();
    const view = await render(<CircularAddButton accessibilityLabel="Add catalog item" onPress={onPress} />);
    const button = view.getByRole('button', { name: 'Add catalog item' });
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ height: 48, width: 48, borderRadius: 24, backgroundColor: Colors[mode].primary });
    const symbol = view.getByTestId('circular-add-symbol', { includeHiddenElements: true });
    expect(symbol.props.size).toBe(24);
    expect(symbol.props.tintColor).toBe(Colors[mode].primaryText);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    await view.rerender(<CircularAddButton accessibilityLabel="Add catalog item" disabled onPress={onPress} />);
    expect(view.getByRole('button', { name: 'Add catalog item' }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(StyleSheet.flatten(view.getByRole('button', { name: 'Add catalog item' }).props.style).opacity).toBe(0.5);
  });

  it('uses one ordinary disclosure icon and a link-colored action variant', async () => {
    const view = await render(<View><DisclosureChevron testID="ordinary-chevron" /><DisclosureChevron testID="action-chevron" variant="action" /></View>);
    expect(view.getByTestId('ordinary-chevron', { includeHiddenElements: true }).props).toMatchObject({ size: 17, tintColor: Colors[mode].textSecondary });
    expect(view.getByTestId('action-chevron', { includeHiddenElements: true }).props).toMatchObject({ size: 17, tintColor: Colors[mode].link });
  });

  it('uses one More details row and equally sized chevrons for both states', async () => {
    const onPress = jest.fn();
    const view = await render(<MoreDetailsToggle expanded={false} onPress={onPress} />);
    const button = view.getByRole('button', { name: 'More details' });
    expect(button.props.accessibilityState).toMatchObject({ expanded: false, disabled: false });
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ minHeight: 56, borderColor: Colors[mode].border });
    expect(StyleSheet.flatten(view.getByText('More details (optional)').props.style)).toMatchObject({ fontWeight: '700' });
    const collapsed = view.getByTestId('more-details-chevron', { includeHiddenElements: true });
    expect(collapsed.props).toMatchObject({ size: 18, tintColor: Colors[mode].textSecondary });
    expect(collapsed.props.name.ios).toBe('chevron.down');
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);

    await view.rerender(<MoreDetailsToggle expanded onPress={onPress} />);
    const expanded = view.getByTestId('more-details-chevron', { includeHiddenElements: true });
    expect(view.getByRole('button', { name: 'More details' }).props.accessibilityState.expanded).toBe(true);
    expect(expanded.props.size).toBe(collapsed.props.size);
    expect(expanded.props.name.ios).toBe('chevron.up');

    await view.rerender(<MoreDetailsToggle disabled expanded onPress={onPress} />);
    expect(view.getByRole('button', { name: 'More details' }).props.accessibilityState.disabled).toBe(true);
  });

  it('uses the same chevron geometry for other expandable rows', async () => {
    const view = await render(<View><ExpansionChevron expanded={false} testID="collapsed" /><ExpansionChevron expanded variant="action" testID="expanded" /></View>);
    expect(view.getByTestId('collapsed', { includeHiddenElements: true }).props).toMatchObject({ size: 18, tintColor: Colors[mode].textSecondary });
    expect(view.getByTestId('expanded', { includeHiddenElements: true }).props).toMatchObject({ size: 18, tintColor: Colors[mode].link });
  });

  it('shares sheet and grouped-row metrics without imposing a card on every picker', () => {
    expect(visualStyles.sheetTitle).toMatchObject({ fontSize: 20, lineHeight: 26 });
    expect(visualStyles.sheetAction).toMatchObject({ minHeight: 44, minWidth: 44 });
    expect(visualStyles.groupedSurface).toMatchObject({ borderRadius: 16 });
    expect(visualStyles.groupedRow).toMatchObject({ minHeight: 44, paddingHorizontal: 16 });
    expect(visualStyles.groupedDivider.borderTopWidth).toBe(StyleSheet.hairlineWidth);
  });
});

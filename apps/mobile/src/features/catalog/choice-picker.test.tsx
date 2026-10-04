import { fireEvent, render } from '@testing-library/react-native';
import { Keyboard, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { ChoicePicker, shouldDismissChoiceSheet } from './choice-picker';

jest.mock('expo-symbols', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SymbolView: (props: Record<string, unknown>) => React.createElement(View, props) };
});

async function renderPicker(choices: { id: string; label: string; emoji?: string | null }[], options: { label?: string; createLabel?: string; manageLabel?: string } = {}) {
  const onSelect = jest.fn();
  const onOpen = jest.fn();
  const label = options.label ?? 'Category';
  const result = await render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 47, right: 0, bottom: 34, left: 0 },
    }}>
      <ChoicePicker label={label} choices={choices} value="" selectedId="" createLabel={options.createLabel ?? 'Create category'} manageLabel={options.manageLabel ?? 'Manage categories'} onSelect={onSelect} onOpen={onOpen} onCreate={jest.fn()} onManage={jest.fn()} />
    </SafeAreaProvider>,
  );
  return { ...result, onSelect, onOpen };
}

describe('Catalog choice sheet', () => {
  it('keeps a long searchable list and its query field visible while filtering', async () => {
    const view = await renderPicker(Array.from({ length: 10 }, (_value, index) => ({ id: `category-${index}`, label: `Category ${index}` })));
    await fireEvent.press(view.getByTestId('choice-picker-field'));
    expect(view.getByTestId('catalog-choice-sheet')).toBeTruthy();
    const search = view.getByLabelText('Search Category');
    await fireEvent.changeText(search, 'Category 9');
    expect(view.getByLabelText('Search Category')).toBeTruthy();
    expect(view.getByText('Category 9')).toBeTruthy();
    expect(view.queryByText('Category 1')).toBeNull();
  });

  it('keeps short lists compact and displays the category emoji and action card', async () => {
    const view = await renderPicker([{ id: 'produce', label: 'Produce', emoji: '🥬' }]);
    await fireEvent.press(view.getByTestId('choice-picker-field'));
    expect(view.queryByLabelText('Search Category')).toBeNull();
    expect(view.getByText('🥬')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Create category' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Manage categories' })).toBeTruthy();
  });

  it('uses a deliberate downward drag threshold and exposes an accessible dismiss target', async () => {
    const view = await renderPicker([{ id: 'produce', label: 'Produce' }]);
    await fireEvent.press(view.getByTestId('choice-picker-field'));
    expect(shouldDismissChoiceSheet(40)).toBe(false);
    expect(shouldDismissChoiceSheet(90)).toBe(true);
    expect(shouldDismissChoiceSheet(18, 0.9)).toBe(true);
    expect(shouldDismissChoiceSheet(8, 1.2)).toBe(false);
    expect(shouldDismissChoiceSheet(28, -1)).toBe(false);
    const header = view.getByTestId('catalog-sheet-drag-area');
    expect(typeof header.props.onMoveShouldSetResponderCapture).toBe('function');
    expect(view.getByText('Done')).toBeTruthy();
    await fireEvent.press(view.getByTestId('catalog-sheet-grabber'));
    expect(view.queryByTestId('catalog-choice-sheet')).toBeNull();
  });

  it('keeps the search list keyboard-dismiss behavior platform appropriate', async () => {
    const view = await renderPicker(Array.from({ length: 8 }, (_value, index) => ({ id: `category-${index}`, label: `Category ${index}` })));
    await fireEvent.press(view.getByTestId('choice-picker-field'));
    expect(view.getByTestId('catalog-choice-scroll').props.keyboardDismissMode).toBe('interactive');
    expect(StyleSheet.flatten(view.getByText('Done').props.style)).toMatchObject({ color: Colors.light.link });
    expect(view.getByRole('button', { name: 'Manage categories' })).toBeTruthy();
  });

  it('uses concise plural store actions and dismisses the keyboard without closing the sheet', async () => {
    const view = await renderPicker(Array.from({ length: 7 }, (_value, index) => ({ id: `store-${index}`, label: `Store ${index}` })), {
      label: 'Preferred store (optional)',
      createLabel: 'Create store',
      manageLabel: 'Manage stores',
    });
    await fireEvent.press(view.getByTestId('choice-picker-field'));
    expect(view.getByRole('button', { name: 'Create store' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Manage stores' })).toBeTruthy();
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    view.getByTestId('catalog-choice-scroll').props.onScrollBeginDrag();
    expect(dismiss).toHaveBeenCalled();
    expect(view.getByTestId('catalog-choice-sheet')).toBeTruthy();
    dismiss.mockRestore();
  });

  it('notifies the form to dismiss its prior focus before showing the sheet', async () => {
    const view = await renderPicker([{ id: 'produce', label: 'Produce' }]);
    await fireEvent.press(view.getByTestId('choice-picker-field'));
    expect(view.onOpen).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('catalog-choice-sheet')).toBeTruthy();
  });
});

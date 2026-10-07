import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { ChoicePicker } from './choice-picker';

const mockPresent = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockMode: 'light' | 'dark' = 'light';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('@/features/native-sheets/native-sheet-context', () => ({ useNativeSheetFlow: () => ({ present: mockPresent, scope: 'test-scope' }) }));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mockMode }));
jest.mock('expo-symbols', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SymbolView: (props: Record<string, unknown>) => ReactModule.createElement(View, props) };
});

async function openPicker(choices: { id: string; label: string; emoji?: string | null; group?: string }[], options: { label?: string; createLabel?: string; manageLabel?: string; searchable?: boolean } = {}) {
  const onSelect = jest.fn();
  const onOpen = jest.fn();
  const onCreate = jest.fn();
  const onManage = jest.fn();
  const label = options.label ?? 'Category';
  const field = await render(<ChoicePicker
    label={label}
    choices={choices}
    value=""
    selectedId=""
    searchable={options.searchable}
    createLabel={options.createLabel ?? 'Create category'}
    manageLabel={options.manageLabel ?? 'Manage categories'}
    onSelect={onSelect}
    onOpen={onOpen}
    onCreate={onCreate}
    onManage={onManage}
  />);
  await fireEvent.press(field.getByTestId('choice-picker-field'));
  const [content, sheetOptions] = mockPresent.mock.calls.at(-1)!;
  const sheet = await render(content as React.ReactElement);
  return { ...field, ...sheet, onSelect, onOpen, onCreate, onManage, sheetOptions };
}

describe('Catalog choice native sheet', () => {
  beforeEach(() => {
    mockPresent.mockClear();
    mockPush.mockClear();
    mockBack.mockClear();
    mockMode = 'light';
  });

  it('keeps a long searchable list and query filtering inside the native route content', async () => {
    const view = await openPicker(Array.from({ length: 10 }, (_value, index) => ({ id: `category-${index}`, label: `Category ${index}` })));
    expect(view.sheetOptions).toEqual({ detents: [0.58, 0.94] });
    expect(view.getByTestId('catalog-choice-keyboard-area')).toBeTruthy();
    expect(view.getByTestId('catalog-choice-sheet')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('Search Category'), 'Category 9');
    expect(view.getByText('Category 9')).toBeTruthy();
    expect(view.queryByText('Category 1')).toBeNull();
    expect(view.getByTestId('catalog-choice-scroll').props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('keeps short lists compact and displays category emoji and separate Create/Manage actions', async () => {
    const view = await openPicker([{ id: 'produce', label: 'Produce', emoji: '🥬' }]);
    expect(view.sheetOptions).toEqual({ detents: [0.38, 0.76] });
    expect(view.queryByLabelText('Search Category')).toBeNull();
    expect(view.getByText('🥬')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Create category' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Manage categories' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Produce' }));
    expect(view.onSelect).toHaveBeenCalledWith('produce');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows distinct Food and Household group labels in the same sheet', async () => {
    const view = await openPicker([
      { id: 'food', label: 'Pantry', group: 'Food' },
      { id: 'household', label: 'Pantry', group: 'Household' },
    ]);
    expect(view.getAllByText('Pantry')).toHaveLength(2);
    expect(view.getByText('Food')).toBeTruthy();
    expect(view.getByText('Household')).toBeTruthy();
  });

  it('uses platform-appropriate keyboard dismissal and theme action colors', async () => {
    mockMode = 'dark';
    const view = await openPicker(Array.from({ length: 8 }, (_value, index) => ({ id: `store-${index}`, label: `Store ${index}` })), {
      label: 'Preferred store (optional)', createLabel: 'Create store', manageLabel: 'Manage stores',
    });
    expect(view.getByTestId('catalog-choice-scroll').props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');
    expect(StyleSheet.flatten(view.getByText('Done').props.style)).toMatchObject({ color: Colors.dark.link });
    expect(view.getByRole('button', { name: 'Create store' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Manage stores' })).toBeTruthy();
  });

  it('notifies the form to dismiss its prior focus and opens a root sheet route with no value in route params', async () => {
    const view = await openPicker([{ id: 'produce', label: 'Produce' }]);
    expect(view.onOpen).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/native-sheet/[sheetId]' }));
    expect(view.getByTestId('catalog-choice-sheet')).toBeTruthy();
  });
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { submitTimeZoneSelection, TimeZonePicker } from '@/components/time-zone-picker';

const mockPresent = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('@/features/native-sheets/native-sheet-context', () => ({ useNativeSheetFlow: () => ({ present: mockPresent, scope: 'test-scope' }) }));

describe('TimeZonePicker', () => {
  beforeEach(() => { mockPresent.mockClear(); mockPush.mockClear(); mockBack.mockClear(); });

  it('submits the selected IANA time zone when the selection changes', () => {
    const onChange = jest.fn();
    submitTimeZoneSelection(onChange, 'America/Chicago');
    expect(onChange).toHaveBeenCalledWith('America/Chicago');
  });

  it('opens a keyboard-aware native sheet with a searchable list and an explicit Done action', async () => {
    const onChange = jest.fn();
    await render(React.createElement(TimeZonePicker, { value: 'America/Phoenix', onChange }));
    await fireEvent.press(screen.getByRole('button', { name: 'Time zone' }));

    const [content, options] = mockPresent.mock.calls[0];
    expect(options).toEqual({ detents: [0.45, 0.94] });
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/native-sheet/[sheetId]' }));
    const sheet = await render(content as React.ReactElement);
    expect(StyleSheet.flatten(sheet.getByTestId('time-zone-keyboard-area').props.style)).toMatchObject({ flex: 1 });
    expect(sheet.getByLabelText('Search time zones')).toBeTruthy();
    expect(sheet.getByTestId('time-zone-results').props.keyboardShouldPersistTaps).toBe('handled');
    expect(sheet.getByTestId('time-zone-results').props.keyboardDismissMode).toBe('interactive');
    expect(StyleSheet.flatten(sheet.getByTestId('time-zone-sheet').props.style)).toMatchObject({ flex: 1 });
    await fireEvent.changeText(sheet.getByLabelText('Search time zones'), 'New York');
    await fireEvent.press(sheet.getByText('America/New_York'));
    expect(onChange).toHaveBeenCalledWith('America/New_York');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

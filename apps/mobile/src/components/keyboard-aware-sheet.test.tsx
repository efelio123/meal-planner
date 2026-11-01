import { act, fireEvent, render } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet, Text, type KeyboardEvent } from 'react-native';
import { KeyboardAwareSheet, sheetKeyboardOverlap } from './keyboard-aware-sheet';
import { Screen } from './screen';

type Measurement = (x: number, y: number, width: number, height: number) => void;
const mockMeasure = jest.fn<void, [Measurement]>();
jest.mock('react-native/Libraries/Components/View/View', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { __esModule: true, default: React.forwardRef(function MeasuredView(props: Record<string, unknown>, ref) {
    React.useImperativeHandle(ref, () => ({ measureInWindow: mockMeasure }));
    return React.createElement('View', props);
  }) };
});

const originalPlatform = Platform.OS;
const callbacks = new Map<string, (event: KeyboardEvent) => void>();
const event = { duration: 0, easing: 'keyboard', endCoordinates: { screenX: 0, screenY: 500, width: 390, height: 344 } } as KeyboardEvent;

describe('measured sheet keyboard clearance', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
    callbacks.clear();
    mockMeasure.mockReset().mockImplementation((callback) => callback(0, 200, 390, 600));
    jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
    jest.spyOn(Keyboard, 'scheduleLayoutAnimation').mockImplementation(() => {});
    jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => {
      callbacks.set(name, callback);
      return { remove: () => { callbacks.delete(name); } };
    });
  });
  afterEach(() => { Platform.OS = originalPlatform; jest.restoreAllMocks(); });

  it('accounts for sheet offset, an already resized viewport, and keyboards below the sheet', () => {
    expect(sheetKeyboardOverlap(200, 600, 500)).toBe(300);
    expect(sheetKeyboardOverlap(200, 300, 500)).toBe(0);
    expect(sheetKeyboardOverlap(200, 300, 700)).toBe(0);
    expect(sheetKeyboardOverlap(200, 600, 100)).toBe(600);
  });

  it('moves the content boundary with keyboard frame changes, detent changes, and dismissal', async () => {
    const view = await render(<KeyboardAwareSheet testID="frame"><Text>Last action</Text></KeyboardAwareSheet>);
    const padding = () => StyleSheet.flatten(view.getByTestId('frame').props.style).paddingBottom;
    await act(async () => { callbacks.get('keyboardWillChangeFrame')!(event); });
    expect(padding()).toBe(300);
    mockMeasure.mockImplementation((callback) => callback(0, 90, 390, 710));
    await fireEvent(view.getByTestId('frame'), 'layout');
    expect(padding()).toBe(300);
    await act(async () => { callbacks.get('keyboardWillChangeFrame')!({ ...event, endCoordinates: { ...event.endCoordinates, screenY: 550 } }); });
    expect(padding()).toBe(250);
    await act(async () => { callbacks.get('keyboardWillHide')!(event); });
    expect(padding()).toBe(0);
    expect(view.getByText('Last action')).toBeTruthy();
  });

  it('does not add keyboard height a second time after Android resizes its viewport', async () => {
    Platform.OS = 'android';
    mockMeasure.mockImplementation((callback) => callback(0, 100, 390, 400));
    const view = await render(<KeyboardAwareSheet testID="frame" />);
    await act(async () => { callbacks.get('keyboardDidShow')!(event); });
    expect(StyleSheet.flatten(view.getByTestId('frame').props.style).paddingBottom).toBe(0);
  });

  it('handles a keyboard already open when a nested sheet mounts', async () => {
    jest.mocked(Keyboard.metrics).mockReturnValue(event.endCoordinates);
    const view = await render(<KeyboardAwareSheet testID="frame" />);
    expect(StyleSheet.flatten(view.getByTestId('frame').props.style).paddingBottom).toBe(300);
  });

  it('opts out of other screens’ keyboards and rejects measurements after an inline input blurs', async () => {
    const view = await render(<KeyboardAwareSheet enabled={false} testID="frame"><Text>Shopping</Text></KeyboardAwareSheet>);
    const padding = () => StyleSheet.flatten(view.getByTestId('frame').props.style).paddingBottom;
    expect(callbacks.size).toBe(0);
    expect(padding()).toBe(0);
    jest.mocked(Keyboard.metrics).mockReturnValue(event.endCoordinates);
    await view.rerender(<KeyboardAwareSheet enabled testID="frame"><Text>Shopping</Text></KeyboardAwareSheet>);
    expect(padding()).toBe(300);
    let finish!: Measurement;
    mockMeasure.mockImplementation((callback) => { finish = callback; });
    await act(async () => { callbacks.get('keyboardWillChangeFrame')!(event); });
    await view.rerender(<KeyboardAwareSheet enabled={false} testID="frame"><Text>Shopping</Text></KeyboardAwareSheet>);
    await act(async () => { finish(0, 200, 390, 600); });
    expect(padding()).toBe(0);
    expect(callbacks.size).toBe(0);
    expect(view.getByText('Shopping')).toBeTruthy();
  });

  it('clears only the keyboard overlap inside a tab page’s already reserved native safe area', async () => {
    // Screen provider: top 70, bottom 84 in an 844-point window. The inner
    // viewport therefore ends at 760, not 844. Keyboard begins at 500.
    mockMeasure.mockImplementation((callback) => callback(0, 70, 390, 690));
    const view = await render(<Screen layout="tab-root" inlineKeyboardActive contentAlignment="top"><Text>Last Shopping row</Text></Screen>);
    const frame = view.getByTestId('screen-inline-keyboard-area');
    expect(frame.parent?.props.edges).toEqual({ top: true, right: true, bottom: true, left: true });
    expect(view.getByTestId('screen').parent).toBe(frame);
    await act(async () => { callbacks.get('keyboardWillChangeFrame')!(event); });
    const clearance = StyleSheet.flatten(view.getByTestId('screen-inline-keyboard-area').props.style).paddingBottom;
    expect(clearance).toBe(260);
    expect(70 + 690 - clearance).toBe(event.endCoordinates.screenY);
    expect(view.getByTestId('screen').props.automaticallyAdjustKeyboardInsets).toBe(false);
    await view.rerender(<Screen layout="tab-root" inlineKeyboardActive={false} contentAlignment="top"><Text>Last Shopping row</Text></Screen>);
    expect(StyleSheet.flatten(view.getByTestId('screen-inline-keyboard-area').props.style).paddingBottom).toBe(0);
    expect(frame.parent?.props.edges.bottom).toBe(true);
    expect(callbacks.size).toBe(0);
  });

  it('rejects a late measurement after keyboard dismissal or sheet unmount', async () => {
    let finish!: Measurement;
    mockMeasure.mockImplementation((callback) => { finish = callback; });
    const view = await render(<KeyboardAwareSheet testID="frame" />);
    await act(async () => { callbacks.get('keyboardWillChangeFrame')!(event); });
    await act(async () => { callbacks.get('keyboardWillHide')!(event); finish(0, 200, 390, 600); });
    expect(StyleSheet.flatten(view.getByTestId('frame').props.style).paddingBottom).toBe(0);
    await act(async () => { callbacks.get('keyboardDidShow')!(event); });
    await view.unmount();
    await act(async () => { finish(0, 200, 390, 600); });
    expect(callbacks.size).toBe(0);
  });
});

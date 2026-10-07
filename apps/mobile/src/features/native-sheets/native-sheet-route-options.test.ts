import { nativeSheetRouteOptions } from './native-sheet-route-options';
import type { NativeSheetEntry } from './native-sheet-context';

const entry: NativeSheetEntry = {
  id: 'sheet-1',
  scope: 'signed-in:user:session:household',
  content: null,
  detents: [0.38, 0.76],
  initialDetent: 1,
};

describe('native sheet navigator options', () => {
  it('configures iOS presentation and the flow-specific detents before opening', () => {
    expect(nativeSheetRouteOptions(entry, '#202020', 'ios')).toMatchObject({
      presentation: 'formSheet',
      sheetAllowedDetents: [0.38, 0.76],
      sheetInitialDetentIndex: 1,
      sheetGrabberVisible: true,
      headerShown: false,
      contentStyle: { backgroundColor: '#202020' },
    });
  });

  it('uses native form-sheet presentation on Android and a web fallback', () => {
    expect(nativeSheetRouteOptions(entry, '#202020', 'android').presentation).toBe('formSheet');
    expect(nativeSheetRouteOptions(entry, '#202020', 'web').presentation).toBe('modal');
  });

  it('keeps a safe native sheet presentation while an entry is being removed', () => {
    expect(nativeSheetRouteOptions(null, '#202020', 'ios')).toMatchObject({
      presentation: 'formSheet',
      sheetAllowedDetents: [0.55, 0.92],
      sheetInitialDetentIndex: 0,
    });
  });
});

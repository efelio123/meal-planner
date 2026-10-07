import type { NativeSheetEntry } from './native-sheet-context';

// Presentation must be known by the owning navigator before a route is pushed.
// Setting it from inside the sheet screen is too late for the native transition.
export function nativeSheetRouteOptions(entry: NativeSheetEntry | null, backgroundColor: string, platform: string) {
  return {
    headerShown: false,
    presentation: platform === 'web' ? 'modal' as const : 'formSheet' as const,
    sheetAllowedDetents: entry?.detents ?? [0.55, 0.92],
    sheetInitialDetentIndex: entry?.initialDetent ?? 0,
    sheetGrabberVisible: true,
    sheetCornerRadius: 24,
    contentStyle: { backgroundColor },
  };
}

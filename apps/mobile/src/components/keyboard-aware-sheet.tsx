import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Keyboard, Platform, StyleSheet, View, type KeyboardEvent, type ViewInstance, type ViewProps } from 'react-native';

/** Uses window coordinates, including the sheet's position and current detent. */
export function sheetKeyboardOverlap(sheetTop: number, sheetHeight: number, keyboardTop: number): number {
  return Math.max(0, Math.min(sheetHeight, Math.ceil(sheetTop + sheetHeight - keyboardTop)));
}

/** One measured keyboard owner for bounded scrolling content. Inline inputs opt in only while focused. */
export function KeyboardAwareSheet({ children, enabled = true, style, ...props }: PropsWithChildren<Omit<ViewProps, 'onLayout'> & { enabled?: boolean }>) {
  const frame = useRef<ViewInstance>(null);
  const keyboardTop = useRef<number | null>(null);
  const active = useRef(true);
  const measurement = useRef(0);
  const [overlap, setOverlap] = useState(0);
  const measure = useCallback(() => {
    const top = keyboardTop.current;
    const generation = ++measurement.current;
    if (top === null) { setOverlap(0); return; }
    frame.current?.measureInWindow((_x, y, _width, height) => {
      if (active.current && generation === measurement.current && keyboardTop.current === top) {
        setOverlap(sheetKeyboardOverlap(y, height, top));
      }
    });
  }, []);

  useEffect(() => {
    active.current = enabled;
    if (!enabled) {
      keyboardTop.current = null;
      measurement.current += 1;
      // Disabled padding is derived below; re-enabling measures the current keyboard.
      return;
    }
    if (Platform.OS === 'web') return () => { active.current = false; };
    const update = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      keyboardTop.current = event.endCoordinates.screenY;
      measure();
    };
    const hide = () => { keyboardTop.current = null; measure(); };
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', update),
      Keyboard.addListener('keyboardDidHide', hide),
      ...(Platform.OS === 'ios' ? [
        Keyboard.addListener('keyboardWillChangeFrame', update),
        Keyboard.addListener('keyboardWillHide', hide),
      ] : []),
    ];
    keyboardTop.current = Keyboard.metrics()?.screenY ?? null;
    measure();
    return () => {
      active.current = false;
      measurement.current += 1;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [enabled, measure]);

  return <View {...props} collapsable={false} ref={frame} onLayout={measure} style={[styles.frame, style, { paddingBottom: enabled ? overlap : 0 }]}>
    {children}
  </View>;
}

const styles = StyleSheet.create({ frame: { flex: 1 } });

import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Keyboard, Platform, StyleSheet, View, type KeyboardEvent, type ViewInstance, type ViewProps } from 'react-native';

/** Uses window coordinates, including the sheet's position and current detent. */
export function sheetKeyboardOverlap(sheetTop: number, sheetHeight: number, keyboardTop: number): number {
  return Math.max(0, Math.min(sheetHeight, Math.ceil(sheetTop + sheetHeight - keyboardTop)));
}

/** One keyboard owner for a bounded sheet with independently scrolling content. */
export function KeyboardAwareSheet({ children, style, ...props }: PropsWithChildren<Omit<ViewProps, 'onLayout'>>) {
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
    active.current = true;
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
  }, [measure]);

  return <View {...props} collapsable={false} ref={frame} onLayout={measure} style={[styles.frame, style, { paddingBottom: overlap }]}>
    {children}
  </View>;
}

const styles = StyleSheet.create({ frame: { flex: 1 } });

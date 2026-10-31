/* eslint-disable react-hooks/immutability, react-hooks/refs -- Reanimated shared values intentionally mutate inside UI-thread gesture worklets. */
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SWIPE_REVEAL_WIDTH, swipeDeleteRelease } from './swipe-to-delete-logic';

const TRASH_RED = '#ff3b3b';
const ACTION_SIZE = 56;
const SNAP = { mass: 1, damping: 28, stiffness: 300 };

type Props = {
  active: boolean;
  children: ReactNode;
  enabled: boolean;
  rowId: string;
  removeAccessibilityLabel: string;
  testID?: string;
  separatorTestID?: string;
  containerStyle?: StyleProp<ViewStyle>;
  onClose: () => void;
  onDragEnd: () => void;
  onDragStart: () => void;
  onRemove: () => Promise<void>;
  onReveal: () => void;
  separatorColor?: string | null;
};

export function SwipeToDeleteRow({ active, children, enabled, rowId, removeAccessibilityLabel, testID, separatorTestID, containerStyle, onClose, onDragEnd, onDragStart, onRemove, onReveal, separatorColor }: Props) {
  const offset = useSharedValue(0);
  const startOffset = useSharedValue(0);
  const endedAfterActivation = useSharedValue(false);
  const dragActivated = useSharedValue(false);
  const rowWidth = useSharedValue(0);
  const removalRequested = useRef(false);

  const removeOnce = useCallback(() => {
    if (!enabled || removalRequested.current) return;
    removalRequested.current = true;
    void onRemove().catch(() => {
      removalRequested.current = false;
      offset.value = withSpring(0, SNAP);
      onClose();
    });
  }, [enabled, offset, onClose, onRemove]);

  useEffect(() => {
    if (!active) offset.value = withSpring(0, SNAP);
  }, [active, offset]);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onBegin(() => { startOffset.value = offset.value; endedAfterActivation.value = false; dragActivated.value = false; })
    .onStart(() => { dragActivated.value = true; scheduleOnRN(onDragStart); })
    .onUpdate((event) => {
      offset.value = Math.min(0, Math.max(-rowWidth.value, startOffset.value + event.translationX));
    })
    .onEnd(() => {
      endedAfterActivation.value = true;
      scheduleOnRN(onDragEnd);
      const target = swipeDeleteRelease(offset.value, rowWidth.value);
      if (target === 'delete') {
        offset.value = withTiming(-rowWidth.value, { duration: 160 }, (finished) => {
          if (finished) scheduleOnRN(removeOnce);
        });
      } else if (target === 'reveal') {
        offset.value = withSpring(-SWIPE_REVEAL_WIDTH, SNAP);
        scheduleOnRN(onReveal);
      } else {
        offset.value = withSpring(0, SNAP);
        scheduleOnRN(onClose);
      }
    })
    .onFinalize(() => {
      if (!endedAfterActivation.value) {
        offset.value = withSpring(startOffset.value, SNAP);
        if (dragActivated.value) scheduleOnRN(onDragEnd);
      }
      endedAfterActivation.value = false;
      dragActivated.value = false;
    }), [dragActivated, enabled, endedAfterActivation, offset, onClose, onDragEnd, onDragStart, onReveal, removeOnce, rowWidth, startOffset]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const actionStyle = useAnimatedStyle(() => ({
    width: Math.max(ACTION_SIZE, Math.min(rowWidth.value * 0.78, -offset.value - 32)),
  }));

  return <GestureDetector gesture={pan}>
    <Animated.View testID={testID ?? `swipe-${rowId}`} collapsable={false} onLayout={(event) => { rowWidth.value = event.nativeEvent.layout.width; }} style={[styles.container, containerStyle]}>
      <View pointerEvents={active ? 'auto' : 'none'} accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'} style={styles.actionTrack}>
        <Animated.View style={[styles.actionPill, actionStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel={removeAccessibilityLabel} accessibilityState={{ disabled: !enabled }} disabled={!enabled} onPress={removeOnce} style={styles.actionButton}>
            <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={26} weight="semibold" tintColor="#ffffff" />
          </Pressable>
        </Animated.View>
      </View>
      <Animated.View style={rowStyle}>{children}</Animated.View>
      {separatorColor ? <View testID={separatorTestID ?? `swipe-separator-${rowId}`} pointerEvents="none" style={[styles.separator, { backgroundColor: separatorColor }]} /> : null}
    </Animated.View>
  </GestureDetector>;
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  separator: { position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
  actionTrack: { ...StyleSheet.absoluteFill, alignItems: 'flex-end', justifyContent: 'center' },
  actionPill: { backgroundColor: TRASH_RED, borderRadius: ACTION_SIZE / 2, height: ACTION_SIZE, marginRight: 8 },
  actionButton: { alignItems: 'flex-start', flex: 1, justifyContent: 'center', paddingLeft: 15 },
});

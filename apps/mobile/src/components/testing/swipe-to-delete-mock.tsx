// Native gesture/animation boundary; screens, hooks, routing and API calls stay real.
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import type { SwipeToDeleteRow as NativeSwipeRow } from '../swipe-to-delete-row';

export function SwipeToDeleteRow({ children, active, enabled, removeAccessibilityLabel, testID, onDragStart, onDragEnd, onClose, onReveal, onRemove, containerStyle }: ComponentProps<typeof NativeSwipeRow>) {
  return <View testID={testID} {...{ active, enabled, onDragStart, onDragEnd, onClose, onReveal, onRemove }} style={containerStyle}>
    {children}
    {active ? <Pressable accessibilityRole="button" accessibilityLabel={removeAccessibilityLabel} disabled={!enabled} onPress={() => { void onRemove().catch(() => undefined); }} /> : null}
  </View>;
}

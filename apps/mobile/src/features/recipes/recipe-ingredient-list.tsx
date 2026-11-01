import type { ComponentRef, PropsWithChildren, ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, View, type KeyDownEvent } from 'react-native';
import { GestureDetector, GestureStateManager, useManualGesture, type ManualGestureConfig } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, type AnimatedRef, type SharedValue } from 'react-native-reanimated';
import Sortable, { useItemContext } from 'react-native-sortables';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { RecipeIngredientDraft } from './recipe-form-utils';
import { formatRecipeAmount } from './recipe-presentation';

type Touch = { key: string; sequence: number; phase: 'down' | 'released' | 'cancelled' };
type Drag = { key: string; sequence: number } | null;
export type RecipeDragLock = { owner: string; blocked: boolean };
type Props = {
  ingredients: RecipeIngredientDraft[];
  enabled: boolean;
  busy: boolean;
  scrollRef: AnimatedRef<ComponentRef<typeof ScrollView>>;
  dragBlocked: SharedValue<RecipeDragLock>;
  interactionId: string;
  onStart: () => void;
  onFinish: (keys: string[], completed: boolean) => void;
  onEdit: (ingredient: RecipeIngredientDraft) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => number | null;
};

/** Observe native release/cancel separately: Sortables reports BOTH as a drop.
 * A simultaneous passive observer does not steal activation or use RN responder
 * cancellation (which iOS can send on a perfectly valid native drag).
 */
function IngredientHandle({ ingredient, index, count, disabled, touch, onMove }: {
  ingredient: { key: string; catalogItemName: string }; index: number; count: number; disabled: boolean;
  touch: SharedValue<Touch>; onMove: Props['onMove'];
}) {
  const theme = useTheme();
  const { gesture } = useItemContext();
  const key = ingredient.key;
  const observer = useManualGesture({
    enabled: !disabled,
    shouldCancelWhenOutside: false,
    simultaneousWith: gesture as unknown as ManualGestureConfig['simultaneousWith'],
    onTouchesDown: () => {
      'worklet';
      touch.set({ key, sequence: touch.get().sequence + 1, phase: 'down' });
    },
    onTouchesUp: (event) => {
      'worklet';
      if (touch.get().key === key && touch.get().phase === 'down') touch.set({ ...touch.get(), phase: 'released' });
      // This observer never activates. Release its BEGAN state after the last
      // pointer so it cannot hold a native gesture relation open between drags.
      GestureStateManager.fail(event.handlerTag);
    },
    onTouchesCancel: () => {
      'worklet';
      if (touch.get().key === key) touch.set({ ...touch.get(), phase: 'cancelled' });
    },
  });
  const move = (direction: -1 | 1) => {
    if (disabled) return;
    const position = onMove(key, direction);
    if (position !== null) AccessibilityInfo.announceForAccessibility(`${ingredient.catalogItemName}, position ${position} of ${count}`);
  };
  return <GestureDetector gesture={observer}>
    <View collapsable={false}>
      <Sortable.Handle mode={disabled ? 'non-draggable' : 'draggable'}>
        <View
          accessible accessibilityRole="adjustable"
          accessibilityLabel={`Reorder ${ingredient.catalogItemName}, position ${index + 1} of ${count}`}
          accessibilityHint="Hold and drag to reorder. Use accessibility actions to move earlier or later."
          accessibilityState={{ disabled }}
          accessibilityActions={disabled ? [] : [
            ...(index > 0 ? [{ name: 'decrement', label: 'Move earlier' }] : []),
            ...(index < count - 1 ? [{ name: 'increment', label: 'Move later' }] : []),
          ]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'decrement') move(-1);
            if (nativeEvent.actionName === 'increment') move(1);
          }}
          {...(Platform.OS === 'web' ? {
            tabIndex: disabled ? -1 : 0,
            onKeyDown: (event: KeyDownEvent) => {
              const { key, altKey } = event.nativeEvent;
              if (!altKey || !['ArrowUp', 'ArrowDown'].includes(key)) return;
              event.preventDefault(); move(key === 'ArrowUp' ? -1 : 1);
            },
          } : {})}
          style={[styles.handle, disabled && styles.disabled]}
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.lines}>
            {[0, 1, 2].map((line) => <View key={line} style={[styles.line, { backgroundColor: theme.textSecondary }]} />)}
          </View>
        </View>
      </Sortable.Handle>
    </View>
  </GestureDetector>;
}

/** Draw separators from UI-thread order, including the frame before React commits a drop. */
function IngredientRowSurface({ children }: PropsWithChildren) {
  const theme = useTheme();
  const { isActive, activationAnimationProgress, itemKey, keyToIndex } = useItemContext();
  const separatorStyle = useAnimatedStyle(() => ({
    opacity: !isActive.get() && activationAnimationProgress.get() === 0 && (keyToIndex.get()[itemKey] ?? 0) > 0 ? 1 : 0,
  }));
  return <View style={[styles.row, { backgroundColor: theme.surface }]}>
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`ingredient-separator-${itemKey}`} style={[styles.rowSeparator, { backgroundColor: theme.border }, separatorStyle]} />
    {children}
  </View>;
}

type ReorderProps<T extends { key: string }> = Omit<Props, 'ingredients' | 'onEdit'> & {
  items: T[]; label: (item: T) => string; detail?: (item: T) => ReactNode;
  onEdit: (item: T) => void; sectionRows?: boolean;
};
export function RecipeIngredientList(props: Props) {
  return <RecipeReorderList {...props} items={props.ingredients} label={(item) => item.catalogItemName} detail={(item) => {
    const unit = item.customUnitLabel.trim() || item.unitLabel;
    const amount = formatRecipeAmount(item.amount.trim());
    return <><ThemedText themeColor="textSecondary">{amount ? (unit ? `${amount} ${unit}` : amount) : 'To taste'}</ThemedText>
      {item.note ? <ThemedText themeColor="textSecondary">Note: {item.note}</ThemedText> : null}</>;
  }} />;
}
export function RecipeReorderList<T extends { key: string }>({ items: ingredients, label, detail, sectionRows, enabled, busy, scrollRef, dragBlocked, interactionId, onStart, onFinish, onEdit, onRemove, onMove }: ReorderProps<T>) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const touch = useSharedValue<Touch>({ key: '', sequence: 0, phase: 'cancelled' });
  const drag = useSharedValue<Drag>(null);
  return <View style={{ backgroundColor: theme.surface, borderRadius: 16 }}><Sortable.Grid
    data={ingredients} columns={1} customHandle keyExtractor={(item) => item.key}
    scrollableRef={scrollRef} sortEnabled={enabled && ingredients.length > 1}
    hapticsEnabled={false} dragActivationDelay={250}
    activeItemScale={reducedMotion ? 1 : 1.025} activeItemOpacity={1}
    activeItemShadowOpacity={reducedMotion ? 0 : 0.18} inactiveItemOpacity={1}
    activationAnimationDuration={reducedMotion ? 0 : 180} dropAnimationDuration={reducedMotion ? 0 : 180}
    itemEntering={null} itemExiting={null}
    onDragStart={({ key }) => {
      'worklet';
      if (dragBlocked.get().owner !== interactionId || dragBlocked.get().blocked) return;
      drag.value = { key, sequence: touch.value.sequence };
      dragBlocked.set({ owner: interactionId, blocked: true });
      scheduleOnRN(onStart);
    }}
    onActiveItemDropped={({ key, indexToKey }) => {
      'worklet';
      const active = drag.value;
      if (active === null) return;
      // A zero-duration reduced-motion drop can finish in the up event itself.
      // Wait one UI frame so the simultaneous up/cancel observer always runs.
      requestAnimationFrame(() => {
        const released = touch.value;
        const completed = active !== null && active.key === key && released.key === key
          && active.sequence === released.sequence && released.phase === 'released';
        drag.value = null;
        scheduleOnRN(onFinish, [...indexToKey], completed);
      });
    }}
    renderItem={({ item, index }) => {
      const name = label(item);
      return <IngredientRowSurface>
        <View style={styles.summary}>
          <ThemedText numberOfLines={3} style={styles.name}>{name}</ThemedText>
          {detail?.(item)}
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${sectionRows ? 'section ' : ''}${name}`} disabled={!enabled || busy} onPress={() => onEdit(item)} style={styles.action}><ThemedText themeColor="link">Edit</ThemedText></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${sectionRows ? 'section ' : ''}${name}${sectionRows ? '' : ' from recipe'}`} disabled={!enabled || busy} onPress={() => onRemove(item.key)} style={styles.action}><ThemedText themeColor="error">Remove</ThemedText></Pressable>
          <IngredientHandle ingredient={{ key: item.key, catalogItemName: name }} index={index} count={ingredients.length} disabled={!enabled || ingredients.length < 2} touch={touch} onMove={onMove} />
        </View>
      </IngredientRowSurface>;
    }}
  /></View>;
}

const styles = StyleSheet.create({
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: 4, minHeight: 72, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 12 },
  rowSeparator: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
  summary: { flex: 1, gap: 3, minWidth: 0 },
  name: { fontWeight: '700', flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  action: { alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, paddingHorizontal: 4 },
  handle: { alignItems: 'center', justifyContent: 'center', width: 44, height: 44 },
  lines: { gap: 4 },
  line: { width: 22, height: 2, borderRadius: 1 },
  disabled: { opacity: 0.4 },
});

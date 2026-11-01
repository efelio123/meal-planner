import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable, type ScrollViewInstance } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { calendarDay } from './planning-dates';
import { dateLabel, dayNumber, shortDayLabel } from './meal-plan-utils';

const BUFFER = 14;
export function PlanningDayStrip({ start, activeDay, plannedDates, disabled, onSelect, onStartChange }: {
  start: string; activeDay: string | null; plannedDates: ReadonlySet<string>; disabled: boolean;
  onSelect: (date: string) => void; onStartChange: (date: string) => void;
}) {
  const theme = useTheme();
  const scroll = useRef<ScrollViewInstance>(null);
  const [width, setWidth] = useState(0);
  const cell = width / 7;
  const latest = useRef({ start, cell, onStartChange });
  const dragging = useRef(false);
  const moved = useRef(false);
  const offset = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressPressUntil = useRef(0);
  const committed = useRef(false);
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useLayoutEffect(() => { latest.current = { start, cell, onStartChange }; }, [cell, onStartChange, start]);
  useLayoutEffect(() => {
    clearTimer(); committed.current = false; dragging.current = false; moved.current = false;
    offset.current = BUFFER * cell;
    scroll.current?.scrollTo({ x: BUFFER * cell, animated: false });
  }, [cell, start]);
  useEffect(() => () => clearTimer(), []);
  const settle = () => {
    clearTimer();
    const current = latest.current;
    if (!current.cell || committed.current || !moved.current) return;
    const shift = Math.max(-BUFFER, Math.min(BUFFER, Math.round(offset.current / current.cell) - BUFFER));
    if (!shift) { moved.current = false; committed.current = true; scroll.current?.scrollTo({ x: BUFFER * current.cell, animated: true }); return; }
    committed.current = true;
    current.onStartChange(calendarDay(current.start, shift));
  };
  return <View testID="meal-plan-week-strip" style={styles.rail} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {width > 0 ? <ScrollView ref={scroll} testID="planning-day-scroll" horizontal showsHorizontalScrollIndicator={false} directionalLockEnabled
      contentOffset={{ x: BUFFER * cell, y: 0 }} snapToInterval={cell} decelerationRate="fast" scrollEventThrottle={16}
      onScrollBeginDrag={() => { clearTimer(); dragging.current = true; moved.current = false; committed.current = false; }}
      onScroll={(event) => {
        offset.current = event.nativeEvent.contentOffset.x;
        if (dragging.current && Math.abs(offset.current - BUFFER * latest.current.cell) > 4) { moved.current = true; suppressPressUntil.current = Date.now() + 500; }
        if (!dragging.current && moved.current && !committed.current) { clearTimer(); timer.current = setTimeout(settle, 140); }
      }}
      onScrollEndDrag={(event) => {
        offset.current = event.nativeEvent.contentOffset.x;
        if (Math.abs(offset.current - BUFFER * latest.current.cell) > 4) moved.current = true;
        dragging.current = false;
        if (moved.current) { suppressPressUntil.current = Date.now() + 500; clearTimer(); timer.current = setTimeout(settle, 140); }
      }}
      onMomentumScrollBegin={() => { clearTimer(); suppressPressUntil.current = Date.now() + 10000; }}
      onMomentumScrollEnd={(event) => { suppressPressUntil.current = Date.now() + 500; offset.current = event.nativeEvent.contentOffset.x; settle(); }}>
      {Array.from({ length: 7 + BUFFER * 2 }, (_, index) => {
        const day = calendarDay(start, index - BUFFER);
        const visible = index >= BUFFER && index < BUFFER + 7;
        const active = day === activeDay;
        return <Pressable key={day} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} accessibilityRole="button" accessibilityLabel={`${shortDayLabel(day)} ${dateLabel(day, { month: 'long', day: 'numeric' })}`} accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={() => { if (Date.now() >= suppressPressUntil.current && !dragging.current) onSelect(day); }} style={[styles.day, { width: cell }, active && { backgroundColor: theme.primary }]}>
          <ThemedText themeColor={active ? undefined : 'textSecondary'} style={[styles.label, active && { color: theme.primaryText }]}>{shortDayLabel(day)}</ThemedText>
          <ThemedText style={[styles.number, active && { color: theme.primaryText }]}>{dayNumber(day)}</ThemedText>
          <View testID={visible ? `meal-plan-day-dot-${day}` : undefined} style={[styles.dot, { backgroundColor: active ? theme.primaryText : plannedDates.has(day) ? theme.primary : 'transparent' }]} />
        </Pressable>;
      })}
    </ScrollView> : null}
  </View>;
}
const styles = StyleSheet.create({
  rail: { width: '100%', overflow: 'hidden', minHeight: 80, paddingVertical: 3 },
  day: { alignItems: 'center', justifyContent: 'center', borderRadius: 18, gap: 5, paddingHorizontal: 2, paddingVertical: 9 },
  label: { fontSize: 12, fontWeight: '600' }, number: { fontSize: 16, fontWeight: '700' }, dot: { height: 5, width: 5, borderRadius: 3 },
});

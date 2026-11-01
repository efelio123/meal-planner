import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { PlanningDayStrip } from './planning-day-strip';

it('keeps seven complete accessible days and suppresses presses after a canceled horizontal drag', async () => {
  const onSelect = jest.fn(); const onStartChange = jest.fn();
  await render(<PlanningDayStrip start="2026-10-05" activeDay="2026-10-05" plannedDates={new Set()} disabled={false} onSelect={onSelect} onStartChange={onStartChange} />);
  await fireEvent(screen.getByTestId('meal-plan-week-strip'), 'layout', { nativeEvent: { layout: { width: 350, height: 90, x: 0, y: 0 } } });
  const days = within(screen.getByTestId('meal-plan-week-strip')).getAllByRole('button');
  expect(days).toHaveLength(7);
  const scroll = screen.getByTestId('planning-day-scroll');
  await fireEvent(scroll, 'scrollBeginDrag', { nativeEvent: { contentOffset: { x: 700, y: 0 } } });
  await fireEvent(scroll, 'scroll', { nativeEvent: { contentOffset: { x: 730, y: 0 } } });
  await fireEvent(scroll, 'scrollEndDrag', { nativeEvent: { contentOffset: { x: 700, y: 0 } } });
  await fireEvent(scroll, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 700, y: 0 } } });
  await fireEvent.press(days[2]);
  expect(onStartChange).not.toHaveBeenCalled(); expect(onSelect).not.toHaveBeenCalled();
});

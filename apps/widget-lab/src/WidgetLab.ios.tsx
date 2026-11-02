import { Button, HStack, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding, background, widgetURL, controlSize } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { freshSample, type LabProps } from './sample';

export const WidgetLabLayout = (props: LabProps, environment: WidgetEnvironment) => {
  'widget';
  const count = props.items.filter((item) => !item.confirmedChecked).length;
  const pending = props.items.filter((item) => item.pendingChecked !== null).length;
  const limit = environment.widgetFamily === 'systemLarge' ? 3 : 2;
  const day = props.days[props.selectedDay] ?? props.days[0];
  return <VStack alignment="leading" spacing={5} modifiers={[padding({ all: 10 }), background(props.colors.background), foregroundStyle(props.colors.text), widgetURL(`mealplanner-widget-lab://${props.view}`)]}>
    <Text modifiers={[font({ size: 12, weight: 'bold' })]}>Widget Lab · Sample</Text>
    {environment.widgetFamily === 'systemSmall' ? <>
      <Text modifiers={[font({ size: 28, weight: 'bold' })]}>{`${count} items`}</Text>
      <Text>Open the lab for sample details</Text>
    </> : <>
      <HStack spacing={12}>
        <Button modifiers={[controlSize('mini')]} label="Shopping" target="view-shopping" onPress={() => ({ view: 'shopping' })} />
        <Button modifiers={[controlSize('mini')]} label="Plan" target="view-plan" onPress={() => ({ view: 'plan' })} />
      </HStack>
      {props.view === 'shopping' ? <VStack key="shopping" alignment="leading" spacing={4}>
        <Text>{`${count} needed · ${pending} pending${count > limit ? ` · +${count - limit} more` : ''}`}</Text>
        {props.items.slice(0, limit).map((item) => <Button key={item.id} label={`${item.pendingChecked === null ? '○' : '…'} ${item.name}`} target={`check-${item.id}`} onPress={() => ({ items: props.items.map((current) => current.id === item.id ? { ...current, pendingChecked: current.pendingChecked === null ? true : null } : current) })} />)}
        <Text modifiers={[font({ size: 11 })]}>Pending locally. No API synchronization.</Text>
      </VStack> : <VStack key="plan" alignment="leading" spacing={4}>
        <HStack spacing={6}>{props.days.map((entry, index) => <Button key={entry.date} label={entry.label} target={`day-${index}`} onPress={() => ({ selectedDay: index })} />)}</HStack>
        <Text>{`${day.label} · ${day.date}`}</Text>
        <Text>{`Breakfast: ${day.breakfast}`}</Text><Text>{`Lunch: ${day.lunch}`}</Text><Text>{`Dinner: ${day.dinner}`}</Text>
        {environment.widgetFamily === 'systemLarge' ? <Text modifiers={[font({ size: 11 })]}>All seven days are selectable above.</Text> : null}
      </VStack>}
    </>}
  </VStack>;
};
const widget = createWidget('MealPlannerWidgetLab', WidgetLabLayout, freshSample());
export const publishSample = () => widget.updateSnapshot(freshSample());
export default widget;

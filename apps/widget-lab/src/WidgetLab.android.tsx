import { Button, Column, Row, Text } from '@expo/ui/jetpack-compose';
import { paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';
import { freshSample, type LabProps } from './sample';

export const WidgetLabLayout = (props: LabProps) => {
  'widget';
  const count = props.items.filter((item) => !item.confirmedChecked).length;
  const pending = props.items.filter((item) => item.pendingChecked !== null).length;
  const day = props.days[props.selectedDay] ?? props.days[0];
  const small = props.size === 'small';
  const limit = props.size === 'large' ? 3 : 2;
  return <Column modifiers={[paddingAll(10)]}>
    <Text>Widget Lab · Sample</Text>
    {small ? <Text>{`${count} items`}</Text> : <>
      <Row><Button key="shopping-mode" onClick={() => ({ view: 'shopping' })}>Shopping</Button><Button key="plan-mode" onClick={() => ({ view: 'plan' })}>Plan</Button></Row>
      {props.view === 'shopping' ? <Column key="shopping">
        <Text>{`${count} needed · ${pending} pending`}</Text>
        {props.items.slice(0, limit).map((item) => <Button key={item.id} onClick={() => ({ items: props.items.map((current) => current.id === item.id ? { ...current, pendingChecked: current.pendingChecked === null ? true : null } : current) })}>{`${item.pendingChecked === null ? '○' : '…'} ${item.name}`}</Button>)}
        <Text>Pending locally. No API synchronization.</Text>
      </Column> : <Column key="plan">
        <Row><Button key="previous-day" onClick={() => ({ selectedDay: (props.selectedDay + 6) % 7 })}>Previous</Button><Text>{day.label}</Text><Button key="next-day" onClick={() => ({ selectedDay: (props.selectedDay + 1) % 7 })}>Next</Button></Row>
        <Text>{`${day.label} · ${day.date}`}</Text>
        <Text>{`Breakfast: ${day.breakfast}`}</Text><Text>{`Lunch: ${day.lunch}`}</Text><Text>{`Dinner: ${day.dinner}`}</Text>
      </Column>}
    </>}
  </Column>;
};
const small = createWidget('WidgetLabSmall', WidgetLabLayout, { ...freshSample(), size: 'small' });
const medium = createWidget('WidgetLabMedium', WidgetLabLayout, { ...freshSample(), size: 'medium' });
const large = createWidget('WidgetLabLarge', WidgetLabLayout, { ...freshSample(), size: 'large' });
export const publishSample = () => {
  small.updateSnapshot({ ...freshSample(), size: 'small' });
  medium.updateSnapshot({ ...freshSample(), size: 'medium' });
  large.updateSnapshot({ ...freshSample(), size: 'large' });
};
export default medium;

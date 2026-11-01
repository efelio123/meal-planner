// Native layout/animation boundary only; editor state and callbacks stay real.
import { createContext, useContext, useEffect, useLayoutEffect, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useManualGesture } from 'react-native-gesture-handler';
import type { SortableGridProps } from 'react-native-sortables';

type ItemState = {
  itemKey: string;
  gesture: ReturnType<typeof useManualGesture>;
  isActive: SharedValue<boolean>;
  activationAnimationProgress: SharedValue<number>;
  keyToIndex: SharedValue<Record<string, number>>;
};
const ItemContext = createContext<ItemState | null>(null);
export const sortableTestItems = new Map<string, ItemState>();
export function useItemContext() {
  const context = useContext(ItemContext);
  if (!context) throw new Error('Sortable test items require their item context.');
  return context;
}
function Item({ itemKey, order, children }: PropsWithChildren<{ itemKey: string; order: ItemState['keyToIndex'] }>) {
  const gesture = useManualGesture({});
  const isActive = useSharedValue(false);
  const activationAnimationProgress = useSharedValue(0);
  const value = { itemKey, gesture, isActive, activationAnimationProgress, keyToIndex: order };
  useEffect(() => {
    sortableTestItems.set(itemKey, value);
    return () => { sortableTestItems.delete(itemKey); };
  });
  return <ItemContext.Provider value={value}>{children}</ItemContext.Provider>;
}
export default {
  Grid: function Grid<T extends { key: string }>({ data, renderItem, ...props }: SortableGridProps<T>) {
    const order = useSharedValue<Record<string, number>>(Object.fromEntries(data.map((item, index) => [item.key, index])));
    useLayoutEffect(() => { order.set(Object.fromEntries(data.map((item, index) => [item.key, index]))); }, [data, order]);
    return <View {...props} {...{ data }} testID="recipe-sortable-grid">
      {data.map((item, index) => <Item key={item.key} itemKey={item.key} order={order}>{renderItem({ item, index })}</Item>)}
    </View>;
  },
  Handle: ({ children, mode }: PropsWithChildren<{ mode: string }>) => <View {...{ mode }} testID="ingredient-drag-handle">{children}</View>,
};

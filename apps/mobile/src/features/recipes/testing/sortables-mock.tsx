// Native layout/animation boundary only; editor state and callbacks stay real.
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useManualGesture } from 'react-native-gesture-handler';
import type { SortableGridProps } from 'react-native-sortables';

export const useItemContext = () => ({ gesture: useManualGesture({}) });
export default {
  Grid: <T extends { key: string },>({ data, renderItem, ...props }: SortableGridProps<T>) => (
    <View {...props} {...{ data }} testID="recipe-sortable-grid">
      {data.map((item, index) => <View key={item.key}>{renderItem({ item, index })}</View>)}
    </View>
  ),
  Handle: ({ children, mode }: PropsWithChildren<{ mode: string }>) => <View {...{ mode }} testID="ingredient-drag-handle">{children}</View>,
};

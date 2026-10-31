import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { ThemedText } from '@/components/themed-text';
import { ThemedInput } from '@/components/themed-controls';
import { useTheme } from '@/hooks/use-theme';
import { MealEntryCover } from './meal-entry-cover';
import { SPECIAL_MEALS, validMealChoice, type MealChoice } from './meal-entry';

export function SpecialMealOptions({ choice, onSelect, onDetail, disabled = false }: {
  choice: MealChoice; onSelect: (kind: 'leftovers' | 'eating_out') => void; onDetail: (value: string) => void; disabled?: boolean;
}) {
  const theme = useTheme();
  const option = SPECIAL_MEALS.find((item) => item.kind === choice.kind);
  return <View style={styles.content}>
    <View style={[styles.group, { borderColor: theme.border, backgroundColor: theme.surface }]}>{SPECIAL_MEALS.map((item, index) => {
      const selected = choice.kind === item.kind;
      return <Pressable key={item.kind} accessibilityRole="radio" accessibilityLabel={item.title} accessibilityState={{ selected, disabled }} disabled={disabled}
        onPress={() => onSelect(item.kind)} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, selected && { backgroundColor: theme.surfaceSelected }]}>
        <MealEntryCover entry={{ entry_type: item.kind }} /><ThemedText style={styles.title}>{item.title}</ThemedText>
        {selected ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={22} tintColor={theme.primary} /> : null}
      </Pressable>;
    })}</View>
    {choice.kind !== 'recipe' && option ? <View style={styles.content}>
      <ThemedText style={styles.label}>{option.field}</ThemedText>
      <ThemedInput accessibilityLabel={option.field} editable={!disabled} value={choice.detail} onChangeText={onDetail} maxLength={320} returnKeyType="done" placeholder={choice.kind === 'leftovers' ? 'e.g. Chicken tacos' : 'e.g. Favorite restaurant'} />
      {!validMealChoice(choice) ? <ThemedText accessibilityRole="alert" themeColor="error">Use 160 characters or fewer.</ThemedText> : null}
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({ content: { gap: 12 }, group: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 76, paddingHorizontal: 10, paddingVertical: 9 },
  title: { flex: 1, fontSize: 16, fontWeight: '600' }, label: { fontSize: 16, fontWeight: '700' } });

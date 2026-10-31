import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { ThemedText } from '@/components/themed-text';
import { ThemedInput } from '@/components/themed-controls';
import { useTheme } from '@/hooks/use-theme';
import { SPECIAL_MEALS, validMealChoice, type MealChoice } from './meal-entry';

export function SpecialMealOptions({ choice, onSelect, onDetail, disabled = false, immediate = false }: {
  choice: MealChoice; onSelect: (kind: 'leftovers' | 'eating_out') => void; onDetail: (value: string) => void; disabled?: boolean; immediate?: boolean;
}) {
  const theme = useTheme();
  const option = SPECIAL_MEALS.find((item) => item.kind === choice.kind);
  return <View style={styles.content}>
    <View style={styles.group}>{SPECIAL_MEALS.map((item) => {
      const selected = !immediate && choice.kind === item.kind;
      return <Pressable key={item.kind} accessibilityRole={immediate ? 'button' : 'radio'} accessibilityLabel={item.title} accessibilityState={immediate ? { disabled, busy: disabled } : { selected, disabled }} disabled={disabled}
        onPress={() => onSelect(item.kind)} style={[styles.row, { backgroundColor: selected ? theme.surfaceSelected : theme.surface, borderColor: selected ? theme.primary : theme.border }]}>
        <SymbolView name={item.kind === 'leftovers' ? { ios: 'arrow.clockwise', android: 'replay', web: 'replay' } : { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }} size={20} tintColor={theme.primary} /><ThemedText style={styles.title}>{item.title}</ThemedText>
        {selected ? <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={18} tintColor={theme.primary} /> : null}
      </Pressable>;
    })}</View>
    {!immediate && choice.kind !== 'recipe' && option ? <View style={styles.content}>
      <ThemedText style={styles.label}>{option.field}</ThemedText>
      <ThemedInput accessibilityLabel={option.field} editable={!disabled} value={choice.detail} onChangeText={onDetail} maxLength={320} returnKeyType="done" placeholder={choice.kind === 'leftovers' ? 'e.g. Chicken tacos' : 'e.g. Favorite restaurant'} />
      {!validMealChoice(choice) ? <ThemedText accessibilityRole="alert" themeColor="error">Use 160 characters or fewer.</ThemedText> : null}
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({ content: { gap: 12 }, group: { flexDirection: 'row', gap: 10 },
  row: { flex: 1, minWidth: 0, borderRadius: 13, borderWidth: 1, alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 52, paddingHorizontal: 10, paddingVertical: 10 },
  title: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '600' }, label: { fontSize: 16, fontWeight: '700' } });

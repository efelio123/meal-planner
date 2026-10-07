import { useMemo, useState } from 'react';
import { Button, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { filteredTimeZones, timeZoneLabel } from '@/lib/time-zones';
import { useTheme } from '@/hooks/use-theme';
import { ThemedInput } from '@/components/themed-controls';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';

type Props = {
  disabled?: boolean;
  onChange: (timeZone: string) => void;
  value: string;
};

export function timeZoneSheetStyle(backgroundColor: string) {
  return [styles.sheet, { backgroundColor }];
}

export function submitTimeZoneSelection(onChange: Props['onChange'], timeZone: string) {
  onChange(timeZone);
}

function TimeZoneSheet({ value, onChange }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filteredTimeZones(value, query), [query, value]);

  return <KeyboardAvoidingView testID="time-zone-keyboard-area" behavior="padding" style={styles.keyboardArea}>
    <View testID="time-zone-sheet" style={timeZoneSheetStyle(theme.elevatedSurface)}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Choose time zone</Text>
        <Button onPress={() => router.back()} title="Done" />
      </View>
      <ThemedInput
        accessibilityLabel="Search time zones"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(query) => setQuery(query)}
        placeholder="Search city or region"
        value={query}
      />
      <FlatList
        data={filtered}
        testID="time-zone-results"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyExtractor={(timeZone) => timeZone}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <Pressable
          accessibilityLabel={timeZoneLabel(item)}
          accessibilityRole="radio"
          accessibilityState={{ selected: item === value }}
          onPress={() => { submitTimeZoneSelection(onChange, item); router.back(); }}
          style={[styles.option, { borderBottomColor: theme.border }]}
        >
          <Text style={[styles.optionLabel, { color: theme.text }]}>{timeZoneLabel(item)}</Text>
          <Text style={[styles.identifier, { color: theme.textSecondary }]}>{item}</Text>
        </Pressable>}
      />
    </View>
  </KeyboardAvoidingView>;
}

export function TimeZonePicker({ disabled = false, onChange, value }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const { present } = useNativeSheetFlow();

  const open = () => {
    const sheetId = present(<TimeZoneSheet value={value} onChange={onChange} />, { detents: [0.45, 0.94] });
    router.push({ pathname: '/native-sheet/[sheetId]', params: { sheetId } } as never);
  };

  return <View style={styles.container}>
    <Text style={[styles.label, { color: theme.text }]}>Time zone</Text>
    <Pressable accessibilityLabel="Time zone" accessibilityRole="button" disabled={disabled} onPress={open} style={[styles.selected, { backgroundColor: theme.inputBackground, borderColor: theme.border }]}>
      <Text style={[styles.selectedLabel, { color: theme.text }]}>{timeZoneLabel(value)}</Text>
      <Text style={[styles.identifier, { color: theme.textSecondary }]}>{value}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  keyboardArea: { flex: 1 },
  container: { gap: 6 },
  label: { fontSize: 16, fontWeight: '600' },
  selected: { borderColor: '#9ca3af', borderRadius: 8, borderWidth: 1, gap: 2, padding: 12 },
  selectedLabel: { fontSize: 16 },
  identifier: { fontSize: 13 },
  sheet: { flex: 1, gap: 16, padding: 24, paddingTop: 18 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700' },
  option: { borderBottomWidth: 1, gap: 2, paddingVertical: 14 },
  optionLabel: { fontSize: 16 },
});

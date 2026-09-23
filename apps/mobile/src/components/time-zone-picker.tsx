import { useMemo, useState } from 'react';
import { Button, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { filteredTimeZones, timeZoneLabel } from '@/lib/time-zones';

type Props = {
  onChange: (timeZone: string) => void;
  value: string;
};

export function submitTimeZoneSelection(onChange: Props['onChange'], timeZone: string) {
  onChange(timeZone);
}

export function TimeZonePicker({ onChange, value }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const timeZones = useMemo(() => filteredTimeZones(value, query), [query, value]);

  const selectTimeZone = (timeZone: string) => {
    submitTimeZoneSelection(onChange, timeZone);
    setQuery('');
    setIsOpen(false);
  };

  return <View style={styles.container}>
    <Text style={styles.label}>Time zone</Text>
    <Pressable accessibilityLabel="Time zone" accessibilityRole="button" onPress={() => setIsOpen(true)} style={styles.selected}>
      <Text style={styles.selectedLabel}>{timeZoneLabel(value)}</Text>
      <Text style={styles.identifier}>{value}</Text>
    </Pressable>
    <Modal animationType="slide" onRequestClose={() => setIsOpen(false)} visible={isOpen}>
      <View style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose time zone</Text>
          <Button onPress={() => setIsOpen(false)} title="Close" />
        </View>
        <TextInput
          accessibilityLabel="Search time zones"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search city or region"
          style={styles.search}
          value={query}
        />
        <FlatList
          data={timeZones}
          keyExtractor={(timeZone) => timeZone}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <Pressable
            accessibilityLabel={timeZoneLabel(item)}
            accessibilityRole="radio"
            accessibilityState={{ selected: item === value }}
            onPress={() => selectTimeZone(item)}
            style={styles.option}
          >
            <Text style={styles.optionLabel}>{timeZoneLabel(item)}</Text>
            <Text style={styles.identifier}>{item}</Text>
          </Pressable>}
        />
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 16, fontWeight: '600' },
  selected: { borderColor: '#9ca3af', borderRadius: 8, borderWidth: 1, gap: 2, padding: 12 },
  selectedLabel: { fontSize: 16 },
  identifier: { color: '#4b5563', fontSize: 13 },
  modal: { flex: 1, gap: 16, padding: 24, paddingTop: 64 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700' },
  search: { borderColor: '#9ca3af', borderRadius: 8, borderWidth: 1, fontSize: 16, padding: 12 },
  option: { borderBottomColor: '#e5e7eb', borderBottomWidth: 1, gap: 2, paddingVertical: 14 },
  optionLabel: { fontSize: 16 },
});

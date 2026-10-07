import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';

import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';

export type ChoiceOption = { id: string; label: string; group?: string; emoji?: string | null };

type ChoiceSheetProps = {
  label: string;
  choices: ChoiceOption[];
  selectedId?: string;
  emptyChoiceLabel?: string;
  searchable: boolean;
  createActionLabel?: string;
  manageActionLabel?: string;
  customValue?: string;
  onSelect: (id: string) => void;
  onCreate?: () => void;
  onManage?: () => void;
  onCustomSelect?: (value: string) => void;
};

function ChoiceSheet({ label, choices, selectedId, emptyChoiceLabel, searchable, createActionLabel, manageActionLabel, customValue, onSelect, onCreate, onManage, onCustomSelect }: ChoiceSheetProps) {
  const theme = useTheme();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState(customValue ?? '');
  const searchInput = useRef<TextInput>(null);
  const filtered = choices.filter((choice) => choice.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const close = () => { Keyboard.dismiss(); router.back(); };
  const choose = (id: string) => { searchInput.current?.blur(); Keyboard.dismiss(); onSelect(id); router.back(); };
  const runRouteAction = (action?: () => void) => {
    Keyboard.dismiss();
    router.back();
    if (action) requestAnimationFrame(action);
  };

  return <KeyboardAvoidingView testID="catalog-choice-keyboard-area" behavior="padding" style={styles.keyboardArea}>
    <View accessibilityViewIsModal testID="catalog-choice-sheet" style={[styles.sheet, { backgroundColor: theme.elevatedSurface }]}>
    <View style={styles.sheetHeading}>
      <ThemedText accessibilityRole="header" style={styles.modalTitle}>{customMode ? 'Custom unit' : label}</ThemedText>
      <Pressable accessibilityLabel={`Close ${label} choices`} accessibilityRole="button" onPress={close} style={styles.closeButton}><ThemedText themeColor="link">{customMode ? 'Back' : 'Done'}</ThemedText></Pressable>
    </View>
    {customMode ? <View style={styles.customEntry}>
      <ThemedText themeColor="textSecondary">For this ingredient only</ThemedText>
      <ThemedInput accessibilityLabel="Custom recipe unit" autoFocus maxLength={40} onChangeText={setCustomText} placeholder="e.g. pinch" value={customText} />
      <PrimaryButton disabled={!customText.trim()} onPress={() => { onCustomSelect?.(customText.trim()); router.back(); }} title="Use custom unit" />
    </View> : <>
      {searchable ? <ThemedInput ref={searchInput} accessibilityLabel={`Search ${label}`} onChangeText={setSearch} placeholder={`Search ${label.toLocaleLowerCase()}`} value={search} returnKeyType="search" /> : null}
      <ScrollView testID="catalog-choice-scroll" contentContainerStyle={styles.list} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" style={styles.choices}>
        <View style={[styles.choiceCard, { backgroundColor: theme.surface, borderColor: theme.surfaceSelected }]}>
          {emptyChoiceLabel ? <Pressable accessibilityLabel={emptyChoiceLabel} accessibilityRole="button" accessibilityState={{ selected: !selectedId }} onPress={() => choose('')} style={[styles.choice, { borderBottomColor: theme.border }]}><SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'circle.slash', android: 'block', web: 'block' }} size={24} tintColor={theme.textSecondary} /><ThemedText style={styles.choiceLabel}>{emptyChoiceLabel}</ThemedText>{!selectedId ? <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={20} tintColor={theme.link} /> : null}</Pressable> : null}
          {filtered.map((choice, index) => <View key={choice.id}>
            {choice.group && (index === 0 || filtered[index - 1]?.group !== choice.group) ? <ThemedText style={styles.groupHeading} themeColor="textSecondary">{choice.group}</ThemedText> : null}
            <Pressable accessibilityLabel={choice.label} accessibilityRole="button" accessibilityState={{ selected: choice.id === selectedId }} onPress={() => choose(choice.id)} style={[styles.choice, { borderBottomColor: theme.border }]}>
              {choice.emoji ? <ThemedText style={styles.choiceEmoji}>{choice.emoji}</ThemedText> : null}
              <ThemedText style={styles.choiceLabel}>{choice.label}</ThemedText>
              {choice.id === selectedId ? <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={20} tintColor={theme.link} /> : null}
            </Pressable>
          </View>)}
          {filtered.length === 0 ? <ThemedText themeColor="textSecondary" style={styles.noChoices}>No matching choices.</ThemedText> : null}
        </View>
      </ScrollView>
      {onCustomSelect ? <Pressable accessibilityRole="button" onPress={() => { searchInput.current?.blur(); Keyboard.dismiss(); setCustomMode(true); }} style={[styles.customAction, { backgroundColor: theme.surfaceSelected }]}><SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'pencil', android: 'edit', web: 'edit' }} size={22} tintColor={theme.link} /><ThemedText themeColor="link">Use custom unit</ThemedText></Pressable> : null}
      {onCreate || onManage ? <View style={[styles.actions, { borderColor: theme.surfaceSelected, backgroundColor: theme.surfaceSelected }]}>
        {onCreate ? <Pressable accessibilityLabel={createActionLabel} accessibilityRole="button" onPress={() => runRouteAction(onCreate)} style={styles.action}><SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }} size={26} tintColor={theme.link} /><ThemedText themeColor="link">{createActionLabel}</ThemedText></Pressable> : null}
        {onManage ? <Pressable accessibilityLabel={manageActionLabel} accessibilityRole="button" onPress={() => runRouteAction(onManage)} style={[styles.action, { borderTopColor: theme.border }]}><SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} size={26} tintColor={theme.link} /><ThemedText themeColor="link">{manageActionLabel}</ThemedText></Pressable> : null}
      </View> : null}
    </>}
    </View>
  </KeyboardAvoidingView>;
}

export function ChoicePicker({ label, value, selectedId, choices, onSelect, onCreate, onManage, onOpen, onCustomSelect, emptyChoiceLabel, searchable: searchableOverride, createLabel, manageLabel, disabled = false, compact = false }: {
  label: string;
  value: string;
  selectedId?: string;
  choices: ChoiceOption[];
  onSelect: (id: string) => void;
  onCreate?: () => void;
  onManage?: () => void;
  onOpen?: () => void;
  /** Optional per-field value; does not create a household Catalog choice. */
  onCustomSelect?: (value: string) => void;
  emptyChoiceLabel?: string;
  searchable?: boolean;
  createLabel?: string;
  manageLabel?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { present } = useNativeSheetFlow();
  const searchable = searchableOverride ?? choices.length > 6;
  const createActionLabel = createLabel ?? `Create ${label.toLocaleLowerCase().replace(/ \(optional\)/, '')}`;
  const manageActionLabel = manageLabel ?? `Manage ${label.toLocaleLowerCase().replace(/ \(optional\)/, '')}s`;

  const open = () => {
    onOpen?.();
    const sheetId = present(
      <ChoiceSheet
        label={label}
        choices={choices}
        selectedId={selectedId}
        emptyChoiceLabel={emptyChoiceLabel}
        searchable={searchable}
        createActionLabel={onCreate ? createActionLabel : undefined}
        manageActionLabel={onManage ? manageActionLabel : undefined}
        customValue={selectedId === '__custom__' ? value : ''}
        onSelect={onSelect}
        onCreate={onCreate}
        onManage={onManage}
        onCustomSelect={onCustomSelect}
      />,
      { detents: choices.length <= 3 ? [0.38, 0.76] : [0.58, 0.94] },
    );
    router.push({ pathname: '/native-sheet/[sheetId]', params: { sheetId } } as never);
  };

  return <View style={[styles.field, compact && styles.compactField]}>
    {compact ? <Pressable testID="choice-picker-field" accessibilityLabel={`${label}: ${value || 'Not selected'}`} accessibilityRole="button" disabled={disabled} onPress={open} style={[styles.select, styles.compactSelect, { backgroundColor: theme.inputBackground, borderColor: theme.border, opacity: disabled ? 0.6 : 1 }]}>
      <View style={styles.selectCopy}><ThemedText themeColor="textSecondary">{label}</ThemedText><ThemedText style={styles.selectedValue}>{value || 'Select…'}</ThemedText></View><ThemedText themeColor="textSecondary">›</ThemedText>
    </Pressable> : <>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <Pressable testID="choice-picker-field" accessibilityLabel={`${label}: ${value || 'Not selected'}`} accessibilityRole="button" disabled={disabled} onPress={open} style={[styles.select, { backgroundColor: theme.inputBackground, borderColor: theme.border, opacity: disabled ? 0.6 : 1 }]}>
        <ThemedText>{value || 'Select…'}</ThemedText><ThemedText themeColor="textSecondary">⌄</ThemedText>
      </Pressable>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  keyboardArea: { flex: 1 },
  field: { gap: 8 },
  compactField: { gap: 0 },
  label: { fontWeight: '600' },
  select: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 14 },
  compactSelect: { minHeight: 76, paddingVertical: 10 },
  selectCopy: { flex: 1, gap: 2 },
  selectedValue: { fontSize: 17 },
  sheet: { flex: 1, gap: 12, paddingBottom: 12, paddingHorizontal: 22, paddingTop: 12 },
  sheetHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  closeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 50 },
  modalTitle: { fontSize: 21, fontWeight: '700' },
  choices: { flex: 1, flexShrink: 1 },
  list: { gap: 2, paddingBottom: 8 },
  choiceCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  choice: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 16 },
  choiceEmoji: { fontSize: 24, width: 32 },
  choiceLabel: { flex: 1 },
  groupHeading: { fontSize: 13, fontWeight: '600', paddingBottom: 4, paddingHorizontal: 16, paddingTop: 14 },
  noChoices: { padding: 16 },
  customAction: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 16, minHeight: 58, paddingHorizontal: 18 },
  customEntry: { gap: 14, paddingBottom: 8 },
  actions: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  action: { alignItems: 'center', flexDirection: 'row', gap: 18, minHeight: 64, paddingHorizontal: 20 },
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type TextInput } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ChoiceOption = { id: string; label: string; group?: string; emoji?: string | null };

export function shouldDismissChoiceSheet(gestureDistanceY: number, gestureVelocityY = 0) {
  return gestureDistanceY > 64 || (gestureDistanceY > 12 && gestureVelocityY > 0.75);
}

export function ChoicePicker({ label, value, selectedId, choices, onSelect, onCreate, onManage, onOpen, emptyChoiceLabel, searchable: searchableOverride, createLabel, manageLabel, disabled = false, compact = false }: {
  label: string;
  value: string;
  selectedId?: string;
  choices: ChoiceOption[];
  onSelect: (id: string) => void;
  onCreate?: () => void;
  onManage?: () => void;
  onOpen?: () => void;
  emptyChoiceLabel?: string;
  searchable?: boolean;
  createLabel?: string;
  manageLabel?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const searchInput = useRef<TextInput>(null);
  const filtered = choices.filter((choice) => choice.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const select = (id: string) => { searchInput.current?.blur(); Keyboard.dismiss(); onSelect(id); setOpen(false); setSearch(''); };
  const searchable = searchableOverride ?? choices.length > 6;
  const close = useCallback(() => { searchInput.current?.blur(); setOpen(false); setSearch(''); }, []);
  const dismissWithGesture = useCallback(() => { Keyboard.dismiss(); setOpen(false); setSearch(''); }, []);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_event, gesture) => { if (shouldDismissChoiceSheet(gesture.dy, gesture.vy)) dismissWithGesture(); },
  }), [dismissWithGesture]);
  const runRouteAction = (action?: () => void) => { close(); action?.(); };
  const maxSheetHeight = Math.min(760, windowHeight * 0.86, Math.max(220, windowHeight - insets.top - keyboardHeight - 12));
  const reservedHeight = 116 + (searchable ? 56 : 0) + (onCreate || onManage ? 132 : 0);
  const maxChoiceHeight = Math.max(88, maxSheetHeight - reservedHeight);
  const createActionLabel = createLabel ?? `Create ${label.toLocaleLowerCase().replace(/ \(optional\)/, '')}`;
  const manageActionLabel = manageLabel ?? `Manage ${label.toLocaleLowerCase().replace(/ \(optional\)/, '')}s`;

  return (
    <>
      <View style={[styles.field, compact && styles.compactField]}>
        {compact ? (
          <Pressable testID="choice-picker-field" accessibilityLabel={`${label}: ${value || 'Not selected'}`} accessibilityRole="button" disabled={disabled} onPress={() => { onOpen?.(); setOpen(true); }} style={[styles.select, styles.compactSelect, { backgroundColor: theme.inputBackground, borderColor: theme.border, opacity: disabled ? 0.6 : 1 }]}>
            <View style={styles.selectCopy}><ThemedText themeColor="textSecondary">{label}</ThemedText><ThemedText style={styles.selectedValue}>{value || 'Select…'}</ThemedText></View>
            <ThemedText themeColor="textSecondary">›</ThemedText>
          </Pressable>
        ) : <>
          <ThemedText style={styles.label}>{label}</ThemedText>
          <Pressable testID="choice-picker-field" accessibilityLabel={`${label}: ${value || 'Not selected'}`} accessibilityRole="button" disabled={disabled} onPress={() => { onOpen?.(); setOpen(true); }} style={[styles.select, { backgroundColor: theme.inputBackground, borderColor: theme.border, opacity: disabled ? 0.6 : 1 }]}>
            <ThemedText>{value || 'Select…'}</ThemedText><ThemedText themeColor="textSecondary">⌄</ThemedText>
          </Pressable>
        </>}
      </View>
      <Modal animationType="slide" onRequestClose={close} presentationStyle="overFullScreen" statusBarTranslucent transparent visible={open}>
        <View accessibilityViewIsModal style={styles.backdrop}>
          <Pressable accessibilityLabel={`Close ${label} choices`} accessibilityRole="button" onPress={close} style={StyleSheet.absoluteFill} />
          <KeyboardAvoidingView behavior="padding" style={styles.keyboardArea}>
            <View testID="catalog-choice-sheet" style={[styles.sheet, { backgroundColor: theme.elevatedSurface, borderColor: theme.border, maxHeight: maxSheetHeight, paddingBottom: Math.max(insets.bottom, 18) }]}>
              <View testID="catalog-sheet-drag-area" {...panResponder.panHandlers}>
                <Pressable testID="catalog-sheet-grabber" accessibilityLabel={`Dismiss ${label} choices`} accessibilityRole="button" onPress={close} hitSlop={12} style={styles.grabberTarget}>
                  <View style={[styles.grabber, { backgroundColor: theme.border }]} />
                </Pressable>
                <View style={styles.sheetHeading}>
                  <ThemedText accessibilityRole="header" style={styles.modalTitle}>{label}</ThemedText>
                  <Pressable accessibilityLabel={`Close ${label} choices`} accessibilityRole="button" onPress={close} style={styles.closeButton}><ThemedText themeColor="link">Done</ThemedText></Pressable>
                </View>
              </View>
              {searchable ? <ThemedInput ref={searchInput} accessibilityLabel={`Search ${label}`} onChangeText={setSearch} placeholder={`Search ${label.toLocaleLowerCase()}`} value={search} returnKeyType="search" /> : null}
              <ScrollView testID="catalog-choice-scroll" contentContainerStyle={styles.list} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" onScrollBeginDrag={() => { searchInput.current?.blur(); Keyboard.dismiss(); }} style={[styles.choices, { maxHeight: maxChoiceHeight }]}>
                <View style={[styles.choiceCard, { backgroundColor: theme.surface, borderColor: theme.surfaceSelected }]}>
                  {emptyChoiceLabel ? <Pressable accessibilityLabel={emptyChoiceLabel} accessibilityRole="button" accessibilityState={{ selected: !selectedId }} onPress={() => select('')} style={[styles.choice, { borderBottomColor: theme.border }]}><SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'circle.slash', android: 'block', web: 'block' }} size={24} tintColor={theme.textSecondary} /><ThemedText style={styles.choiceLabel}>{emptyChoiceLabel}</ThemedText>{!selectedId ? <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={20} tintColor={theme.link} /> : null}</Pressable> : null}
                  {filtered.map((choice, index) => (
                    <View key={choice.id}>
                      {choice.group && (index === 0 || filtered[index - 1]?.group !== choice.group) ? <ThemedText style={styles.groupHeading} themeColor="textSecondary">{choice.group}</ThemedText> : null}
                      <Pressable accessibilityLabel={choice.label} accessibilityRole="button" accessibilityState={{ selected: choice.id === selectedId }} onPress={() => select(choice.id)} style={[styles.choice, { borderBottomColor: theme.border }]}>
                        {choice.emoji ? <ThemedText style={styles.choiceEmoji}>{choice.emoji}</ThemedText> : null}
                        <ThemedText style={styles.choiceLabel}>{choice.label}</ThemedText>
                        {choice.id === selectedId ? <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={20} tintColor={theme.link} /> : null}
                      </Pressable>
                    </View>
                  ))}
                  {filtered.length === 0 ? <ThemedText themeColor="textSecondary" style={styles.noChoices}>No matching choices.</ThemedText> : null}
                </View>
              </ScrollView>
              {onCreate || onManage ? <View style={[styles.actions, { borderColor: theme.surfaceSelected, backgroundColor: theme.surfaceSelected }]}>
                {onCreate ? <Pressable accessibilityLabel={createActionLabel} accessibilityRole="button" onPress={() => runRouteAction(onCreate)} style={styles.action}><SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }} size={26} tintColor={theme.link} /><ThemedText themeColor="link">{createActionLabel}</ThemedText></Pressable> : null}
                {onManage ? <Pressable accessibilityLabel={manageActionLabel} accessibilityRole="button" onPress={() => runRouteAction(onManage)} style={[styles.action, { borderTopColor: theme.border }]}><SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} size={26} tintColor={theme.link} /><ThemedText themeColor="link">{manageActionLabel}</ThemedText></Pressable> : null}
              </View> : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  compactField: { gap: 0 },
  label: { fontWeight: '600' },
  select: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 14 },
  compactSelect: { minHeight: 76, paddingVertical: 10 },
  selectCopy: { flex: 1, gap: 2 },
  selectedValue: { fontSize: 17 },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.42)', flex: 1, justifyContent: 'flex-end' },
  keyboardArea: { flex: 1, justifyContent: 'flex-end' },
  sheet: { alignSelf: 'stretch', borderColor: 'transparent', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, flexShrink: 1, gap: 12, paddingHorizontal: 22, paddingTop: 8 },
  grabberTarget: { alignItems: 'center', alignSelf: 'center', height: 22, justifyContent: 'center', width: 64 },
  grabber: { alignSelf: 'center', borderRadius: 3, height: 5, width: 38 },
  sheetHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  closeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 50 },
  modalTitle: { fontSize: 21, fontWeight: '700' },
  choices: { flexGrow: 0, flexShrink: 1 },
  list: { gap: 2, paddingBottom: 8 },
  choiceCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  choice: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 4 },
  choiceEmoji: { fontSize: 24, width: 32 },
  choiceLabel: { flex: 1 },
  groupHeading: { fontSize: 13, fontWeight: '600', paddingTop: 12 },
  noChoices: { padding: 16 },
  actions: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginTop: 4, overflow: 'hidden' },
  action: { alignItems: 'center', flexDirection: 'row', gap: 18, minHeight: 64, paddingHorizontal: 20 },
});

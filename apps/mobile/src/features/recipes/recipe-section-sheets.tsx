import { type ComponentRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef, useSharedValue } from 'react-native-reanimated';
import { PrimaryButton, ThemedInput } from '@/components/themed-controls';
import { ThemedText } from '@/components/themed-text';
import { AppBackButton } from '@/components/app-back-button';
import { visualStyles } from '@/components/visual-roles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { dragGrabFeedback } from '@/lib/haptics';
import { newCreateRequestId } from './recipe-form-utils';
import { RecipeReorderList, type RecipeDragLock } from './recipe-ingredient-list';
import type { RecipeSectionDraft } from './recipe-sections';

export function RecipeSectionNameSheet({ section, isCurrent, onSave }: {
  section?: RecipeSectionDraft; isCurrent: () => boolean; onSave: (name: string) => boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme(); const router = useRouter(); const [name, setName] = useState(section?.name ?? '');
  const submitted = useRef(false); const [error, setError] = useState('');
  const clean = name.trim(); const valid = clean.length > 0 && clean.length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/u.test(clean);
  return <ScrollView testID="recipe-section-name-scroll" automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} style={[styles.root, { backgroundColor: theme.elevatedSurface }]} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
    <View style={styles.header}><AppBackButton accessibilityLabel="Back to sections" onPress={() => router.back()} /><ThemedText accessibilityRole="header" style={visualStyles.sheetTitle}>{section ? 'Rename section' : 'Add section'}</ThemedText><Pressable accessibilityRole="button" onPress={() => router.back()} style={visualStyles.sheetAction}><ThemedText themeColor="link">Cancel</ThemedText></Pressable></View>
    <ThemedText>Section name</ThemedText><ThemedInput accessibilityLabel="Section name" maxLength={80} value={name} onChangeText={setName} placeholder="e.g. Chicken" autoCapitalize="sentences" />
    {error ? <ThemedText accessibilityRole="alert" themeColor="error">{error}</ThemedText> : null}
    <PrimaryButton title={section ? 'Save section' : 'Add section'} disabled={!valid} onPress={() => {
      if (!valid || submitted.current || !isCurrent()) return;
      if (!onSave(clean)) { setError('Sections changed. Close this sheet and try again.'); return; }
      submitted.current = true; router.back();
    }} />
  </ScrollView>;
}

export function RecipeSectionsSheet({ nameSheetRoute, initialSections, isCurrent, onChange }: {
  nameSheetRoute: string; initialSections: RecipeSectionDraft[]; isCurrent: () => boolean;
  onChange: (sections: RecipeSectionDraft[], removedKey?: string) => boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme(); const router = useRouter(); const flow = useNativeSheetFlow();
  const [sections, setSections] = useState(initialSections); const current = useRef(sections);
  const [removing, setRemoving] = useState<RecipeSectionDraft | null>(null);
  const [dragging, setDragging] = useState(false); const [epoch, setEpoch] = useState(0);
  const [identity] = useState(newCreateRequestId); const interactionId = `${identity}:${epoch}`;
  const active = useRef(false); const focused = useRef(true);
  const lock = useSharedValue<RecipeDragLock>({ owner: identity, blocked: false });
  const latestInteraction = useRef(interactionId);
  useLayoutEffect(() => { latestInteraction.current = interactionId; lock.set({ owner: interactionId, blocked: false }); }, [interactionId, lock]);
  const scrollRef = useAnimatedRef<ComponentRef<typeof ScrollView>>();
  const blocked = () => active.current || lock.get().blocked;
  const cancel = useCallback(() => { active.current = false; lock.set({ owner: latestInteraction.current, blocked: false }); setDragging(false); setEpoch((x) => x + 1); }, [lock]);
  useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; cancel(); }; }, [cancel]));
  useEffect(() => { const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') cancel(); }); return () => subscription.remove(); }, [cancel]);
  const publish = (next: RecipeSectionDraft[], removedKey?: string) => {
    if (!isCurrent() || !onChange(next, removedKey)) return false;
    current.current = next; setSections(next); return true;
  };
  const reorder = (keys: string[]) => {
    if (keys.length !== current.current.length || new Set(keys).size !== keys.length) return;
    const byKey = new Map(current.current.map((item) => [item.key, item]));
    if (keys.some((key) => !byKey.has(key))) return;
    if (keys.every((key, index) => current.current[index].key === key)) return;
    publish(keys.map((key) => byKey.get(key)!));
  };
  const entry = (section?: RecipeSectionDraft) => {
    if (blocked() || !isCurrent() || (!section && current.current.length >= 20)) return;
    const id = flow.present(<RecipeSectionNameSheet section={section} isCurrent={isCurrent} onSave={(name) => {
      if (!isCurrent() || (section && !current.current.some((s) => s.key === section.key))) return false;
      if (!section && current.current.length >= 20) return false;
      return publish(section ? current.current.map((s) => s.key === section.key ? { ...s, name } : s) : [...current.current, { key: `section-${newCreateRequestId()}`, name }]);
    }} />, { detents: [0.42, 0.78] });
    router.push({ pathname: nameSheetRoute, params: { sheetId: id } } as never);
  };
  return <View testID="recipe-sections-root" style={[styles.root, { backgroundColor: theme.elevatedSurface }]}>
    <View style={[styles.header, styles.content]}><ThemedText accessibilityRole="header" style={visualStyles.sheetTitle}>Manage sections</ThemedText><Pressable accessibilityRole="button" disabled={dragging} onPress={() => { if (!blocked()) router.back(); }} style={visualStyles.sheetAction}><ThemedText themeColor="link">Done</ThemedText></Pressable></View>
    <Animated.ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}>
      <ThemedText themeColor="textSecondary">Hold a handle to reorder sections. Changes save with the recipe.</ThemedText>
      <RecipeReorderList key={interactionId} items={sections} label={(s) => s.name} sectionRows enabled={isCurrent()} busy={dragging} scrollRef={scrollRef} dragBlocked={lock} interactionId={interactionId}
        onStart={() => { if (latestInteraction.current !== interactionId) return; if (!focused.current || !isCurrent()) { cancel(); return; } active.current = true; setDragging(true); void dragGrabFeedback(); }}
        onFinish={(keys, complete) => { if (latestInteraction.current !== interactionId) return; const wasActive = active.current; active.current = false; lock.set({ owner: interactionId, blocked: false }); setDragging(false); if (wasActive && complete && focused.current && isCurrent()) reorder(keys); else setEpoch((x) => x + 1); }}
        onEdit={entry} onRemove={(key) => { if (!blocked() && isCurrent()) setRemoving(current.current.find((s) => s.key === key) ?? null); }}
        onMove={(key, direction) => { if (blocked() || !isCurrent()) return null; const index = current.current.findIndex((s) => s.key === key); const target = index + direction; if (index < 0 || target < 0 || target >= current.current.length) return null; const keys = current.current.map((s) => s.key); [keys[index], keys[target]] = [keys[target], keys[index]]; reorder(keys); return target + 1; }} />
    </Animated.ScrollView>
    <View style={[styles.content, { paddingBottom: insets.bottom + 16 }]}><PrimaryButton title="Add section" disabled={dragging || sections.length >= 20} onPress={() => entry()} /></View>
    <Modal transparent animationType="fade" visible={removing !== null} onRequestClose={() => setRemoving(null)}><View style={styles.overlay}><View style={[styles.confirm, { backgroundColor: theme.surface }]}>
      <ThemedText accessibilityRole="header" style={styles.confirmTitle}>Remove {removing?.name} section?</ThemedText><ThemedText>Its ingredients will be kept and moved to Other ingredients.</ThemedText>
      <Pressable accessibilityRole="button" style={[styles.confirmAction, { borderColor: theme.error, backgroundColor: theme.errorSurface }]} onPress={() => { if (removing && !blocked() && isCurrent()) publish(current.current.filter((s) => s.key !== removing.key), removing.key); setRemoving(null); }}><ThemedText themeColor="error">Remove section</ThemedText></Pressable>
      <Pressable accessibilityRole="button" style={visualStyles.sheetAction} onPress={() => setRemoving(null)}><ThemedText themeColor="link">Cancel</ThemedText></Pressable>
    </View></View></Modal>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 28, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 },
  confirm: { borderRadius: 16, gap: 16, maxWidth: 440, padding: 24, width: '100%' }, confirmTitle: { fontSize: 22, fontWeight: '700' },
  confirmAction: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, minHeight: 48 },
});

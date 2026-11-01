import { usePreventRemove } from 'expo-router';
import { useLayoutEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type Attempt = { scope: string; repeat: () => void };
type Options = { scope: string; enabled: boolean; saving: boolean; saveUnknown: boolean };

/** Removal, rather than blur, owns this guard: nested sheets and retained tabs keep drafts. */
export function useRecipeLeaveGuard({ scope, enabled, saving, saveUnknown }: Options) {
  const [releasedScope, setReleasedScope] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const pending = useRef<Attempt | null>(null);
  const live = useRef({ scope, enabled, saving, mounted: true });
  const protectedDraft = enabled && releasedScope !== scope;
  useLayoutEffect(() => {
    live.current = { scope, enabled: protectedDraft, saving, mounted: true };
    if (!protectedDraft || pending.current?.scope !== scope) pending.current = null;
    return () => { live.current.mounted = false; };
  }, [scope, protectedDraft, saving]);

  const disablePrevention = usePreventRemove(protectedDraft, ({ repeat }) => {
    if (!live.current.mounted || !live.current.enabled || live.current.scope !== scope) return;
    if (pending.current?.scope === scope) return;
    Keyboard.dismiss();
    const next = { scope, repeat };
    pending.current = next; setAttempt(next);
  });
  const keepEditing = () => {
    if (!live.current.mounted || live.current.scope !== scope || pending.current !== attempt) return;
    pending.current = null; setAttempt(null);
  };
  const allowSavedExit = () => {
    if (!live.current.mounted || live.current.scope !== scope) return false;
    pending.current = null; setAttempt(null); setReleasedScope(scope);
    // SDK 58 requires updating the condition AND disabling before a new action.
    disablePrevention();
    return true;
  };
  const discard = () => {
    if (!attempt || pending.current !== attempt || !live.current.mounted
      || live.current.scope !== attempt.scope || !live.current.enabled || live.current.saving) return;
    pending.current = null; setAttempt(null); setReleasedScope(scope);
    // Repeat the blocked Back/pop-to-root exactly once, never substitute a new destination.
    attempt.repeat();
  };
  const visible = protectedDraft && attempt?.scope === scope;
  return {
    allowSavedExit,
    confirmation: <RecipeLeaveConfirmation visible={visible} saving={saving} saveUnknown={saveUnknown} onKeep={keepEditing} onDiscard={discard} />,
  };
}

function RecipeLeaveConfirmation({ visible, saving, saveUnknown, onKeep, onDiscard }: {
  visible: boolean; saving: boolean; saveUnknown: boolean; onKeep: () => void; onDiscard: () => void;
}) {
  const theme = useTheme();
  return <Modal transparent animationType="fade" visible={visible} onRequestClose={onKeep}>
    <ScrollView contentContainerStyle={styles.overlay} keyboardShouldPersistTaps="handled" bounces={false}>
      <View accessibilityViewIsModal style={[styles.card, { backgroundColor: theme.surface }]}>
        <ThemedText accessibilityRole="header" style={styles.title}>{saving ? 'Recipe is saving' : 'Discard recipe changes?'}</ThemedText>
        <ThemedText>{saving ? 'Please wait while we finish checking the save. Your recipe will stay open.' : saveUnknown
          ? 'We could not confirm whether the recipe saved. Leaving discards this local draft; it does not undo a save that may have completed.'
          : 'Your recipe has unsaved changes. Leaving now will discard them.'}</ThemedText>
        {!saving ? <Pressable accessibilityRole="button" onPress={onDiscard} style={[styles.discard, { backgroundColor: theme.errorSurface, borderColor: theme.error }]}><ThemedText themeColor="error" style={styles.actionText}>Discard changes</ThemedText></Pressable> : null}
        <Pressable accessibilityRole="button" onPress={onKeep} style={styles.keep}><ThemedText themeColor="link">{saving ? 'Stay here' : 'Keep editing'}</ThemedText></Pressable>
      </View>
    </ScrollView>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 },
  card: { borderRadius: 16, gap: 16, maxWidth: 440, padding: 24, width: '100%' },
  title: { fontSize: 22, fontWeight: '700' },
  discard: { alignItems: 'center', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 48 },
  actionText: { fontWeight: '600' }, keep: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});

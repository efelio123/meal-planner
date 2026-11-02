import { useContext, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { PrimaryButton } from '@/components/themed-controls';
import { visualStyles } from '@/components/visual-roles';
import { ThemePalettes, themeChoices, type ThemeTokens } from '@/constants/theme';
import { useTheme, useThemeMode } from '@/hooks/use-theme';
import { AppearanceContext } from './appearance-context';

export function AppearanceChoices() {
  const appearance = useContext(AppearanceContext);
  const theme = useTheme(); const mode = useThemeMode();
  if (!appearance) return null;
  return <View style={styles.choices}>
    <ThemedText themeColor="textSecondary">Choose your colors. Each theme follows your phone’s light or dark appearance.</ThemedText>
    {themeChoices.map((choice) => {
      const selected = appearance.themeId === choice.id;
      return <Pressable key={choice.id} accessibilityRole="radio" accessibilityLabel={choice.name} accessibilityState={{ checked: selected, disabled: !appearance.hydrated }} disabled={!appearance.hydrated} onPress={() => { void appearance.chooseTheme(choice.id); }}
        style={({ pressed }) => [styles.card, { backgroundColor: theme.surface, borderColor: selected ? theme.primary : theme.border, borderWidth: selected ? 2 : 1, opacity: pressed ? 0.85 : 1 }]}>
        <View style={styles.cardHeading}><ThemedText style={styles.choiceName}>{choice.name}</ThemedText><SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: selected ? 'checkmark.circle.fill' : 'circle', android: selected ? 'radio_button_checked' : 'radio_button_unchecked', web: selected ? 'radio_button_checked' : 'radio_button_unchecked' }} size={24} tintColor={selected ? theme.primary : theme.textSecondary} /></View>
        <ThemedText themeColor="textSecondary">{choice.description}</ThemedText>
        <ThemePreview palette={ThemePalettes[choice.id][mode]} />
      </Pressable>;
    })}
    {appearance.saving ? <ThemedText accessibilityLiveRegion="polite" themeColor="textSecondary">Saving appearance…</ThemedText> : null}
    {appearance.error ? <View style={styles.feedback}><ThemedText accessibilityRole="alert" themeColor="error">{appearance.error}</ThemedText><PrimaryButton title="Retry appearance" accessibilityLabel="Retry appearance" onPress={() => { void appearance.retry(); }} /></View> : null}
  </View>;
}

/** Same shared palette roles as the app; a compact illustration, not a second app. */
function ThemePreview({ palette }: { palette: ThemeTokens }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.preview, { backgroundColor: palette.screen, borderColor: palette.border }]}>
    <View style={styles.previewHeading}><Text style={[styles.previewTitle, { color: palette.text }]}>Dinner</Text><View style={[styles.previewAction, { backgroundColor: palette.primary }]}><Text style={[styles.previewPlus, { color: palette.primaryText }]}>+</Text></View></View>
    <View style={[styles.previewRow, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={[styles.previewCheck, { borderColor: palette.textSecondary }]} /><Text style={[styles.previewLabel, { color: palette.text }]}>Tomato soup</Text><Text style={{ color: palette.textSecondary }}>›</Text></View>
  </View>;
}
export function AppearanceScreen() {
  return <Screen layout="tab-stack" contentAlignment="top"><AppearanceChoices /></Screen>;
}

export function AppearanceChooser() {
  const appearance = useContext(AppearanceContext);
  const theme = useTheme(); const insets = useSafeAreaInsets(); const router = useRouter();
  const hydrated = appearance?.hydrated; const markChooserPresented = appearance?.markChooserPresented;
  useEffect(() => { if (hydrated) void markChooserPresented?.(); }, [hydrated, markChooserPresented]);
  return <View collapsable={false} testID="appearance-chooser-root" style={[styles.sheet, { backgroundColor: theme.elevatedSurface }]}>
    <View collapsable={false} testID="appearance-chooser-header" style={styles.sheetHeader}><ThemedText accessibilityRole="header" style={visualStyles.sheetTitle}>Choose your look</ThemedText><ThemedText themeColor="textSecondary">You can change this anytime in Profile → Appearance.</ThemedText></View>
    <ScrollView testID="appearance-chooser-scroll" style={styles.scroll} contentContainerStyle={styles.sheetBody} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}><AppearanceChoices /></ScrollView>
    <View collapsable={false} testID="appearance-chooser-footer" style={[styles.sheetFooter, { borderTopColor: theme.border, paddingBottom: insets.bottom + 16 }]}><PrimaryButton title="Continue" onPress={() => router.back()} /></View>
  </View>;
}
const styles = StyleSheet.create({
  choices: { gap: 16 }, feedback: { gap: 12 },
  card: { borderRadius: 16, padding: 16, gap: 10 }, cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, choiceName: { flex: 1, fontWeight: '700', fontSize: 18, lineHeight: 26 },
  preview: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, gap: 8 }, previewHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, previewTitle: { fontWeight: '700', fontSize: 16, lineHeight: 22 }, previewAction: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, previewPlus: { fontSize: 22, lineHeight: 26 }, previewRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth }, previewCheck: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 }, previewLabel: { flex: 1, fontSize: 14, lineHeight: 20 },
  sheet: { flex: 1 }, sheetHeader: { flexShrink: 0, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 16, gap: 8 }, scroll: { flex: 1, minHeight: 0 }, sheetBody: { paddingHorizontal: 22, paddingBottom: 20 }, sheetFooter: { flexShrink: 0, paddingHorizontal: 22, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
});

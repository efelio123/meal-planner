import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useNativeSheetFlow } from './native-sheet-context';

export function NativeSheetScreen({ direct = false }: { direct?: boolean }) {
  const { sheetId } = useLocalSearchParams<{ sheetId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const theme = useTheme();
  const flow = useNativeSheetFlow();
  const requestedFallbackBack = useRef(false);
  const entry = flow.get(sheetId);

  useEffect(() => {
    if (entry) {
      requestedFallbackBack.current = false;
      return;
    }
    if (requestedFallbackBack.current) return;
    requestedFallbackBack.current = true;
    router.back();
  }, [entry, router]);

  useEffect(() => {
    if (!entry) return;
    const unsubscribe = navigation.addListener('removed', () => {
      // SDK 58 reports completed removal after unmount. Effect cleanup alone
      // may also mean Activity hid a retained screen, so it must not drop drafts.
      requestedFallbackBack.current = true;
      flow.remove(entry.id);
    });
    // Keep listening through unmount so the completed-removal event arrives.
    return () => queueMicrotask(unsubscribe);
  }, [entry, flow, navigation]);

  if (!entry) return null;

  // Recipes content owns its native root: a single ScrollView for details,
  // or distinct header/results/footer siblings for a keyboard-aware picker.
  // Keep the container for the existing shared Catalog/time-zone route.
  if (direct) return entry.content;

  return <View testID="native-sheet-content" style={[styles.content, { backgroundColor: theme.elevatedSurface }]}>
    {entry.content}
  </View>;
}

const styles = StyleSheet.create({ content: { flex: 1 } });

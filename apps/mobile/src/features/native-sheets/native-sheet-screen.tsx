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
    return navigation.addListener('beforeRemove', () => {
      // Removing the registry entry rerenders this route before the native
      // dismissal finishes. It is already leaving; do not issue a second Back.
      requestedFallbackBack.current = true;
      flow.remove(entry.id);
    });
  }, [entry, flow, navigation]);

  useEffect(() => {
    if (!entry) return;
    return () => {
      // Native gesture removal can bypass the JS navigation notification.
      // Unmount is the final cleanup point for the entry and dismiss callback.
      requestedFallbackBack.current = true;
      flow.remove(entry.id);
    };
  }, [entry, flow]);

  if (!entry) return null;

  // Stacked Recipes form sheets need the scrollable sheet content to be the
  // native route's root, as in the accepted gesture prototype. Keep the
  // container for the existing shared Catalog/time-zone route.
  if (direct) return entry.content;

  return <View testID="native-sheet-content" style={[styles.content, { backgroundColor: theme.elevatedSurface }]}>
    {entry.content}
  </View>;
}

const styles = StyleSheet.create({ content: { flex: 1 } });

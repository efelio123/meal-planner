import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useNativeSheetFlow } from './native-sheet-context';

export function NativeSheetScreen() {
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
    return navigation.addListener('beforeRemove', () => flow.remove(entry.id));
  }, [entry, flow, navigation]);

  if (!entry) return null;

  return <>
    <Stack.Screen options={{
      headerShown: false,
      presentation: Platform.OS === 'web' ? 'modal' : 'formSheet',
      sheetAllowedDetents: entry.detents,
      sheetInitialDetentIndex: entry.initialDetent,
      sheetGrabberVisible: true,
      sheetCornerRadius: 24,
      contentStyle: { backgroundColor: theme.elevatedSurface },
    }} />
    <View testID="native-sheet-content" style={[styles.content, { backgroundColor: theme.elevatedSurface }]}>
      {entry.content}
    </View>
  </>;
}

const styles = StyleSheet.create({ content: { flex: 1 } });

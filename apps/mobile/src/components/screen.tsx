import type { PropsWithChildren } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  safeAreaEdges?: Edge[];
  contentAlignment?: 'center' | 'top';
  /** Marks tab-root content whose iOS inset adjustment is owned by NativeTabs. */
  nativeTabScreen?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
}>;

const defaultSafeAreaEdges: Edge[] = ['top', 'right', 'bottom', 'left'];

export function Screen({ children, contentAlignment = 'center', safeAreaEdges = defaultSafeAreaEdges, nativeTabScreen = false, refreshing = false, onRefresh }: ScreenProps) {
  const theme = useTheme();
  const nativeIosInsets = nativeTabScreen && Platform.OS === 'ios';
  return (
    <SafeAreaView edges={nativeIosInsets ? [] : safeAreaEdges} style={[styles.safeArea, { backgroundColor: theme.screen }]}>
      <ScrollView
        contentContainerStyle={[styles.content, contentAlignment === 'top' && styles.contentTop]}
        contentInsetAdjustmentBehavior={nativeIosInsets ? 'automatic' : 'never'}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh && Platform.OS !== 'web' ? (
          <RefreshControl
            colors={[theme.primary]}
            onRefresh={() => { void onRefresh(); }}
            progressBackgroundColor={theme.surface}
            refreshing={refreshing}
            tintColor={theme.primary}
          />
        ) : undefined}
        style={{ backgroundColor: theme.screen }}
        testID="screen"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flexGrow: 1, padding: 24, gap: 16, justifyContent: 'center' },
  contentTop: { justifyContent: 'flex-start' },
});

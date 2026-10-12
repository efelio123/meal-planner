import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  accessibilityLabel: string;
  onPress: () => void;
};

/** Plain 44-point back control for headers that cannot use the native stack button. */
export function AppBackButton({ accessibilityLabel, onPress }: Props) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.button}>
    <SymbolView accessibilityElementsHidden importantForAccessibility="no" name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={24} tintColor={theme.text} />
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
});

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Optional feedback must never delay or interrupt the interaction it confirms. */
export async function dragGrabFeedback(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    // Expo uses an optional native binding; unavailable native calls are caught.
    if (Platform.OS === 'android') {
      await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Drag_Start);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    // Haptics can be unavailable or disabled; the drag still works normally.
  }
}

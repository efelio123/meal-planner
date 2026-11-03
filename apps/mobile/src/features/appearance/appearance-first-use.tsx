import { useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useNativeSheetFlow } from '@/features/native-sheets/native-sheet-context';
import { AppearanceContext } from './appearance-context';
import { AppearanceChooser } from './appearance-screen';
import { CHOOSER_VERSION } from './appearance-store';

export const themeChooserTabRoots = ['/plan', '/recipes', '/shopping', '/catalog', '/profile'];
/** Defer to an idle tab root, never replace auth routing or interrupt a draft. */
export function AppearanceFirstUse({ eligible }: { eligible: boolean }) {
  const appearance = useContext(AppearanceContext); const flow = useNativeSheetFlow();
  const router = useRouter(); const pathname = usePathname(); const claimed = useRef(false);
  const { present, hasOpenSheet } = flow;
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => { const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active')); return () => subscription?.remove(); }, []);
  useEffect(() => {
    if (!eligible || !active || !appearance?.hydrated || appearance.error || appearance.chooserSeenVersion >= CHOOSER_VERSION || claimed.current || hasOpenSheet || !themeChooserTabRoots.includes(pathname)) return;
    const timer = setTimeout(() => {
      claimed.current = true;
      const sheetId = present(<AppearanceChooser />, { detents: [1], direct: true });
      router.push({ pathname: '/native-sheet/[sheetId]', params: { sheetId } });
    }, 350);
    return () => clearTimeout(timer);
  }, [active, appearance?.chooserSeenVersion, appearance?.error, appearance?.hydrated, eligible, hasOpenSheet, pathname, present, router]);
  return null;
}

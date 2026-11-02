import { ThemedText } from '@/components/themed-text';
import { useHouseholdAccess } from './use-household-access';
export function PermissionNotice({ allowed }: { allowed: boolean }) {
  const { known } = useHouseholdAccess();
  return allowed ? null : <ThemedText accessibilityRole="alert" themeColor="textSecondary">{known ? 'You can view this content. Ask an owner to enable changes for your account. Your unsaved work is kept.' : 'Access has not loaded. Refresh or update the app before making changes. Your unsaved work is kept.'}</ThemedText>;
}

import { useLocalSearchParams } from 'expo-router';

import { OwnerInvitationScreen } from '@/features/household-invitations/owner-invitation-screen';

export default function HouseholdInvitationsRoute() {
  const { householdId } = useLocalSearchParams<{ householdId: string }>();
  return <OwnerInvitationScreen householdId={householdId} />;
}

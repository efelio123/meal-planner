export const profileNativeStackOptions = {
  headerBackButtonDisplayMode: 'minimal',
} as const;

export function profileDetailHeader(title: string) {
  return { headerShown: true, title } as const;
}

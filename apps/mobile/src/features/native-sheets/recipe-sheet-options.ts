export function recipeSheetOptions(detents: number[], backgroundColor: string, platform: string) {
  return {
    headerShown: false,
    presentation: platform === 'web' ? 'modal' as const : 'formSheet' as const,
    sheetAllowedDetents: detents,
    sheetInitialDetentIndex: 0,
    sheetGrabberVisible: true,
    sheetCornerRadius: 24,
    contentStyle: { backgroundColor },
  };
}

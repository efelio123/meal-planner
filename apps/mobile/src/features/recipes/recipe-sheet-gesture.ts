/** Native Animated clamps upward travel below the status bar while following pulls. */
export function ingredientSheetTranslateRange(maxLift: number, viewportHeight: number) {
  return {
    inputRange: [-Math.max(maxLift, 1), 0, viewportHeight],
    outputRange: [-maxLift, 0, viewportHeight],
    extrapolate: 'clamp' as const,
  };
}

/** A downward pull or quick downward flick returns to the Food list. */
export function shouldDismissIngredientSheet(distanceY: number, velocityY: number) {
  return distanceY > 64 || (distanceY > 12 && velocityY > 750);
}

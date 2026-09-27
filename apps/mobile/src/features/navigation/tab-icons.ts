/**
 * expo-symbols uses SF Symbols on iOS and Material Symbols on Android and web.
 * Keep all three names explicit so the JavaScript web tab bar never receives
 * an iOS-only symbol name.
 */
export const tabIcons = {
  plan: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  recipes: { ios: 'book.closed', android: 'menu_book', web: 'menu_book' },
  shopping: { ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' },
  pantry: { ios: 'cabinet.fill', android: 'kitchen', web: 'kitchen' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
} as const;

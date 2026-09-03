import { useSyncExternalStore } from "react";
import { useColorScheme as useReactNativeColorScheme } from "react-native";

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useColorScheme() {
  const colorScheme = useReactNativeColorScheme();

  const hasHydrated = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  return hasHydrated ? colorScheme : "light";
}
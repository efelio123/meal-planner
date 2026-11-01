process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mobile';
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8000';

// Screen can opt into an animated scroll owner. Native worklets have no runtime
// in Jest; use the installed packages' adapters and retain shared values across
// rerenders so interaction-lock tests still exercise real component state.
jest.mock('react-native-worklets/src/mock', () => ({
  ...jest.requireActual('react-native-worklets/src/mock'),
  scheduleOnRN: (callback: (...args: unknown[]) => void, ...args: unknown[]) => callback(...args),
}));
jest.mock('react-native-worklets', () => jest.requireMock('react-native-worklets/src/mock'));
// Reanimated 4.7's mock imports its native initializer, whose CSS event bridge
// has no Jest counterpart. Keep this native boundary inert in component tests.
jest.mock('react-native-reanimated/src/initializers.native', () => ({ initializeReanimatedModule: () => {} }));
// Router also imports this subpath directly; patch here so its adapter keeps
// the same persistent shared-value semantics instead of replacing our hooks.
jest.mock('react-native-reanimated/mock', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Reanimated = jest.requireActual('react-native-reanimated/mock');
  const createSharedValue = Reanimated.useSharedValue;
  Reanimated.useSharedValue = function useSharedValue(initial: unknown) {
    return React.useRef(createSharedValue(initial)).current;
  };
  return Reanimated;
});

jest.mock('react-native-reanimated', () => jest.requireMock('react-native-reanimated/mock'));

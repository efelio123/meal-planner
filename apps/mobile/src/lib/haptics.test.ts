import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { dragGrabFeedback } from './haptics';

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' }, AndroidHaptics: { Drag_Start: 'drag-start' },
  impactAsync: jest.fn(), performAndroidHapticsAsync: jest.fn(),
}));
const originalPlatform = Platform.OS;
const impact = jest.mocked(Haptics.impactAsync);
const androidImpact = jest.mocked(Haptics.performAndroidHapticsAsync);
beforeEach(() => { jest.clearAllMocks(); impact.mockResolvedValue(undefined); androidImpact.mockResolvedValue(undefined); });
afterEach(() => { Platform.OS = originalPlatform; });

it('plays one light iOS impact', async () => {
  Platform.OS = 'ios';
  await dragGrabFeedback();
  expect(impact).toHaveBeenCalledTimes(1);
  expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  expect(androidImpact).not.toHaveBeenCalled();
});
it('uses the native Android grab cue', async () => {
  Platform.OS = 'android';
  await dragGrabFeedback();
  expect(androidImpact).toHaveBeenCalledTimes(1);
  expect(androidImpact).toHaveBeenCalledWith(Haptics.AndroidHaptics.Drag_Start);
  expect(impact).not.toHaveBeenCalled();
});
it('does not vibrate on web', async () => {
  Platform.OS = 'web';
  await dragGrabFeedback();
  expect(impact).not.toHaveBeenCalled();
  expect(androidImpact).not.toHaveBeenCalled();
});
it.each(['ios', 'android'] as const)('keeps unavailable %s feedback from failing the grab', async (platform) => {
  Platform.OS = platform;
  impact.mockRejectedValue(new Error('Native module unavailable'));
  androidImpact.mockRejectedValue(new Error('Native module unavailable'));
  await expect(dragGrabFeedback()).resolves.toBeUndefined();
});

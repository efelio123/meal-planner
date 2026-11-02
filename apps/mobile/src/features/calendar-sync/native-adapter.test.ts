import { calendarAvailable, nativeCalendar } from './native-adapter';
import { Platform } from 'react-native';
const mockModule = jest.fn(); let mockGo = false;
jest.mock('expo', () => ({ isRunningInExpoGo: () => mockGo, requireOptionalNativeModule: (...args: unknown[]) => mockModule(...args) }));
const original = Platform.OS;
afterEach(() => { Platform.OS = original; mockGo = false; jest.clearAllMocks(); });
it('does not evaluate the unsupported binding in Expo Go or web', async () => {
  Platform.OS = 'ios'; mockGo = true; expect(calendarAvailable()).toBe(false); expect(mockModule).not.toHaveBeenCalled(); await expect(nativeCalendar.permission()).rejects.toThrow('installed');
  mockGo = false; Platform.OS = 'web'; expect(calendarAvailable()).toBe(false); expect(mockModule).not.toHaveBeenCalled();
});
it('requires the actual CalendarNext native binding, not just JavaScript exports', () => {
  Platform.OS = 'ios'; mockModule.mockReturnValue(null); expect(calendarAvailable()).toBe(false); mockModule.mockReturnValue({}); expect(calendarAvailable()).toBe(true); expect(mockModule).toHaveBeenCalledWith('CalendarNext');
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { calendarStore, scopeKey } from './journal-store';
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1 }));
jest.mock('expo', () => ({ uuid: { v4: () => '11111111-1111-4111-8111-111111111111' } }));
beforeEach(() => jest.clearAllMocks());
it('keeps user and household scopes separate, with device-only credentials outside AsyncStorage', async () => {
  expect(scopeKey('user-a', 'home')).not.toBe(scopeKey('user-b', 'home')); expect(scopeKey('user-a', 'home')).not.toBe(scopeKey('user-a', 'other'));
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null); const value = await calendarStore.credential(scopeKey('user-a', 'home'), true);
  expect(value?.secret.length).toBeGreaterThanOrEqual(64); expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), JSON.stringify(value), { keychainAccessible: 1 }); expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
it('fails closed on unreadable recovery data instead of treating it as a fresh calendar', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue('{broken'); await expect(calendarStore.load('scope')).rejects.toThrow();
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify({ version: 9 })); await expect(calendarStore.load('scope')).rejects.toThrow('recovery');
});
it('a persistence error blocks device registration', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null); jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('locked'));
  await expect(calendarStore.credential('scope', true)).rejects.toThrow('locked');
});

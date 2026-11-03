import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { uuid } from 'expo';
import type { CalendarJournal } from './types';

export function scopeKey(userId: string, householdId: string) { return `calendar-v1.${encodeURIComponent(userId)}.${encodeURIComponent(householdId)}`; }
const credentialKey = (scope: string) => scope.replace(/[^a-zA-Z0-9._-]/gu, '_');
export const calendarStore = {
  async load(scope: string): Promise<CalendarJournal | null> {
    const raw = await AsyncStorage.getItem(scope); if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
      || !('mappings' in value) || !value.mappings || typeof value.mappings !== 'object'
      || !('calendarId' in value) || typeof value.calendarId !== 'string'
      || !('bindingId' in value) || typeof value.bindingId !== 'string') {
      throw new Error('Calendar recovery data could not be read. Reconnect after reviewing existing exports.');
    }
    return value as CalendarJournal;
  },
  save: (scope: string, journal: CalendarJournal) => AsyncStorage.setItem(scope, JSON.stringify(journal)),
  async credential(scope: string, create = false): Promise<{ id: string; secret: string } | null> {
    const key = credentialKey(scope); const raw = await SecureStore.getItemAsync(key);
    if (raw) {
      const value = JSON.parse(raw) as { id?: string; secret?: string };
      if (typeof value.id !== 'string' || typeof value.secret !== 'string') throw new Error('The phone connection needs recovery.');
      return { id: value.id, secret: value.secret };
    }
    if (!create) return null;
    const value = { id: uuid.v4(), secret: uuid.v4() + uuid.v4() };
    await SecureStore.setItemAsync(key, JSON.stringify(value), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    return value;
  },
  clear: async (scope: string) => { await AsyncStorage.removeItem(scope); await SecureStore.deleteItemAsync(credentialKey(scope)); },
};

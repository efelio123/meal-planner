import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { NativeCalendarAdapter, NativeDestination, NativeEvent, ProjectedMeal } from './types';

type CalendarModule = typeof import('expo-calendar');
let modulePromise: Promise<CalendarModule> | undefined;
export function calendarAvailable() {
  return (Platform.OS === 'ios' || Platform.OS === 'android') && !isRunningInExpoGo()
    && Boolean(requireOptionalNativeModule('CalendarNext'));
}
function calendar() {
  if (!calendarAvailable()) throw new Error('Calendar sync needs an installed Meal Planner build. It is unavailable in Expo Go or on the web.');
  return modulePromise ??= import('expo-calendar');
}
const record = (event: import('expo-calendar').ExpoCalendarEvent): NativeEvent => ({
  id: event.id, calendarId: event.calendarId, title: event.title ?? '', notes: event.notes ?? '',
  startDate: new Date(event.startDate).toISOString(), endDate: new Date(event.endDate).toISOString(),
  timeZone: event.timeZone, allDay: event.allDay, hasAlarms: Boolean(event.alarms?.length),
});
function destination(item: import('expo-calendar').ExpoCalendar): NativeDestination {
  return { id: item.id, title: item.title, source: item.source?.name ?? 'Calendar',
    local: Platform.OS === 'android' ? Boolean(item.source?.isLocalAccount) : item.source?.type === 'local' };
}
async function eventDetails(calendarId: string, meal: ProjectedMeal, notes: string) {
  const C = await calendar(); const target = await C.ExpoCalendar.get(calendarId);
  if (!target.allowsModifications) throw new Error('This calendar is no longer writable. Choose another calendar.');
  return { title: meal.title, startDate: new Date(meal.start_date), endDate: new Date(meal.end_date),
    timeZone: meal.time_zone, notes, allDay: false, alarms: [],
    ...(target.allowedAvailabilities?.includes(C.Availability.FREE) ? { availability: C.Availability.FREE } : {}) };
}
export const nativeCalendar: NativeCalendarAdapter = {
  available: calendarAvailable,
  async permission(request = false) {
    const C = await calendar();
    const access = request ? await C.requestCalendarPermissions(false) : await C.getCalendarPermissions(false);
    if (!access.granted) throw new Error('Full calendar access is needed to update and remove synced meals. Allow Calendar access in your phone settings, then retry.');
  },
  async destinations() { const C = await calendar(); return (await C.getCalendars(C.EntityTypes.EVENT)).filter((c) => c.allowsModifications).map(destination); },
  async createDestination(title, sourceCalendarId, color) {
    const C = await calendar();
    if (Platform.OS === 'android') {
      // Apps cannot create provider-synced accounts. Explicitly disclose local-only creation.
      return destination(await C.createCalendar({ title, name: 'meal-planner', color,
        entityType: C.EntityTypes.EVENT, accessLevel: C.CalendarAccessLevel.OWNER,
        ownerAccount: 'Meal Planner', source: { name: 'Meal Planner', type: 'LOCAL', isLocalAccount: true } }));
    }
    if (!sourceCalendarId) throw new Error('Select a calendar account to create the new calendar in.');
    const source = await C.ExpoCalendar.get(sourceCalendarId);
    return destination(await C.createCalendar({ title, entityType: C.EntityTypes.EVENT,
      sourceId: source.source.id, color: color ?? source.color }));
  },
  async list(id, start, end) { const C = await calendar(); return (await (await C.ExpoCalendar.get(id)).listEvents(new Date(start), new Date(end))).map(record); },
  async get(id) {
    const C = await calendar();
    try { return record(await C.ExpoCalendarEvent.get(id)); }
    catch (error) {
      // Permission/network/provider failures are never mistaken for an absent event.
      if ((error as { code?: string }).code === 'ERR_EVENT_NOT_FOUND') return null;
      throw error;
    }
  },
  async create(id, meal, notes) { const C = await calendar(); return record(await (await C.ExpoCalendar.get(id)).createEvent(await eventDetails(id, meal, notes))); },
  async update(id, meal, notes) { const C = await calendar(); const event = await C.ExpoCalendarEvent.get(id); await event.update(await eventDetails(event.calendarId, meal, notes)); },
  async remove(id) { const C = await calendar(); await (await C.ExpoCalendarEvent.get(id)).delete(); },
};

import { ownershipMarker, reconcileCalendar } from './reconcile';
import type { CalendarJournal, CalendarSnapshot, NativeCalendarAdapter, NativeEvent, ProjectedMeal } from './types';
const binding = '11111111-1111-4111-8111-111111111111';
const source = '22222222-2222-4222-8222-222222222222';
const meal: ProjectedMeal = { id: source, planned_for: '2026-11-02', title: 'Dinner · Tacos', start_date: '2026-11-03T01:00:00Z', end_date: '2026-11-03T02:00:00Z', time_zone: 'America/Phoenix', notes: 'Home\nEdit this meal in Meal Planner.' };
function fixture() {
  let events: NativeEvent[] = []; let writes = 0;
  const native: NativeCalendarAdapter = { available: () => true, permission: jest.fn(async () => {}), destinations: async () => [], createDestination: jest.fn(),
    list: jest.fn(async () => [...events]), get: jest.fn(async (id) => events.find((e) => e.id === id) ?? null),
    create: jest.fn(async (calendarId, m, notes) => { writes++; const result = { id: `native-${writes}`, calendarId, title: m.title, notes, startDate: m.start_date, endDate: m.end_date }; events.push(result); return result; }),
    update: jest.fn(async (id, m, notes) => { events = events.map((e) => e.id === id ? { ...e, title: m.title, notes, startDate: m.start_date, endDate: m.end_date } : e); }),
    remove: jest.fn(async (id) => { events = events.filter((e) => e.id !== id); }) };
  const journal: CalendarJournal = { version: 1, bindingId: binding, calendarId: 'calendar', calendarTitle: 'Home', mappings: {}, recoveryConfirmed: false };
  const snapshot: CalendarSnapshot = { binding_id: binding, revision: 1, run_id: 'run', complete: true, previous_exports: [], range_start: '2026-10-26', range_end: '2027-01-31', scan_start: '2026-10-26', scan_end: '2027-01-31', time_zone: 'America/Phoenix', events: [meal] };
  const save = jest.fn(async () => {}); const authorize = jest.fn(async () => {});
  const run = (cleanup = false) => reconcileCalendar({ snapshot, journal, adapter: native, save, authorize, cleanup });
  return { native, journal, snapshot, run, save, authorize, events: () => events, setEvents: (items: NativeEvent[]) => { events = items; } };
}
it('journals before create, retries without duplicates, and restores manual edits and renamed recipes', async () => {
  const f = fixture(); await f.run(); expect(f.save.mock.invocationCallOrder[0]).toBeLessThan((f.native.create as jest.Mock).mock.invocationCallOrder[0]);
  await f.run(); expect(f.native.create).toHaveBeenCalledTimes(1); expect(f.native.update).not.toHaveBeenCalled();
  f.snapshot.events = [{ ...meal, title: 'Dinner · Renamed' }]; await f.run(); expect(f.events()[0].title).toBe('Dinner · Renamed');
  f.setEvents(f.events().map((e) => ({ ...e, title: 'Calendar-side change' }))); await f.run(); expect(f.events()[0].title).toBe('Dinner · Renamed');
});
it('recovers an uncertain successful create by ownership marker after a crash', async () => {
  const f = fixture(); const create = f.native.create;
  f.native.create = jest.fn(async (...args) => { await create(...args); throw new Error('lost response'); });
  await expect(f.run()).rejects.toThrow('lost response'); expect(f.journal.pendingCreate).toBe(source);
  await f.run(); expect(f.native.create).toHaveBeenCalledTimes(1); expect(f.journal.pendingCreate).toBeUndefined();
});
it('pauses an uncertain create with no visible marker rather than creating twice', async () => {
  const f = fixture(); f.native.create = jest.fn(async () => { throw new Error('unknown'); });
  await expect(f.run()).rejects.toThrow('unknown'); await expect(f.run()).rejects.toThrow('uncertain'); expect(f.native.create).toHaveBeenCalledTimes(1);
});
it('releases a create intent if authorization fails before the OS call', async () => {
  const f = fixture(); f.authorize.mockRejectedValueOnce(new Error('account changed'));
  await expect(f.run()).rejects.toThrow('account changed'); expect(f.journal.pendingCreate).toBeUndefined(); expect(f.native.create).not.toHaveBeenCalled();
  await f.run(); expect(f.native.create).toHaveBeenCalledTimes(1);
});
it('does not change an event whose ownership marker or destination changed', async () => {
  const f = fixture(); await f.run(); f.setEvents(f.events().map((e) => ({ ...e, notes: '' })));
  await expect(f.run()).rejects.toThrow('ownership'); expect(f.native.update).not.toHaveBeenCalled(); expect(f.native.remove).not.toHaveBeenCalled();
});
it('cleanup deletes only matching ownership markers and never unrelated events or calendars', async () => {
  const f = fixture(); await f.run(); f.setEvents([...f.events(), { id: 'unrelated', calendarId: 'calendar', title: meal.title, notes: '', startDate: meal.start_date, endDate: meal.end_date }]);
  await f.run(true); expect(f.native.remove).toHaveBeenCalledWith('native-1'); expect(f.events().map((e) => e.id)).toEqual(['unrelated']);
});
it('moves out of coverage and deletions remove tracked exports; aging out preserves history', async () => {
  const f = fixture(); await f.run(); f.snapshot.range_start = '2026-11-05'; f.snapshot.events = [{ ...meal }]; await f.run(); expect(f.native.remove).not.toHaveBeenCalled();
  f.snapshot.events = [{ ...meal, planned_for: '2028-01-01' }]; await f.run(); expect(f.native.remove).toHaveBeenCalledTimes(1);
  f.snapshot.range_start = '2026-10-26'; f.snapshot.events = [meal]; await f.run(); f.snapshot.events = []; await f.run(); expect(f.events()).toHaveLength(0);
});
it('recovers owned events after reinstall without using titles, and rejects duplicate markers', async () => {
  const f = fixture(); f.setEvents([{ id: 'recovered', calendarId: 'calendar', title: meal.title, notes: meal.notes + '\n' + ownershipMarker(binding, source), startDate: meal.start_date, endDate: meal.end_date }]);
  f.journal.recoveryConfirmed = true; await f.run(); expect(f.native.create).not.toHaveBeenCalled(); expect(f.journal.mappings[source].eventId).toBe('recovered');
  f.setEvents([...f.events(), { ...f.events()[0], id: 'duplicate' }]); await expect(f.run()).rejects.toThrow('Duplicate'); expect(f.native.remove).not.toHaveBeenCalled();
});
it('incomplete snapshots, failed reads and lost permission never imply an empty calendar', async () => {
  const f = fixture(); await f.run(); f.snapshot.complete = false as true; await expect(f.run()).rejects.toThrow('complete'); expect(f.native.remove).not.toHaveBeenCalled();
  f.snapshot.complete = true; (f.native.list as jest.Mock).mockRejectedValueOnce(new Error('offline')); await expect(f.run()).rejects.toThrow('offline');
  (f.native.permission as jest.Mock).mockRejectedValueOnce(new Error('denied')); await expect(f.run()).rejects.toThrow('denied'); expect(f.native.remove).not.toHaveBeenCalled();
});

it('does not recreate a previous phone’s export before provider delivery', async () => {
  const f = fixture(); f.snapshot.previous_exports = [source]; f.journal.recoveryConfirmed = true;
  await expect(f.run()).rejects.toThrow('previous phone'); expect(f.native.create).not.toHaveBeenCalled();
});

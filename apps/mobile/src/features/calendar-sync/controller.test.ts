import { CalendarController } from './controller';
import type { api } from '@/lib/api';
import type { calendarStore } from './journal-store';
import type { CalendarJournal, CalendarSnapshot, CalendarStatus, NativeCalendarAdapter } from './types';
jest.mock('expo', () => ({ uuid: { v4: () => '33333333-3333-4333-8333-333333333333' } }));
jest.mock('./native-adapter', () => ({ nativeCalendar: {} }));
jest.mock('./journal-store', () => ({ calendarStore: {}, scopeKey: (u: string, h: string) => `${u}:${h}` }));
function fixture() {
  const state: CalendarStatus = { manager_membership_id: 'manager', manager_name: 'Owner', is_manager: true, enabled: true, revision: 2, binding_id: '11111111-1111-4111-8111-111111111111', writer_linked: true, recovery_required: false, writer_label: 'Phone', writer_id: 'device', run_pending: false, last_success_at: null, time_zone: 'America/Phoenix', breakfast_time: '08:00', lunch_time: '12:00', dinner_time: '18:00', duration_minutes: 60 };
  let journal: CalendarJournal = { version: 1, bindingId: state.binding_id, calendarId: 'calendar', calendarTitle: 'Home', mappings: {}, recoveryConfirmed: false };
  const store = { load: jest.fn(async () => journal), save: jest.fn(async (_: string, value: CalendarJournal) => { journal = structuredClone(value); }), credential: jest.fn(async () => ({ id: 'device', secret: 'secret' })), clear: jest.fn() };
  const snapshot: CalendarSnapshot = { binding_id: state.binding_id, revision: 2, run_id: '33333333-3333-4333-8333-333333333333', range_start: '2026-10-26', range_end: '2027-01-31', scan_start: '2026-10-26', scan_end: '2027-01-31', complete: true, previous_exports: [], time_zone: 'America/Phoenix', events: [] };
  const client = { calendarStatus: jest.fn(async () => ({ ...state })), calendarRun: jest.fn(async () => snapshot), calendarAuthorize: jest.fn(async () => ({ authorized: true })), calendarFinish: jest.fn(async () => ({ finished: true })) };
  const adapter: NativeCalendarAdapter = { available: () => true, permission: jest.fn(async () => {}), destinations: jest.fn(async () => []), createDestination: jest.fn(), list: jest.fn(async () => []), get: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() };
  let active = true;
  const controller = new CalendarController('user', 'home', async () => 'token', () => active, adapter, store as unknown as typeof calendarStore, client as unknown as typeof api);
  return { state, store, client, adapter, controller, journal: () => journal, deactivate: () => { active = false; } };
}
it('does not prompt or read calendars for members or a different linked phone', async () => {
  const f = fixture(); f.state.is_manager = false; await f.controller.syncNow(); expect(f.adapter.permission).not.toHaveBeenCalled();
  f.state.is_manager = true; f.state.writer_id = 'other-device'; await f.controller.syncNow(); expect(f.adapter.permission).not.toHaveBeenCalled(); expect(f.client.calendarRun).not.toHaveBeenCalled();
});
it('serializes rapid requests and records success only after all work', async () => {
  const f = fixture(); await Promise.all([f.controller.syncNow(), f.controller.syncNow()]); expect(f.client.calendarRun).toHaveBeenCalledTimes(2); expect(f.client.calendarFinish).toHaveBeenCalledTimes(2); expect(f.journal().runId).toBeUndefined();
});
it('scope changes between snapshot and native operation prevent writes but acknowledge settled work', async () => {
  const f = fixture(); f.client.calendarRun.mockImplementationOnce(async () => { f.deactivate(); return { binding_id: f.state.binding_id, revision: 2, run_id: '33333333-3333-4333-8333-333333333333', complete: true, previous_exports: [], range_start: '2026-10-26', range_end: '2027-01-31', scan_start: '2026-10-26', scan_end: '2027-01-31', time_zone: 'America/Phoenix', events: [] }; });
  await expect(f.controller.syncNow()).rejects.toThrow('account'); expect(f.adapter.list).not.toHaveBeenCalled(); expect(f.adapter.create).not.toHaveBeenCalled(); expect(f.client.calendarFinish).toHaveBeenCalledWith(expect.anything(), 'home', expect.objectContaining({ success: false }));
});
it('lost begin response retains its run ID to resume instead of requesting another run', async () => {
  const f = fixture(); f.client.calendarRun.mockRejectedValueOnce(new Error('network')); await expect(f.controller.syncNow()).rejects.toThrow('network');
  expect(f.journal().runId).toBe('33333333-3333-4333-8333-333333333333'); expect(f.client.calendarFinish).not.toHaveBeenCalled(); await f.controller.syncNow(); expect(f.journal().runId).toBeUndefined();
});
it('never reports last success on a failed native read and preserves retryable state', async () => {
  const f = fixture(); (f.adapter.list as jest.Mock).mockRejectedValueOnce(new Error('provider unavailable'));
  await expect(f.controller.syncNow()).rejects.toThrow('provider'); expect(f.client.calendarFinish).toHaveBeenCalledWith(expect.anything(), 'home', expect.objectContaining({ success: false })); await f.controller.syncNow();
});

it('serializes controller replacement until the previous native operation has settled', async () => {
  const first = fixture(); const second = fixture(); let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  (first.adapter.list as jest.Mock).mockImplementationOnce(async () => { await pending; return []; });
  const one = first.controller.syncNow();
  while (!(first.adapter.list as jest.Mock).mock.calls.length) await Promise.resolve();
  const two = second.controller.syncNow(); await Promise.resolve(); expect(second.client.calendarRun).not.toHaveBeenCalled();
  release(); await Promise.all([one, two]); expect(second.client.calendarRun).toHaveBeenCalledTimes(1);
});

import { uuid } from 'expo';
import { api, type GetToken } from '@/lib/api';
import { calendarStore, scopeKey } from './journal-store';
import { nativeCalendar } from './native-adapter';
import { reconcileCalendar } from './reconcile';
import type { CalendarJournal, CalendarSettings, CalendarStatus, NativeCalendarAdapter, NativeDestination } from './types';

// Also serialize across provider remounts/session transitions in this process.
// A new controller cannot resume a persisted run while an old OS promise lives.
const scopeTails = new Map<string, Promise<unknown>>();
type State = { status: CalendarStatus | null; journal: CalendarJournal | null; linkedHere: boolean; busy: boolean; error: string | null };
export class CalendarController {
  private state: State = { status: null, journal: null, linkedHere: false, busy: false, error: null };
  private listeners = new Set<() => void>();
  private queued = false;
  private stopped = false;
  private scope: string;
  constructor(private userId: string, private home: string, private getToken: GetToken,
    private active: () => boolean, readonly adapter: NativeCalendarAdapter = nativeCalendar,
    private store = calendarStore, private client = api) { this.scope = scopeKey(userId, home); }
  get identity() { return this.scope; }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(value: Partial<State>) { this.state = { ...this.state, ...value }; this.listeners.forEach((fn) => fn()); }
  private check(allowInactive = false) { if (this.stopped || (!allowInactive && !this.active())) throw new Error('Calendar sync paused because the active account or household changed.'); }
  start() { this.stopped = false; }
  stop() { this.stopped = true; }
  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const promise = (scopeTails.get(this.scope) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      this.check(); this.publish({ busy: true, error: null });
      try { return await action(); }
      catch (error) { this.publish({ error: error instanceof Error ? error.message : 'Calendar sync failed. Retry when connected.' }); throw error; }
      finally { this.publish({ busy: false }); }
    });
    const settled = promise.catch(() => undefined); scopeTails.set(this.scope, settled);
    void settled.then(() => { if (scopeTails.get(this.scope) === settled) scopeTails.delete(this.scope); });
    return promise;
  }
  private async read() {
    this.check(); const status = await this.client.calendarStatus(this.getToken, this.home); this.check();
    const journal = await this.store.load(this.scope);
    const credential = this.adapter.available() ? await this.store.credential(this.scope) : null;
    this.check();
    this.publish({ status, journal, linkedHere: Boolean(credential && journal && journal.bindingId === status.binding_id && credential.id === status.writer_id) });
    return status;
  }
  refresh = () => this.exclusive(() => this.read());
  requestSync = () => {
    if (this.queued || this.stopped || !this.active()) return;
    this.queued = true;
    void this.exclusive(async () => { this.queued = false; await this.sync(); }).catch(() => undefined);
  };
  syncNow = () => this.exclusive(() => this.sync());
  private async sync(cleanup = false) {
    const status = await this.read();
    const journal = this.state.journal;
    const credential = this.adapter.available() ? await this.store.credential(this.scope) : null;
    // Only the linked manager phone ever checks calendar permissions or reads events.
    if (!status.is_manager && credential && journal?.runId) {
      await this.client.calendarFinish(this.getToken, this.home, { writer_secret: credential.secret, run_id: journal.runId, success: false });
      delete journal.runId; await this.store.save(this.scope, journal); return;
    }
    if (!status.is_manager || !this.state.linkedHere || !credential || !journal) return;
    cleanup = cleanup || Boolean(journal.cleanup);
    if (!status.enabled && !cleanup && !journal.runId) return;
    if (journal.bindingId !== status.binding_id) throw new Error('The calendar binding changed. Review and reconnect this phone.');
    if (journal.runId && !status.enabled && !cleanup) {
      // No native promise is outstanding after process restart. Acknowledge the
      // previous run, retaining its journal for an explicit recovery/cleanup.
      await this.client.calendarFinish(this.getToken, this.home, { writer_secret: credential.secret, run_id: journal.runId, success: false });
      delete journal.runId; await this.store.save(this.scope, journal); return;
    }
    await this.adapter.permission(); this.check();
    journal.runId ??= uuid.v4(); journal.cleanup = cleanup || journal.cleanup;
    await this.store.save(this.scope, journal);
    const input = { writer_secret: credential.secret, expected_revision: status.revision,
      run_id: journal.runId, cleanup: Boolean(journal.cleanup), known_ids: Object.keys(journal.mappings) };
    let started = false; let success = false;
    try {
      const snapshot = await this.client.calendarRun(this.getToken, this.home, input); started = true; this.check();
      if (snapshot.revision !== status.revision || snapshot.run_id !== journal.runId) throw new Error('Calendar snapshot authority changed. Retry.');
      await reconcileCalendar({ snapshot, journal, adapter: this.adapter, cleanup: Boolean(journal.cleanup),
        save: () => this.store.save(this.scope, journal!),
        authorize: async (operation, sourceId) => {
          this.check(); await this.adapter.permission(); this.check();
          const startedAt = Date.now();
          await this.client.calendarAuthorize(this.getToken, this.home, {
            writer_secret: input.writer_secret, expected_revision: input.expected_revision,
            run_id: input.run_id, cleanup: input.cleanup, operation, source_id: sourceId,
          });
          this.check(); if (Date.now() - startedAt >= 25000) throw new Error('Calendar authorization took too long. Retry when the connection is stable.');
        } });
      success = true;
    } finally {
      // Uncertain create remains fenced on the server until marker recovery.
      // On a rejected begin, also retain runId: the response may have been lost.
      if (started && !journal.pendingCreate) {
        await this.client.calendarFinish(this.getToken, this.home, { writer_secret: credential.secret, run_id: input.run_id, success, cleanup_complete: success && Boolean(journal.cleanup), removed_source_ids: journal.cleanedIds ?? [] });
        delete journal.runId; delete journal.cleanedIds; if (success) delete journal.cleanup; await this.store.save(this.scope, journal);
      }
      this.publish({ journal: { ...journal } });
    }
    if (success) await this.read();
  }
  async destinations() {
    this.check(); const status = await this.refresh(); if (!status.is_manager) throw new Error('Only the calendar manager can connect a calendar.');
    await this.adapter.permission(true); this.check(true); return this.adapter.destinations();
  }
  connect = (settings: CalendarSettings, destination: NativeDestination | { create: true; title: string; sourceId?: string; color?: string }, takeoverConfirmed: boolean, recoveryConfirmed: boolean, newDestinationConfirmed = false) => this.exclusive(async () => {
    let status = await this.read(); if (!status.is_manager) throw new Error('Only the calendar manager can connect a calendar.');
    const previous = this.state.journal;
    if (previous && (this.state.linkedHere || 'create' in destination || destination.id !== previous.calendarId)) throw new Error('Reconnect to the previous calendar first, then disconnect to choose how to keep or remove its meal events before changing destination.');
    await this.adapter.permission(); this.check();
    const credential = await this.store.credential(this.scope, true); if (!credential) throw new Error('Could not securely register this phone.');
    status = await this.client.calendarRegister(this.getToken, this.home, { expected_revision: status.revision,
      writer_secret: credential.secret, writer_id: credential.id, writer_label: 'Meal Planner phone', takeover_confirmed: takeoverConfirmed, new_destination_confirmed: newDestinationConfirmed });
    this.check();
    const chosen = 'create' in destination ? await this.adapter.createDestination(destination.title, destination.sourceId, destination.color) : destination;
    this.check();
    const journal: CalendarJournal = { version: 1, bindingId: status.binding_id, calendarId: chosen.id,
      calendarTitle: chosen.title, mappings: previous?.bindingId === status.binding_id ? previous.mappings : {}, recoveryConfirmed };
    // Old exports cannot be discovered by title; reconnect explicitly adopts only
    // matching binding markers in the chosen destination, and retains history.
    await this.store.save(this.scope, journal);
    await this.client.calendarConfigure(this.getToken, this.home, { ...settings, enabled: true,
      expected_revision: status.revision, writer_secret: credential.secret });
    await this.sync();
  });
  saveSettings = (settings: CalendarSettings) => this.exclusive(async () => {
    const status = await this.read(); const credential = await this.store.credential(this.scope);
    if (!this.state.linkedHere || !credential) throw new Error('Use the linked phone to change calendar settings.');
    await this.client.calendarConfigure(this.getToken, this.home, { ...settings, enabled: true,
      expected_revision: status.revision, writer_secret: credential.secret });
    await this.sync();
  });
  disconnect = (remove: boolean) => this.exclusive(async () => {
    let status = await this.read(); const credential = await this.store.credential(this.scope);
    if (!this.state.linkedHere || !credential || !status.is_manager) throw new Error('Use the linked manager phone to disconnect.');
    if (remove) {
      if (this.state.journal?.runId) await this.sync();
      status = await this.read();
      await this.client.calendarConfigure(this.getToken, this.home, { breakfast_time: status.breakfast_time,
        lunch_time: status.lunch_time, dinner_time: status.dinner_time, duration_minutes: status.duration_minutes,
        enabled: false, expected_revision: status.revision, writer_secret: credential.secret });
      if (this.state.journal) { this.state.journal.cleanup = true; await this.store.save(this.scope, this.state.journal); }
      await this.sync(true);
    }
    status = await this.read(); this.check();
    await this.client.calendarDisconnect(this.getToken, this.home, { writer_secret: credential.secret, expected_revision: status.revision });
    await this.store.clear(this.scope); await this.read();
  });
  transfer = (membershipId: string) => this.exclusive(async () => {
    const status = await this.read(); await this.client.calendarTransfer(this.getToken, this.home, membershipId, status.revision); await this.read();
  });
}

import type { CalendarJournal, CalendarSnapshot, NativeCalendarAdapter, NativeEvent, ProjectedMeal } from './types';

export function ownershipMarker(binding: string, source: string) { return `[meal-planner:v1:${binding}:${source}]`; }
export function sourceFromMarker(notes: string, binding: string): string | null {
  const match = notes.match(/\[meal-planner:v1:([0-9a-f-]{36}):([0-9a-f-]{36})\]/u);
  return match?.[1] === binding ? match[2] : null;
}
export const fingerprint = (meal: ProjectedMeal) => JSON.stringify([meal.title, new Date(meal.start_date).toISOString(), new Date(meal.end_date).toISOString(), meal.notes, meal.time_zone]);
function checkSnapshot(snapshot: CalendarSnapshot, journal: CalendarJournal) {
  if (!Number.isFinite(Date.parse(snapshot.scan_start)) || !Number.isFinite(Date.parse(snapshot.scan_end)) || snapshot.complete !== true || snapshot.binding_id !== journal.bindingId || !Array.isArray(snapshot.events) || !Array.isArray(snapshot.previous_exports)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(snapshot.range_start) || snapshot.range_end < snapshot.range_start
    || snapshot.events.some((e) => !e.id || !e.title || !Number.isFinite(Date.parse(e.start_date)) || !Number.isFinite(Date.parse(e.end_date)))
    || new Set(snapshot.events.map((e) => e.id)).size !== snapshot.events.length) {
    throw new Error('Calendar sync paused because the complete plan could not be verified. Retry after refreshing.');
  }
}

/** Every write has fresh server authority; persistence precedes any uncertain create. */
export async function reconcileCalendar({ snapshot, journal, adapter, save, authorize, cleanup = false }: {
  snapshot: CalendarSnapshot; journal: CalendarJournal; adapter: NativeCalendarAdapter;
  save: () => Promise<void>; authorize: (operation: 'create' | 'update' | 'delete', sourceId: string) => Promise<void>; cleanup?: boolean;
}) {
  checkSnapshot(snapshot, journal);
  await adapter.permission();
  const known = Object.values(journal.mappings);
  const starts = [snapshot.scan_start + 'T00:00:00Z', ...known.map((m) => m.start)];
  const ends = [snapshot.scan_end + 'T23:59:59Z', ...known.map((m) => m.end)];
  const start = new Date(Math.min(...starts.map(Date.parse)) - 86400000).toISOString();
  const end = new Date(Math.max(...ends.map(Date.parse)) + 86400000).toISOString();
  // Only matching markers in the selected destination can be recovered/adopted.
  const found = new Map<string, NativeEvent[]>();
  for (const event of await adapter.list(journal.calendarId, start, end)) {
    const source = sourceFromMarker(event.notes, journal.bindingId);
    if (source) found.set(source, [...(found.get(source) ?? []), event]);
  }
  for (const [source, mapping] of Object.entries(journal.mappings)) {
    if (!mapping.eventId) continue;
    const event = await adapter.get(mapping.eventId);
    if (event && (event.calendarId !== journal.calendarId || sourceFromMarker(event.notes, journal.bindingId) !== source)) {
      throw new Error('A synced event changed calendar or lost its ownership note. Restore it or review it before reconnecting; no unrelated event was changed.');
    }
    if (event && !found.get(source)?.some((e) => e.id === event.id)) found.set(source, [...(found.get(source) ?? []), event]);
  }
  if (!journal.recoveryConfirmed && Object.keys(journal.mappings).length === 0 && found.size > 0) {
    throw new Error('Existing meal exports need explicit recovery confirmation. Disconnect keeping events, then reconnect and confirm recovery.');
  }
  // Multiple valid markers are still ambiguous. Avoid choosing/deleting arbitrarily.
  if ([...found.values()].some((events) => events.length > 1)) throw new Error('Duplicate meal exports were found. Review the duplicate events before retrying.');
  if (cleanup && snapshot.previous_exports.some((id) => !found.has(id) && !journal.mappings[id]?.eventId && !journal.cleanedIds?.includes(id))) {
    throw new Error('Some previous exports are not visible on this phone yet. Refresh the calendar and retry cleanup on the original linked phone.');
  }
  const projected = new Map(snapshot.events.map((e) => [e.id, e]));
  const sources = new Set([...projected.keys(), ...Object.keys(journal.mappings), ...found.keys()]);
  for (const source of sources) {
    const meal = projected.get(source); const mapping = journal.mappings[source];
    const existing = found.get(source)?.[0];
    const inRange = meal && meal.planned_for >= snapshot.range_start && meal.planned_for <= snapshot.range_end;
    // Preserve history merely aging out, even after reconnect. A move to a future
    // date outside coverage or a deletion inside coverage removes the old export.
    const historical = meal ? meal.planned_for < snapshot.range_start && (!mapping || meal.planned_for === mapping.plannedFor)
      : !mapping && existing ? existing.startDate.slice(0, 10) < snapshot.range_start : false;
    if (!cleanup && !inRange && historical) continue;
    const notes = meal ? `${meal.notes}\n${ownershipMarker(journal.bindingId, source)}` : '';
    if (cleanup || !inRange) {
      if (existing) { await authorize('delete', source); await adapter.remove(existing.id); }
      journal.cleanedIds = [...new Set([...(journal.cleanedIds ?? []), source])];
      delete journal.mappings[source]; if (journal.pendingCreate === source) delete journal.pendingCreate;
      await save(); continue;
    }
    if (!meal) continue;
    journal.mappings[source] = { eventId: existing?.id, plannedFor: meal.planned_for,
      start: meal.start_date, end: meal.end_date, fingerprint: fingerprint(meal) };
    if (existing) {
      // Inspect actual fields too: a calendar-side manual edit must be restored.
      if (existing.title !== meal.title || existing.notes !== notes || existing.allDay || existing.hasAlarms
        || (existing.timeZone && existing.timeZone !== meal.time_zone)
        || Date.parse(existing.startDate) !== Date.parse(meal.start_date) || Date.parse(existing.endDate) !== Date.parse(meal.end_date)
        || mapping?.fingerprint !== fingerprint(meal)) {
        await authorize('update', source); await adapter.update(existing.id, meal, notes);
      }
    } else {
      if (!mapping?.eventId && !journal.cleanedIds?.includes(source) && snapshot.previous_exports.includes(source) && journal.pendingCreate !== source) {
        throw new Error('A previous phone may already have exported this meal, but its event is not visible here yet. Refresh the calendar and retry. No duplicate was created.');
      }
      if (journal.pendingCreate === source) throw new Error('A previous event creation has an uncertain result. Wait for the calendar to refresh, then retry. No duplicate was created.');
      journal.pendingCreate = source; await save();
      try { await authorize('create', source); }
      catch (error) {
        // The OS call never started. A lost authority response may have recorded
        // its intent on the server; acknowledge that non-write when finishing.
        journal.cleanedIds = [...new Set([...(journal.cleanedIds ?? []), source])];
        delete journal.pendingCreate; await save(); throw error;
      }
      const created = await adapter.create(journal.calendarId, meal, notes);
      // A returned ID is not enough; providers must preserve the ownership note.
      if (created.calendarId !== journal.calendarId || sourceFromMarker(created.notes, journal.bindingId) !== source) {
        throw new Error('This calendar did not preserve the meal ownership note. Sync is paused to protect existing events.');
      }
      journal.mappings[source].eventId = created.id;
    }
    if (journal.pendingCreate === source) delete journal.pendingCreate;
    await save();
  }
}

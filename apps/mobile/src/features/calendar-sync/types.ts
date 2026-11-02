export type CalendarSettings = {
  breakfast_time: string; lunch_time: string; dinner_time: string; duration_minutes: number;
};
export type CalendarStatus = CalendarSettings & {
  manager_membership_id: string | null; manager_name: string | null; is_manager: boolean;
  enabled: boolean; revision: number; binding_id: string; writer_linked: boolean; recovery_required: boolean;
  writer_label: string | null; writer_id: string | null; run_pending: boolean; last_success_at: string | null; time_zone: string;
};
export type ProjectedMeal = {
  id: string; planned_for: string; title: string; start_date: string; end_date: string; time_zone: string; notes: string;
};
export type CalendarSnapshot = {
  binding_id: string; revision: number; run_id: string; range_start: string; range_end: string;
  time_zone: string; complete: true; previous_exports: string[]; scan_start: string; scan_end: string; events: ProjectedMeal[];
};
export type CalendarRunInput = {
  writer_secret: string; expected_revision: number; run_id: string; cleanup?: boolean; known_ids?: string[];
};
export type NativeEvent = {
  id: string; calendarId: string; title: string; notes: string; startDate: string; endDate: string;
  timeZone?: string | null; allDay?: boolean; hasAlarms?: boolean;
};
export type NativeDestination = { id: string; title: string; source: string; local: boolean };
export type Mapping = { eventId?: string; plannedFor: string; fingerprint?: string; start: string; end: string };
export type CalendarJournal = {
  version: 1; bindingId: string; calendarId: string; calendarTitle: string;
  mappings: Record<string, Mapping>; runId?: string; cleanup?: boolean;
  // Creation is journaled before the OS call, so uncertain success is never retried blindly.
  pendingCreate?: string; cleanedIds?: string[]; recoveryConfirmed: boolean;
};
export type NativeCalendarAdapter = {
  available: () => boolean;
  permission: (request?: boolean) => Promise<void>;
  destinations: () => Promise<NativeDestination[]>;
  createDestination: (title: string, sourceCalendarId?: string, color?: string) => Promise<NativeDestination>;
  list: (calendarId: string, start: string, end: string) => Promise<NativeEvent[]>;
  get: (id: string) => Promise<NativeEvent | null>;
  create: (calendarId: string, meal: ProjectedMeal, notes: string) => Promise<NativeEvent>;
  update: (id: string, meal: ProjectedMeal, notes: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

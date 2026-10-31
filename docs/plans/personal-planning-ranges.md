# Personal planning windows and shopping date ranges - F11

Status: proposed October 31, 2026; awaiting Felipe's approval. Planning only.
Branch: `codex/personal-planning-ranges`, from clean accepted tip `36713f8`.
This retains the accepted family-trial fixes and F07 work; it is not based on
older main and does not authorize merging, deployment or changing trial data.

## Goal

Let each person choose the seven dates visible in Plan and review groceries for
any chosen shopping period. A personal view never moves shared planned meals or
changes another household member's view. Default shopping review covers the
seven visible dates, including the leftmost and rightmost dates.

## Current behavior and affected areas

- `meal-plan-screen.tsx` renders seven fitted days and navigates by whole-week
  offsets. `use-meal-plan.ts` keys reads and stale-result protection by offset.
- API `meal_planning.get_week` calculates Monday from household-local today.
  Shopping review rejects non-Monday starts and always calculates end as start+6.
- Review route/state uses only weekStart. Snapshot tokens and persisted request
  hashes include start but not an independently chosen end. Both must identify
  the actual range without breaking legacy retry records.
- Change Plan screen/state/utils/context, Add/Edit date-return ownership, review
  screen and amount-sheet guards, typed API client, FastAPI routes/models and
  domain queries/tests. Keep route files thin; support belongs in the existing
  meal-plan feature, reusable UI only where actually shared.

## Proposed user experience

### Seven-day strip

- Slide the date strip horizontally in either direction. It follows the finger
  and settles on whole-day boundaries, showing exactly seven complete days at
  rest. The settled leftmost date becomes the planning-window start; e.g.
  Thursday October 8 through Wednesday October 14. Commit the new window only
  after settling, not on every drag pixel. Canceled/no-movement drags do nothing.
- Keep tapping a day for Breakfast/Lunch/Dinner. A drag must not accidentally
  select a day, open a meal, or activate a meal's separate swipe-delete action.
  Vertical page scrolling and pull-to-refresh retain their accepted behavior.
- Previous/Next arrows still move seven days, retaining the chosen starting
  weekday. Tapping the displayed range opens a start-date calendar as a precise,
  accessible alternative to dragging; provide labeled previous/next-day actions
  for assistive technology. Shared chevrons and button styles remain consistent.
- Retain the selected date when it remains visible. Otherwise select the nearest
  visible date; Today explicitly selects household-local today. Today shows the
  current seven-day window beginning on the remembered weekday, at or before today.
- Replace the unconditional THIS WEEK label with THIS WEEK only for that current
  window, otherwise DATE RANGE. Always show both actual endpoints, including
  years where needed across year boundaries.
- During a new-window load, never present old meals as belonging to new dates.
  Disable Add/Edit/review until that window is ready; retain navigation and Retry.
  Reset revealed delete actions on a committed window change. Preserve existing
  per-entry deletion, conflict, tombstone and late-result protections.

### Personal preference

- Start with Monday for existing users. Remember the weekday of the leftmost
  settled date, not an absolute date that becomes stale next week.
- Store only this preference per signed-in user on this device, using existing
  AsyncStorage. It applies across that user's households; household-local today
  still determines dates. It is independent of other users and is not synchronized
  across a person's devices in this slice. No database migration is proposed.
- Preserve the exact browsed window during the active Plan flow and return from
  its nested screens. On a new app session, open the current window using the
  saved weekday. Arrows change the browsed dates without changing that weekday.
- Preference reads/writes are user-scoped and ordered; late hydration must not
  overwrite an intervening drag or leak a prior user's view. Invalid/missing
  storage defaults to Monday; storage failure leaves navigation usable and
  reports that the preference could not be saved rather than claiming success.

### Review shopping needs

- Keep the existing pushed Review page under its native stack header. Add two
  compact selectors at the top: From and Through, plus the inclusive day count.
  Example: October 8 - October 14, 7 days. Default from the committed Plan window.
- Each selector opens the same reusable month-calendar component in the accepted
  draggable native sheet, with month arrows, selected date, Cancel and Done.
  No new date-picker dependency or custom sheet-drag implementation. The Plan
  start-date selector reuses this calendar; existing meal date selection retains
  its seven-day options.
- Proposed practical limit: 1-31 days inclusive, any weekday, including a single
  day and ranges crossing weeks/months/years. This is a range-size limit, not a
  calendar-month restriction. Show validation inline; do not silently truncate
  dates or move the other endpoint. Reject reversed, invalid or overlong ranges
  on the server as well as the client.
- Calendar changes stay draft until Done; Cancel/swipe-dismiss retains the current
  review and selections. Applying a valid changed range reloads needs and clears
  selected items, manual amount adjustments and expanded source rows, then uses
  the new snapshot's default selections. Explain briefly that changing dates
  recalculates the list. A same-range Done is a no-op.
- Disable Add while a range is loading, invalid, stale or submitting. Lock range
  controls during Add so a completed mutation cannot belong to another period.
  Late review loads or amount-sheet returns cannot overwrite a changed range,
  dismissed screen, household, session or user.
- A custom review range does not change Plan's dates or saved weekday. Returning
  to Plan preserves its window. Opening a fresh review defaults to that window
  again. Same-range refresh may retain existing valid amount overrides under
  current rules; cross-range changes always clear them.
- Keep recipe-only consolidation, partial amounts, source dates, existing Shopping
  matching, explicit selection, idempotent Add and badge/list reconciliation.
  Leftovers/Eating out never create grocery needs.

## API, compatibility and data decisions

- Add optional explicit `start_date` to GET meal-plan for a seven-day window.
  Preserve old `week_offset` requests and their Monday behavior. Reject explicit
  start combined with an explicitly supplied offset. Preserve response
  `week_start`/`week_end` as the actual bounds; `week_offset` remains integer for
  legacy reads and is null for explicit-start reads. Update client types and
  nested recipe-create return state to use absolute window identity.
- Extend review GET and Shopping POST with optional `week_end`, keeping existing
  `week_start` names for compatibility. Explicit endpoints enable arbitrary
  inclusive ranges; omitted end retains the existing Monday/seven-day contract.
  New clients always send both dates and always display the returned bounds.
- Use one validated date-range representation for review GET, snapshot query,
  token and Shopping POST. Include both endpoints in extended review tokens and
  request hashes, even for empty or identical-result ranges. A token from one
  range cannot authorize another; changing only the end with a reused request ID
  must fail. Retain existing request locking, authorization and ownership checks.
- Preserve the exact legacy token/hash path for requests omitting the end so old
  persisted successful requests can replay after the API update. Do not rewrite
  retry records or household data. Test a previously generated legacy hash, not
  just two calls to the newly changed implementation.
- Use date-only calendar arithmetic and household time zone; never infer today
  from the phone's UTC date or serialize a local midnight as a timestamp. Verify
  leap days, DST, month/year rollover and a phone in a different time zone.
- No schema, dependency, role, theme, calendar-sync, widget, recipe-section or
  copy-recipe changes. Owner/member policy is unchanged in this slice.

## Layout and implementation sequence after approval

1. Extend API date reads/review and legacy-compatible hashing; update typed client
   and deterministic calendar helpers. Preserve all existing planned entries.
2. Add user-scoped weekday preference and explicit-window state; update nested
   recipe-create returns and stale read/write guards to absolute window identity.
3. Build the snapping date strip with native horizontal scrolling and existing
   animation tools, then reuse the calendar sheet for exact start/range choices.
   Bound the rendered dates and fetch on settlement; avoid an unbounded calendar.
4. Connect review range state, selection reset and retry guards. Add intended
   regressions before one coordinated validation pass.

Plan remains `Screen layout="tab-root"`; review remains `tab-stack`. Short date
selection uses the existing native-sheet route/context and appropriate detents,
with one measured inset/keyboard owner. Preserve final-action reachability,
headers, Back, drafts, larger text and full-width seven-day fit at rest. Follow
`native-sheets-app-wide.md` and mobile AGENTS. No fixed tab-height padding.

## Validation and rollout

- Mobile unit/state/router tests: every starting weekday; daily settling versus
  weekly arrows; Today; exact calendar jump; preference hydration/failure and
  user switch; stale/overlapping reads; nested create/edit return; independent
  views; meal kinds, quick Add and swipe-delete behavior.
- Review tests: inclusive 1/7/14/31-day periods, invalid/32-day inputs; Cancel
  preserves and Apply resets; empty/failed/retry loads; range changes during
  pending reads and nested amount edits; repeat Add and late navigation; source
  labels, partial quantities and Shopping badge reconciliation.
- API/disposable PostgreSQL: endpoint validation and boundaries, recipe-only
  totals across multiple weeks, time zones, access isolation, stale plans and
  Shopping matches, both-endpoint tokens/hashes, old persisted replay and new
  request replay/conflict. Full disposable PostgreSQL and full mobile suites
  are appropriate for this substantial query/state/idempotency change even
  without DDL; then types, mobile/API lint, whitespace and iOS JS export.
- Device review: smooth slow/fast drag, seven complete days after settling,
  tap-versus-pan/vertical scroll, no accidental meal swipe, long date labels and
  large text, native sheet dragging/Back/Done, last actions, custom totals, and
  return through recipe creation. Felipe owns phone acceptance. Android and
  other unrun cases remain explicitly unverified; automation does not prove feel.
- No runtime changes during planning. After implementation, local API may need
  restart for phone review; keep Expo running unless necessary. Mac trial rollout
  remains separately coordinated with fresh backup and compatible installed
  phone builds. No data reset, paid service, push or merge is approved here.

## Decisions for Felipe's review

Propose device-local per-user weekday persistence, Today aligned to that weekday,
1-31 inclusive shopping days, and clearing review selections/amount adjustments
when applying a different range. These are proposals, not previously confirmed
requirements. No blocking investigation remains before review; revise this plan
before implementation if Felipe chooses different behavior.

## Official references checked during planning

Installed: Expo 58.0.19, Router 58.0.26, React Native 0.88.0, AsyncStorage 2.2.0,
gesture-handler 3.3.0 and Reanimated 4.7.1. No package changes proposed.

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- [React Native ScrollView](https://reactnative.dev/docs/scrollview): horizontal
  scrolling and snapping; verify APIs against installed 0.88 before implementation.
- [SDK 58 AsyncStorage](https://docs.expo.dev/versions/v58.0.0/sdk/async-storage/):
  installed 2.2.0 matches its recommendation and is included in Expo Go.

# Timed meal-calendar sync — F12

Status: exploration/proposed plan, November 2, 2026. No implementation approved.
Branch: `codex/calendar-sync-plan`, from accepted themes at `2f00efe`.
Preserve F09/F10/F15/F14 work. No package/config/schema/native/runtime changes.

## Goal and confirmed choices

Automatically show planned meals in the phone calendar without exporting each
meal manually. Felipe confirms timed events with configurable Breakfast/Lunch/
Dinner times, and foreground sync when the app opens or changes a meal. He wants
both destination options: create a new calendar or select an existing one.

Recommend one-way **Meal Planner → calendar**. Calendar changes do not edit the
shared meal plan. Recipe meals, Leftovers and Eating out all participate. The
original request prefers automatic sync; a one-off export is not a substitute.

## Options researched

| Approach | Benefit | Limitation / recommendation |
| --- | --- | --- |
| Native calendar integration | Works with OS-visible iPhone/Android calendars and existing private API; no provider OAuth service or new hosting. | Recommend for this slice. Reconciles while app is active; needs native permissions/builds and explicit event ownership. |
| Subscribe to a calendar feed | Calendar apps can fetch updates independently of our app. | Provider refresh timing/access varies. Our Tailscale-only API is not a generally reachable feed server for external calendar services. Requires separate feed authentication/hosting/support work. |
| Direct calendar-provider integration | A server can update a connected provider even while phones are closed. | Separate provider-specific auth, token lifecycle, jobs and failure handling; cannot treat Apple, Google and device-local calendars as one API. Defer. |
| One-time Add to calendar | Smaller permission-light flow through OS event editor. | Does not keep edits/deletions synchronized; not the chosen feature. |

Do not promise background or instant cross-phone delivery. Expo's background
scheduler is OS-controlled and can stop after user termination; no background
library or push service is proposed in this first slice.

## Proposed product experience

Profile → **Calendar sync** opens a regular native-stack page using shared
`Screen layout="tab-stack"`. Every signed-in member can manage their own export,
independently of product-write permissions. No prompt on launch; off by default.

Setup:

1. Explain one-way sync and request calendar access only after Enable is tapped.
2. Confirm the linked household; one household/destination binding per signed-in
   user on that device for this version. Switching the app's selected household
   never silently changes that binding or its calendar.
3. Choose **Create a Meal Planner calendar** (default title `Meal Planner —
   <household>`) or **Use an existing calendar**. List only OS-visible calendars
   with enough access to read and modify events; exclude subscribed/read-only
   calendars. Creation uses an available supported source, not a hard-coded
   iCloud/Google/Exchange assumption. Explain whether its source is local/cloud.
4. Start with editable presets: Breakfast 8:00 AM, Lunch 12:00 PM and Dinner
   6:00 PM, shown in the device's normal clock format. Felipe confirms preset
   times must remain individually changeable during setup and later in Calendar
   sync settings; these values are starting suggestions, not fixed meal times. These are
   personal calendar display preferences, not new shared meal schedule fields.
5. Proposed event length: one hour, with a common 15/30/60/90/120-minute selector.
   Show the household time zone explicitly. Changes apply to managed events.
6. Show a short example and **Enable sync**. No event write until setup is
   confirmed. Canceled setup creates no meal events; retain draft times if the
   destination picker is dismissed. Avoid orphaning a newly created empty calendar
   if setup is canceled; defer creation until final confirmation when possible.

Settings shows linked household/calendar, the three times, length, enabled/paused
state, last successful sync and **Sync now / Retry**. Saving a meal remains
successful if calendar export fails; report calendar failure separately.

Use accepted native selection sheets for calendar, time and length choices;
fixed header/body/footer frames and existing Back/dismiss semantics. Reuse the
installed time-selection capability if available; otherwise use shared validated
HH:MM input (accept localized AM/PM through a clear UI), not a speculative picker
dependency. All theme palettes and bottom/keyboard reachability must be preserved.

## Event shape, dates and coverage

One ordinary non-recurring timed event per stable planned-meal entry:

- `Dinner · Chicken tacos`
- `Lunch · Leftovers — Chicken tacos` (omit detail if blank)
- `Dinner · Eating out — Restaurant` (omit detail if blank)

Include household and a brief “Edit this meal in Meal Planner” note, plus a
machine-readable ownership marker. No ingredients, directions, attendees or
invitation emails. No app-created alarms; use Free availability where supported
so meal display does not automatically block other scheduling. Provider-default
alert/availability behavior must be tested rather than assumed.

Recommend a rolling managed range from household-local today minus seven days
through today plus 90 days, inclusive. It is independent of the currently viewed
week and the 31-day shopping-review limit. Historical events that age out remain
as history; do not delete them merely because time advanced. Meals moved into
or out of the managed range must not leave an incorrect old event behind.

Resolve meal date + configured clock in the **household's IANA time zone**, not
the phone's current zone. Calendar apps may display the resulting instant in the
traveler's current zone. Use existing API Python ZoneInfo support to calculate
UTC instants; no JavaScript timezone library is proposed. DST policy: repeated
clock time uses the earlier occurrence, nonexistent time shifts forward by the
transition gap. Validate by round-trip; attaching tzinfo alone does not validate
a missing wall-clock time. Event length is elapsed minutes after the resolved
start. Include leap days, midnight and DST tests.

## Shared destinations — decision still open

Calendar IDs are native-store identifiers; matching a title does not prove two
phones selected the same remote calendar. A pre-insert scan/marker by itself
cannot prevent simultaneous creation on two independent devices.

Recommended first version: **one configured syncing phone per shared calendar**.
Other people see the events through the calendar's existing sharing, and the
syncing phone must open Meal Planner to collect changes. Personal calendars may
be configured separately. Make this limitation clear during setup; do not claim
automatic global duplicate prevention. A device-local lock is not a cross-phone
lock. Ownership checks/markers still prevent duplicates on ordinary retries.

Felipe was asked whether that first-version restriction is acceptable or multiple
phones must safely write the same shared calendar. Await his answer before
implementation approval. If multiple writers are required, revise this plan to
include a server-coordinated shared destination identity and writer ownership/
lease protocol; native calendar IDs alone are insufficient. That larger design
would need schema/concurrency/transition review, not an improvised client patch.

## Reconciliation and event ownership

- Central coordinator, not one effect per screen. Serialize/coalesce work by
  user/household/destination generation. Trigger after confirmed Plan mutations,
  app foreground, relevant successful plan refresh and explicit Sync now. An
  unrelated phone's edits are collected on the next successful fresh read; no
  claim of live updates without a fetch. Recipe-name changes affect event titles.
- Persist versioned settings, calendar identity, an opaque binding identifier,
  source-entry → native-event mappings and desired fingerprints in user-scoped
  local storage. Do not reuse theme's installation-global preference scope.
- Fetch a complete authorized snapshot before deciding deletes. Network errors,
  partial/invalid results and unavailable permissions must never mean empty plan.
  Check live membership/session/binding generation before each native operation.
- Journal a create intention before native creation, then save its returned ID.
  Recover uncertain results by inspecting app-owned markers in the chosen
  calendar, rather than blindly creating again after a crash/storage failure.
- Update events by stable source entry ID; compare projected fields, not only
  meal edit_revision (recipe names and personal times may change independently).
  Only delete/update an event when stored mapping, calendar and ownership marker
  agree. Never touch unrelated events or match solely by title/date.
- Keep mappings needed to reconcile moves and history; query known IDs as well
  as the managed date window. Verify an ID still points to our event. Treat
  manually deleted/moved/modified exported events as app-managed: recreate or
  restore from Meal Planner while sync is enabled. State this one-way rule.
- If a marker is missing or ownership is ambiguous, pause that event and offer
  repair/reconnect; do not edit somebody else's record or silently duplicate it.
  Detect matching old exports on reconnect/reinstall and require an explicit
  recovery choice if ownership cannot safely be reconstructed.
- Meal saves and calendar writes are separate operations. Calendar failures do
  not roll back the meal or block the normal app; retain retryable work and
  update last-success only after the whole requested reconciliation succeeds.

## Disconnects, scope and permissions

Disable stops future sync. Offer **Keep calendar events** or **Remove synced meal
events**, with explicit destructive confirmation. Delete only verified app-owned
events, including in existing personal/shared calendars; never delete an existing
calendar. Keep retry/ownership data until partial cleanup is resolved. Switching
destination uses the same cleanup choice before attaching the replacement.

Sign-out or membership loss pauses sync and prevents further source reads/writes.
Previously exported calendar copies may remain; they cannot be reliably recalled
if OS access is revoked or the app is absent. Explain this in setup. Another user
signing into the phone cannot adopt or resume the previous user's binding.

OS calendar authorization is separate from app permissions. Read-only household
members can export content they can already view; calendar edits do not grant
Plan Add/Edit/Remove. Ask for the iOS full access needed to reconcile existing
owned events; handle write-only/denied/restricted access with an actionable state.
Android requires runtime read/write calendar permission. Do not request Reminders
access, upload unrelated calendar contents or log event titles/private details.
Permission loss pauses reconciliation; re-enable only after a successful recheck.

## API and module changes proposed

- Add one bounded, membership-scoped read-only calendar projection endpoint under
  `/v1/households/{household_id}/meal-plan/`. Accept validated slot times/common
  duration, return household-local bounds/timezone and a complete event projection
  from one consistent read. No week-by-week fetch/delete inference or public feed.
  Shared meal records remain unchanged; no DB migration for the proposed
  single-writer version. The existing seven-day Plan and shopping limits stay.
- Derive projected titles/times from existing stable entry IDs, date/slot, recipe
  name, special-entry detail and household timezone. Scope every join to the
  household; return no other person's calendar settings or data.
- New mobile support under `src/features/calendar-sync/`, thin Profile route,
  pure reconciliation planner, preference/journal store, platform adapter,
  capability check and one coordinator mounted outside retained tab screens.
  Preserve session/household races and existing editor/navigation behavior.
- Add SDK-compatible `expo-calendar` (SDK 58 docs currently recommend ~58.0.6)
  and its config plugin through the approved dependency change. Prefer the new
  class-based API; do not accidentally call deprecated root Async methods that
  the current docs say throw. No general background worker dependency needed.
- The new API is documented unsupported in Expo Go. Probe capability without
  evaluating an unsupported native binding at app startup: stock Expo Go/web
  keeps the rest of the app usable and shows an installed-build requirement.
  Rebuild native dev/Release apps to test/use sync. The legacy subpath's Expo Go
  listing differs; verify actual installed capability rather than relying on it.

## Delivery phases and native feasibility gate

1. After plan approval, validate the exact installed module/plugin source and
   native creation/select/read/update/delete, ownership-marker persistence,
   recoverable IDs and timed/DST handling on an iPhone and Samsung. Calendar-source
   creation, shared-calendar visibility and account sync differ by provider.
   Do not promise a new calendar is always local or cloud-synced. Stop/review
   the design if the adapter cannot provide the required safe identity operations.
2. Implement the bounded API projection and pure mobile planner/store/coordinator,
   then shared setup/status UI and permissions. Complete all intended edits before
   coordinated validation; keep focused commits on a dedicated implementation
   branch derived from this plan, preserving the accepted prior slices.
3. Native device acceptance and release are separate. Preserve the Mac's native
   project/signing/scene-support configuration, take a native-project recovery
   copy before regeneration, and verify embedded JS/API URL and both device
   profiles. No deployment/install/working-server restart is authorized now.

No paid service or account is proposed; retain the $0/month target and existing
private API. Do not purchase Apple membership or use paid builds. Verify that the
new native module works with existing Personal Team builds during the gate.

## Validation

- Pure tests: all three meal kinds, clock/duration validation, projected title/
  timezone/DST, rolling bounds, stable IDs, recipe renames and permissions.
- Coordinator/store: repeated sync, serialized rapid edits, move/delete/retry,
  uncertain create recovery, partial failure, stale snapshots, sign-out/account/
  household/destination changes, native permission loss and reconnect duplicates.
- API integration against verified disposable PostgreSQL: access/tenant isolation,
  complete bounded snapshots, deleted meals, renamed/archived recipes, special
  meals, timezone projection and existing Plan/Shopping contracts. No tests on
  the family Mac data. Full API suite before final major-feature release.
- Actual-router tests for Profile, setup/pickers/Back, no lost drafts, read-only
  members, all theme appearances and OS-capability fallback. Full mobile normal/
  cache-cleared tests, types/lint, Expo compatibility, native JS exports and real
  native builds; JS exports alone do not exercise Calendar APIs.
- Physical iPhone and Samsung: new/existing calendars, denied/write-only/full/
  revoked access, create/edit/move/delete from either person's meal plan, manual
  calendar changes, retry/offline/relaunch, shared-destination rule, DST/travel,
  cleanup without unrelated-event loss and no duplicate events. Record actual
  devices/calendars/providers tested; do not infer universal provider behavior.

## Open point and review

Confirmed: timed entries with individually editable default presets during setup
and later in settings, foreground automatic sync, new or existing writable
calendar. Proposed for approval: the suggested preset values/event length, household-zone timestamps,
rolling range, one-way/manual-change handling, cleanup and single-writer shared
calendar behavior. The shared-writer answer can materially change scope.
No code, dependency, migration, native build or deployment has started.

## Primary references reviewed November 2

- [Expo SDK 58 Calendar](https://docs.expo.dev/versions/v58.0.0/sdk/calendar/)
- [SDK 58 legacy API](https://docs.expo.dev/versions/v58.0.0/sdk/calendar-legacy/)
- [Expo Calendar plugin source, SDK 58](https://github.com/expo/expo/blob/sdk-58/packages/expo-calendar/plugin/src/withCalendar.ts)
- [Apple EventKit access levels](https://developer.apple.com/documentation/technotes/tn3153-adopting-api-changes-for-eventkit-in-ios-macos-and-watchos)
- [Android Calendar Provider](https://developer.android.com/identity/providers/calendar-provider)
- [SDK 58 background scheduling limits](https://docs.expo.dev/versions/v58.0.0/sdk/background-task/)
- [Python 3.13 timezone rules](https://docs.python.org/3.13/library/zoneinfo.html)
- [Google provider OAuth](https://developers.google.com/workspace/guides/configure-oauth-consent)

Source/API findings guide feasibility; proposed UX, sync semantics and rolling
coverage above are product recommendations, not guarantees supplied by the OS.

## Editable preset clarification — November 2

Felipe confirms default preset meal times with user overrides. Breakfast, Lunch
and Dinner each have their own editable time; users may accept the suggested
8:00 AM/noon/6:00 PM or replace any of them, both during setup and afterward.
Changes update that user's managed calendar events on the next successful sync;
they do not change shared meal-plan dates/slots or other people's preferences.
The specific starting values remain proposed; shared-calendar writer behavior
and overall implementation approval remain open.

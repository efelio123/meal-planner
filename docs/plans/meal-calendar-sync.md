# Timed meal-calendar sync — F12

Status: implemented locally, November 2, 2026; native-device acceptance pending.
Felipe approved direct implementation.
Implementation branch: `codex/native-calendar-sync`. Native device capability
checks remain pending; Felipe asks to prepare local work first.
Felipe confirms the simpler one-phone scope after considering API-driven sync.
Planning branch: `codex/calendar-sync-plan`, from accepted themes at `2f00efe`.
Implementation branch: `codex/native-calendar-sync`; preserve F09/F10/F15/F14.
Earlier review/clarification passages below are planning history, superseded by
the approved implementation status and the implementation notes at the end.

## Goal and confirmed choices

Automatically show planned meals in the phone calendar without exporting each
meal manually. Felipe confirms timed events with configurable Breakfast/Lunch/
Dinner times, and foreground sync when the app opens or changes a meal. He wants
both destination options: create a new calendar or select an existing one.
He confirms one calendar manager per household, ideally its creator, and setup
should recommend a shared calendar so other members can see the meals.

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
`Screen layout="tab-stack"`. Only the household’s designated calendar manager
can configure, enable, retry or disconnect sync. Other members see read-only
status and who manages it. No OS permission prompt for them. Off by default.

Setup:

1. Explain one-way sync and request calendar access only after Enable is tapped.
2. Confirm the linked household; one manager, one active syncing phone and one
   destination per household. Switching the app’s selected household never
   silently changes that binding or its calendar.
3. Choose **Create a Meal Planner calendar** (default title `Meal Planner —
   <household>`) or **Use an existing calendar**. List only OS-visible calendars
   with enough access to read and modify events; exclude subscribed/read-only
   calendars. Creation uses an available supported source, not a hard-coded
   iCloud/Google/Exchange assumption. Explain whether its source is local/cloud.
   Recommend an existing shared family calendar; other members view its meals
   through the provider’s existing sharing. Creating a calendar does not share
   it automatically. Local-only calendars cannot be promised shared access; guide
   users to a supported cloud calendar/provider sharing UI where needed.
4. Start with editable presets: Breakfast 8:00 AM, Lunch 12:00 PM and Dinner
   6:00 PM, shown in the device's normal clock format. Felipe confirms preset
   times must remain individually changeable during setup and later in Calendar
   sync settings; these values are starting suggestions, not fixed meal times. These are
   calendar-display settings controlled by the manager for this household’s
   single integration, not new shared meal schedule fields. Other members
   cannot change them or start independent exports through this feature.
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

## One household calendar manager and one syncing phone

Felipe resolves the shared-writer decision: restrict calendar control to one user,
preferably the household creator. Recommend a shared calendar for other members
to see exported meals; they do not run additional independent syncs.

Proposed lifecycle rules for the revised plan:

- Default manager to `households.created_by_user_id` when that person is an active
  Owner. If they are no longer eligible, select the earliest active Owner
  deterministically. Store the assignment explicitly; creator identity alone
  is not a permanent bypass of membership/role checks.
- The manager must remain an active Owner. Calendar management is household
  integration administration, outside the 25 product-action checkboxes.
- Owners may explicitly transfer the manager assignment to another active Owner
  through a confirmation flow. This is a household-administration action, not
  permission for multiple owners to control the integration simultaneously.
- On manager demotion/removal/leave, disable sync, revoke the writer and assign
  the fallback eligible Owner under the existing household lock. The new manager
  must reconnect/confirm a destination; never inherit another person's OS access.
  Preserve existing last-owner safeguards. No automatic calendar writes by the
  replacement manager before setup confirmation.
- Restrict the manager to one registered syncing phone per household as well:
  one user can otherwise sign in on two phones and still create duplicates.
  Register a device credential with a server-stored digest; keep its secret in
  the already-installed SecureStore. Other devices show which phone is linked
  and offer explicit reconnect/takeover, not another independent sync loop.
- Server validation checks the live manager, writer credential, enabled state
  and configuration revision before issuing synchronization work. Serialize
  registration/configuration/takeover with household administration. Pause old
  runs and reject stale credentials/revisions after a transfer or takeover.
- An in-flight OS write is not a database transaction and cannot be recalled by
  revoking a server credential. During takeover do not start a second writer
  until the prior run is quiescent/reconciled; ambiguous cases stay paused and
  require recovery. Use bounded run authority and tests rather than claiming
  cross-device exactly-once writes from a device-local lock or calendar name.

Calendar IDs are native-store identifiers and cannot serve as a shared destination
identity across phones. Retain a household integration/binding ID, ownership
markers, journal and explicit recovery when a different phone takes over. Do not
silently adopt another calendar or blindly recreate old exported events.

Only the manager’s linked phone updates the shared calendar. If another member
changes a meal, its calendar representation updates after that phone next opens/
refreshes Meal Planner. Seeing it on the other phones depends on the calendar
provider's own sharing and refresh; no instant delivery guarantee.

## Reconciliation and event ownership

- Central coordinator, not one effect per screen. Serialize/coalesce work by
  manager/household/writer/destination generation. Trigger after confirmed Plan mutations,
  app foreground, relevant successful plan refresh and explicit Sync now. An
  unrelated phone's edits are collected on the next successful fresh read; no
  claim of live updates without a fetch. Recipe-name changes affect event titles.
- Persist versioned settings, calendar identity, an opaque binding identifier,
  source-entry → native-event mappings and desired fingerprints in user-scoped
  local storage for the authorized writer. Keep integration configuration and
  manager/writer authority on the server; do not reuse theme’s global scope.
- Fetch a complete authorized snapshot before deciding deletes. Network errors,
  partial/invalid results and unavailable permissions must never mean empty plan.
  Check live membership/manager/writer authority and session/binding generation
  before each native operation; pause on failed authority refresh.
- Journal a create intention before native creation, then save its returned ID.
  Recover uncertain results by inspecting app-owned markers in the chosen
  calendar, rather than blindly creating again after a crash/storage failure.
- Update events by stable source entry ID; compare projected fields, not only
  meal edit_revision (recipe names and configured times may change independently).
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

OS calendar authorization is separate from app permissions and is requested
only on the manager’s linked phone. Members retain normal meal-plan access but
cannot enable exports, change times/destination or invoke sync controls. Calendar
edits do not grant Plan Add/Edit/Remove. Ask for full iOS access to reconcile existing
owned events; handle write-only/denied/restricted access with an actionable state.
Android requires runtime read/write calendar permission. Do not request Reminders
access, upload unrelated calendar contents or log event titles/private details.
Permission loss pauses reconciliation; re-enable only after a successful recheck.

## API and module changes proposed

- Add one bounded, membership-scoped read-only calendar projection endpoint under
  `/v1/households/{household_id}/meal-plan/`, guarded by manager and active-writer
  authority. Use confirmed server-stored times/length, return household-local
  bounds/timezone and a complete event projection from one consistent read. No
  caller-supplied timing override, week-by-week delete inference or public feed.
  Shared meal records and existing Plan/Shopping limits stay unchanged.
- Derive projected titles/times from existing stable entry IDs, date/slot, recipe
  name, special-entry detail and household timezone. Scope every join to the
  household; return no other person's calendar settings or data.
- Add an additive household calendar-integration table: household PK, assigned
  manager membership, enabled/configuration revision, slot times/event length,
  binding ID and registered-writer credential digest/authority state. Keep native
  event IDs/journal and private OS account metadata on the writer device.
- Add authenticated configuration/status, explicit manager transfer, device
  registration/takeover, run authority and disconnect endpoints. Members receive
  a safe read-only summary without credentials or private calendar account data.
  Configuration/integration mutations require the current manager; transfer
  requires an active Owner. All role, scope, revision and writer checks are
  service-level, using the existing household lock, never UI-only.
- Backfill manager assignment from active creator-Owner or deterministic fallback
  Owner; integration starts disabled with no writer. Do not change meal records
  or member product grants. Extend membership role/removal/leave lifecycle to
  invalidate authority atomically. Reject downgrades that would discard saved
  integration configuration without an explicitly reviewed recovery plan.
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
2. Implement migration, manager/writer lifecycle and API projection with the
   pure mobile planner/store/coordinator,
   then manager setup/read-only member status UI and authorization. Complete all intended edits before
   coordinated validation; keep focused commits on a dedicated implementation
   branch derived from this plan, preserving the accepted prior slices.
3. Native device acceptance and release are separate. Before any live migration,
   take a fresh restore-verified Mac database backup and review the additive
   migration; this planning change authorizes neither. Preserve the Mac's native
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
  single-manager/one-phone authority, creator/fallback backfill, transfer and
  revocation races, stale config/writer credentials, complete snapshots, deleted
  meals, renamed/archived recipes, special
  meals, timezone projection and existing Plan/Shopping contracts. No tests on
  the family Mac data. Full API suite before final major-feature release.
- Actual-router tests for Profile, setup/pickers/Back, no lost drafts, read-only
  member status with no mutation controls or OS prompt, manager setup/times,
  transfer/takeover, all theme appearances and OS-capability fallback. Full mobile normal/
  cache-cleared tests, types/lint, Expo compatibility, native JS exports and real
  native builds; JS exports alone do not exercise Calendar APIs.
- Physical iPhone and Samsung: new/existing calendars, denied/write-only/full/
  revoked access, create/edit/move/delete from either person's meal plan, manual
  calendar changes, retry/offline/relaunch, shared-destination rule, DST/travel,
  cleanup without unrelated-event loss and no duplicate events. Record actual
  devices/calendars/providers tested; do not infer universal provider behavior.

## Revised-plan review

Confirmed: editable timed presets, foreground automatic sync, new or existing
writable calendar, one calendar-control user per household (ideally the creator),
and guidance to use a shared calendar for other members.

The new manager restriction supersedes the earlier personal-export model and
adds server configuration/authority plus an additive migration. Review the
proposed active-Owner eligibility/fallback, transfer/takeover recovery, preset
values/length, timezone/window and cleanup behavior before implementation.
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
Under the subsequently confirmed one-manager model, only that manager can
change these presets for the household integration. Changes update managed
calendar events on the next successful sync; shared meal-plan dates/slots do
not change. Specific starting values and overall revised-plan approval remain open.

## Household manager clarification — November 2

Felipe confirms one user controls household calendar sync, preferably the creator,
and asks that setup suggest a shared calendar so others can see meals. This is
now reflected throughout the proposal, including server enforcement and the
one-active-phone guard for that manager. The active-Owner fallback/transfer rules
are recommendations to prevent a household being stuck if its creator leaves;
they have not yet been separately accepted. No implementation started.

## Native one-phone scope reaffirmed — November 2

Felipe asks whether any family member’s change/app-open could update the calendar
while the designated phone is closed. Research compared coordinated native
writers with a server-to-iCloud connection; the latter could run independently
of a phone but would add provider authentication/credential handling. Apple/
iCloud support must remain in the first version; a Google-only substitution was
not accepted.

After discussing the additional connection, Felipe chooses the simpler first
version: **only the designated phone syncs**, with the existing one-manager rules.
The server-driven/CalDAV/app-specific-password proposal is not selected. No such
credential is collected/stored by this slice. Use the phone’s native calendar
permission and accounts already configured in its calendar store.

Changes by any active family member remain in the shared app plan normally, but
opening a different phone does not update iCloud by itself. The calendar catches
up when the manager’s linked phone next opens/refreshes Meal Planner. One manager
controls settings and setup recommends a shared calendar for other members.
Keep the manager/writer enforcement and native feasibility work described above;
no cloud provider SDK, provider credential store or Google OAuth integration is
added. This clarification changes planning only, with no runtime/data changes.


## Implementation safety details — November 2

Approved for direct implementation on `codex/native-calendar-sync`. Felipe confirms
an iPhone will be available later; prepare local work first. Native device tests
are a release gate, not inferred from the automated checks below.

The integration keeps a monotonic set of source-meal IDs that might have been
exported, recorded with fresh authority immediately before native creation.
Reading a projection or losing Calendar permission does not mark meals exported.
These are app IDs only; native event/calendar IDs and OS account data
remain on the phone. A replacement phone must recover matching ownership markers
before it can recreate a previous export. Missing provider delivery pauses it.
Verified deletions/cleanup acknowledge source IDs back to the API. Explicitly
starting a separate destination after disconnect keeps old copies and creates
a new binding; recovery in the same destination retains the binding.

A run deadline bounds freshly issued operation authority; expiry does not unlock
an outstanding native operation. Pending runs resume with the persisted run ID.
An uncertain create remains fenced until its marker can be recovered; if ownership
cannot be established, it stays paused for manual calendar review. No automatic
force-unlock or exactly-once cross-provider guarantee is claimed. A lost device
with an unresolved run needs a separate reviewed recovery procedure; do not erase
its fence to get past an error. In-process work is serialized across controller
remounts as well as within the active screen/session.


## Local implementation validation

API/migration: `50ca88f`. Mobile: `cd34fce`. Final API suite: 251 passing on
verified disposable PostgreSQL; final cache-cleared mobile suite: 85 suites,
889 passing. Types/lint, compatibility, native permission-config introspection
and final-source iOS/Android JavaScript exports pass. The normal mobile run also
passes 889, before the final source-intention follow-up; that follow-up passes
35 focused tests and the final complete cold run.

Felipe separately approves migrating local development after a verified backup.
The dump restores successfully to a temporary verification database; eleven
content/identity/grant counts match before/after migration to `calendar_sync`.
Integrations start disabled. No working server, family Mac database, Render,
native project, or installed phone app was changed. See
`docs/qa/meal-calendar-sync.md` for the recovery limits and outstanding physical
build/provider/geometry acceptance checks. This is not a release approval.

# F12 — one-phone native calendar sync

Prepared locally November 2, 2026 on `codex/native-calendar-sync`.
This is not a live rollout or physical-device acceptance record.

## Implemented

- Profile → Calendar sync: native-stack page (`Screen layout="tab-stack"`).
  Manager setup, existing writable/new calendar, three editable meal times,
  common event length, household time zone, last success, retry, disconnect
  (Keep/Remove) and Owner manager transfer. Other members see read-only status.
- Time entry is a direct native sheet with real native root/header Views and a
  bounded scrolling body. Calendar and duration selection reuse ChoicePicker.
  No new custom modal/drag implementation or fixed navigation-height padding.
- SDK 58 `expo-calendar ~58.0.6`, class-based CalendarNext adapter. Lazy loading
  only after capability detection; Expo Go/web/older installed builds retain the
  rest of the app and explain that Calendar needs a rebuilt installed app.
- Full Calendar permission only, requested after manager Setup. No Reminders
  permission, provider password, cloud-provider SDK, paid service or background job.
- API integration migration follows `member_permissions`; new/existing homes
  default to an active creator-Owner, otherwise the earliest active Owner.
  Demotion/removal/leave/deletion invalidate authority under the household lock.
  Product-action checkboxes are unchanged.
- One authenticated writer per integration, device-only SecureStore credential,
  revision checks, persisted run authority, consistent source projection and DST
  resolution in the household zone. Existing Plan and Shopping limits are unchanged.
- Event ownership notes, local mappings and pre-create journal protect unrelated
  events. Source-only possible-export ledger prevents a replacement phone from
  blindly recreating exports before provider delivery. Native IDs/account data
  remain local; unrelated calendar contents are never uploaded.
- Automatic foreground and successful Plan/Recipe/household refresh/mutation
  triggers; work coalesces and serializes across provider remounts. Meal saves do
  not wait for calendar writes. Rolling coverage: local today −7 through +90.

## Automated validation

See the final validation entry below. PostgreSQL tests use only the explicitly
verified local `meal_planner_disposable_test`. Rebuilding this draft migration
cleared calendar test fixtures in that disposable database; no development or
Mac family content was used for tests.

The migration guard refuses downgrade when saved integration configuration
exists. No live Mac/Render migration, API restart, native-project regeneration,
phone installation, merge or push is part of this local implementation.

## Recovery behavior and limits

- A run timeout never silently grants a second writer. An outstanding native
  operation must settle/acknowledge before transfer or takeover.
- Unknown create success is recovered by a matching ownership note in the chosen
  calendar. If no matching event is visible, it remains paused; it is not retried
  blindly. Missing/changed ownership notes, moved-to-another-calendar events,
  duplicate markers and incomplete reads also pause rather than alter unrelated data.
- A replacement device recovers the same binding. After an explicit disconnect,
  choosing a separate destination creates a new binding and keeps old copies.
  That choice must be used with a different calendar to avoid intentional copies
  in the same destination. Existing exports cannot be matched by title/date alone.
- Cleanup verifies owned IDs/markers and acknowledges each completed removal.
  Retry retains partial progress. Never delete the destination calendar itself.
- Known IDs plus the integration's accumulated coverage recover older exports.
  Events manually moved beyond discoverable coverage after mappings are lost may
  need manual calendar review. Provider ID/marker behavior remains a device gate.
- A lost writer device with an unresolved run needs a separately reviewed manual
  recovery procedure. Do not clear the server fence merely to bypass that error.
- Calendar-provider default alerts, ID stability, account creation and sharing
  differ. Android app-created calendars are explicitly local-only. Prefer an
  existing shared family calendar; creating a calendar does not share it.

## Physical/native release gate — UNRUN

Felipe says an iPhone will be available later. Before calling this feature ready:

1. Preserve the Mac native project, bundle ID, Personal Team/signing and scene
   support in a recovery copy before prebuild. Build an installed app with the
   native module, embedded JS and the intended API URL; check both phone profiles.
2. iPhone: existing writable iCloud/shared calendar, new calendar source, full/
   denied/write-only/revoked access; ensure markers survive create/read/update/
   delete and IDs recover on reopen/provider refresh. Preserve unrelated events.
3. Samsung: existing Google/shared calendar, explicit local creation, runtime
   permissions, the same identity/mutation/retry/cleanup checks. Android trial
   installation and account access remain separate from this implementation.
4. All three meal kinds; rename recipe, move date/slot, remove, DST/zone travel,
   changes by the other family member, offline/error/relaunch, foreground sync,
   manager transfer/takeover, event edits/deletions and delayed provider delivery.
5. Confirm calendar setup/time/duration sheets, nested Back/dismiss, long results,
   keyboard, larger text, fixed actions and final scroll settling. Test the current
   appearance during development and light/dark before major deployment.
6. Take a fresh restore-verified family Mac backup and review the additive
   migration before any live rollout. Do not test against `meal_planner_trial`.

Native JS exports and passing Jest tests do not validate EventKit/Calendar
Provider operations, provider sharing, signing or native screen geometry.


## Local database approval and backup

After explicit approval, the local `meal_planner_dev` database was backed up to
`meal-planner-dev-before-calendar-sync-20261102124331.dump` in Windows temporary
storage, outside the repository. The dump was restored successfully into a
separate temporary verification database; eleven content/identity/grant table
counts matched. That verification database was removed afterward. The additive
migration then brought local development to `calendar_sync`, preserving those
same eleven counts. Every integration is disabled, with no registered writer.
No working server was stopped/restarted. The family Mac database, Render and
both installed phone apps were not changed.

## Validation results — November 2

- Full disposable-PostgreSQL API suite: **251 passed** on the final API changes;
  Ruff passes. The calendar migration upgrade/downgrade and backfill/guard checks
  pass against disposable schemas, including role/lifecycle and registration races.
- Full normal mobile run: **85 suites / 889 passed**, before the final
  pre-create-authority bookkeeping follow-up. The follow-up passes all **35**
  focused calendar tests, TypeScript and full mobile lint.
- Final cache-cleared mobile run on the completed implementation: **85 suites /
  889 passed**. TypeScript and full lint also pass.
- Expo dependency compatibility passes. Final-source iOS/Android JavaScript
  exports pass; these are not native builds. Config introspection verifies full Calendar access, Android read/write
  permissions and absence of Reminders permission descriptions.
- Actual Profile-stack navigation, unsupported-build/read-only state, native
  setup/time-sheet navigation, time edits and cancellation are covered in the
  router suite. Provider sharing, Calendar IDs/markers, native geometry and
  installed iPhone/Samsung operations are **unrun**.


Implementation commits: API/migration `50ca88f`; mobile `cd34fce`. Commits are
local on the feature branch; nothing was pushed, merged or deployed.

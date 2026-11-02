# F16 second slice — native widgets and shared-list sync

Status: approved for direct implementation November 2.
Implementation branch: `codex/native-widgets`. Native build/storage gate first. Preserve the separate lab and Calendar changes.
Evidence: `docs/qa/widget-feasibility.md`; stock Expo Widgets 58.0.26 handles local
props but lacks the reviewed public action/storage/Android-sizing path needed
for the complete feature. Do not patch/fork that dependency.

## Goal

Deliver the original small count and medium/large Shopping–Plan widgets with
server-confirmed checkoffs while the app is closed where the OS permits. Offline
taps remain visibly Pending until acknowledged. Each authorized household user
can use widgets independently; Calendar's one-phone rule does not apply.

## Proposed implementation

1. Use app-owned native WidgetKit/SwiftUI (iPhone) and App Widget/Glance (Android)
   targets, connected by a small local Expo module. Keep the consumer Expo SDK
   unchanged. Verify exact toolchain/library versions and Personal Team/App Group/
   secure-storage entitlement support in an isolated native build first. If those
   capabilities fail, return to review; never purchase access or weaken storage.
2. Add native support under `apps/mobile/modules/meal-planner-widgets/`, a scoped
   config plugin for repeatable native generation, and TypeScript integration
   under `src/features/widgets/`. Preserve bundle IDs, team/signing, scene support
   and native recovery copies. The lab remains a reference, not a dependency.
3. Share one versioned summary/theme contract. Reuse current Shopping state,
   permissions, badge count and personal week-start preference in the app. Native
   renderers consume data; domain rules remain in existing API services. Keep UI
   consistent across palettes, OS tint and appearances without copying app screens.
4. Add Profile → Widgets as a shared `tab-stack` page: opt-in information,
   follow-current-household binding, access/status and refresh/reconnect/disable.
   Reuse native selection sheets and the layout standard. Do not auto-add widgets.
5. Native protected shared storage coordinates snapshot publication and an outbox
   transactionally across app/extension processes. Every queued action contains
   user/household/device generation, stable operation ID, item ID, explicit checked
   state and source check-state version. An app refresh cannot erase pending taps.
6. Register a limited, revocable widget-device credential through the normal
   authenticated app. Keep only a digest in the API and its secret in native
   secure storage available to the required process. Never put a Clerk token or
   secret in visible props, timelines, UserDefaults or logs. Propose seven-day
   credential expiry, refreshed during authorized app use; expiry shows Reconnect.
7. Add narrowly scoped summary/checkoff endpoints and additive registration/
   idempotency storage. Extend Shopping check-state versioning, including re-adds,
   and reuse its mutation/permission service. Check live membership/permission and
   generation on every request; a widget never grants otherwise forbidden access.
   Keep old app clients compatible with additive fields.
8. Native user-action handlers attempt synchronization within OS execution limits.
   Persist Pending before optimistic UI. Confirm only after a server acknowledgement;
   on conflicts refresh instead of blindly toggling or undoing a later family
   change. Retry on permitted future native actions/refreshes and app opens; no
   exact background retry time, always-on worker or instant cross-phone promise.
9. Sign-out, household changes, removal and lost permissions clear/invalidate old
   snapshots and pending generations. Revoke credentials online; describe offline
   revocation/expiry limits honestly. A stale widget must never mutate the newly
   selected household. Scope checking also surrounds in-flight result handling.

## UI retained from the original plan

Small: all-household unpurchased count, unknown distinct from zero, tap to Shopping.
Medium/large: Shopping–Plan switch. Shopping shows fitting rows, count, +N more,
Open list and separate Pending state. Plan makes all seven dates and three slots
reachable; medium prioritizes readable selected-day detail, large adds an overview.
Confirm native sizing on phones instead of clipping text to simulate a full week.
Use household-local dates and personal week start. Include special meal details.

## Validation and delivery

First validate isolated native targets, shared secure storage, app-closed handlers
and a disposable authenticated write on iPhone/Samsung. No real trial data or phone
installations without coordinated review. Then complete app/API/schema/test edits
before one coordinated validation pass: projection and outbox races, duplicate/
rapid/offline/stale taps, re-adds, permission/account changes, expiry, all dates,
actual routing/deep links, native sizes/tint/text, and light/dark release review.

Use verified disposable PostgreSQL for access, tenancy, idempotency and concurrency;
run the full API suite for the major schema slice. Types/lint/mobile suites and JS
exports supplement real native builds; they do not prove native execution.
Back up and restore-verify before any approved non-disposable migration. Deployment,
paid membership, push/Live Activities, Siri, public API hosting and unrelated SDK
upgrades are outside this approval request.

## Review decisions

Felipe approved the native-target approach and scoped credential/version/outbox work on November 2. Offline Pending/later sync is already confirmed. A smaller
read-only release remains an alternative only if Felipe explicitly changes scope;
it would not complete the original interactive-widget request.

## Native gate progress

See `docs/qa/native-widget-gate.md` for the isolated native results. Both platforms
compile and seven native tests pass. The baseline app/extension signatures and
profile authorization for matching shared App Group/Keychain groups are verified
with the free Personal Team. A separate private HTTPS fixture and confirmed/pending
phone-test UI are prepared. The updated desktop-session build succeeds, and the
verified probe is installed/launched on the test iPhone with explicit authorization.
Felipe confirms small/medium/large iPhone widget taps; the fixture reports four
unique fictional acknowledgements. Offline retry, termination/lock behavior and
physical Samsung acceptance remain pending. Keep production integration behind
this gate; these findings do not complete F16.

# Home-screen widgets — F16

Status: native feasibility approved November 2, 2026; offline Pending confirmed.
Implementation branch: `codex/widget-feasibility`. Use an isolated fictional-data
lab; consumer-app configuration/dependencies and the family trial remain unchanged.
Branch: `codex/home-screen-widgets-plan`, from calendar checkpoint `c0780de`.
Calendar phone acceptance remains pending and is not replaced by this work.

## Goal and preserved request

Felipe requested a small widget showing the unpurchased Shopping count, and
medium/large widgets with Shopping and weekly Plan views. Shopping should allow
quick checkoffs from the home screen. Plan should make all seven days and their
meals accessible. Explore the Android equivalent as well as iPhone support.
This is a home-screen feature, not an app-icon badge, Live Activity or calendar
export. Each authorized user may use widgets; do not inherit Calendar's
single-manager/single-phone restriction.

## Proposed experience

- Small: “12 items”, household label where space permits, and a tap opens Shopping.
  Count is all unpurchased household entries, independent of app search/filter.
  Unknown, disconnected and empty are different states; never show unknown as zero.
- Medium/large: Shopping / Plan segmented controls, retaining each widget's view.
  Switching these local display modes must not require the app to be open.
- Shopping: readable item rows with amount/unit where space permits, checkoffs,
  unpurchased count and an Open list action. Fit the available area and show
  “+N more” rather than clip rows. No delete, recipe editing or full app navigation.
- Plan proposal for review: medium shows seven date choices and the selected day's
  Breakfast/Lunch/Dinner, defaulting to today. Large adds a compact seven-day
  overview with a readable selected-day detail. Every day/slot remains reachable;
  do not promise all long meal names fit simultaneously in an iOS widget.
  Explicitly review this density tradeoff before implementation. Opening a day
  should deep-link to that date in Plan without changing the saved week-start day.
- The current week follows the user's preferred start weekday and the household
  time zone, rather than whichever future week was last browsed in the app.
  Include recipe meals, Leftovers and Eating out with their optional details.
- Initially follow the selected household on the phone. Clear old content during
  account/household changes; do not silently send a stale widget action into the
  newly selected household. Per-widget independent household selection is later.
- Use the accepted palettes and light/dark contrast through a shared data/theme
  projection. Native widget layouts differ by platform, but labels, hierarchy and
  behavior should agree with the app. Support OS tint and larger text.
- Display last-updated/stale status. Home-screen widgets may expose family meal
  names; explain this when the user enables them. Do not automatically add widgets.

## Current official findings and technical choices

Repository: Expo ~58.0.22, React Native 0.88.1, React 19.3.0, existing
`@expo/ui ~58.0.26`; `expo-widgets` is not installed.

Expo's SDK 58 documentation currently recommends `expo-widgets ~58.0.26` and
supports iOS plus opt-in Android widgets. Prefer evaluating it before adding
another third-party widget library or maintaining two complete native UI systems.
It uses SwiftUI/Jetpack Compose components, not existing React Native screens.
The isolated widget render function cannot use app hooks/context, module imports
or asynchronous work. Provide compact serializable props through a shared
projection rather than duplicate app state or embed the full app UI.

Expo documents that an interactive button can persist returned widget props with
the app closed. Its app-side interaction listener only fires while the app process
is alive. Therefore changing a local checkbox is **not proof that a Shopping API
mutation ran**. A listener alone cannot implement the requested reliable checkoff.
Do not quietly replace server-confirmed checkoffs with local-only appearances.

App Groups are required by Expo's iOS widget communication. Apple's current
capability table marks App groups supported in all three columns, including the
free Apple Developer column (the HTML check icons are omitted by text extraction).
Do not claim a paid membership is required based on older guidance. Still verify
our actual Personal Team, extension profile, supported OS/toolchain and app-group
signing on an installed build before committing to delivery. No paid enrollment,
EAS service, provider account or notification entitlement is proposed.

Android's equivalent is an App Widget. Expo's supported controls are a subset;
Glance provides native callbacks/workers if a native action path is needed.
Neither platform promises continuous execution or instant background refresh.
App foreground refresh and successful mutations publish fresh snapshots; scheduled
refresh remains OS-controlled. Tailscale/API availability must be tested while the
main app is closed, not inferred from opening the health URL in a browser.

## First implementation slice to approve: native feasibility

Use a disposable sample and preserve the working app/native projects. After
approval, inspect the exact resolved SDK 58 package/plugin/native source, then:

1. Pin the compatible widget package in an isolated validation runtime; evaluate
   any transitive/plugin changes before touching the serving project. No Expo
   upgrade, new background package or alpha AppIntents dependency by default.
2. Verify small/medium/large rendering, persistent Shopping/Plan switching,
   configuration, safe deep links and native storage on both platforms. Confirm
   free iPhone signing with a recovery copy before native regeneration.
3. Prove a checkoff can reach a disposable authenticated API with the main app
   closed, and report success/failure correctly. Verify OS limits, not just the
   component's callback. Determine whether supported Expo extension hooks permit
   the required native action handler without patching/forking dependencies.
4. If the supported API cannot safely provide closed-app mutations, stop and
   review the choice: native WidgetKit/Glance targets with a small Expo bridge,
   or an explicitly accepted read-only first version. Do not introduce a package
   fork or label read-only widgets the completed F16 feature.
5. Record actual build/device facts. If a phone is unavailable, prepare source/
   automated checks but leave physical feasibility unverified. Never infer
   signing, native controls or background networking from Jest/JS exports.

This gate is intentionally separate from approving the complete write/sync
implementation. Revise this document with the verified adapter and obtain review
before adding its API credentials, schema or full native synchronization layer.

## Full-feature architecture direction, subject to the gate

- Add support under `apps/mobile/src/features/widgets/`, with platform-specific
  renderers/adapters and a pure summary/theme projection. Keep route files thin.
  Reuse the current Shopping state owner/badge count and personal week preference;
  do not mount additional per-screen fetch loops. A Profile setup page would use
  `Screen layout="tab-stack"`, and accepted native selection sheets where needed.
- Publish an account/household/generation-scoped, versioned snapshot atomically.
  Store only the data needed by the widget; no Clerk token or API secret in
  visible widget props, timeline payloads, UserDefaults or logs.
- Closed-app networking may require a revocable, limited device credential:
  authenticate registration through the app, retain only a digest server-side,
  protect its secret in native secure storage accessible to the required process,
  and restrict it to summary reads and `shopping.check` for one user/household.
  Never share the general Clerk bearer token or Calendar writer credential.
  Server membership, permission, device generation and revocation checks remain
  authoritative. Owners and permitted members can check; revoked users cannot.
- A checkoff sets an explicit desired state with a stable operation ID; never
  send a blind toggle. Use a check-state version (including re-add/reset) and
  idempotency so retries cannot undo another person's later change or duplicate
  writes. Reuse Shopping mutation/permission rules rather than copy business logic.
  Any required additive API/schema changes belong in the reviewed second plan.
- Felipe confirms offline Pending and later sync. Persist a native outbox before optimistic UI,
  show Pending separately from confirmed purchases, and reconcile each operation
  with the server. Do not promise a retry time while the OS/VPN prevents execution.
  On stale state/permission loss/removal, refresh and report the result; do not
  replay an old action against a newly re-added item automatically.
- Native storage must coordinate app publishing and extension actions so a fresh
  snapshot cannot overwrite unacknowledged taps. App startup drains/reconciles
  pending actions before replacing state. Clearing user/household scope and
  revoking access must invalidate stale actions, snapshots and workers.
- Do not show a failed checkoff as a confirmed change to the family list. All
  existing in-app workflows remain usable if a widget permission/build/sync fails.
- No calendar changes, unrelated dependencies, Live Activities, pushes, Siri,
  new hosting, public API exposure or live database rollout in this feature gate.

## Validation

Feasibility: resolved-source/API review, plugin/entitlement diff, real iPhone and
Samsung builds and a closed-app action against disposable data. Preserve existing
Personal Team signing, bundle IDs, scene support and native recovery copies.

Full slice after design approval: projection/count/range/theme tests; actual-router
setup/deep links; account/household transitions, denied permissions, duplicate and
rapid taps, app/extension storage races, closed/offline/relaunch/retry, stale item
versions, re-adds/deletes and live membership revocation. Any API/schema work gets
permission/tenant/concurrency tests on verified disposable PostgreSQL and the full
suite for final release. No tests on the family Mac database.

Native acceptance: all sizes, long lists/names, large text, empty/unknown/pending/
error state, all seven Plan days, supported OS tint, current appearance during
routine review and light/dark before major deployment. Other phone's updates and
VPN-off/locked/rebooted-device behavior need actual observations. No deployment,
phone installation or paid capability follows from this planning change.

## Open product decisions

- Plan density: approve seven-day selection plus readable day detail, versus
  showing all seven days with truncated meal names. A literal full app tab view
  does not fit every widget size.
- Offline checkoffs: **confirmed** — show durable Pending and sync later. A
  pending mark must remain distinguishable from a server-confirmed purchase.
- Confirm the technical gate before selecting the complete mutation architecture;
  a read-only first release would need explicit scope approval.

## Primary references reviewed November 2

- [Expo SDK 58 Widgets](https://docs.expo.dev/versions/v58.0.0/sdk/widgets/)
- [Apple capability comparison](https://developer.apple.com/help/account/reference/supported-capabilities-ios)
- [Apple interactive widgets](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)
- [Apple widget refresh budgets](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)
- [Android Glance state and updates](https://developer.android.com/develop/ui/compose/glance/glance-app-widget)
- [Android widget actions](https://developer.android.com/develop/ui/compose/glance/user-interaction)
- [Expo AppIntents, evaluated but not selected](https://docs.expo.dev/versions/v58.0.0/sdk/app-intents/)


## Feasibility findings — November 2

Felipe approved the native feasibility slice. Implemented a separate fictional-data
lab under `apps/widget-lab/` on `codex/widget-feasibility`; the consumer app and all
API/data/native working projects remain unchanged. Exact 58.0.26 source audit,
type/compatibility checks, app exports, SDK widget-runtime bundles, two runs of
nine isolated-runtime checks and Android native scaffolding generation pass.
Physical/native signing/rendering/networking remain unrun.

The reviewed public SDK path cannot supply the required app-closed authenticated
checkoff and coordinated durable outbox. Android also lacks the reviewed timeline
readback/size environment used by iOS. Stop under step 4 above, preserving the lab;
do not add production credentials, schema, SDK forks or misleading local-only
checkmarks. `docs/qa/widget-feasibility.md` records evidence and limits. Recommend
the app-owned native WidgetKit/Glance approach proposed separately in
`docs/plans/home-screen-widgets-native-sync.md`; that next slice needs review.

# F16 native widget feasibility — November 2, 2026

Branch: `codex/widget-feasibility`, from approved plan `43d16c8`.
Verdict: **the stock SDK path is insufficient for the complete requested feature**.
The isolated rendering/local-interaction prototype is prepared; native device
acceptance and actual server-confirmed closed-app checkoffs are not established.

## Scope and isolation

`apps/widget-lab/` is a separate, fictional-data Expo app with distinct identifiers.
It pins Expo 58.0.22, Expo UI 58.0.26, Expo Widgets 58.0.26 and RN 0.88.1.
The reviewed widget archive integrity is checked against its lockfile by
`scripts/audit-sdk.mjs`; the package source was inspected before implementation.
No consumer-app dependency/config/source, API, schema, database, Mac project,
running server, signing profile or installed phone app was changed.

## Reproducible source findings

Run `npm run audit:sdk` in the lab for exact package paths, source line numbers,
SHA-256 file digests and the pinned archive integrity.

| Reviewed package path | Finding | Effect |
| --- | --- | --- |
| `ios/Widgets/Buttons.swift` | The control selects the stock WidgetUserInteraction intent. | No public option to attach our authenticated native worker. |
| `ios/Widgets/AppIntent.swift` | Evaluates the callback and merges returned props into the stored timeline, then notifies/reloads. | Local display changes do not perform our API mutation. |
| `ios/WidgetsEvents.swift` | Uses process-local NotificationCenter delivery. | Not a durable cross-process operation queue. |
| `ios/Widgets/WidgetsJSRuntime.swift` | Isolated JavaScriptCore context for the widget bundle. | App hooks/auth/networking are not inherited. |
| `android/.../WidgetInteractionAction.kt` | Stores callback props, calls WidgetsEvents, reloads. | No supported API mutation added by the stock tap. |
| `android/.../WidgetsEvents.kt` | Optional in-memory observer; no observer means no callback delivery. | Closed-app taps cannot rely on the app-side listener. |
| `android/.../WidgetsModule.kt` and `WidgetObject.kt` | Widget object exposes reload/updateSnapshot, not getTimeline. | The JavaScript timeline-readback API is not available here. |
| `android/.../WidgetsUtils.kt` | Rendering environment has appearance/configuration; no widgetFamily/resize dimensions. | iOS size-family logic is not a portable Android resize solution. |
| `plugin/src/types/WidgetConfig.type.ts` | Reviewed public options contain configuration/layout parameters, not an app-defined action worker. | A full solution requires another native path; do not patch/fork silently. |

These findings agree with Expo's documented isolated synchronous runtime and
app-alive interaction listener. They establish the reviewed supported path's
limitation, not a proof that no native implementation is possible.

A counter or pending mark can persist locally without the main app running. That
is not the same as a permission-checked, idempotent Shopping write. Replacing the
snapshot overwrites unacknowledged local marks; the prototype tests this explicitly.
It does not claim to implement the approved durable offline Pending policy.

## Completed local validation

- Lab dependency installation: 461 packages; no install scripts; consumer app
  dependency files and serving node_modules unchanged.
- TypeScript: passed. Expo dependency compatibility: passed.
- Nine tests with actual SDK JS normalization/dispatch and stub native view hosts:
  passed; serialized layouts, view switching, all days, pending/confirmed separation,
  no fetch/require globals, count-only size and overwritten-local-state case.
- The same nine checks against the built SDK iOS/Android widget runtime bundles
  with actual Expo UI JavaScript: passed, no skipped checks. This remains a Node
  VM execution, not a native JavaScriptCore/Hermes or WidgetKit/Glance device test.
- iOS/Android app JavaScript exports: passed. Both SDK widget-runtime resources
  built successfully with the package's own build-bundle script.
- Isolated Android prebuild: passed; three sample providers generated. No Gradle
  compile, emulator run or APK installation performed.
- Native config introspection: expected lab App Group; no push entitlement or
  notification permission. Actual Xcode extension/profile signing is unverified.
- `git diff --check`: passed. Consumer/API suites were not rerun for a separate
  lab; their prior results do not constitute widget acceptance.

## Unrun / gate result

Actual iPhone/Samsung rendering, persistence, resize behavior, OS tint/larger
text, deep links, closed/locked/terminated-app networking, Tailscale access from
an extension, and free Personal Team signing remain unrun. No authenticated test
API mutation was attempted: the reviewed public tap path does not supply it, and
the approved plan requires review before adding the full native sync layer.

Following step 4 of `docs/plans/home-screen-widgets.md`, stop before production
integration. Recommend native WidgetKit/Glance targets and a small Expo bridge,
with a coordinated snapshot/outbox and narrowly scoped credentials, rather than
a package fork or a local-only checkmark presented as synced. The proposed second
slice is in `docs/plans/home-screen-widgets-native-sync.md` and needs approval.

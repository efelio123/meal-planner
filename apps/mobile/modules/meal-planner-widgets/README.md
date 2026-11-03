# Meal Planner native widgets

App-owned local Expo module and WidgetKit/Glance renderers. The approved design is
`docs/plans/home-screen-widgets-native-sync.md`; build instructions, exact test
results and pending device acceptance are in `docs/qa/widget-integration.md`.

`ios/Module.swift` and `ios/WidgetCore.swift` compile into the app bridge. The config
plugin copies the core and `Widgets.swift` into the separate extension (Swift
module `MealPlannerHomeWidgets`, distinct from app bridge `MealPlannerWidgets`). Never link
`Widgets.swift` into the app Pod: it owns the extension's `@main` entry point.

Android uses the main application process for its Glance receiver so WorkManager
initialization remains valid after process termination. SQLite transactions fence
publication/outbox state; do not replace them with app props or plain preferences.
Only native Keychain/Keystore storage holds the limited device secret. Normal app
authority is a transient connection argument, never stored in the widget cache.

Small counts are authoritative, not decremented optimistically. Queued checkoffs
stay Pending until acknowledgment plus snapshot reconciliation. Respect generation
and snapshot-version guards for every new native action/publication path.

The standalone Android and iOS test hosts compile real module sources with distinct
identities; they must not install over the consumer app or use family data. Native
phone rollout requires reviewed migration and signing/profile verification.

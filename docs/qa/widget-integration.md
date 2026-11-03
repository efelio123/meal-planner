# F16 widget API integration checkpoint

Branch: `codex/native-widgets`. Approved parent plan:
`docs/plans/home-screen-widgets-native-sync.md`.

The first consumer integration portion adds `widget_devices` after `calendar_sync`,
scoped seven-day digest-only device credentials, per-binding membership/role/grant
revision checks, a bounded Shopping/seven-day Plan summary, explicit checkoff
operations and durable idempotent outcomes. Registrations use app authentication;
only summary/checkoff/self-revocation accept the widget credential. Input validation
on these routes strips credential-bearing input from errors, and responses are
not cached.

The Shopping check-version trigger increments on every explicit checked-state
write, including old clients and same-state re-adds. Ordinary quantity/unit/store
edits preserve it. App and widget checkoffs share the same checked-state mutation.
Re-add of an already unchecked item is now a new intent: content stays unchanged,
while check_version/updated_at advance to invalidate old offline taps.

API source/migration/test edits are complete for this checkpoint. Validation on
the explicitly verified localhost `meal_planner_disposable_test` database:

- API lint: passed.
- Additive migration: passed; disposable head `widget_devices`.
- Full API suite: **264 passed**, none skipped (20.11 seconds).
- New coverage: scoped summary/count/week, bound rows, replay and re-add fencing,
  concurrent duplicate/competing operations, deleted/replaced items, membership/
  permission/role changes, expiry/revocation and non-echoing route validation.

The shared local development database, Mac family database/API and installed
consumer apps have NOT been migrated/deployed. Persistent migration requires its
own approved, restore-verified backup. Native module, config plugin, app settings,
summary/theme projection and the real WidgetKit/Glance renderers are still being
implemented; the validated isolated probe is not the consumer widget feature.

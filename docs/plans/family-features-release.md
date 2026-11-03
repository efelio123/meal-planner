# Family features release closeout — November 2, 2026

Felipe approves pushing a PR, running CI and merging the accumulated work to
main, updating Loryn's phone when available, then native calendar acceptance.
Branch: `codex/family-features-release`, from clean `8d52fd9` on the widget branch.
This is release closeout of already approved work, not a new feature scope.

## Included behavior

- Recipe ingredient sections, independent whole/section recipe imports and
  unsaved-draft exit protection, with accepted native sheet/layout refinements.
- Explicit per-member product permissions; new/demoted Members receive full
  content access by default, while administration stays owner-only.
- Shared color palettes, first-use Appearance selection and reusable semantic
  colors; Meal Planner is the default palette and a placeholder product name.
- App-owned iOS/Android widgets, scoped device credentials, persisted Pending
  checkoffs, versioned snapshots and iPhone shopping pagination.
- Opt-in one-phone meal calendar sync, implemented but disabled by default;
  provider identity, writes and cleanup still require native-device acceptance.
- Four additive migrations after `meal_plan_special_entries`, ending at
  `widget_devices`, plus isolated widget feasibility/reproduction sources.

## Evidence and merge gates

- Mac family deployment uses exact source `1b3a970`; later commits only record
  the results. Its backup/rehearsal/live original-data checks and signed phone
  installation are in `family-widgets-rollout.md` and `../qa/widget-phone-review.md`.
- Final full disposable-PostgreSQL API validation: 265 passed, zero skips;
  Ruff and Alembic head pass. Last iOS pagination XCTest run: 10 passed. Prior
  mobile/full native results retain their recorded source boundaries.
- On November 2, Felipe confirms app/all widget sizes look good in both light
  and dark mode. Native calendar provider operations and Samsung acceptance
  remain unreported, not implicitly accepted by those checks.
- Before PR publication, fetched main is an ancestor with zero divergence;
  the release branch has 62 existing commits not yet on main. Preserve them.
- Render settings are read directly: Auto-Deploy selected **Off**, linked main,
  no migration pre-deploy command. Cancel the edit form without saving. No
  staging deployment/configuration change is included in this release request.
- Run hosted PR Mobile/API jobs on the exact release head, resolve relevant
  failures and merge only passing checks. Verify main CI after the merge.
  Public repository/default Linux runners preserve the $0 workflow boundary.

## Phone update and calendar follow-up

The verified family-target app and widget profiles cover both phones. Loryn's
phone is connected, but Felipe says he will unlock it later. Her installation
must remain unchanged until then; preserve her app data and install in place.
No new signing setup or database rollout is needed to resume that update.

Next test calendar sync with disposable household data and a separate test
calendar; do not use existing personal events or turn on live family calendar
exports merely to obtain a passing gate. Preserve the one-manager/one-phone
rule and verify create/update/delete, repeat sync without duplicates, permission
failure and owned-event cleanup. Actual provider review requires an available
phone/user; automated tests do not establish EventKit behavior.

## Recovery and reporting

Preserve Mac backup archives, old API image/native artifacts and the private
active-release pointer. No destructive database reset/restore, force push,
unrelated branch/worktree deletion or paid resource is authorized. Report
hosted PR/main checks, merge SHA and deferred phone/calendar steps explicitly.

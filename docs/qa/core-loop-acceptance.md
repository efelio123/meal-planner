# Consumer v1 core-loop device acceptance

Status: not run. Use only test accounts, a QA household, and disposable
Catalog/recipe/Shopping entries. Staging code and migration parity must be
verified before this checklist is run against staging. Do not clear a real
household's list.

Staging preflight, October 13, 2026: Felipe confirmed a quiet test window.
Neon Free recovery snapshot `pre-core-loop-migration-2026-10-13` was captured
before exactly two disposable legacy Shopping rows were removed. The staging
database is at `household_shopping_catalog_items (head)` with both households
preserved and zero Shopping rows. Render Free [deployment
`dep-db77bdcs728c73fcppc0`](https://dashboard.render.com/web/srv-daup95gjo6nc73e2d1p0/deploys/dep-db77bdcs728c73fcppc0)
is Live at `main` commit `228e1651ad0074c014222043892b07932b0a703a`;
Auto-Deploy remains Off. Direct health returned `ok` and OpenAPI exposes the
four core feature routes. This is deployment validation only, not an
authenticated cross-feature or physical-device pass. For the phone smoke,
the local Expo API URL was temporarily set to staging, then restored to
`http://192.168.1.71:8000`. The hosted Expo SDK patch check is a known CI
failure accepted only for this staging rollout.

Single-phone smoke, October 13: after Felipe restarted the local Expo server
from his own terminal, the app loaded with the ignored local Expo API URL set
to staging. He could open all main pages and reported that a full flow,
including meal planning and adding to Shopping, worked. This is a user-reported
single-device smoke; exact per-step results, device OS version, two-member
refresh, and Android behavior remain unrecorded, so the acceptance rows below
remain Not run. He found that the bottom of New Recipe was obscured by the tab
bar and snapped back when scrolled. A targeted bottom-inset fix is implemented
on the acceptance branch, but its physical-phone retest is pending. An earlier
Expo server started in the restricted agent environment returned a 500 for its
iOS manifest; that attempt does not count as an app or staging API result.
After the smoke test, the ignored local Expo API URL was restored to
`http://192.168.1.71:8000`; the running Expo app needs a reload to pick it up.

Record the date, both devices and OS versions, app build or Expo Go reload,
API target, household IDs or non-sensitive labels, and tester. Mark each
scenario Pass, Fail, or Not run. Attach a screenshot and exact steps for a
failure. Never put invitation codes, tokens, or personal data in this file.

| Scenario | Result | Notes |
| --- | --- | --- |
| Device A and Android device B sign in as distinct test members of the same QA household. | Not run | |
| A creates or finds a Food Catalog item, saves a recipe with that ingredient, and B refreshes to see the same recipe. | Not run | |
| A schedules the recipe on multiple days plus a second recipe using the same Catalog item; B refreshes to see the same week. | Not run | |
| Both devices show all seven days, one recipe per selected meal slot, and the week-wide review combines that Catalog item with correct amounts and meal sources. | Not run | |
| A selects needs, changes one amount to buy below the recipe total, and adds to Shopping. B refreshes and sees one canonical item with the chosen amount. | Not run | |
| Repeating review does not silently duplicate the item; existing-list handling and explicit confirmation behave as designed. | Not run | |
| B rapidly checks and unchecks multiple rows; A refreshes to see the final state. Edit amount/store, then remove one QA item by short-swipe trash and far swipe. | Not run | |
| Shopping search, quick add, keyboard-safe Create action, filtering, sorting, and the remaining cases in `shopping-manual-regression.md` pass on both platforms. | Not run | |
| With a QA item, disconnect/reconnect once: a failed mutation reports the error and rolls back; retry succeeds without duplicate writes. | Not run | |
| Switch to a second QA household. Prior household recipes, plans, Shopping items, searches, and sheet drafts do not appear or accept stale responses. | Not run | |
| On both platforms, open and drag one Recipes, Plan, Shopping, and Catalog native sheet; check header, keyboard-open controls, stacked Back, dismiss, and tab-bar clearance. | Not run | |
| An installable native build launches, restores sign-in, navigates all five tabs, opens a native sheet, and completes a small QA loop on each available platform. | Not run | |

Acceptance is limited to scenarios explicitly marked Pass. A prior iPhone
screen review or automated test is not a substitute for the two-device and
Android results here.

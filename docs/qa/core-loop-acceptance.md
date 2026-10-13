# Consumer v1 core-loop device acceptance

Status: not run. Use only test accounts, a QA household, and disposable
Catalog/recipe/Shopping entries. Staging code and migration parity must be
verified before this checklist is run against staging. Do not clear a real
household's list.

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

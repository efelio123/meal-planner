# App color theme review — F14

November 2, 2026. Implementation: `codex/app-themes`.
Phone acceptance is pending; automated results do not prove native appearance.

## Offered palettes

Each theme follows the device appearance; there is no separate forced-mode picker.

| Choice | Light screen / primary | Dark screen / primary |
| --- | --- | --- |
| Meal Planner (default; placeholder name) | `#E2C4A6` / `#2A3244` | `#1c202a` / `#E2C4A6` |
| Phone theme | `#ffffff` / `#155eef` | `#101114` / `#84adff` |
| Green | `#E2E9DF` / `#164939` | `#111d18` / `#c6d9b5` |

One semantic registry supplies all screens; palette anchors came from the saved
website design. Supporting shades are derived for readability. No new fonts,
backend data, dependency change or duplicated app layout is involved.

## Phone checklist — not yet reported

- First eligible tab visit offers Choose your look once. A direct-linked editor,
  auth recovery or another sheet is not interrupted. Continue/swipe-dismiss keeps
  the current selection; selecting an option is immediate.
- Profile → Appearance is available to owners and members. Three radio choices,
  clear selected indicator, preview and readable descriptions; no extra Save.
- Change all three themes, restart, switch household and sign out/in. The same
  phone retains its choice; another phone remains independent. Reinstall recovery
  and cross-device account sync are outside this slice.
- Change the phone light/dark setting while open. Check app surfaces, text,
  borders, inputs/cursors/keyboards, tabs/badge, native headers, Back arrows,
  sheet backgrounds, highlights, spinners, error states and destructive controls.
- Visit Plan/date selection/review; Recipes/editor/details/sections/import;
  Shopping/search/grouping/add/edit/swipe; Catalog/item/category/unit/store forms;
  Profile/permissions/household flows. Compare equivalent controls across screens.
- Keep a recipe draft, visit Appearance in Profile and return; work stays intact.
  Return from nested native sheets with search and drafts retained.
- First-use sheet: long/short content, larger text and small display. Header must
  remain separate from scrolling choices; Continue remains above the home inset
  and final choices stay reachable after scrolling settles. No extra keyboard gap.
- Auth email-code Send/Verify/Resend, Create/Join household and Sign out actions
  now use shared themed buttons: verify disabled/busy/error appearance and labels.
- Startup uses the static existing native launch/logo assets; dynamic preference
  applies to app content. Check for unexpected startup delay or wrong colors
  after returning from background. Native OS menus/alerts follow OS styling.

Record iPhone and Android separately, including device/OS and appearances tested.
A full six-appearance review remains necessary before a major release. No signed
native build, installation or deployment is included in this implementation.

## Automated validation completed November 2

Final cold mobile run: 851 tests / 80 suites, no skips. Normal run: same counts,
before the last shared-auth-button follow-up; 33 focused tests and final cold run
cover that follow-up. Types/lint (no warnings), SDK dependency compatibility,
six-palette contrast and iOS/Android production JS exports pass. No signed build,
physical device review or new API suite is claimed by these checks.

November 2 chooser polish: review order Meal Planner / Phone theme / Green;
Meal Planner is selected on a fresh preference. Saved explicit Phone/Green choices
remain selected. Descriptions unchanged; preview plus symbols should be centered.
Rename the Meal Planner placeholder when the official app name is selected.

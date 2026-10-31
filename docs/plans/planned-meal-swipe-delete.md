# Planned-meal swipe deletion — F06

Status: approved October 30, 2026 with "Looks good, implement"; assigned directly
to this chat. Implementation branch: `codex/planned-meal-swipe-delete`, from
`6559fe4`. Implementation and automated validation are complete. Felipe accepts the
reviewed swipe feature on his phone October 31, 2026, as recorded below.
Planning branch: `codex/planned-meal-swipe-plan`, from clean `8b472cd` after
acceptance of ingredient reordering and grab feedback. Preserve that accepted
branch chain. Felipe subsequently approved direct implementation on the focused branch above. No push, merge, deployment, native
rebuild, Mac database/runtime changes or paid resources are part of this plan.

## Goal and scope

Remove a planned meal directly from Plan using the same two-stage left swipe as
Shopping. Remove only that scheduled occurrence; its saved recipe, other planned
occurrences and Shopping entries stay intact. Apply to every filled Breakfast,
Lunch and Dinner card, including an archived recipe already present in the plan.
Empty Add meal slots keep their existing behavior.

## Source findings

- Shopping already has the accepted 56-point red circular trash action, white
  semibold trash symbol, expanding full-swipe pill, spring snap and failure retry
  in `features/shopping-list/shopping-swipe-row.tsx`. Its separator sits outside
  the moving content. Reuse that implementation rather than copy a second one.
- `shopping-swipe-logic.ts` reveals at 48% of the 76-point reveal distance and
  deletes at `0.65 * max(measuredRowWidth, 260)`. Preserve that exact rule,
  including the existing narrow-row minimum, and the ability to resume a full
  swipe from the revealed position. This plan does not retune Shopping.
- Plan currently renders filled cards as Edit Pressables in
  `features/meal-plan/meal-plan-screen.tsx`, within `Screen layout="tab-root"`.
- `use-meal-plan.ts` calls the revision-protected DELETE and then quietly reloads
  the week. It does not yet reconcile a confirmed deletion into its cached week.
  The screen also currently hides cached meal cards when a refresh reports error.
- The existing endpoint deletes by household + entry ID + expected revision.
  A changed entry returns 409; a missing/inaccessible entry returns 404. It does
  not delete or archive the recipe. No API/schema change is expected.

## Interaction decisions

1. A short left swipe reveals the same circular Delete action as Shopping and
   stays open after release. Tapping it removes the occurrence immediately.
   Releasing beyond the existing 65% rule removes it after the accepted exit
   animation. No extra confirmation or Undo is added to this swipe interaction.
2. Dragging back closes the action. A completed or canceled horizontal swipe must
   never open Edit. Ordinary taps on a closed card still open Edit; a tap on its
   revealed content closes it first. Keep the existing Edit-sheet Remove
   confirmation and that non-swipe removal path, including on web/VoiceOver.
3. Only one meal action stays revealed. Beginning a swipe on another card closes
   the previous card, without resetting the card currently being dragged. Preserve
   the existing Shopping press-suppression/finalization behavior during reuse.
4. Close revealed actions on a real vertical scroll, refresh, date/week change,
   Today, Add/Edit, Review shopping needs, tab/navigation departure, backgrounding,
   household/session change or removal/replacement of the underlying entry.
   A ScrollView begin event or the pan's synthetic release press must not close a
   newly revealed action. Reuse Shopping's actual-scroll-distance distinction;
   unrelated rerenders must leave the action available for tapping.
5. Keep the existing meal card size, cover, text, chevron and theme. Draw its frame
   once outside the translated content, with correct corner clipping; avoid
   doubled borders or a separator carried along by the moving card. Compare Plan
   and Shopping side by side. No new swipe haptic is added in this slice.

## Proposed implementation and organization

- Move the accepted swipe row and release-policy helper into reusable UI:
  `src/components/swipe-to-delete-row.tsx` and
  `src/components/swipe-to-delete-logic.ts`, with their corresponding tests.
  Rename Shopping-specific exports, labels and IDs into explicit caller props;
  preserve Shopping's existing test IDs/accessible labels at its call site.
  Allow the Plan card frame style and an optional stationary Shopping separator.
- Update Shopping's import/call site and all dependent tests/mocks, including
  navigation/household/meal-plan router tests. Delete the old feature-local
  implementation after imports move; do not retain duplicate gesture engines or
  introduce a generic shared directory. Keep screen-specific state/actions in
  their features. No library, SDK or gesture-API migration is needed.
- Wrap Plan's filled cards with the shared component. Track reveal/press state
  by the scoped planned-entry ID, never recipe ID or slot index. Guard Edit and
  deletion synchronously against pending work, removed entries and stale
  callbacks; require current user/session/household/week and the captured entry
  revision before dispatch. Preserve the native sheets and shared Screen frame.
- Add per-entry pending removal protection in the Plan hook, allowing unrelated
  entries to remain usable. A trash tap and full-swipe completion racing for the
  same entry must issue at most one DELETE. Retain revision checks; never retry
  a conflict automatically against a newer revision.
- After confirmed DELETE success, reconcile that entry out of the current cached
  week immediately and invalidate older in-flight reads before a quiet refresh.
  Update its slot, daily count and day dot from the resulting entries. If that
  refresh fails, retain the confirmed removal and remaining cached meals with a
  retry notice. A failed reload must not look like a failed deletion or resurrect
  the entry. Preserve the selected day/week and unrelated drafts.
- On an unconfirmed/failed DELETE, restore the card, close the action and show a
  scoped retry error. On timeout, 404 or 409, refresh to reconcile current state;
  do not equate every 404 with success, claim a deletion that is unconfirmed, or
  remove a meal another person changed. Require fresh data and a new user action
  before retrying a conflicted/unknown removal. Ignore late results after scope
  or week changes and do not refresh an old view over the new one.

## Validation after intended edits

- Shared gesture/policy tests: closed/revealed/full-delete states, exact threshold
  boundaries, narrow/unmeasured widths, second-stage continuation, drag-back and
  native cancellation, single removal, retry, accessible action visibility and
  stationary border/separator. Preserve all accepted Shopping gesture tests.
- Plan screen/hook/actual-router tests: all meal slots, repeated uses of one
  recipe on different days, only one revealed card, no Edit from swipe/release,
  reveal stays open for Delete, actual scroll versus begin-only events, action/
  navigation cleanup, duplicate requests, revision conflicts, already-removed
  entries, network/unknown outcomes, and stale callbacks after household/session/
  week switches. Cover DELETE success + refresh failure without resurrection,
  updated day counts/dots, and the existing Add/Edit/Review/native-sheet flows.
- Run relevant Shopping, Plan and navigation tests, then one full mobile pass for
  the shared component extraction; TypeScript, lint, whitespace and iOS JS export.
  Run a targeted existing/extended meal-plan API integration check on verified
  local `meal_planner_disposable_test` PostgreSQL only: deleting one occurrence
  preserves its recipe/other occurrences and enforces revision/household rules.
  A full database suite is unnecessary unless server/schema scope changes.
- Physical iPhone review: compare Plan against Shopping at rest, short reveal,
  reverse drag and full delete; verify action persistence, scrolling, first/last
  card, long titles/larger text, retry, tab return and scope/week changes. Keep
  current appearance for routine review. Check Android when a device is available;
  mark unrun cases explicitly. Web retains Edit -> Remove. Mocked tests do not
  establish native touch competition, animation fidelity or safe-area geometry.

## Open decisions

No blocking product question is known. Approved: immediate swipe removal matching
Shopping, with the existing Edit-sheet confirmation retained. Approval of this
plan covers the focused shared-component move and Plan deletion-state repairs;
F13 badge, leftovers/eating out, personal week ranges and roles remain separate.
Approval and direct implementation assignment are recorded above.


## Implementation record — October 30, 2026

- Shopping and Plan now share `components/swipe-to-delete-row.tsx` and its release
  policy. The accepted circle, icon, expanding pill, springs, reveal distance and
  `0.65 * max(width, 260)` deletion threshold are preserved. Shopping retains its
  labels, test IDs and screen-owned interaction guards. An activated cancellation
  ends press suppression; a pan that never activates does not suppress taps.
- Plan remains a `Screen layout="tab-root"`; no inset or keyboard owner changes.
  Filled cards use one stationary frame, feature-owned reveal/intent state, and
  the shared gesture. External resets replace even a partly dragged native row;
  reveal rerenders do not replace it. Actual vertical movement closes a reveal,
  while begin-only scrolling does not. Edit-sheet confirmation and web editing
  remain available.
- The hook deduplicates per-entry removals, guards captured view/revision scope,
  reconciles confirmed IDs before reloading, and prevents delayed reads from
  resurrecting removed occurrences. Unconfirmed deletion failures require a fresh
  read and a new action; no automatic DELETE retry uses a newer revision. Cached
  remaining meals, counts and dots stay visible when a reload fails.
- No API implementation, schema, dependencies, live Mac data/runtime, native
  build, Expo server, deployment or paid resource changed. The existing API
  integration test was extended to verify revision checks and that another
  occurrence and its saved recipe survive deletion.

Physical iPhone/Android checks are unrun by this agent. Felipe owns review of
short reveal persistence, trash tap, continued full swipe, reverse/canceled swipe,
ordinary Edit tap, real scrolling, tab/day/week return, long titles/larger text,
and comparison with Shopping. Automated gesture callbacks and iOS JS export do
not establish native animation feel, touch competition or final screen geometry.
The existing native tab-root layout is preserved; keyboard and safe-area device
review remain unrun. Hosted CI, native builds, light/dark release review and the
full PostgreSQL suite were not run for this focused slice.


Final validation: all 62 mobile suites / 633 tests passed, with no skipped tests,
plus TypeScript, lint, whitespace checks and iOS JS export. The targeted existing
meal-plan API integration case passed (1 test), after migration to head and
identity verification of local `127.0.0.1:5432 / meal_planner_disposable_test`.
No development or Mac trial database was used. The final route test controls its
clock after router initialization, so release suppression and later ordinary Edit
taps are both verified. Earlier failed runs were repaired and superseded by this
final pass; no broader physical or release acceptance is inferred.


## Phone acceptance - October 31, 2026

Felipe confirms "Okay swipe to delete feature looks good" after running the
local app containing `55382a0`. F06 is accepted at that reviewed phone scope.
This does not imply that every individual checklist case, Android, larger text,
light/dark release review or hosted/native deployment was tested. No application
code changed for this acceptance record; automated checks above remain the last
implementation validation and were not rerun for documentation only.

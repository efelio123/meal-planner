# Household member permissions — F15

Status: implemented November 1, 2026 on `codex/member-permissions`, awaiting
Felipe's phone acceptance. Felipe approved direct implementation, including
section checkboxes and the lifecycle/migration decisions. Accepted F09/F10 work
is preserved. The local development database is migrated; the live Mac trial,
Render, installed phone builds and main remain unchanged.

## Goal and scope

Owners can decide what each member may do in one household. Owners retain full
access. New invitees are Members with every current product action enabled;
household administration remains owner-only. The restricted Shopping-only
starting point includes Add, Edit and Check/uncheck. Add an owner-only permission editor
and enforce the same policy in every household mutation, including nested
flows and requests from older/stale clients.

Deliver the settings and enforcement together. Scope includes migration/defaults,
role and membership transitions, app-wide action gating, API errors and permission
refresh, with no changes to the accepted meal/recipe/Shopping behavior beyond
access restrictions. No custom roles, view restrictions, content ownership by
creator, permission templates, calendar integration, widgets or paid services.
Self-service profile, sign-out, personal date/view preferences, creating/joining
another household and voluntary leave remain independent of these grants.

## Pre-implementation findings

- `household_management.lock_household` serializes household mutations and checks
  active membership; its owner flag protects household administration. Most
  Catalog, Recipe, Plan and Shopping writes currently accept any active member.
- `household_members` stores owner/member roles; there are no content permissions.
  Invitations create a member. Existing last-owner/removal rules must survive.
- `member-detail-screen.tsx` already gives an owner role and removal controls
  under Profile / My households. Routes explicitly identify the target household;
  it may differ from the currently selected household.
- Shopping PATCH combines check state and amount/unit/store edits. Meal-plan
  shopping review adds items through another write path. Re-adding a purchased
  item currently uses an update rather than the new-item endpoint. Each needs an
  explicit policy; protecting only buttons or POST endpoints leaves gaps.
- Household state holds role snapshots and guards session/selection races.
  Permission refresh must preserve the mounted navigator and open drafts.

## Approved owner experience

Profile → My households → household → person → **Permissions**.
Only owners see this action. Use a full stack page, titled **Member permissions**,
showing the person's name and target household. Its frame is `tab-stack` under
one native header: shared Screen, one bounded scrolling form, no second top
safe-area owner, and all final rows/actions reachable above navigation.

Group accessible checkbox rows by Shopping, Recipes, Meal planning and Catalog
(with Items, Categories, Stores and Shopping units). Labels name the action,
rather than a vague Manage permission. Checked means allowed. All rows have
consistent checkbox targets, labels and disabled states. Do not introduce a
native sheet for this long settings list.

Each major section heading has a global checkbox: **Shopping**, **Recipes**,
**Meal planning** and **Catalog**. Catalog's master includes Items, Categories,
Stores and Shopping units. Its subheadings organize the individual rows; they do
not introduce another layer of master checkboxes.

- All actions checked: heading is checked; tapping clears that whole section.
- No actions checked: heading is unchecked; tapping checks the whole section.
- Some actions checked: heading is mixed/indeterminate; tapping checks all.
- Individual row changes immediately update the heading's derived state.

These controls affect only their section, including destructive actions such as
Shopping removal/clear where listed. They do not change the other sections, read
access or household administration. Announce checked/unchecked/mixed states with
accessible checkbox semantics and a label such as All Shopping actions. For an
owner target, both section and individual checkboxes remain checked/read-only.

Use explicit **Save**. Section and individual toggles change only the checkbox
draft; Save persists once. There is no Allow all, Shopping only or Reset to
defaults shortcut. Back with changed checkboxes offers
Keep editing / Discard changes, following the accepted draft-warning behavior.
A successful Save shows confirmation and refreshes member details. Errors keep
the checkbox draft; a conflicting owner edit offers Reload latest rather than
overwriting it. Do not automatically retry an uncertain write: refetch and
reconcile the saved revision/list first.

For an owner target, show **Owners have full access** and a read-only all-enabled
list. Their access cannot be reduced with checkboxes. Changing their role stays
in the existing role flow, which explains full access on promotion and the
full-product access retained on demotion before confirming. Household administration appears as an Owner-only
summary, separate from the editable product-action groups.

## Approved action matrix

Owners can perform every action. New invitees receive all 25 product grants.
The first three rows form the Shopping-only starting point for owners choosing
to restrict a member. The keys below are stable API identifiers; the app displays
labels. The restricted column is not the invitation default.

| Group | Checkbox label | Key | Restricted baseline |
| --- | --- | --- | --- |
| Shopping | Add items | `shopping.add` | On |
| Shopping | Check and uncheck items | `shopping.check` | On |
| Shopping | Edit amounts, units and stores | `shopping.edit` | On |
| Shopping | Remove individual items | `shopping.remove` | Off |
| Shopping | Clear purchased items | `shopping.clear_purchased` | Off |
| Shopping | Clear the entire list | `shopping.clear_all` | Off |
| Recipes | Create recipes | `recipes.create` | Off |
| Recipes | Edit recipes | `recipes.edit` | Off |
| Recipes | Archive recipes | `recipes.archive` | Off |
| Recipes | Restore archived recipes | `recipes.restore` | Off |
| Meal planning | Add meals | `plan.add` | Off |
| Meal planning | Edit or move meals | `plan.edit` | Off |
| Meal planning | Remove meals | `plan.remove` | Off |
| Catalog items | Create Food and Household items | `catalog.items.create` | Off |
| Catalog items | Edit items | `catalog.items.edit` | Off |
| Catalog items | Archive items | `catalog.items.archive` | Off |
| Categories | Create categories | `catalog.categories.create` | Off |
| Categories | Edit categories | `catalog.categories.edit` | Off |
| Categories | Remove categories | `catalog.categories.archive` | Off |
| Stores | Create stores | `catalog.stores.create` | Off |
| Stores | Edit stores | `catalog.stores.edit` | Off |
| Stores | Remove stores | `catalog.stores.archive` | Off |
| Shopping units | Create custom shopping units | `catalog.units.create` | Off |
| Shopping units | Edit custom shopping units | `catalog.units.edit` | Off |
| Shopping units | Remove custom shopping units | `catalog.units.archive` | Off |

The 25 action grants are independent; section checkboxes edit their explicit
grant selections, with no wildcard permission or automatic inheritance. A member
with none checked can still browse product content. Product grants never confer
owner status. Household settings, invitations (create/reissue/revoke), role or
permission changes, member removal and household deletion remain owner-only.
Keep the last-owner safeguard and current email/invitation privacy boundaries;
viewing shared product content does not expose owner-only administrative data.

## Exact boundaries and compound actions

- **Add versus edit:** choosing initial amount/unit/store for a new Shopping
  entry is part of Add. Changing an existing entry's details requires Edit,
  even if the submitted fields happen to match their current values.
- **Re-add purchased:** Add includes returning an existing purchased item to
  To buy with its current amount/unit/store retained. Use a narrow idempotent
  `POST .../shopping-list/items/{item_id}/re-add` that accepts no detail edits.
  It requires Add; an already-unchecked row returns unchanged. Route the accepted
  quick re-add through it. A general PATCH of check state still requires Check.
  This keeps Add-only members useful without granting arbitrary edits.
- **PATCH enforcement:** a submitted `is_checked` field requires Check; any
  amount/unit/store field requires Edit. A mixed request requires both. Check
  every required grant before any write and reject the whole request if denied.
- **Shopping needs:** viewing a review and choosing its date range are reads.
  Adding missing needs, including their initial amount adjustments, requires
  Shopping Add. Editing an already-listed entry requires Shopping Edit; checking
  it requires Check. Existing review-token/idempotency rules remain in force.
- **Clear actions:** each bulk clear has its own grant. Check, Remove or Clear
  purchased does not implicitly permit Clear all. Swipe deletion uses Remove.
- **Nested creation:** a person allowed to add Shopping items can select existing
  Catalog items, units and stores. Create/manage actions use their respective
  Catalog grants. Recipe creation/editing and ingredient import do not grant
  Catalog writes. All nested entry paths reuse the same guards and Back behavior.
- **Recipes:** create/save from Recipes needs Create; existing-recipe Save,
  ingredients/sections/directions/reordering need Edit. Import follows the
  destination's Create/Edit permission and never needs source Edit. Read access
  includes recipe details and the existing archived-recipe view; Restore is
  separate. Plan's create-recipe flow checks both recipe creation and the planned
  add operation. If access changes between those separate saves, retain a recipe
  already saved successfully and clearly report that adding the meal was denied.
- **Category removal:** the current operation clears category references on
  active Catalog items. If any are affected, require both Remove categories and
  Edit items, explaining the dependency beside that action. An unused category
  needs only Remove categories. Determine affected items under the same lock;
  retain the existing count-change confirmation guard. Preserve current Store/
  Unit in-use rules and all destructive confirmations.
- **Every mutation, including replay:** permission checks precede idempotency
  replay handling. Revoked access cannot use an old recipe-create or review
  request ID to bypass current authorization. All records stay household-owned.

## Approved storage and API contract

Use a small backend permission registry and normalized grant rows, with no new
permission service, library or JWT claim. The registry defines supported keys,
labels, groups, full-product invitation grants and the Shopping-only grant set. Unknown/new actions default to denied for
members; owners remain full-access. Keep client action identifiers typed and
verify their agreement with the API registry in contract tests.

Add `household_member_permissions(membership_id, action_key)` with a composite
primary key, foreign key to `household_members`, and validated action keys.
Household scope is derived from the membership; every query validates the target
membership's household and active status. Add a positive `permissions_revision`
to memberships for optimistic concurrency. An empty grant set means no product
writes, never an implicit reset to defaults.

Newly accepted invitations always create a Member with all current product
permissions enabled. Pending invitations retain Member as their invited role;
apply grants transactionally when the invitation is actually accepted. Do not
promote invitees to Owner implicitly. Invitation management remains owner-only.

For migration, seed all current product grants for existing active
members to preserve their current content access. Owners can restrict them after
rollout. Preserve users, recipes, Catalog, Shopping and Plan records. Inventory
roles read-only before a later live rollout. This replaces the earlier migration
proposal that would have restricted existing members automatically.

Owners' effective access is computed as all actions. Promoting a member removes
custom grants. Demotion grants all current product actions
with that outcome explicit in its confirmation; an owner can
then change the member's checkboxes. Removal clears grants. Rejoining through a
new owner-issued invitation receives full product access under the invitation
rule, without resurrecting the previous membership's custom grants. Increment the
revision on role/access/removal transitions, preserving current last-owner and
membership invariants. Never assign grants to another membership or household.

Add effective permissions and their revision to each current-user Household
snapshot (`/me`, household lists/detail, create responses). Do not add other
members' grant sets to broadly readable People responses. Owner endpoints:

- `GET /v1/households/{household_id}/members/{membership_id}/permissions` returns
  target role, revision, effective grants and grouped action definitions/defaults.
- `PATCH` on that path accepts the full grant list and required
  `expected_revision`; success returns the confirmed snapshot. Reject unknown,
  duplicated or owner-administration keys. An owner target is read-only here.
  Compare/update under the household lock; a stale revision returns 409
  `MEMBER_PERMISSIONS_CONFLICT`, with no partial change.

Use a shared service-level `require_permission`/`require_permissions` with the
existing household lock inside each mutation transaction. Owner edits and member
writes take that same lock, so the operation that obtains it first completes
first; later operations observe the updated role/grants. An already committed
allowed write is not undone by a later revocation. Do not authorize in a separate
precheck transaction, UI, token, or cached role alone.

For a valid active member lacking a product action, return structured 403
`HOUSEHOLD_ACTION_FORBIDDEN` with a safe message/action key. Keep current 404
behavior for inaccessible households, members, or cross-household targets and
owner-only administration. Resolve target IDs within the caller's household
before reporting a missing product grant, and check every grant before writes.
These are access errors, not authentication expiry;
do not sign the user out. Strict request validation must cover the raw submitted
fields so clients cannot smuggle additional changes through a permitted action.

## Mobile permissions and refresh

Add shared selectors/hooks with an explicit household ID (or the selected
household default), using authoritative user/session/household-scoped snapshots.
Extend current household state narrowly with access refresh/merge; keep role and
permissions consistent across its household list and selected-household object.
Do not reorganize authentication or change root startup/navigation contracts.

Refresh access on relevant screen focus, foreground resume, pull-to-refresh and
a permission denial, plus after confirmed owner/role edits. Coalesce requests and
ignore stale responses after sign-out, household switch or target change. Missing
member permissions from an old API do not imply write access. Keep reads usable
and show an update/retry message. Do not widen known grants on refresh failure.
No realtime transport/polling service is introduced: another phone's visual
controls update on refresh/focus/resume or its first denied action; the API always
checks current rights before writing.

Use the same selectors for toolbar actions, swipe gestures, row buttons, Catalog
choosers/managers, recipe forms, Plan and Shopping review, and direct route entry.
Keep all tabs, shared content, search, sorting and read navigation usable. Hide
unavailable mutation controls; show a clear read-only explanation on a detail or
blocked deep-linked editing page. A checkbox without Check permission remains a
visible non-interactive status indicator. A readable Shopping row may still open
its details, but its Save/Delete/Catalog-edit actions each follow their own grant.

On permission changes, preserve an open draft, make forbidden actions unavailable
and explain the restriction. Do not reset editor scope or discard content merely
because the permission revision changed. Existing leave warnings still protect
unsaved drafts. No autosave or automatic write retry on a later grant. Reconcile
optimistic checkoffs/deletions after denial and refresh access; independent allowed
quick checkoffs must retain their existing per-item responsiveness.

## Affected areas and implementation sequence

1. Add the permission registry/helper, migration, defaults and membership lifecycle
   integration in household management/onboarding. Add owner endpoints and typed
   API snapshots. Consult current official docs against resolved FastAPI,
   SQLAlchemy/PostgreSQL and Expo/Router versions before implementation.
2. Inventory every mutation in `main.py` and its actual service call; apply the
   policy in `shopping_lists.py`, `catalog.py`, `recipes.py`, `meal_planning.py`
   and owner-only services. Add narrow re-add and field-aware authorization.
3. Add the shared mobile access selectors/refresh behavior and the owner page in
   `src/features/household-permissions/`; add a thin nested Profile route and
   member-detail link. Reuse app-wide visual/layout components.
4. Apply guards across Shopping, Catalog, Recipes, Plan, review, nested sheets and
   archived recipes. Preserve current navigation, drafts and accepted interactions.
5. Complete intended tests and implementation, then run one coordinated validation
   pass. Commit focused changes on `codex/member-permissions` from this planning
   branch after approval. Follow the standing coding-agent/direct-assignment
   agreement; Felipe explicitly assigned this implementation to the chat agent.

## Validation and later rollout

- Unit/contract matrix for all 25 actions: owner, full-access invited member,
  Shopping-only member, explicit grant/denial, empty grants and unknown actions. Check all existing mutation routes
  have an intentional mapping; test service enforcement as well as HTTP behavior.
- Verified disposable-PG integration: migration/backfill, defaults on invitation,
  rejoin/promotion/demotion/removal, last owner, tenant isolation, owner-only
  editing, stale revisions and concurrent revocation versus writes. Verify denied
  operations leave data/revisions unchanged. Test Shopping mixed fields, re-add,
  bulk clears, category side effects, replay IDs and alternate Plan/review paths.
  Guard downgrade against losing saved permission configuration.
- Checkbox tests cover all/none/mixed states, mixed-to-all and all-to-none taps,
  individual-to-heading updates, Catalog descendants, isolation between sections,
  read-only owner targets and saving the explicit grant list with no wildcard.
- Actual-router/UI coverage for owner settings and scoped non-selected households,
  read-only browsing, deep links, nested creation, recipe import, interrupted
  drafts, denied optimistic updates and account/household switches. Confirm a
  member cannot reach a working forbidden mutation via another tab or sheet.
- Full mobile normal and cache-cleared suites, types/lint, Expo compatibility,
  iOS/Android JS exports, API Ruff and full disposable-PG suite with no claimed
  pass for skipped tests. No tests against the Mac trial database.
- Phone review: owner and member accounts, one grant/revocation between phones,
  default checkoffs/re-add and recipe/Plan browsing, long permission list with
  larger text, Back/discard, full content reachability and nested return behavior.
  Record actual devices/modes checked; a dedicated light/dark pass precedes a
  major release. Automated checks do not prove native geometry or gesture feel.
- A later separately approved rollout needs a fresh restore-verified Mac backup,
  role inventory, migration review, both-phone client upgrade and coordinated
  API deployment. Older clients remain subject to server enforcement and may see
  denials when an owner restricts their actions. Avoid rolling back to an API that stops enforcing
  the configured policy; prefer a permission-compatible fix. This plan does not authorize a merge, live migration/deployment, app
  reinstall or staging auto-deploy change. Local development migration is
  recorded below.

## Confirmed decisions

Felipe accepts the overall permissions approach and confirms:

1. Owners retain full access and exclusive household administration.
2. New invitees start as Members with full Shopping, Recipes, Plan and Catalog
   access. They do not become owners automatically.
3. The restricted Shopping-only baseline includes Add, Edit and Check/uncheck.
   Owners can customize all individual product-action checkboxes.
4. Each major section has a checkbox to check/uncheck its actions together;
   partial selection is mixed. These replace Allow all / Shopping only shortcuts.

Lifecycle refinements approved with the final plan:

- Preserve existing members' current full product access at migration.
- On demotion, explicitly confirm retaining full product access. A new invitation
  on rejoin grants full product access, consistent with the invitation rule.

The accepted Add/re-add and field-aware Edit/Check rules above remain intact.
No external credentials, paid resource or package change was needed.

## Invitation policy decision — November 1

Felipe resolves all features as full Shopping, Recipes, Plan and Catalog access,
with household administration staying with owners. New invitees therefore remain
Members and receive all current product grants on acceptance. Explicit promotion
is still required to manage people, permissions, invitations and household
settings/deletion. Owners may restrict content actions afterward.

This supersedes the earlier three-grant invitation assumption. The three Shopping
grants now describe the restricted starting point, not newly invited Members'
initial rights. Existing-member migration and demotion/rejoin refinements were
approved with the final plan. Felipe subsequently replaces the named shortcuts with
section-wide checkboxes; no preset shortcut UI remains in the plan.

## Implementation and review handoff — November 1

Code commits: `dca9b6c` (API/migration/contract) and `a9a244d` (mobile controls,
refresh and app-wide guards). No dependency changes.

Implemented all 25 action grants, transactional service enforcement, owner GET/
PATCH with revision conflicts, field-aware Shopping PATCH and strict re-add,
invitation defaults and role/removal/rejoin lifecycle. Migration
`member_permissions` follows `recipe_ingredient_sections`; existing active Members
receive all 25 grants. Downgrade refuses to discard saved permission changes.

The new Profile stack page provides four all/none/mixed section checkboxes,
individual actions, explicit Save, conflict reload, uncertain-save reconciliation
and unsaved-Back protection. Shared access selectors gate writes across Catalog,
Recipes, Shopping, Plan/review and nested sheets. Forbidden entry/toolbar actions
are hidden; forms/status controls can remain visible but disabled with an access
explanation. Access refresh preserves navigators and drafts, coalesces requests,
ignores stale responses and leaves unchanged household snapshots alone. There is
no realtime push; API checks are immediately authoritative.

Validation completed using the committed lockfile in an isolated temporary
mobile runtime, without installing packages into the serving Expo checkout:

- Full normal and cache-cleared mobile runs: 77 suites / 819 tests each, no skips.
- The subsequent unchanged-access-response guard and regression test passed the
  relevant household-state/router checks: 142 tests, no skips. The earlier full
  runs do not claim coverage of this final follow-up.
- TypeScript, Expo lint, SDK dependency compatibility and iOS/Android production
  JavaScript exports passed. JavaScript exports are not signed native builds.
- API Ruff and full guarded disposable-PostgreSQL suite: 232 passed, no skips;
  Alembic head verified. Coverage includes all 25 mutation grants, migration,
  lifecycle, tenant isolation, raw-field restrictions, replay, stale revisions,
  concurrent updates and transaction-ordered revocation.
- Legacy Member test fixtures now seed explicit full-product grants; production
  code never treats absent grants as full access. Registry contract tests compare
  mobile and API action keys.
- After the final permission-warning copy correction, three relevant actual-
  router permission cases passed; 50 unrelated cases were unselected, not claimed
  as passing in that focused run.

Local development only: created a custom-format PostgreSQL backup in Felipe's
local temporary directory before migration and verified its restore catalog
(the backup has not been restored). Migrated `meal_planner_dev`, checked all eight
tracked content/membership table counts unchanged and all existing active Member
grants seeded. Restarted the local API; health is OK. Existing Expo remains
running. No Mac trial database or services were accessed.

Phone acceptance remains unrun: review Profile → My households → person →
Permissions as Owner, section mixed/all/none states and Catalog descendants,
Save and Back/discard, then restricted Member browsing and denied writes across
all tabs and nested sheets. Test a grant/revocation across phones after refresh,
open-draft preservation, long lists/larger text and nested Back. Dedicated light/
dark release review, Android device acceptance, native builds and live rollout
remain separate. No merge, push or deployment is included in this implementation.

## Demotion default correction — November 1

Felipe clarifies that every default Member transition, including Owner → Member,
must start with all current product actions checked. This supersedes the earlier
Shopping-only demotion decision. Household administration becomes owner-only;
owners can subsequently restrict individual actions through Permissions. The
role-change warning and backend now agree. Existing saved Member restrictions
are not rewritten or widened; a redundant Member → Member update preserves them.
For an account already demoted under the earlier behavior, an owner can enable
all four section checkboxes and Save, or promote and demote it again.

Follow-up validation: 45 permission/household-management API tests passed on the
verified disposable database, plus Ruff; all five member-detail mobile tests
passed. Local API restarted and health verified. No database records or live
Mac services changed for this correction. Earlier full-suite results are
historical, not rerun for this focused follow-up.

## Permission layout follow-up — November 2

Felipe requests trailing checkboxes, larger main group titles and subheadings
at the previous title size. All section/individual checkboxes now align at the
far right of their full-width tappable rows. Main group titles are 24/32 bold;
Catalog subheadings reuse the former shared 20/26 bold section-title role. The
existing tab-stack frame, scroll reachability, wrapping labels, mixed states and
save behavior are preserved. Physical appearance remains for Felipe's review.

Validation: all eight permission-editor tests and targeted screen lint pass.
No API/database change or full-suite rerun for this presentation-only follow-up.

# Profile Hub Replacing Settings: Implementation Plan

Status: implementation is committed on `feat/profile-hub`; PR #9 is open and
awaiting review. Felipe approved it after physical-iPhone testing. Felipe
confirmed the Profile layout looks good, Back works through nested pages, and
VoiceOver announces the native Back control correctly. Android device testing,
native rebuilds, cloud staging, and lost-invitation-code recovery remain
outstanding. Household-management work below is future scope and is not
implemented or approved.

## Goal and scope

Replace the signed-in Settings tab with a Profile hub while retaining five tabs
in this order: Plan, Recipes, Shopping, Pantry, Profile. Preserve the temporary
Shopping startup destination through the existing centralized startup route.

Profile shows an optional Clerk avatar (initials fallback), the available
display name (email fallback), and the currently selected household and role.
It offers My account and My households rows. My account displays existing
account information and moves the existing sign-out action there. My
households lists the user's memberships and marks the active household.
Household details show its existing name, time zone, and the user's role;
opening details is read-only with respect to active selection. An explicit
Switch to this household action changes the selection. Owners may open that
household's Invitations destination; members have no owner-management control.

### Approved visual direction

- On the headerless main Profile tab, use Airbnb's Profile page only as a
  layout reference: a top-aligned “Profile” heading, then a compact user card
  with optional avatar/initials, visible name, and email, followed by a clean
  navigation section headed “Account Settings.” It contains simple full-width
  My account and My households rows with relevant leading icons, one-line
  labels, trailing chevrons, and a subtle divider; there is no surrounding
  card/border or long subtitles. Make the current household prominent and
  clearly labeled, including the current role. If email is used as the name
  fallback, show it once rather than repeating it as both name and email.
- Keep the hierarchy compact, readable, and responsive; use existing semantic
  theme tokens so the card, grouped section, labels, and navigation rows retain
  appropriate contrast in both light and dark appearance. Do not copy Airbnb's
  branding, colors, typography, or exact styling.
- On household details, the current Profile slice remains read-only and uses
  the existing household summary fields; owners get the Invitations entry and
  members do not. The member “People” rows belong to the separately proposed
  household-management slice because the current API does not return other
  household members. In that later slice, use Apple Home's People section only
  as a layout reference: readable active-member rows with name and Owner/Member
  role, plus an owner-visible Invite action. Keep pending invitations in a
  distinct Invitations section/destination, never mixed into the active-member
  list. Do not copy Apple's branding or visual styling.
- The approved native icon-only Back-arrow header applies to nested Profile
  routes in both the current slice and the later management slice; it does not
  add a header to any main tab root.

Out of scope for the Profile hub: profile editing, avatar uploads, account
deletion, new preferences, household member/role management, household
deletion, active-invitation listing/revocation/reissue, additional-household
creation from My households, new API endpoints, schema changes, and unfinished
management actions. A separate household-management slice is proposed below;
it needs its own review and approval before implementation. Invitation codes
remain unrecoverable after creation because only hashes are stored; reissue
would mint a new code rather than retrieve an old one.

## Branch and scope record

The invitation UI was reviewed and merged through PR #8 before this Profile
branch began. This approved implementation is on `feat/profile-hub`; it does
not include household-management endpoints or UI. Any later
household-management slice must wait until the Profile work is reviewed and
merged, then start on a new feature branch from updated `main`.

## Existing data and behavior

- `GET /v1/me` already returns `user.id`, `user.email`, `user.display_name`,
  and each household's `id`, `name`, `time_zone`, and membership `role`.
- `useHouseholdState` already stores the `/v1/me` result, exposes the household
  list, selected household, and `me` profile object. Its
  `select(householdId)` method accepts a household ID and persists the
  device-local active household. Reuse this existing state and result contract;
  do not add another endpoint for Profile fields.
- Installed `@clerk/expo` 4.6.5 exports `useUser`; use its existing `imageUrl`
  as the optional avatar source. Keep the local API's display name/email as the
  profile identity display source. If either source is unavailable, render the
  agreed fallback without blocking the screen. Do not persist the image URL or
  copy identity into new storage.
- The current invite-create endpoint is
  `POST /v1/households/{household_id}/invitations`. The API client accepts an
  explicit household ID, and the current Invitations route already passes its
  route household ID to the invitation screen. Preserve that exact target for
  authorization display, request URL, and stale-operation identity. Never fall
  back to the active household if the route ID is missing, malformed, or not
  in the user's current `/v1/me` household list. The server remains the
  authorization boundary.
- The signed-in default is centralized in
  `features/navigation/startup-route.ts`; it currently resolves to Shopping.
  Keep household switching and cold-start navigation pointed to this one
  destination rather than duplicating a hard-coded tab path.

No new API endpoint or database work is anticipated. If implementation reveals
that the existing `/v1/me` representation lacks a field required by these
screens, pause and propose the smallest API change separately before adding it.

## Implemented route and source organization

Keep `src/app/` limited to Expo Router screens/layouts. Each visible tab remains
its own folder with a nested stack:

```text
src/app/(app)/(tabs)/
  plan/
  recipes/
  shopping/
  pantry/
  profile/
    _layout.tsx               # one Profile-tab stack owns detail Back history
    index.tsx                 # Profile hub
    my-account.tsx
    my-households/
      index.tsx               # Household list
      [householdId]/
        index.tsx             # Details; no selection side effect
        invitations.tsx       # Existing code-creation flow for route target
```

All nested Profile routes are screens in the Profile tab's single Stack. This
means the navigator rendering each native header also owns the relevant Back
history: Profile → My households → Household details → Invitations. The actual
router test verifies these paths pop in reverse order. All five main tab roots
(Plan, Recipes, Shopping, Pantry, Profile) remain headerless. The Profile root
is also headerless; its in-content Profile title is part of the hub, not a
navigation header. My account, My households, household details, and
Invitations each show exactly one themed native stack header. Give each detail
route its screen title and a platform-native icon-only back arrow. Keep
`headerBackButtonDisplayMode: 'minimal'`; do not propose
`headerBackAccessibilityLabel`, because it is absent from the installed Expo
Router native-stack types. Remove any in-content/bottom Back buttons so there
is only one Back control. Do not replace the platform arrow with a custom
control unless the native implementation fails an acceptance check. Expo
Router's SDK 57 Stack API documents native back-button options and native stack headers:
[Expo Router SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/router/).

Top-align content on all five signed-in tab roots—Plan, Recipes, Shopping,
Pantry, and Profile—and all nested Profile pages; retain vertical scrolling
when content exceeds the viewport. This includes the “Coming soon” tab pages.
Audit the shared
`src/components/screen.tsx` before changing it: its shared ScrollView currently
uses `justifyContent: 'center'`, and its consumers include auth, onboarding,
API-error, invitation, and signed-in screens. Add an opt-in top-alignment
setting for signed-in tabs and Profile pages, keeping intentional auth,
onboarding, and loading layouts centered where appropriate. Do not globally
change unrelated screen alignment. Preserve the ScrollView so long content and
smaller devices remain usable. Test that native
headers own the top/status-bar inset, Profile content has no duplicated top
inset, and the five-tab container retains its existing bottom-inset ownership.
Do not add a second safe-area wrapper to compensate for a hidden header. The
consumer review includes `auth-email-code-form`, root loading, create/join and
select-household onboarding, API error/retry, Shopping, themed placeholder
tabs, Profile hub, account/household details, and owner Invitations.
Do not add placeholder screens beyond the already-agreed themed placeholders.

Deliberate moves/edits:

- Replace `settings/index.tsx` with the Profile hub route at `profile/index.tsx`;
  move the household/sign-out presentation rather than duplicating it.
- Replace `settings/_layout.tsx` with Profile's nested stack layout.
- Move `settings/invite-household.tsx` to the explicit dynamic household
  Invitations route. Keep `OwnerInvitationScreen` and its tests under
  `src/features/household-invitations/`, changing its inputs to receive the
  target household and membership context instead of consulting active
  selection as the target. Remove its current in-content “Back to household”
  action; the nested native header is the sole Back control.
- Update web/native tab declarations, labels, tab-icon map/tests, actual-router
  fixtures, and any Settings route references. Keep the centralized startup
  constant pointed at Shopping; do not change startup behavior.
- Put Profile-specific navigation rows and household presentation support in
  `src/features/profile/`; keep genuinely app-wide reusable rows in
  `src/components/`. Create only components that remove repeated structure.
  Do not reorganize auth or onboarding code.
- Keep all tests under `src/features/profile/`,
  `src/features/household-invitations/`, or other existing non-route test
  locations, never under `src/app/`.

## Important behavior and safeguards

- The profile header uses Clerk `imageUrl` only when present; otherwise show
  accessible initials derived from the display name, falling back to email.
  The visible name is `display_name` when nonblank, otherwise email. The
  selected household and role are explicitly labeled.
- My account is read-only in this slice. Move the existing `SignOutAction`
  there without changing its shared sign-out logic or safe failure message.
  Sign-out must continue clearing session/household state and leave no Back
  route to authenticated Profile screens.
- My households marks exactly the current selected household as Active. Tapping
  a household opens details without changing selection. Detail screens show
  role-specific content; only owners see Invitations. Members have no disabled
  or unfinished owner-management buttons.
- Switching is explicit. Only the Switch action calls existing
  `useHouseholdState().select(targetHouseholdId)`. Define a typed asynchronous
  result such as `{ status: 'selected' }`, `{ status: 'cancelled', reason }`,
  or `{ status: 'failed' }`. The Profile screen navigates only for `selected`;
  cancellation is not success and leaves the user on the current screen, while
  failure shows a safe message and preserves the previous active household.
  Resolve a target ID against the latest membership snapshot rather than
  trusting a stale object passed by a screen.
- Make switching race-safe in the shared hook, not only by disabling a button.
  Acquire a synchronous in-flight guard before the first await, expose a
  read-only pending flag for UI feedback, and reject/cancel duplicate requests.
  Capture a selection operation ID, Clerk user/session generation, and
  membership revision. Sign-out start, session/user change, a newer
  overlapping `/v1/me` refresh, or authoritative membership loss invalidates
  the operation before it may commit the active household or report success.
  If a refresh is already in flight, defer/return a cancellation rather than
  selecting from a membership snapshot that is being replaced. Recheck target
  membership and captured generations after asynchronous preference storage;
  stale work must not navigate or overwrite a newer preference/sign-out clear.
  A refresh that invalidates a user switch remains responsible for its own
  existing stored-selection/zero-or-one/multiple-household reconciliation; use
  a private refresh-generation-checked commit path rather than calling the
  public switch method while that refresh is in flight. Keep refresh's existing
  response-generation guard. Update onboarding's explicit selector to handle
  the result contract; genuine success and current startup reconciliation must
  retain their behavior.
- AsyncStorage operations are not cancellable and do not provide compare-and-
  swap. Serialize active-household preference writes, refresh reads/cleanup,
  and sign-out removal through one hook-owned ordering mechanism (or an
  equivalent proven coordinator). If an invalidated selection write has
  already reached storage, restore the prior preference only while that
  operation still owns the preference generation; never let compensation
  overwrite a later selection, refresh reconciliation, or sign-out/session
  clear. The refresh that invalidated the switch must read after the preceding
  preference operation/compensation settles. State and navigation still commit
  only for a current `selected` result.
- After successful selection, clear household-specific navigation history and
  navigate to the centralized signed-in destination (currently Shopping).
  Do not assume `router.replace()` resets a nested stack: it replaces the
  current route without appending to that stack, but does not itself guarantee
  that another tab's retained nested state was cleared. SDK 57's
  `router.dismissAll()` only pops the closest stack to its root, so it is not
  sufficient by itself to clear all Profile/My households/detail/invitation
  history. Expo documents dispatching `CommonActions.reset` imported from
  `expo-router/react-navigation` through Expo Router's `useNavigation` API.
  Prefer a supported reset of the relevant signed-in navigator state directly
  to the centralized startup route (currently Shopping), with Profile's nested
  history reinitialized. Do not issue a second navigation action unless the
  tested navigator state requires it. Do not add a custom navigator or new
  dependency. Dispatch the reset using `useNavigation()` and
  `CommonActions.reset` from `expo-router/react-navigation`, the entry point
  Expo documents for SDK 56+; build the reset state from the actual registered
  route groups and omit prior Profile nested state. Verify this exact nested
  state shape against the installed Expo Router `~57.0.23`; if a reset
  cannot reliably clear retained Profile state, pause and present alternatives
  before implementation. Sources: [Expo Router SDK 57 API reference](https://docs.expo.dev/versions/v57.0.0/sdk/router/)
  and [Expo's migration guide on resetting navigation state](https://docs.expo.dev/router/migrate/from-react-navigation/).
- Invitation requests use the `householdId` captured from the route parameter,
  not `selectedHousehold.id`. Validate the route parameter against the current
  `/v1/me` membership list before rendering the flow, then rely on the API's
  owner check. If a target owner membership disappears or changes to member,
  close/clear the invitation flow. A different active household must never
  silently retarget a request.
- Preserve the approved invitation protections: route remains mounted across
  temporary Profile-tab blur; route close/unmount, target household change,
  authenticated session change, sign-out start, or loss of owner access clears
  sensitive code state and invalidates work. Keep the paired recipient/code/ID/
  expiry snapshot; editing the email or failing a later creation must not
  relabel it. Clipboard operations/feedback bind to the exact snapshot, `false`
  or rejection is a failure, late completion cannot affect a replacement, and
  replacement never triggers an automatic copy.
- Opening household details and Invitations must not call `select`, modify
  AsyncStorage, or change Shopping's household. Switching household uses
  existing membership data and current local selection behavior.
- Use shared theme tokens/components, platform-specific tab icons, accessible
  labels/roles, appropriate image alternative text/initials, and the shared
  `Screen` component. Keep each tab root headerless while showing native headers
  on the four nested Profile destinations. Use icon-only native Back arrows
  with no duplicate bottom Back actions, and top-aligned scrollable content on
  all signed-in tabs and nested Profile routes. Verify VoiceOver announces the
  native icon-only Back control with a useful name; if it does not, pause and
  propose a supported accessibility solution before implementing a custom
  button. The signed-in alignment change must not disturb deliberately centered
  authentication, onboarding, or loading layouts. Verify one top-inset owner
  per route and preserve mounted light/dark appearance updates.
- Tab blur must not reset Profile drafts/snapshots if the nested route remains
  mounted, and must not trigger unnecessary profile or household fetches.
  Household/session changes continue rejecting stale Shopping loads/mutations
  and invitation operations under the existing generation/identity guards.

## Focused validation

- Data/presentation tests: optional Clerk avatar vs initials; display-name vs
  email fallback; active household/role; account information; theme/accessibility
  of Profile rows and household screens in light and dark modes; Profile
  heading/user-card/grouped-row order; prominent active-household labeling; and
  no duplicate email when it supplies both the name and email fallback. Check
  top alignment for each signed-in tab root and nested Profile page, scrolling
  on long content, and unchanged centered auth/onboarding/loading layouts.
- Household tests: list all existing memberships; active badge tracks the
  selected ID; opening nonactive details leaves selection/storage untouched;
  only explicit Switch calls `select`; successful switch changes selection and
  replaces route history; failure preserves the old active household and shows
  a safe error.
- Permission tests: owner details show Invitations; member details do not;
  invalid/unknown route ID never falls back to active household; API call uses
  the exact route-target ID even when a different household is active.
- Invitation regressions: existing recipient snapshot/copy/expiry behavior,
  duplicate/conflict handling, pending create/copy across tab blur, and late
  create/copy results after route close, target change, session change,
  sign-out, or owner-access loss. Assert request target path and that raw codes
  never enter navigation params/storage/logs.
- Actual-router coverage: cold signed-in startup still opens Shopping; tab order
  is Plan, Recipes, Shopping, Pantry, Profile; returning from onboarding retains
  startup behavior; all five tab roots are headerless; Profile -> My account,
  My households -> details -> Invitations each expose exactly one visible
  nested header with the expected title and icon-only Back action configured
  with `headerBackButtonDisplayMode: 'minimal'`; no nested screen renders a
  bottom Back control; opening details does not switch. VoiceOver naming is a
  separate real-iPhone acceptance check, not something the router test claims.
  With real
  Expo Router navigators, switch from a nested household detail/invitation
  route, return to Profile, and press Back repeatedly; verify no prior
  household-detail or invitation route/state can be restored. Also cover
  cancellation/failure (no navigation) and sign-out/sign-in history cleanup.
- Deferred switching tests: start a switch using a deferred AsyncStorage write,
  then sign out/session-switch or resolve a `/v1/me` refresh that removes or
  changes the target membership; settle the write and assert no stale household
  commit, success navigation, or preference overwrite (including the queued
  sign-out clear/refresh read). Start a refresh while a switch is pending and a
  switch while refresh is pending; verify the defined cancellation/defer
  outcome and that only current membership data can be selected. Start two
  switch attempts before rerender; assert only one persistence operation runs
  and only its genuine success can navigate. Test storage rejection as failure
  and ensure the previous active household stays selected. Retain existing hook
  tests for sign-out and stale refresh behavior.
- Shopping regressions: tab switching preserves drafts, list/scroll state,
  pending mutations and errors; valid same-household completion/rollback while
  blurred still applies; blur itself adds no requests; actual household switch
  still rejects old loads and mutations. Keep tests outside `src/app/`.
- Validate with normal and cold mobile tests, TypeScript, lint, route-test
  placement check, `git diff --check`, and Expo dependency/Doctor checks if
  registry access is available. Do not add dependencies unless separately
  approved; no native builds are required by the proposed code-only routing
  change. Automated router/header-option assertions are not a substitute for
  native rendering checks: the prior router tests did not catch the missing
  iPhone headers. Report unavailable online checks accurately.

## Acceptance and validation record

Felipe completed physical-iPhone acceptance: the Profile layout looks good,
Back works through the nested pages, and VoiceOver announces the native Back
control correctly. This records only the checks Felipe reported; it does not
imply Android acceptance, native rebuilds, cloud staging, or future
household-management work. Android device testing remains outstanding.

Automated validation on this branch:

- `npm test -- --runInBand`: 18 suites, 124 tests passed.
- `npx jest --runInBand --no-cache`: 18 suites, 124 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed without lint warnings.
- `git diff --check`: passed; Git emitted line-ending conversion notices for
  working-tree files, not whitespace errors.

Automated router coverage verifies route paths and Back history, but native
header rendering and VoiceOver remain physical-device behaviors. No native
build or Android device check was performed for this slice.

## Proposed later slice: household management

This is a separate feature after the Profile hub is reviewed/merged, with its
own plan approval and feature branch. It is not part of the current Profile PR.
It would add to My households the ability to create another household, see its
active members and roles, let owners promote/demote members, allow owner-
controlled household soft deletion, and let owners list active invitations
with expiry and revoke/reissue them. Profile household details remain read-only
in the current slice; the later slice owns these controls.

### Existing API/schema findings

- `GET /v1/me` and `GET /v1/households` return only the signed-in user's
  household summaries (`id`, `name`, `time_zone`, and that user's `role`).
  They do not return other household members or invitations.
- `POST /v1/households` already creates a household, its owner membership, and
  its shopping list transactionally. The additional-household UI can reuse
  this API. Household creation requires a name and IANA time-zone value.
- The API already has owner-only invitation creation and revocation. It has no
  active-invitation list, member list/role mutation, or household deletion API.
- The schema already supports `household_members.role` (`owner`/`member`) and
  historical `removed_at`, `households.deleted_at`, plus invitation statuses
  (`pending`, `accepted`, `revoked`, `expired`) and `expires_at`. The invitation
  table stores only `token_digest`, not the raw code. Relevant foreign keys use
  `ON DELETE RESTRICT`; no schema change is currently evident for a soft-delete
  implementation. Confirm with migration tests before deciding whether a new
  migration is required.
- Active household queries exclude removed memberships and soft-deleted
  households. Invitation acceptance currently looks up the invitation by hash;
  the management work must also reject acceptance for a soft-deleted household
  and must revoke its pending invitations in the same deletion transaction.

### Proposed contract and safeguards

- Add a household-scoped active-member read endpoint returning only the
  household members' required display fields, role, and membership dates. All
  reads require active membership and a non-deleted household; do not expose
  unrelated account data. Every role change is owner-only and targets an
  active membership in the explicit route household.
- Add a role-update endpoint restricted to `owner` or `member`. Enforce the
  “at least one active owner” invariant inside the database transaction, not
  only in the UI: lock the household/owner set, verify the caller remains an
  active owner, and serialize concurrent demotions/promotions. Reject a
  demotion that would leave no active owner. Do not add member removal in this
  slice unless separately approved.
- Reuse `POST /v1/households` for additional creation. Creating another
  household must not silently switch the active household. Refresh `/v1/me`
  and preserve the previous active selection. Existing API refresh rules remain
  authoritative if that selection is no longer a member.
- Household deletion is proposed as owner-only soft deletion (`deleted_at`),
  never physical cascading deletion in this first management slice. In one
  transaction, validate the owner and live household, mark it deleted, and
  revoke its pending invitations. Its active members lose access immediately;
  the household and dependent shopping/product rows remain stored but
  inaccessible through normal APIs, consistent with restrictive foreign keys.
  This requires an explicit destructive confirmation naming the household and
  explaining that all members lose access and shared list/data become
  unavailable. After success, refresh `/v1/me`: retain the current selection
  when it is still valid; otherwise follow the existing zero/one/multiple
  household rule (onboarding, automatic sole household, or selection). Every
  other member receives the same result at their next authoritative refresh.
- Add an owner-only active-invitation list that returns normalized recipient
  address and expiry, never `token_digest` or a code. Expire stale pending rows
  transactionally before listing. Keep existing create/revoke authorization.
  Reissue must mint a new random code and hash, and return the new raw code only
  once. Recommended contract: a dedicated transactional reissue operation
  locks the selected pending invitation, revokes it, and creates the
  replacement atomically, so failure cannot leave the recipient with an
  unexpectedly revoked invitation. The prior code is immediately invalid and
  cannot be recovered. Preserve verified-email matching, seven-day expiry,
  single-use acceptance, and never log/store the raw code outside the existing
  in-memory one-time UI snapshot.
- Scope every request to the household ID explicitly selected in its route;
  do not substitute the device's active household. Recheck session, household
  membership, role, and route identity when responses settle. A role demotion
  from owner clears/unmounts owner invitation state and invalidates pending
  invitation work.

### Future-slice tests and acceptance

- API/database integration: members can read only their own household's active
  member list; nonowners cannot list invitations, update roles, reissue/revoke,
  or delete; cross-household and removed-member requests are denied; soft-
  deleted households reject all normal reads/writes and invitation acceptance;
  deletion revokes pending invitations and preserves dependent rows; new
  household creation creates one owner and a shopping list without changing an
  existing selection; role races cannot remove the last owner; invitation list
  omits expired/revoked/accepted rows and never returns the digest; reissue is
  atomic, invalidates the old code, and returns only the replacement once.
- Mobile: create another household with the existing time-zone picker; verify
  active selection stays unchanged; list members/roles; show owner actions only
  to an owner; handle loading, empty, authorization, conflict, and retry states;
  require explicit named-household deletion confirmation; refresh selection
  after creation, role change, or deletion; suppress stale results after
  household/session/role changes; and exercise invitation revoke/reissue
  without retaining an old raw code. Cover the household-details People section
  with active member name/role rows and an owner-only Invite action, and verify
  pending invitations appear separately from active members.
- Physical iPhone acceptance: test with owner and member accounts, at least two
  households, create without changing the active household, role promotion and
  demotion, concurrent last-owner attempts, deletion consequences on all
  members, pending invitation expiry/revocation/reissue, old-code rejection,
  and shared-list access after deletion. Android remains a separate required
  device check before claiming Android acceptance. Cloud staging is not a
  prerequisite for this proposed local/API slice and remains separate.

## Decisions / open questions

- The approved native headers and VoiceOver Back announcement were confirmed
  by Felipe on iPhone. Android device acceptance remains outstanding.
- The approved current-slice defaults remain: household details show name,
  time zone, and membership role; centralized startup and successful household
  switching land at temporary Shopping while Plan remains the permanent future
  default.
- Actual-router coverage verifies the installed SDK 57 `CommonActions.reset`
  flow clears household-specific Profile history after a successful switch.
- No new dependency is proposed. Expo `Image`, `useUser`, existing themed
  controls, and existing API/hook state are sufficient. If implementation finds
  a meaningful SDK compatibility limitation, pause and revise this plan rather
  than adding a package ad hoc.
- Decisions needed before planning/implementing household management:
  (a) confirm the recommended soft-delete consequence: all members lose access
  immediately, related rows are retained but inaccessible, with physical purge
  and any restore flow deferred; choose whether retention should be indefinite
  or time-limited; (b) may any active owner delete the household, or should
  deletion require agreement from multiple owners (recommend any active owner
  with an explicit destructive confirmation); (c) may an owner demote themself
  when another active owner remains (recommend yes, but never demote the last
  owner); (d) should reissue immediately revoke the old code and atomically
  mint a new seven-day code shown once (recommend yes; the old code is
  unrecoverable); (e) confirm creating a household never changes the active
  household (recommended), and deletion follows the existing refresh-based
  zero/one/multiple selection rules; and (f) confirm which member identity
  fields other household members may see (recommend display name with email
  only as a fallback, scoped to that household).

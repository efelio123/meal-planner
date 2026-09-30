# Household Management: Implementation Plan

Status: the household-management plan and display-name/navigation additions are
approved. Implementation is in progress and remains uncommitted on
`feat/household-management`. The Clerk compatibility preflight completed on
2026-09-29: the Development instance has First and last name enabled, and the
resolved `@clerk/expo` 4.6.5 types support `firstName` on custom email-code
signup and `UserResource.update()`.

The earlier migration/integration run passed 50/50 against
`meal_planner_disposable_test` at `household_management_profiles (head)`. The
latest full API run, reported by Felipe, passed 56 tests with 0 skipped,
including the disposable-PostgreSQL integration tests. The latest mobile
normal and no-cache cold runs each passed 27 suites / 178 tests; TypeScript,
mobile lint, and `git diff --check` also passed. API Ruff passed in the earlier
implementation validation. Felipe reports that iPhone checks confirmed role
updates and pull-to-refresh work. This is limited acceptance evidence, not
complete device acceptance; broader iPhone checks, Android device testing,
native rebuild/smoke testing, and cloud staging remain outstanding.
The branch was created from `main` after PR #9 was verified merged and local
`main` was fast-forwarded to merge commit `fed3f0d`.

## Goal and scope

Give household members useful, household-scoped management in Profile while
keeping all shared product data owned by the household. Members can view the
household and active members, edit household settings if they are owners,
manage memberships and invitations according to role, create additional
households without changing the active selection, and use the owner-only
“Delete household” action.

This slice includes household details/editing, member list/detail, owner role
changes/removal, voluntary leave, invitation listing/revocation/reissue, and
owner-controlled household archival. It does **not** implement pantry,
meal-planning, saved-recipe, or other product-content modules. Shopping-list
items already exist and must remain household-owned. Any future pantry,
meal-plan, saved-recipe, and shopping data is also household-owned; creator
attribution is audit metadata, never ownership. Removing a user must not
remove or transfer shared content.

## Current baseline: existing versus new work

| Area | Already present | Required in this slice |
| --- | --- | --- |
| Household creation | `POST /v1/households` transactionally creates a household, its first `owner` membership, and one shopping list. `GET /v1/me` / `GET /v1/households` return the caller's active household summaries. | Create another household without changing the active selection, refresh membership, then open that new household's details so the user can explicitly choose whether to activate it. |
| Household schema | `households` already has `name`, IANA-name `time_zone`, `created_by_user_id`, timestamps, and `deleted_at`. | Add owner-only detail/update/archive service behavior and serialize archive against household writes. |
| Membership schema | `household_members` has role `owner`/`member`, `joined_at`, `removed_at`, and an active-only `(household_id, user_id)` unique index. | Read active member summaries/details; owner promotion/demotion/removal; member leave; concurrent last-owner protection. Preserve past membership rows on rejoin. |
| Invitations | Owner-only creation/revocation exist. v1 creation always invites `member`; codes are random, stored only as `token_digest`, expire after seven days, and are returned once. Acceptance checks verified normalized email and is single-use. Acceptance currently reactivates a prior removed membership row. | Read-only owner list of unexpired pending invitations, owner revoke, and atomic replacement-code generation. Reject creation/reissue for an email already active in that same household. Replace acceptance's reactivation behavior with a new membership row so old membership history remains intact. No code recovery: a replacement is a new code. |
| Mobile | Profile has My households, read-only details, explicit active-household selection, and the household-targeted invitation creation flow. A searchable IANA time-zone picker and shared themed controls exist. | Create/edit/detail/member/invitation-management and “Delete household” UI, role-aware visibility, and refreshed lifecycle protections. |
| Identity/profile | Clerk is the identity source. `resolve_current_user()` reads the verified email and Clerk first/last name on each protected request, synchronizes the local `display_name` and avatar, and currently substitutes `Household member` when Clerk has no name. The Profile card prefers Clerk's name, but its existing missing-name fallback must be replaced by the profile-completion gate before Profile screens are shown. | Require a non-unique display name for new accounts without changing email-code sign-in or introducing a username. Use it for the signed-in Profile card and member-facing profiles; route existing nameless accounts to profile completion before household/Profile screens. Keep member email server-projected to owners only. |

Existing authorization uses the route's explicit household ID; it must not be
replaced with the device's selected-household preference. Inaccessible or
unknown household/member resources should continue to be indistinguishable
(404) where doing so avoids membership enumeration. Input-shape errors remain
422; semantic/domain validation should follow the existing household API's
400 convention; owner-invariant and duplicate-active-invitation conflicts use
409.

## Household form navigation and refresh lifetime

Physical testing exposed a root-router lifecycle issue rather than an incorrect
form target. `HouseholdFormScreen` already targets the created/edited household
details route after `refresh()`, but `useHouseholdState.refresh()` currently
sets the app-wide destination to `loading` for every request. `RootNavigator`
then replaces the signed-in Expo Router `Stack` with a loading view. Once the
refresh resolves, centralized startup routing returns to the Shopping tab, so
the form's intended details navigation can be lost.

Change the shared refresh contract narrowly: an initial refresh for an
unvalidated Clerk identity still owns the root loading/API-error transition;
an explicit refresh for the already validated, unchanged account/session
keeps the current signed-in navigator mounted while authoritative data loads.
Apply valid same-session results normally, then derive the destination from
the response. If refresh fails during a create/edit action, do not tear down
the form or pretend the mutation failed; return an explicit refresh failure so
the form can explain that the save succeeded but its details could not be
refreshed and offer retry. On the next successful refresh, reconcile the
household list and route to the correct detail. If the response proves that
the current session lost access or the selected household is no longer valid,
normal destination/selection reconciliation still takes effect. Identity,
session, sign-out, refresh-generation, and membership-revision guards must
continue rejecting stale results and must not let an older refresh overwrite a
newer one. Do not weaken API-error handling for initial startup.

Navigation after successful writes is explicit:

- Create: after the create response and authoritative refresh succeed, replace
  the form route with the new household's details. Do not call `select()` or
  write the new ID to the selected-household preference. The existing active
  household remains active; the details page presents the normal explicit
  “Switch to this household” action.
- Edit: after the update and authoritative refresh succeed, replace the edit
  route with that same household's updated details route. Preserve its
  household ID and do not redirect to startup/Shopping.
- If the save succeeds but refresh fails, retain a recoverable form/result
  state; retry refresh without repeating the create/update request. A later
  household/session change invalidates the pending navigation.

The Expo SDK 57 Router guidance supports href-based `router.replace()` and
nested stack routes; the defect is unmounting the root navigator before that
navigation occurs, not lack of support for the destination. Use the actual
installed Expo Router `57.0.23` behavior, with no custom router or navigator
workaround.

## Display-name collection and Clerk compatibility

The installed mobile versions are Expo `57.0.25`, Expo Router `57.0.23`, and
`@clerk/expo` `4.6.5`. The existing auth form uses the installed Clerk
custom-flow `useSignUp().signUp.create()` API followed by email-code send,
verification, and finalization. Clerk's Expo documentation describes `firstName`
as a supported `signUp.create()` value when the instance's First and last name
profile setting is enabled. It also documents updating an authenticated
`UserResource` through `useUser().user.update()`. Keep email verification-code
sign-in unchanged; collect the new display-name field only on sign-up. Do not
change to a username or login handle. Current SDK 57 Router documentation
supports the existing `Stack`/href routing approach. Do not migrate to Clerk's
newer Future auth-resource API as part of this feature; use APIs supported by
the installed package and type-check against `4.6.5`.

Official guidance checked 2026-09-29: [Clerk Expo sign-up object](https://clerk.com/docs/expo/reference/objects/sign-up),
[Clerk Expo `useUser`](https://clerk.com/docs/expo/reference/hooks/use-user),
[Clerk Expo custom-flow quickstart](https://clerk.com/docs/expo/getting-started/quickstart),
and [Expo Router SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/router/).
The Clerk pages are current documentation; their API recommendations must be
constrained to the installed `@clerk/expo@4.6.5` legacy custom-flow surface,
not copied from newer hook shapes without checking local types.

Expected mobile/API touchpoints include `src/components/auth-email-code-form.tsx`
for signup-only collection; `src/hooks/use-household-state.tsx` and
`src/app/_layout.tsx` for same-session refresh and the completion destination;
the signed-in onboarding layout and a new completion route outside `(app)`;
the current Profile card and account/member response types; and API identity
resolution plus tests. Keep feature-focused screens/tests under the existing
`src/features/` locations. Do not relocate unrelated authentication or
onboarding code.

## Data and synchronization decisions

- Keep Clerk authoritative for account name, verified email, and profile
  image. Add nullable `users.avatar_url` in a handwritten Alembic migration.
  On each authenticated API request, synchronize the current user's
  `display_name` and `avatar_url` from Clerk even when their email did not
  change. Keep the existing active-email conflict rule and never accept these
  values from a mobile request. Member-list responses use this local snapshot;
  another member's edits become visible after that member's next authenticated
  API request. Do not add webhooks, background jobs, or per-member Clerk API
  fan-out in this slice. The mobile app renders the returned image URL or
  initials fallback.
- Require a user-chosen, non-unique display name for new email-code sign-ups;
  do not enable or collect a username/login handle. Collect one field labelled
  `Display name` and submit it as Clerk `firstName` with no `lastName` through
  the existing `signUp.create()` flow. Keep email-code verification and
  finalization unchanged. Approved name rules: trim input; require 1-80 Unicode
  characters; reject control characters; names are not unique. Existing users
  with a usable Clerk first/last name keep their combined name. The API reads
  Clerk `first_name`/`last_name` and synchronizes `users.display_name`, so the
  name reaches `/v1/me` and member profiles through existing profile sync.
- Implementation gate: before code changes, verify both that the development
  Clerk instance supports `firstName` for email-code signup and profile update,
  and that the installed `@clerk/expo@4.6.5` types/API accept the calls. The
  resolved SDK types currently expose `firstName`, but instance configuration
  has not been verified. If either check fails, stop and present an alternative
  for approval; do not enable usernames or improvise metadata or another
  storage location.
- Do not use email or `Household member` as a normal user-facing name. For a
  new signup, validate and trim the required display name before sending the
  email code and again at the trusted Clerk/API boundary. Approved validation
  is 1-80 Unicode characters after trim, no control characters, and no
  uniqueness requirement. `/v1/me` and member responses use the synchronized
  `display_name`; email remains a secondary account field and is returned for
  another member only to an active household owner. Keep the email-only legacy
  row backfill to a nonblank transitional value if required by the existing
  schema, but never present that value as a normal label.
- Existing Clerk accounts without a usable name complete a required profile-
  completion step on their next app visit before household/Profile screens;
  preserve the active Clerk session and do not sign them out. This behavior is
  approved. Implement the flow so protected API resolution returns a stable
  `DISPLAY_NAME_REQUIRED`
  conflict instead of exposing an email/generic fallback; the mobile state
  hook maps that code to a signed-in completion destination (not `api-error`),
  where the user submits a display name with Clerk `user.update({ firstName })`.
  After Clerk confirms the update, call the existing `/v1/me` refresh so the
  API synchronizes its local row, then let normal household routing proceed.
  Do not sign the user out, discard memberships, or add a name-update API
  endpoint. Apply the same gate to already-signed-in accounts on their next
  app visit. If profile update or sync fails, retain the completion form and
  show a retryable safe error.
- Profile uses the current display name as the primary label; never replace it
  with email or `Household member`. The email may remain as secondary account
  information and under My account. Member list/detail uses the database
  snapshot and avatar/initials fallback. If an existing member has no
  synchronized name because they have not yet returned to complete their
  profile, show exactly `Name not set yet` as the temporary primary label—never
  their email or `Household member`. Email remains visible only in the existing
  owner-authorized response. Owner-only email projection is a server rule, not
  a UI-only hide.
- Return a member's verified normalized email only when the requester is an
  active household owner. Enforce this in the server projection/response,
  never by returning it to members and hiding it in the UI. Do not return Clerk
  subject/provider identifiers or unrelated profile fields.
- Member list/detail identifies a membership by its household-scoped
  `membership_id`, and includes name, avatar URL (nullable), role, and
  `joined_at`; include `email` only for owners. `joined_at` denotes the start
  of the current active membership period.
- A removal/leave sets `removed_at`; it does not delete the membership row or
  shared data. The current `accept_invitation()` instead clears `removed_at`
  and reuses that old row. Replace that behavior: after locking and validating
  the invitation, accept only if there is no active membership, then insert a
  new active row with a fresh `joined_at`. Never clear the historical row's
  `removed_at` or overwrite its original `joined_at`. The existing partial
  unique index permits this. Integration tests must assert the old row is
  unchanged and the new membership has a new ID/date.
- The existing schema already supports household archival, member history,
  invitation status, invitation hashes, and all required roles. Other than
  `users.avatar_url`, do not add speculative columns or tables. Do not add
  composite parent keys unless a concrete new foreign key requires one.
- Units, recipe/pantry/meal-plan records, and catalog/content schemas are
  outside this slice. Shared content remains tied to `household_id` (directly
  or through a household-owned parent); `created_by_user_id` is optional
  attribution and does not confer ownership.

## Proposed API contract

All routes require a verified Clerk session. Resolve the caller to an active
local user, require active membership in the path household, and reject
soft-deleted households for normal access. Check owner role on the server for
every management endpoint; client-side hiding is only presentation.

Before normal protected API work, require a usable Clerk display name. For
existing accounts that lack one, return a stable `409` detail code
`DISPLAY_NAME_REQUIRED` (without returning an email-as-name or
`Household member` label). The mobile household-state layer maps that response
to a signed-in display-name-completion destination rather than `api-error` or
sign-out. No new name endpoint is needed: after the user updates their own
Clerk `firstName`, the existing authenticated `/v1/me` path synchronizes the
name to the local row. The profile-completion route stays outside the signed-in
tabs and is available only while Clerk is signed in and this requirement is
outstanding.

| Route | Access and behavior |
| --- | --- |
| `POST /v1/households` | Reuse existing contract for additional creation. It creates the owner and list but does not modify device-local selected household. |
| `GET /v1/households/{household_id}` | Active members receive household name, time zone, and their own role. |
| `PATCH /v1/households/{household_id}` | Owners only; accept name and/or IANA `time_zone`, validate nonblank name and `ZoneInfo` membership, update `updated_at`; members cannot edit. |
| `GET /v1/households/{household_id}/members` | Active members receive active member rows and roles. Only an owner receives email values. |
| `GET /v1/households/{household_id}/members/{membership_id}` | Same privacy rules, scoped to the active membership in this household. |
| `PATCH /v1/households/{household_id}/members/{membership_id}` | Owners only; body role is exactly `owner` or `member`. Serialize with the household lock and reject any operation that would leave zero active owners. |
| `DELETE /v1/households/{household_id}/members/{membership_id}` | Owners only; mark an active membership removed. Removing any owner must preserve an active owner. |
| `DELETE /v1/households/{household_id}/leave` | Any active member may leave. An owner may leave only if another active owner remains. This distinct household-level route cannot collide with `members/{membership_id}`; do not use `/members/me`. |
| `GET /v1/households/{household_id}/invitations` | Owners only and read-only. Return rows with `status = 'pending' AND expires_at > current time`, recipient/expiry/ID only; never return token digest or code. Do not change invitation status during GET. |
| `POST /v1/households/{household_id}/invitations` | Reuse existing owner-only, member-role, seven-day creation contract. Under the household lock, check for an active same-household member with this normalized email before generating a code; if found, create no invitation/code and return 409 `HOUSEHOLD_MEMBER_ALREADY_EXISTS`. Keep 409 `INVITATION_ALREADY_PENDING` distinct for an unexpired pending invite. |
| `POST /v1/households/{household_id}/invitations/{invitation_id}/revoke` | Reuse existing owner-only revoke behavior; cannot revoke another household's invitation. |
| `POST /v1/households/{household_id}/invitations/{invitation_id}/reissue` | New owner-only atomic operation for a live pending invitation. Under the household lock, recheck whether its normalized email is already an active member. If so, mint no code and return 409 `HOUSEHOLD_MEMBER_ALREADY_EXISTS`; do not replace the invitation. Otherwise revoke the old row and create a fresh seven-day invitation/code in one transaction; return replacement code once after success. The old digest/code remains invalid and unrecoverable. |
| `DELETE /v1/households/{household_id}` | Owners only; perform in-place soft deletion, return success only after deletion and invitation revocation commit. Never physically delete household-owned records. |

Where member leave/removal or household archive affects the active household,
the client refreshes `/v1/me` and follows existing zero/one/multiple household
selection behavior. Creating a second household preserves the existing
selection and opens the new household's detail route without selecting it.

### Invitation expiry and replacement failure semantics

Keep invitation listing a genuinely read-only GET. It filters stale rows out
using both pending status and `expires_at > current time`; merely displaying a
list never mutates database state. Expiry status is persisted transactionally
at write/acceptance boundaries: before creating an invitation, the creation
transaction marks an expired pending invitation for the same household and
normalized email as `expired`, then inserts the replacement; an attempt to
accept an expired code marks that row `expired` and commits that status before
returning 410. Structure acceptance to leave the transaction normally with an
`expired` outcome, then raise/translate to HTTP 410 only after commit; raising
inside the transaction would roll the status update back. If a reissue targets
a stale pending row, mark it expired and commit before returning an
expired/not-active result. Do not rely on a time-based partial unique index or
a scheduled job; the active-email partial unique index remains the final race
guard for create.

Before either create or reissue mints a random code, perform the active-member
lookup in the same household-locked transaction. Match the normalized
invitation email to an active local user and an active membership in that
explicit household only. Membership in a different household is irrelevant;
a former membership with `removed_at IS NOT NULL` is not active and remains
eligible for invitation. Return stable machine-readable 409 codes
`HOUSEHOLD_MEMBER_ALREADY_EXISTS` and `INVITATION_ALREADY_PENDING`, so the API
returns them in the existing FastAPI `detail` error envelope (for example,
`{"detail":{"code":"HOUSEHOLD_MEMBER_ALREADY_EXISTS"}}`). Extend the typed
API error with a recognized code parsed from that envelope; map only known
codes to safe UI copy and keep a generic fallback for unknown server errors.
On create, the active-member conflict inserts no invitation and mints no code.
On reissue it leaves the old invitation row unchanged and mints no replacement
code.

Invitation acceptance must repeat the active-membership check after the
household and invitation locks, immediately before insertion. This closes the
race where someone became a member after an owner created or began replacing
the invitation. If already active, insert no second membership; mark the now
redundant invitation revoked and commit, then return 409
`HOUSEHOLD_MEMBER_ALREADY_EXISTS`. Emit the HTTP conflict only after commit so
the revocation is not rolled back.

Reissue has an ambiguous transport-failure case: the database may commit the
new code and revoke the old one even if the mobile client never receives the
response. As soon as the owner starts reissue, hide and invalidate the old
code snapshot and disable its Copy action. On any failure, including timeout,
connection loss, or server error, never restore/present/copy that old code as
valid. Refresh the read-only invitation list to discover the currently active
pending invitation ID for the recipient; list refresh cannot recover its code.
Show that no code is available and offer a new replacement attempt for the
active invitation. If refresh also fails, keep all code-copy actions disabled
and provide Retry status. Only a successful reissue response may create a new
one-time in-memory code snapshot. This is deliberately conservative even when
the server definitely rejected before commit.

## Authorization, concurrency, and archival invariants

### At least one active owner

All owners have equal powers. A current owner may promote/demote/remove other
members and may leave or remove themselves subject to the same invariant.
Members may leave voluntarily; they cannot change roles or remove another
member. The last active owner cannot demote, leave, or be removed. This is a
server/database transaction rule, never just a disabled button.

Serialize **every** membership role/removal/leave mutation on the parent
household row: start a transaction, lock the live household row `FOR UPDATE`,
then re-read the caller's active membership/role and target's active
membership, count active owners, apply the change only if at least one remains,
and commit. All mutation paths must use this same lock first, including
promotion, so overlapping management actions have one consistent lock order.
Return 409 when an otherwise authorized action would remove the final owner.
Concurrent integration tests must prove no interleaving can leave a live
household ownerless.

### Archive versus membership, invitation, and content writes

Archiving sets `households.deleted_at` and revokes all pending invitations in
the same transaction. Keep every membership row and role/removal timestamp
exactly as it stood at the archive commit; do not mark members removed. Retain
the household, shopping list/items, and future household-owned data in place.
Archived households disappear from active household/member/invitation views;
all ordinary reads and writes, including invitation acceptance, return no
access. Do not expose an archived-household list or self-service restore. Rare
support-assisted restoration is future work; user-facing copy should say the
household and its shared content become inaccessible in the app, not promise
permanent erasure.

Archive must serialize against household-scoped writes. Use the same parent
household row lock before authorization and mutation for archive, membership
changes, invitation create/revoke/reissue/acceptance, and all household-owned
content writes (including the existing shopping-list add/toggle/remove
services). Each path must recheck `deleted_at IS NULL` and current membership
after acquiring the lock. This gives a clear ordering: an in-flight write may
commit before archive, in which case its row is retained; if archive commits
first, the later write is denied. Future pantry, meal-plan, recipe, and catalog
write services must adopt this contract before those modules ship.

Use one lock order to avoid deadlocks: household row first, then invitation,
membership, or content row. Invitation acceptance can first read the digest
without locking to learn the household ID, then lock the household, re-read
and lock the invitation, and revalidate pending status, expiry, live household,
verified normalized-email match, and single-use state before adding membership.
Replacement locks the household before the existing invitation; it revokes
and inserts atomically, so partial replacement cannot escape the transaction.

### Invitation code and deletion privacy

Pending-invitation listing exposes only the invited normalized email and
expiry/ID to owners. A generated code exists in server memory for its create or
reissue response, and in the app's existing in-memory one-time invitation
snapshot only; never persist it, log it, place it in navigation parameters,
analytics, or a database field. Manual sharing only—no mail delivery, links,
deep links, or automatic acceptance. If a recipient loses a code, the owner
must generate a replacement; do not attempt to retrieve a digest.

All user-facing action and confirmation copy must say **“Delete household”**;
never show “archive,” “soft delete,” or retention terminology. The confirmation
names the household and says that everyone will lose access to it and its
shared content, and that the action cannot be undone from the app. Do not say
that data is permanently erased or promise restoration. Do not show an archived
household list or self-service restore. Internal implementation remains an
in-place soft delete with dependent rows retained, and rare support-assisted
restoration is only a future possibility.

## Mobile route and state proposal

Keep Profile and the five-tab structure. Add routes under the existing Profile
stack, with supporting UI/hooks/tests under
`apps/mobile/src/features/household-management/`; app-wide themed rows,
controls, and infrastructure stay in their existing shared locations. Do not
reorganize unrelated auth/onboarding code.

- My households: existing list gains a Create household row/button. Its form
  reuses the searchable time-zone picker and shared themed input. On create,
  call the existing API, refresh `/v1/me`, verify the new household is in the
  refreshed authorized membership list, preserve the prior selected ID, then
  navigate to that new household's details. If the refresh shows the session
  or membership changed, do not navigate into stale details.
- Own Profile identity: show the signed-in user's display name only after the
  required-name gate succeeds. Do not use email or a generic member label as
  the primary name. Email may remain secondary account information.
- Household details: show editable values to owners, read-only values to
  members; show active people rows with photo/initials, name, role, and join
  date. Include an explicit Switch action only when the target differs from
  active selection. Owners get edit, invitation-management, member-management,
  and a “Delete household” action; members get member detail and Leave. Do not
  silently select on open.
- Edit household: owner-only name and IANA time-zone fields; discard or cancel
  behavior is explicit. Successful update refreshes authoritative household
  data and returns to its detail page.
- Member detail: route uses household ID plus membership ID; all active
  members see name, photo/initials, role, and join date. Only the server's
  owner-scoped response includes email. Owners can promote/demote or remove an
  active member; self-removal/leave is clearly labeled. Prevent accidental
  removal of the last owner with an actionable conflict message, while the
  API remains the authority.
- Invitations: keep the existing owner-only creation screen/safety behavior
  under the explicit household route. Add active pending invitation rows with
  recipient/expiry and Revoke/Reissue actions. Reissue invalidates the old
  one-time snapshot and displays the newly returned code once, requiring the
  owner to manually share it again. No management action implies email or URL
  delivery.
- Delete household: owner-only destructive flow names the route household,
  presents “Delete household,” explains that members lose access to the
  household and shared content, and requires deliberate confirmation. Then
  refresh `/v1/me`. If this was selected, use the existing selection rule and
  clear old household-specific Profile history so Back cannot reopen deleted
  household details or invitation/code state. UI copy must not mention
  archival, retention, permanent erasure, or a restore promise.

### Role-change invalidation and pull-to-refresh

The acting owner must see a confirmed promotion/demotion on the member detail
immediately, and the already-mounted household People list must show the same
confirmed role when the owner returns. Keep the member-detail API reload after
the successful role mutation and `/v1/me` refresh. Add a small
household-management-scoped in-memory People-list invalidation revision keyed
by authenticated context and household ID: increment it only after the role
mutation is confirmed by the server. The household-details route consumes that
revision on focus and reloads members only when it differs from the revision
represented by its list. Ordinary tab switches, unrelated route returns, and
failed role mutations must not trigger an extra request. A new reload advances
the request generation so an older pending list response cannot overwrite the
confirmed role.

Add pull-to-refresh to My households and household details. Use React Native
0.86.3's core `RefreshControl` through the existing `Screen`'s `ScrollView`;
the SDK 57 app resolves Expo 57.0.25 with React Native 0.86.3. `RefreshControl`
is controlled by its `refreshing` state and `onRefresh` handler. Extend `Screen`
only with optional refresh props and attach the control to its existing
vertical `ScrollView`; do not add another scroll container or change safe-area
ownership. Use the existing semantic theme tokens for the iOS tint and Android
indicator/background colors. No dependency or native configuration change is
needed. React Native for Web 0.21.2 does not implement `RefreshControl`, so keep
an accessible explicit Refresh/Retry action available on web rather than
claiming a pull gesture works there.

- My households pull and retry call the existing
  `useHouseholdState().refresh()` (`GET /v1/me`). On success the shared provider
  remains authoritative for membership roles, active-household selection, and
  Profile's household/name/role summary. Do not copy these fields into
  page-local state. If the active household is no longer authorized, retain the
  hook's existing selection reconciliation. During a refresh show a visible
  native indicator and an accessible “Refreshing households…” status. On
  failure, retain last-confirmed rows for continuity but mark them visibly
  stale with a safe retryable message; never imply the failed request refreshed
  them.
- Household-details pull first refreshes `/v1/me`, then verifies that the same
  route household remains in the returned active memberships. If it does, load
  that route household's active People list; the successful `/v1/me` result
  supplies current name, time zone, membership role, selected-household state,
  and whether owner controls are allowed. No request may silently substitute
  the device's selected household for the route ID. If membership was removed,
  stop before fetching People, hide stale household data/controls, and return to
  My households through the established route behavior.
- Show refreshing state and a safe retryable error if either `/v1/me` or the
  People request fails. Keep last-confirmed data visibly marked stale; disable
  owner-only management actions while the viewer's current role cannot be
  confirmed. If `/v1/me` succeeds but People loading fails, use its current
  role for controls but clearly mark only the People list stale. Retry repeats
  the failed authoritative refresh path, not a household mutation.
- Every refresh captures user/session identity, route household ID, selected
  household ID, role, and a monotonically increasing request generation. Only
  the latest still-authorized operation may commit data, clear its refreshing
  indicator, or set/clear its error. Sign-out, session/account changes,
  membership/role loss, household switch, route change, or a newer refresh
  invalidates older completions. The shared household hook's existing refresh
  ordering and same-session navigator-preservation rules remain authoritative.
- Use `RefreshControl` only where the screen has a vertical scroll surface
  (`Screen` already provides one). Test its controlled state and visible status
  with a rendered `Screen`, and manually verify the gesture and indicator on
  iOS and Android; native gesture behavior is not proven by Jest.

Official implementation references checked against the installed versions:
[React Native 0.86 RefreshControl](https://reactnative.dev/docs/0.86/refreshcontrol),
[Expo SDK 57 React Native mapping](https://docs.expo.dev/versions/v57.0.0/), and
[React Native for Web RefreshControl support](https://necolas.github.io/react-native-web/docs/react-native-compatibility/).

Every async screen request captures authenticated user/session identity,
household route ID, relevant member/invitation ID, role, and operation
generation. On session/sign-out, route household, role/permission, or screen
unmount changes, invalidate pending work and clear sensitive state. A late
response, error, optimistic rollback, or clipboard completion may not change
the new household's screen. Tab changes alone preserve mounted state and do
not trigger redundant requests. Explicit retry/refresh and legitimate
post-mutation refreshes remain available. A household switch is committed only
after `useHouseholdState().select(householdId)` succeeds; cancellation and
failure do not navigate. Keep the existing preference-serialization and
sign-out/account-switch protections in that hook.

## Migration and implementation sequencing

1. Once approved, review/freeze API schemas and response privacy first. Add a
   handwritten Alembic revision to add nullable `users.avatar_url` and
   backfill exact email-equals-display-name legacy rows to `Household member`;
   no ORM or autogeneration. Confirm existing `households.deleted_at`, membership
   `removed_at`/role/joined_at, invitation status/digest/expiry, and shopping
   tables need no structural changes. No dependency, provider, cloud, or
   environment changes are proposed.
2. Implement the approved Clerk display-name collection/completion contract
   before exposing signed-in household routes. Reuse `users.display_name`;
   retain only a transitional database placeholder where the existing nonblank
   constraint requires it. Add no username and no name-update API endpoint.
   Then implement profile synchronization and household/member read services,
   followed by
   write/update/leave/role/archive transactions with a shared household-lock
   helper. Update existing shopping-list mutations and invitation acceptance
   to follow archive serialization and the lock order. Keep creator attribution
   unchanged and do not cascade-delete content.
3. Add invitation listing/revoke/reissue service/API and prove one-time code
   behavior before mobile controls.
4. Implement Profile routes/screens incrementally, reusing the current theme,
   time-zone picker, API client, and household state. Add no new package unless
   implementation finds a concrete need and Felipe approves it separately.

## Focused validation

### Disposable PostgreSQL only

Run migration and integration coverage only after locally setting
`DATABASE_URL` to the explicitly named `meal_planner_disposable_test` database
from `services/api/README.md`. Before migrations/tests verify the URL's database
name and `SELECT current_database()` both exactly equal
`meal_planner_disposable_test`. Never connect to/reset `meal_planner_dev`; do
not print credentials. Run `uv run alembic -c alembic.ini upgrade head`,
`uv run alembic -c alembic.ini current --check-heads`, then `uv run pytest`.
Skipped DB tests are not evidence of tenant isolation.

Migration/constraint tests: avatar nullable and profile sync; household role
and time-zone/name constraints unchanged; active-only membership uniqueness;
membership history after removal and rejoin; invitation state/hash constraints;
archival preserves exact household/member/shopping/invitation history except
pending invitations become revoked; archived household data remains stored.

API integration tests cover:

- Owner/member household and member-detail reads; only owners see email;
  returned member IDs, privacy-safe names, nullable photos, roles, and join
  timestamps are scoped to active membership. A signed-in caller whose Clerk
  profile has only email must receive 409 `DISPLAY_NAME_REQUIRED` before a
  protected response or write, never an email/generic fallback. Named-member
  projections show their synchronized display name; an existing nameless
  member not yet returned to complete their profile is labelled `Name not set yet`,
  never with email or `Household member`; email remains owner-only. Seed
  a legacy row with `display_name = normalized_email` and prove it cannot be
  returned as a normal member name. Cross-household, removed-member,
  unknown/malformed ID, and deleted-household reads/writes cannot reveal or
  alter target rows.
- Additional household creation creates owner/list, returns route-ready data,
  and leaves the current selected-household preference untouched on mobile.
  Owner rename and valid IANA-zone update succeed; member/foreign-owner edits
  fail; invalid body shape/time zone follows 422/400 contracts.
- Owners promote/demote/remove; members cannot; member and owner leave paths
  preserve history. Reacceptance after removal creates a new membership ID and
  `joined_at`, leaving the prior `removed_at`/`joined_at` row unchanged.
  Last-owner demote/remove/leave returns conflict, including two independent
  PostgreSQL connections concurrently attempting to remove or demote the final
  two owners; at least one owner remains.
- Archive revokes pending invites and retains household, memberships exactly
  as at archive, shopping list/items, creator attribution, and other existing
  rows. Both API outcomes of a controlled archive-versus-shopping-write race
  are valid only when the write linearizes before archive or is denied after;
  no mutation commits after archive. Invitation creation, acceptance, revoke,
  reissue, and archive races obey the same lock order. The old invitation code
  fails after reissue/archive and no response exposes a digest.
- Pending list is read-only and omits expired/revoked/accepted invitations.
  Creation expires a stale same-email row before inserting so the pending-email
  unique index permits a replacement; expired-code acceptance commits the
  expired status before returning. Reissue is atomic, generates a new code
  once, and preserves the old code's invalidity. Verified-email match and
  single-use acceptance remain enforced.
- For an email already on an active membership in the target household,
  creation returns 409 `HOUSEHOLD_MEMBER_ALREADY_EXISTS` before token
  generation and inserts no invitation; reissue returns the same conflict,
  mints no replacement code, and leaves the pending row unchanged. Separate
  this from 409 `INVITATION_ALREADY_PENDING`. A same email active only in a
  different household and a removed former member remain eligible. If the
  recipient becomes active after invitation creation, acceptance rechecks
  under the household lock, adds no membership, revokes the redundant invite,
  commits, and then returns the member conflict. Assert membership counts,
  invitation status, and token-generator calls for each case.

### Mobile automated coverage

- Actual-router create test: complete household creation while the signed-in
  navigator is mounted, verify the new household details route is visible, and
  verify the prior active household ID remains selected and the new household
  is not activated. This must fail if refresh briefly unmounts the app and
  centralized startup returns to Shopping.
- Actual-router edit test: edit the current details route's household name or
  time zone, resolve the refresh, and verify navigation returns to that same
  household's updated details. Assert there is no startup/Shopping redirect.
- Create/edit form loading/validation/failure/success, refresh-failure retry
  without repeating a committed mutation, owner/member edit visibility, and
  invalidated navigation after household/session changes.
- Member list/detail loading, empty/error/retry, photo/initial fallback,
  join date/role presentation, email visibility based on server response, and
  no owner controls for members. Promote/demote/remove/leave and conflict UX.
- Acting-phone role refresh: promote and demote a member, verify the member
  detail shows the confirmed role, go Back, and verify the already-mounted
  household People list shows that role. Assert ordinary tab switches and
  returns without a successful role mutation do not fetch members again; a
  failed mutation must not advance the People-list invalidation revision.
- My households pull/retry must call `/v1/me` and update household roles,
  selected-household state, and the Profile card from one provider result.
  Verify the current household's refreshed role appears on Profile. Household
  details pull must refresh `/v1/me` before the route-scoped People request and
  update household fields, People roles, and owner-only controls consistently;
  preserve the active selection unless the authoritative response invalidates
  it.
- Refresh-control tests cover the visible/accessible refreshing state, both
  safe failure messages, retry, and stale-data labeling. A `/v1/me` failure
  must not trigger the People request or imply current roles; a People failure
  after `/v1/me` succeeds leaves only that list marked stale. Test role loss
  removes owner controls after refresh.
- Deferred refresh races: start My households or details/People refresh for
  household A, switch to B or sign out, then resolve/reject A's `/v1/me` and
  People requests. None may overwrite B/Profile roles, clear B's refreshing
  indicator, or change B's error. Cover overlapping refreshes and ensure only
  the latest authorized generation commits. Also verify stale marked lists do
  not enable owner-only actions when role confirmation failed.
- Exercise the feature-scoped invalidation revision with actual nested-router
  focus behavior: revision changes while member detail is above household
  details; returning to details performs exactly one People reload and displays
  the confirmed role. A stale in-flight People response must not beat that
  reload. No revision means no focus-triggered request.
- Email-code sign-up collects and validates a required display name before
  sending the code, passes it through the installed Clerk sign-up API, and
  preserves code verification/finalization. Sign-in remains email-code only
  and has no name step.
- Existing named Clerk accounts proceed without a prompt. Existing accounts
  lacking a name are routed to display-name completion before household UI;
  successful Clerk `user.update()` followed by `/v1/me` refresh synchronizes
  the name. Update/sync failure remains retryable without losing the session.
- Profile and member-list/detail show the normalized display name as the
  primary label. A legacy member without a synchronized name displays exactly
  `Name not set yet`, never email or `Household member`; email may remain
  secondary account information and is returned for other members only in
  owner-authorized server responses. Email-only/malformed Clerk profile tests
  verify the
  `DISPLAY_NAME_REQUIRED` path and that no protected route leaks a fallback.
- Actual-router coverage includes cold launch and returning sessions for
  profile completion, completion before household onboarding/app, successful
  completion returning to normal household destination, cancel/sign-out, and
  retry after update or `/v1/me` failure.
- Invitation list/expiry, create/revoke/reissue, code snapshot replaced only
  on success, no raw code persistence/logging/navigation. Deferred tests must
  model a server-committed reissue whose response is lost: hide/disable the old
  code immediately, refresh to find whichever pending invitation ID is now
  active without exposing its code, and require another replacement before any
  code can be shown/copied.
  Also test definitive failure, refresh failure/retry, and that stale responses
  cannot restore the old snapshot.
- Invitation API/UI tests: creation and reissue for an already-active member
  return the distinct member conflict, create/mint no code, and do not conflate
  it with the existing-pending-invitation conflict. The exact active member in
  this household is blocked; an active member of a different household and a
  former removed member are eligible. In an acceptance race where membership
  becomes active after invitation creation, acceptance creates no duplicate,
  revokes the redundant invitation, returns the member conflict, and commits
  the revocation. UI maps the active-member conflict to exactly “This person is
  already a member of this household.” while retaining a separate pending-
  invitation message.
- “Delete household” confirmation/cancel/success/error; refresh and
  route-history cleanup. Assert the UI does not use internal archive/retention
  wording or promise permanent erasure;
  cross-user access loss after next refresh; household content remains shared.
- Actual-router tests for details/member/invitation nested Back paths, explicit
  switch to the centralized Shopping startup destination, stale Profile history
  cleanup, and sign-out/session changes. Deferred-request tests across household,
  session, role loss, route close, and archive verify stale success/failure,
  optimistic rollback, and invitation snapshots cannot bleed into another
  context. Test member leave/archive while shopping requests are pending.
- Run mobile tests normally and cold, TypeScript, lint, `git diff --check`, API
  Ruff and Pytest, migration head checks, and required Expo compatibility
  checks if code/package changes warrant them. Do not claim PostgreSQL
  authorization tests pass if they skipped.
- This pull-to-refresh/invalidation follow-up is mobile-only: it adds no API,
  database, migration, dependency, or native configuration behavior. Do not
  rerun the full disposable-PostgreSQL suite for this focused change unless
  implementation reveals a concrete database-behavior change.

### Physical-device acceptance

On iPhone, use owner and member accounts and at least two households: create a
second without changing active selection; edit name/time zone; inspect member
identity, role, join date, and owner-only email; promote/demote/remove; leave;
exercise invitation list, revoke, replacement code/manual sharing and old-code
rejection; confirm a member can still use the shared shopping list after
another user's removal; use “Delete household” and verify every member loses
access. Do not describe internal retention or promise permanent erasure in the
UI. Test cancel/error/retry, nested headers/Back, safe areas, light/dark
appearance, and VoiceOver for the new controls. Re-run key flows on Android
before claiming Android acceptance.
Felipe has reported iPhone checks confirming role updates and pull-to-refresh
work. Other listed device scenarios have not been claimed as tested.
Pull to refresh My households and household details on iOS and Android. Confirm
the indicator is visible and theme-appropriate, current membership/active-role
data updates on the acting phone, and the People list reflects a just-confirmed
promotion/demotion after returning from member detail. From a second phone,
change a role and explicitly pull to refresh the first phone; confirm household
rows, Profile role, details, and owner controls update together. Trigger and
retry a network failure, then switch household/sign out during a delayed
refresh and confirm no stale content replaces the new session/household. No
live updates on other phones are expected in this slice.
Native rebuild/smoke testing remains a prerequisite if the implementation
changes native configuration or packages; cloud staging is separate and not a
prerequisite for this local/API slice.

## Explicitly deferred requirements and implementation gate

- Approved display-name product choices: names are non-unique; validation is
  trimmed 1-80 Unicode characters with control characters rejected; existing
  nameless users complete their name on their next app visit without sign-out;
  existing users with a usable Clerk first/last name keep their combined name.
  A legacy member who has not yet returned to complete their profile is shown
  as `Name not set yet`, never by email or `Household member` as the primary
  label.
- Clerk compatibility preflight passed before implementation: the Development
  instance has First and last name enabled, and resolved `@clerk/expo` 4.6.5
  types expose `firstName` for signup and signed-in `UserResource.update()`.
  The approved implementation maps the app display name to `firstName`; it
  does not enable usernames or use metadata as an alternate storage location.
- Public-release account deletion and a defined retention/purge policy are
  separate required work, not delivered here. Before release, decide what
  happens to shared household content, attribution, invitations, backups, and
  archived households when an account is deleted; define retention/purge
  periods and any support/legal requirements. Existing `users.deleted_at` is
  not an account-deletion product flow.
- Archived-household retention duration and operational support-restoration
  policy remain undefined. There is no archived-household listing or
  self-service restore in this slice.
- Cloud provider/staging selection and deployment remain a separate plan.
- Invitation email delivery, URLs, and deep links remain deferred; sharing is
  manual. Code replacement is available because hashes cannot recover a lost
  code.
- Pantry, meal plans, saved recipes, nutrition/catalog expansion, and any
  user-owned product-data model remain outside this slice.

The approved display-name, refresh, and navigation behavior is being
implemented on this branch. If code review finds that account or retention
choices are required to implement a safe operation, pause for Felipe's
decision instead of inferring permanent deletion or erasure.

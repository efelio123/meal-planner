# Household-owner invitation UI plan

Status: draft for review; no implementation is approved yet.

## Goal and scope

Let an active household owner create a member invitation from the mobile app, see its expiration, and copy its one-time invitation code for manual sharing. Explain that the recipient must sign up or sign in using the invited email, then enter the code in the existing Join a household screen. The API remains authoritative for owner authorization, verified-email matching, seven-day expiry, and single-use acceptance.

This is a mobile/API-client code-only slice. Do not add invitation URLs or deep links, email delivery, Clerk Organizations, API/schema changes, cloud deployment, or persistence for invitation codes. Record links as a later follow-up: a shareable URL should open the app and preserve/prefill the code through authentication, but opening it must not accept the invitation. Link routing and behavior when the app is not installed require a separate approved plan.

## Safe branch preparation

The shopping-list implementation and opt-in startup diagnostics have since been separated into focused commits on `feat/household-shared-shopping-list`; the branch is still awaiting review and merge. The roadmap accurately describes the feature as committed but incomplete. Keep this invitation plan a draft and do not start its implementation from the shopping-list branch.

Before invitation implementation, finish review of the shopping-list PR and merge it through the normal review process. Then fetch/update `main`, verify it contains the merged shopping-list work and has a clean working tree, and create `feat/household-owner-invitation-ui` from that updated `main`. If the prior feature is not merged or the working tree is not clean, pause rather than basing a separate feature on an unmerged or dirty tree. This document remains unapproved; wait for Felipe's explicit approval before implementing it.

## Existing contract and user flow

The existing API route is `POST /v1/households/{household_id}/invitations`, with `{ "email": "..." }`. It returns `{ "invitation": { "id", "expires_at", "code" } }`; the code is returned only at creation. The service accepts invitations only from active owners, always assigns the `member` role, normalizes the email, expires stale pending invitations transactionally, rejects a duplicate active invitation with `409`, and sets expiry to seven days. The existing join flow posts the raw code in the JSON body to `/v1/invitations/accept`; backend acceptance requires the signed-in user’s provider-verified normalized email to match and is single-use.

Proposed owner flow:

1. In the selected household’s shopping-list screen, show an “Invite a household member” action only when the selected membership role is `owner`.
2. Open an in-app invitation screen. Collect and validate an email, then submit through the typed API client using the selected household ID and a fresh Clerk token.
3. On success, show the normalized recipient-facing instruction, the copyable code, and a readable expiration date/time. Keep the code available for recopy only while this screen remains active.
4. If the owner gets `409`, explain that an active invitation already exists and its code cannot be retrieved by this request; use the code previously shared or wait until it expires. Do not suggest creating another invite or expose backend details.
5. The recipient manually enters the code in the existing join screen and signs up/signs in with the invited email. The server performs the final email, expiry, membership, and single-use checks.

## Proposed files and changes

- `apps/mobile/src/lib/api.ts`: add invitation response types and `api.createInvitation(getToken, householdId, email)`, preserving the existing per-request Bearer-token behavior and safe `ApiError` handling.
- `apps/mobile/src/app/(app)/index.tsx`: add a themed owner-only entry action without changing shopping-list behavior.
- `apps/mobile/src/app/(app)/invite-household.tsx` (new): implement the email form, pending state, validation/error/success presentation, expiration display, and explicit copy action using the existing `Screen`, `ThemedText`, `ThemedInput`, and `PrimaryButton` patterns.
- `apps/mobile/src/app/(app)/_layout.tsx`: register the screen in the existing Expo Router stack if required by the typed route setup; keep the current app-group route protection.
- `apps/mobile/src/lib/api.test.ts`: cover invitation URL/method/body, fresh Bearer token, success response shape, and relevant error statuses.
- `apps/mobile/src/__tests__/invite-household.test.tsx` (new): cover owner/member availability, email validation, loading, successful creation/instructions/expiry, copy success/failure, duplicate invitation, other API/network failures, and stale completion behavior.
- `apps/mobile/package.json` and lockfile: add the SDK-compatible Expo clipboard module only if approved with this plan; no other dependency changes.

No backend, database, migration, authentication, or environment-file changes are planned.

## State, security, and error decisions

- The creation response’s raw code may exist only in component memory and the user-requested system clipboard. Never put it in AsyncStorage, logs, analytics, crash metadata, test output, or route/navigation params. Do not pass it to a share URL or analytics event. Clearing/unmounting the screen discards app-held code state; clipboard content is an explicit user action and is outside app-managed persistence.
- Capture the selected household ID and a request generation when creation starts. On household change, sign-out, or unmount, invalidate pending work and clear code/expiration state. A late success or failure from the old household must not display its invitation or overwrite the new household’s validation/action state. Never retry automatically.
- Hide the entry action for `member` memberships and guard the invitation screen against a missing/non-owner selected household. This is usability only: the server’s owner check remains the security boundary.
- Keep an invitation success visible until the user leaves or changes household, allowing another copy action. While a subsequent valid request is pending, retain the previous success; replace it only when the new request succeeds. On validation/API failure, keep the previous code and expiry available while showing the new error separately. Test this so a failed second invitation cannot destroy the only copyable code the owner has.
- Map `422` to an email-format correction, `409` to the existing active-invitation explanation, and other/network failures to a safe retry message. Preserve server response bodies and codes out of UI/logs. Disable duplicate submissions while pending; do not add retries or alter backend conflict semantics.
- Format `expires_at` as a localized date/time while retaining the original timestamp for state. If the server returns an invalid timestamp, show a safe generic expiry label and report the API contract issue only in tests/development diagnostics without including the invitation code or email.

## Documentation/version check

The app currently resolves Expo SDK `~57.0.19` and React Native `0.86.3`; `expo-clipboard` is not currently in `apps/mobile/package.json`. Expo’s official SDK 57 clipboard reference lists `expo-clipboard` `~57.0.2`, supports iOS/Android, and documents `Clipboard.setStringAsync()` for copying text; the module is included in Expo Go. If approved, install with `npx expo install expo-clipboard` so the project selects the SDK-compatible version. No implementation has been performed and no package has been installed.

## Focused validation

- Unit/API-client tests verify a fresh Clerk token, exact household-scoped URL, `POST` JSON email body, returned invitation shape, and safe behavior for `409`, `422`, and server/network failures.
- Screen tests verify member users do not see or use the owner action; malformed/blank email does not submit; pending state prevents duplicate requests; success shows recipient instructions, expiration, and copy action; copy invokes the clipboard only after an explicit tap and gives safe feedback; clipboard failure is visible; duplicate invitation and generic failures are actionable.
- Deferred-promise tests switch from household A to B or sign out while invitation creation is pending, then resolve/reject A’s request and assert A’s code/expiry/error are never shown in B’s state. Assert the code is not passed through router params or storage/logging interfaces.
- Run mobile Jest normally and cold, TypeScript, lint, and `git diff --check`. No database integration tests should be needed because the API/database contract is unchanged.

## Physical-device acceptance

On a physical iPhone and Android device using the local API with PostgreSQL reachable:

1. Sign in as the owner, create an invitation for a second test account’s verified email, and verify the screen shows the expiration and recipient instructions.
2. Copy the code, paste it into the recipient’s device manually, and verify it remains usable after leaving the owner screen. Confirm no app logs or navigation state contain the raw code.
3. On the recipient device, sign up/sign in using exactly the invited email, enter the copied code, and verify the household becomes selected.
4. Add an item to the shared shopping list from one device and verify it appears on the other; check it on one device and verify the updated state on the other.
5. Repeat a wrong-email attempt and an expired/duplicate invitation scenario where test data permits; verify safe, understandable messages and no cross-household data access.

The prior local API failure showed PostgreSQL connection timeouts can prevent `/v1/me`; ensure the local database is reachable before interpreting a device-flow failure as an invitation UI defect. Cloud staging remains separate from this slice.

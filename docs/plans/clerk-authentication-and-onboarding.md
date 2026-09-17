# Clerk authentication and household onboarding plan

## Goal

Implement the approved first-beta authentication and onboarding flow with Clerk:
passwordless email verification codes, local user provisioning, household
creation, and development-only copyable invitation codes. The API remains the
authority for household membership and tenant access.

## Confirmed Clerk approach

- Use Clerk's Expo SDK with a custom email-code flow. Do not enable passwords,
  magic links, social sign-in, hosted browser authentication, or deep links.
- Enable Clerk's **Native API** in the development instance's **Native
  applications** settings before testing the Expo flow. Native API is required
  for a native application; enabling it also changes Clerk's bot-protection
  posture, so this is an intentional development-instance configuration step,
  not an SDK default to assume.
- Use the official Python `clerk-backend-api` SDK at version 6 or newer for the
  FastAPI verification boundary. Do not hand-roll JWT validation or use Clerk's
  Backend API to render authentication screens.
- Before implementation, recheck Clerk's official documentation against the
  exact resolved SDK versions. Current Clerk documentation identifies
  `@clerk/expo` 3.4.2+ and `clerk_backend_api` 6.0.0+ as current version floors.

## Dependencies

Add only these dependencies after the Clerk development instance exists:

- Mobile: `@clerk/expo` (3.4.2 or newer) and `expo-secure-store`, installed
  with `npx expo install` so Expo SDK 57 selects compatible versions.
- Mobile preference: `@react-native-async-storage/async-storage` for the
  non-secret most-recent-household ID. It must never store Clerk tokens, raw
  invitation codes, or verified identity data.
- API: `clerk-backend-api` (6.0.0 or newer). Keep the existing SQLAlchemy,
  Alembic, and Psycopg dependencies; do not add a second JWT library.
- Development transport only: if the team chooses a LAN `http://` API for an
  Android development build, add `expo-build-properties` with `npx expo
  install`. Configure `android.usesCleartextTraffic: true` only for that
  development build/profile. Prefer an HTTPS development endpoint instead when
  practical, and never carry this exception into a production build.

Do not add `expo-auth-session`, `expo-crypto`, `expo-web-browser`, OAuth
packages, or deep-link packages for this email-code-only slice.

## Clerk development setup

After explicit authorization to create a Clerk account/instance:

1. Create a Clerk development instance. In **Native applications**, enable
   **Native API**. In the authentication settings, enable email verification
   codes as the only sign-in/sign-up method for this feature.
2. Configure native application identifiers when creating a development build;
   do not configure universal links or invitation deep links.
3. Keep these **mobile build-time values** in an ignored local environment file
   or equivalent local build configuration. Expo intentionally embeds
   `EXPO_PUBLIC_*` values in the client bundle, so neither value is a secret:

   ```text
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
   EXPO_PUBLIC_API_BASE_URL=http://<computer-lan-ip>:8000
   ```

   Pass `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` explicitly to `ClerkProvider`; do
   not rely on the SDK discovering it from `node_modules`. Validate
   `EXPO_PUBLIC_API_BASE_URL` as an absolute `http` or `https` origin and do not
   append or accept a client-supplied alternate base URL.
4. Keep server-only values exclusively in ignored API environment settings:

   ```text
   CLERK_SECRET_KEY=sk_...
   CLERK_ISSUER=...
   CLERK_AUDIENCE_OR_AUTHORIZED_PARTIES=...
   CLERK_JWKS_OR_PUBLIC_KEY_SOURCE=...
   DATABASE_URL=postgresql+psycopg://...
   ```

   `CLERK_SECRET_KEY` and API verification configuration must never be exposed
   through `EXPO_PUBLIC_*`, returned by an endpoint, or placed in mobile build
   configuration. The exact verification-variable names will follow the
   resolved official Python SDK configuration rather than inventing a second
   configuration scheme.
5. Document the variable names, their owning application, and exact local
   development commands in the API/mobile READMEs without recording values. No
   `.env` file, token, key, or personal email address is committed.

## Local development on a physical device

- Run the FastAPI development server bound to the computer's LAN interface, not
  loopback only, and set `EXPO_PUBLIC_API_BASE_URL` to the computer's reachable
  LAN IP and API port (for example, `http://192.168.1.25:8000`). `localhost`
  on an iOS or Android device refers to that device, not the development
  computer.
- Keep the phone and computer on the same trusted Wi-Fi network, permit the
  chosen API port through the local firewall for that private network, and
  verify the phone can reach `GET /v1/health` before testing sign-in.
- Expo's development server may use its normal LAN mode. A tunnel can help only
  when LAN development-server connectivity is restricted; it does not make a
  loopback-only FastAPI server reachable. Do not expose the API publicly for
  this slice.
- **HTTP transport caveat:** Android 9 and later deny cleartext HTTP by default.
  A LAN `http://` API therefore requires the narrowly scoped, development-only
  `usesCleartextTraffic: true` setting described above and a rebuilt Android
  development client, or an HTTPS development endpoint. Verify the generated
  Android development manifest has the exception and that no production build
  configuration enables it.
- Test iOS on a physical device early. If App Transport Security rejects the
  LAN `http://` endpoint, use an HTTPS development endpoint; do not weaken ATS
  or production transport settings merely to support local development.

## Mobile implementation

1. Add the Clerk and SecureStore config plugins to `apps/mobile/app.json` and
   wrap the Expo Router root layout in `ClerkProvider`.
2. Pass `tokenCache` from `@clerk/expo/token-cache` to `ClerkProvider`. This is
   Clerk's SecureStore-backed token persistence; do not write a duplicate token
   cache or read/write session tokens directly.
3. Build custom email-code sign-up and sign-in screens with Clerk's current
   `useSignUp`, `useSignIn`, and session hooks. Handle loading, invalid/expired
   code, resend cooldown, offline, and signed-out states without exposing
   provider errors verbatim.
4. After Clerk reports a signed-in session, obtain a session token through the
   Clerk SDK for each API request and send it only as `Authorization: Bearer`.
5. Call `GET /v1/me` after session restoration. Route a user with no active
   household to create-household or manual invitation-code entry; route others
   to the authenticated household area.
6. Persist only the most-recent household ID in AsyncStorage. Every API request
   that uses it sends the household ID and is reauthorized server-side against
   active membership; stale or removed selections return to household choice.

## FastAPI authentication boundary

1. Add an application configuration module for trusted Clerk settings. It reads
   values only from process environment and validates that expected issuer,
   audience/authorized parties, algorithm policy, and JWKS/public-key source
   are configured; it never derives them from token claims or request input.
2. Add one FastAPI dependency that extracts exactly one Bearer token from the
   `Authorization` header and delegates verification to Clerk's official
   `authenticate_request()` support. It produces a narrow verified
   `CurrentIdentity` (`provider="clerk"`, Clerk subject, verified session
   context) or the consistent API `401` response.
3. Reject missing/malformed headers, unknown key IDs, disallowed algorithms,
   bad signatures, expired/not-yet-valid tokens, and issuer/audience/authorized
   party mismatches. Never log raw bearer tokens, headers, Clerk responses, or
   secrets.
4. Keep this dependency independent from household access. A separate reusable
   service/repository helper checks `household_members.removed_at IS NULL` for
   every household-scoped operation.
5. Layer a reusable `require_current_user` dependency/service over verified
   identity. Every protected route that needs local application state invokes
   it, so it provisions or resolves the local user before route logic runs;
   `GET /v1/me` is a consumer of this contract, not a prerequisite for it.
   The result is a local `CurrentUser` plus verified identity. Routes then add
   household authorization only when they operate on a household.

## Local user provisioning

- `require_current_user` maps Clerk's stable user ID to
  `users.identity_provider = 'clerk'` and `users.identity_subject` on every
  protected local-data route. `GET /v1/me` uses that same service and therefore
  cannot be relied on as a one-time provisioning call.
- On first sign-in or provider-profile refresh, use the trusted Clerk user
  resource to obtain the provider-verified normalized primary email and display
  name. Do not accept these values from the mobile request or assume an email
  claim is present in every session token.
- Concurrent first sign-ins use a transaction/savepoint around insert and a
  re-read on the `(identity_provider, identity_subject)` conflict path, returning
  one local user rather than an error or duplicate.
- A user with `deleted_at IS NOT NULL` returns a deliberate account-deleted
  outcome and is never silently reactivated. A changed verified email is written
  only when it does not conflict with another active local user; otherwise return
  a safe conflict response and leave the existing local email unchanged.

## API operations

| Route | Authorization and behavior |
| --- | --- |
| `GET /v1/me` | Valid Clerk session; resolves/provisions the local user and returns user plus active households/onboarding state. |
| `GET /v1/households` | Valid Clerk session; resolves/provisions the local user, then returns only active memberships. |
| `POST /v1/households` | Valid Clerk session; resolves/provisions the local user, validates name and IANA time zone, then transactionally creates the household and its first `owner` membership. |
| `POST /v1/households/{household_id}/invitations` | Active `owner` only; always creates a `member` invitation with a server-set seven-day lifetime and returns the raw development code once. The database stores only its digest. |
| `POST /v1/households/{household_id}/invitations/{invitation_id}/revoke` | Active `owner` only; resolves/provisions the local user and revokes a pending invitation. |
| `POST /v1/invitations/accept` | Valid Clerk session; resolves/provisions the local user, receives the raw code in the JSON body, requires the recipient's Clerk-verified normalized email to match, and atomically accepts/reactivates membership. |

For development codes, generate high-entropy random values, store a one-way
digest only, compare safely, return the raw value only at creation, and never
place it in a URL, route parameter, client persistence, or logs.

Set `expires_at` to seven days after creation using the database/application
transaction clock, not a client value. Acceptance must lock the matching
invitation row (`SELECT ... FOR UPDATE`) or use an equivalent conditional update
whose predicate still requires `status = 'pending'` and `expires_at > now()`.
Inside the same transaction, re-check the status and expiry, change a stale
pending invitation to `expired`, and otherwise create/reactivate the membership
and mark that invitation `accepted`. This ensures two concurrent acceptance
requests cannot both succeed or create duplicate active memberships.

## Tests and validation

- Unit-test the Clerk boundary with a fake Clerk client/JWKS verifier for valid
  claims and missing/malformed tokens, bad issuer/audience/authorized party,
  unknown key ID, invalid algorithm/signature, expiry, and absent subject.
- Integration-test provisioning, concurrent identity creation, deleted-account
  rejection, changed-email conflict behavior, and user-email canonicalization.
- Integration-test a protected household route invoked before `GET /v1/me` to
  prove the shared current-user boundary provisions/resolves safely rather than
  depending on a client-side call order.
- Integration-test atomic household + owner creation, owner-only invitation
  create/revoke, member rejection for invitation creation, token digest handling,
  recipient-email mismatch rejection, expired/revoked/accepted invitation
  handling, membership reactivation, raw-code non-persistence, seven-day
  expiry, and two concurrent acceptance attempts for the same code (exactly one
  succeeds).
- Add cross-household tests proving household A cannot list, create invitations
  for, revoke invitations from, or otherwise mutate household B.
- Mobile-test SecureStore-backed session restoration, email-code states,
  signed-out routing, create-household flow, manual code entry, and stale
  most-recent-household recovery. Test with Clerk hooks mocked; add a manual
  development-instance smoke test on a physical device using a LAN API URL,
  including a check that `localhost` is not used.
- Run `uv run pytest`, `uv run ruff check .`, `npm run lint` in `apps/mobile`,
  relevant migration tests against only `meal_planner_disposable_test`, and
  `git diff --check`.

## Explicitly deferred

- Clerk production instance, cloud deployment, production credentials, and
  account/household deletion execution.
- Passwords, magic links, OAuth/social sign-in, MFA, native hosted components,
  browser flows, universal links, and invitation deep links.
- Transactional invitation email, public web onboarding, existing-member
  removal/demotion, last-owner enforcement, RLS, and product-domain tables.
